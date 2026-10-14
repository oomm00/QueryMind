"""
Question Generation Service — QueryMind
=========================================
Generates Bloom-taxonomy-aligned questions using retrieved context chunks
and Google Gemini as the LLM backbone.

Pipeline:
  retrieve_context() -> build_prompt() -> LLM call -> validate JSON -> return GeneratedQuestion

LLM client interface
--------------------
Any object passed as ``llm_client`` (real or test mock) must expose a single method::

    client.generate_content(prompt: str) -> response   # response.text is the raw string

The real Gemini client is wrapped in ``GeminiAdapter`` which provides this interface.
Test mocks can simply be a ``MagicMock`` with ``generate_content`` configured.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from app.core.config import settings
from app.core.exceptions import QueryMindError, ValidationError
from app.schemas.schemas import GeneratedQuestion
from app.services.retrieval import retrieve_context
from chromadb.api.models.Collection import Collection

logger = logging.getLogger("querymind.generation")

# ── Bloom's Taxonomy Verb Table ───────────────────────────────────────────────
BLOOM_VERBS: dict[str, list[str]] = {
    "remember":   ["define", "list", "name", "recall", "identify", "state", "label", "outline"],
    "understand": ["explain", "describe", "summarize", "paraphrase", "classify", "illustrate"],
    "apply":      ["demonstrate", "use", "compute", "solve", "implement", "execute", "calculate"],
    "analyze":    ["compare", "differentiate", "deconstruct", "examine", "break down", "distinguish"],
    "evaluate":   ["critique", "justify", "assess", "argue", "judge", "defend", "evaluate"],
    "create":     ["design", "construct", "formulate", "compose", "produce", "synthesize", "develop"],
}

VALID_BLOOM_LEVELS = set(BLOOM_VERBS.keys())
VALID_DIFFICULTIES = {"easy", "medium", "hard"}

# ── Expected JSON Output Schema Description ───────────────────────────────────
JSON_SCHEMA_DESCRIPTION = """\
Return ONLY a raw JSON object (no markdown fences, no explanation outside the JSON) with these exact fields:
{
  "question": "<the question text>",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],   // include ONLY for MCQ, omit key entirely for open-ended
  "correct_answer": "<exact correct answer text>",
  "explanation": "<explanation referencing the source material>",
  "bloom_level": "<same level as requested>",
  "difficulty": "<same difficulty as requested>",
  "source_chunks": ["<source_doc name>", ...]
}"""


# ── GeminiAdapter — wraps google.genai into a unified interface ───────────────

class GeminiAdapter:
    """Thin adapter that wraps ``google.genai.Client`` into the common
    ``client.generate_content(prompt) -> response`` interface expected by
    ``_call_llm``.  Using an explicit adapter (rather than duck-typing via
    ``hasattr``) means test ``MagicMock`` objects are never accidentally routed
    through this code path.
    """

    def __init__(self, client: Any, model: str, temperature: float) -> None:
        self._client = client
        self._model = model
        self._temperature = temperature

    def generate_content(self, prompt: str) -> Any:
        """Call the Gemini API and return a response object with a ``.text`` attribute."""
        from google.genai import types as genai_types  # local import keeps module-level clean

        return self._client.models.generate_content(
            model=self._model,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                temperature=self._temperature,
                response_mime_type="application/json",
            ),
        )


def _configure_genai() -> GeminiAdapter:
    """Configure and return a ``GeminiAdapter`` backed by a real google.genai client."""
    api_key = settings.gemini_api_key
    if not api_key:
        raise QueryMindError(
            "Gemini API key is not configured. Set GEMINI_API_KEY in your .env file.",
            status_code=503,
            code="LLM_NOT_CONFIGURED",
        )
    import google.genai as genai  # local import to avoid top-level side-effects during tests

    client = genai.Client(api_key=api_key)
    return GeminiAdapter(client, settings.llm_model, settings.llm_temperature)


# ── Prompt Builder ────────────────────────────────────────────────────────────

def _build_prompt(
    topic: str,
    subject: str,
    bloom_level: str,
    difficulty: str,
    question_type: str,
    context_chunks: list[dict],
) -> str:
    """Construct the full generation prompt with retrieved context and Bloom verb anchoring."""
    verbs = BLOOM_VERBS.get(bloom_level, ["explain"])
    verb_hint = ", ".join(verbs[:4])

    if not context_chunks:
        context_section = "(No specific source material retrieved — use general academic knowledge.)"
    else:
        chunk_lines = []
        for i, chunk in enumerate(context_chunks, 1):
            chunk_lines.append(
                f"[Source {i}: {chunk['source_doc']}]\n{chunk['text']}"
            )
        context_section = "\n\n".join(chunk_lines)

    source_docs = [c["source_doc"] for c in context_chunks]

    q_type_instruction = (
        "Generate a Multiple Choice Question (MCQ) with exactly 4 options (A, B, C, D). "
        "Mark the correct option clearly in correct_answer."
        if question_type == "mcq"
        else "Generate an open-ended descriptive question (no options field)."
    )

    difficulty_hint = (
        "use simple recall" if difficulty == "easy"
        else "require application and reasoning" if difficulty == "medium"
        else "require deep analysis, synthesis, or critique"
    )

    prompt = f"""You are an expert academic question designer. Your task is to generate a {difficulty.upper()} difficulty exam question on the topic of "{topic}" (subject: {subject}).

COGNITIVE LEVEL: Bloom's Taxonomy — {bloom_level.upper()}
Required cognitive verbs to use in the question: {verb_hint}

QUESTION TYPE: {q_type_instruction}

SOURCE MATERIAL (base your question on this content):
{context_section}

INSTRUCTIONS:
1. The question MUST be directly answerable from the source material above.
2. Use the Bloom's verb "{verbs[0]}" or similar in the question phrasing.
3. The difficulty level is {difficulty}: {difficulty_hint}.
4. The explanation must cite the source material reasoning.
5. source_chunks must list the [Source N: filename] doc names you used.

{JSON_SCHEMA_DESCRIPTION}

Source doc names available: {source_docs}
"""
    return prompt


# ── JSON Extraction & Validation ──────────────────────────────────────────────

def _extract_json(text: str) -> dict:
    """Extract JSON object from LLM response, stripping markdown fences if present."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()
    return json.loads(text)


def _validate_and_parse(raw_json: dict, question_type: str) -> GeneratedQuestion:
    """Validate LLM output dict against GeneratedQuestion schema."""
    required = {"question", "correct_answer", "explanation", "bloom_level", "difficulty", "source_chunks"}
    missing = required - set(raw_json.keys())
    if missing:
        raise ValidationError(f"LLM response missing required fields: {missing}")

    if question_type == "mcq":
        options = raw_json.get("options")
        if not options or len(options) != 4:
            raise ValidationError("MCQ questions must have exactly 4 options.")

    return GeneratedQuestion(
        question=raw_json["question"],
        options=raw_json.get("options"),
        correct_answer=raw_json["correct_answer"],
        explanation=raw_json["explanation"],
        bloom_level=raw_json["bloom_level"],
        difficulty=raw_json["difficulty"],
        source_chunks=raw_json.get("source_chunks", []),
    )


# ── Main Entry Point ──────────────────────────────────────────────────────────

def generate_question(
    topic: str,
    subject: str,
    bloom_level: str,
    difficulty: str,
    question_type: str = "open",
    llm_client: Optional[Any] = None,
    chroma_collection: Optional[Collection] = None,
) -> GeneratedQuestion:
    """Generate a Bloom-taxonomy-aligned question grounded in retrieved context.

    Args:
        topic: e.g. "Transactions"
        subject: e.g. "DBMS"
        bloom_level: One of remember/understand/apply/analyze/evaluate/create
        difficulty: One of easy/medium/hard
        question_type: "mcq" or "open"
        llm_client: Inject any object with ``generate_content(prompt) -> response``
                    for testing.  Leave ``None`` to use the real Gemini API.
        chroma_collection: Inject a mock ChromaDB collection for testing.

    Returns:
        GeneratedQuestion (validated Pydantic model)

    Raises:
        ValidationError: If the LLM returns malformed/invalid JSON after 1 retry.
        QueryMindError: If the LLM service is unavailable or both attempts fail.
    """
    # ── Input validation ──────────────────────────────────────────────────────
    if bloom_level not in VALID_BLOOM_LEVELS:
        raise ValidationError(
            f"Invalid bloom_level '{bloom_level}'. Must be one of: {sorted(VALID_BLOOM_LEVELS)}"
        )
    if difficulty not in VALID_DIFFICULTIES:
        raise ValidationError(
            f"Invalid difficulty '{difficulty}'. Must be one of: easy, medium, hard"
        )

    # ── Step 1: Retrieve context ──────────────────────────────────────────────
    context_chunks = retrieve_context(
        topic=topic,
        subject=subject,
        bloom_level=bloom_level,
        difficulty=difficulty,
        collection=chroma_collection,
    )
    logger.info(
        "Retrieved %d context chunks for %s / %s (bloom=%s, diff=%s)",
        len(context_chunks), subject, topic, bloom_level, difficulty,
    )

    # ── Step 2: Build prompt ──────────────────────────────────────────────────
    prompt = _build_prompt(
        topic=topic,
        subject=subject,
        bloom_level=bloom_level,
        difficulty=difficulty,
        question_type=question_type,
        context_chunks=context_chunks,
    )

    # ── Step 3: Resolve client ────────────────────────────────────────────────
    # If no client is injected, create the real GeminiAdapter.
    # Test mocks pass their own object here — _call_llm always uses the same
    # ``.generate_content(prompt)`` interface regardless.
    client = llm_client if llm_client is not None else _configure_genai()

    # ── Inner helper: one LLM round-trip ─────────────────────────────────────
    def _call_llm(extra_instruction: str = "") -> GeneratedQuestion:
        full_prompt = prompt if not extra_instruction else prompt + f"\n\n{extra_instruction}"
        try:
            response = client.generate_content(full_prompt)
            raw_text = response.text
        except Exception as exc:
            raise QueryMindError(
                f"LLM call failed: {exc}",
                status_code=503,
                code="LLM_CALL_FAILED",
            ) from exc

        try:
            raw_json = _extract_json(raw_text)
            return _validate_and_parse(raw_json, question_type)
        except (json.JSONDecodeError, ValidationError, Exception) as exc:
            raise ValidationError(
                f"LLM returned invalid JSON: {exc}\nRaw: {raw_text[:300]}"
            ) from exc

    # ── First attempt ─────────────────────────────────────────────────────────
    try:
        return _call_llm()
    except ValidationError as first_err:
        logger.warning(
            "First LLM attempt returned invalid JSON: %s — retrying with strict instruction",
            first_err,
        )

    # ── Retry with stricter instruction ───────────────────────────────────────
    try:
        return _call_llm(
            "IMPORTANT: You MUST return ONLY a raw valid JSON object. "
            "No markdown fences. No extra text. Start your response with '{' and end with '}'."
        )
    except ValidationError as second_err:
        logger.error("Second LLM attempt also failed: %s", second_err)
        raise QueryMindError(
            "Question generation failed: LLM returned malformed output after retry.",
            status_code=502,
            code="GENERATION_FAILED",
        ) from second_err
