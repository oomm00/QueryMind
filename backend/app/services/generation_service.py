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

import logging
import time
from typing import Any, Optional

from app.core.config import settings
from app.core.exceptions import NoContextError, QueryMindError, ValidationError
from app.schemas.schemas import GeneratedQuestion
from app.services import llm_utils
# Re-exported for backwards compatibility (tests / callers import it from here).
from app.services.llm_utils import LLM_MAX_RETRIES, normalize_str  # noqa: F401
from app.services.retrieval import retrieve_context
from chromadb.api.models.Collection import Collection

logger = logging.getLogger("querymind.generation")

# ── Bloom's Taxonomy Verb Table ───────────────────────────────────────────────
BLOOM_VERBS: dict[str, list[str]] = {
    # Remember / Understand
    "remember":   ["define", "list", "outline", "recall", "name", "identify", "state", "label"],
    "understand": ["explain", "describe", "outline", "summarize", "paraphrase", "classify", "illustrate"],
    # Apply / Analyze
    "apply":      ["demonstrate", "compute", "solve", "use", "implement", "execute", "calculate"],
    "analyze":    ["differentiate", "compare", "analyze", "deconstruct", "examine", "break down", "distinguish"],
    # Evaluate / Create
    "evaluate":   ["critique", "justify", "evaluate", "assess", "argue", "judge", "defend"],
    "create":     ["formulate", "design", "construct", "compose", "produce", "synthesize", "develop"],
}

VALID_BLOOM_LEVELS = set(BLOOM_VERBS.keys())
VALID_DIFFICULTIES = {"easy", "medium", "hard"}

# Transient-error retry / backoff configuration now lives in app.services.llm_utils
# (shared with the answer-evaluation service). LLM_MAX_RETRIES is re-exported above.

# ── Expected JSON Output Schema Description ───────────────────────────────────
JSON_SCHEMA_DESCRIPTION = """\
Return ONLY a raw JSON object (no markdown fences, no explanation outside the JSON) with these fields:
{
  "question": "<the question text>",
  "question_text": "<same as question>",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],   // include ONLY for MCQ, omit key for other types
  "starter_code": "<code template for coding questions, omit for non-coding>",
  "test_cases": [{"input": "...", "output": "...", "explanation": "..."}], // include for coding questions
  "correct_answer": "<exact correct answer text>",
  "explanation": "<explanation referencing the source material>",
  "bloom_level": "<same level as requested>",
  "difficulty": "<same difficulty as requested>",
  "topic": "<topic name>",
  "source_chunks": ["<source_doc name>", ...],
  "source_chunk_ids": ["<source_doc name>", ...]
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

    q_type_normalized = question_type.lower().strip()
    if q_type_normalized == "mcq":
        q_type_instruction = (
            "Generate a Multiple Choice Question (MCQ) with exactly 4 options (A, B, C, D). "
            "Mark the correct option clearly in correct_answer."
        )
    elif q_type_normalized in {"short_answer", "short"}:
        q_type_instruction = (
            "Generate a short-answer question requiring a concise, direct answer "
            "(1-2 sentences). Do not include options."
        )
    elif q_type_normalized == "coding":
        q_type_instruction = (
            "Generate a practical coding problem. Provide a starter code template "
            "in starter_code (e.g. Python function skeleton with type hints) and at least "
            "2 example test cases in test_cases with 'input', 'output', and 'explanation'. "
            "Do not include an options field."
        )
    else:  # descriptive / open
        q_type_instruction = (
            "Generate an in-depth descriptive question requiring clear conceptual reasoning, "
            "explanation, or analysis. Do not include an options field."
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
5. source_chunks / source_chunk_ids must list the [Source N: filename] doc names you used.

{JSON_SCHEMA_DESCRIPTION}

Source doc names available: {source_docs}
"""
    return prompt


# ── JSON Validation ───────────────────────────────────────────────────────────
# (Transient-error backoff, JSON extraction, and the malformed-JSON retry live in
#  app.services.llm_utils so generation and evaluation share one implementation.)

def _validate_and_parse(
    raw_json: dict,
    question_type: str,
    topic: Optional[str] = None,
) -> GeneratedQuestion:
    """Validate LLM output dict against GeneratedQuestion schema.

    ``bloom_level`` and ``difficulty`` are normalized (``strip()`` + ``lower()``)
    *before* enum validation, so values like ``"ANALYZE"`` / ``"Medium"`` returned
    by the LLM still match ``"analyze"`` / ``"medium"``.
    """
    # Accept either 'question' or 'question_text'
    q_text = raw_json.get("question") or raw_json.get("question_text")
    if not q_text:
        raise ValidationError("LLM response missing required question text ('question').")

    chunks_used = raw_json.get("source_chunks") or raw_json.get("source_chunk_ids") or []
    if not isinstance(chunks_used, list):
        chunks_used = [str(chunks_used)]

    required = {"correct_answer", "explanation", "bloom_level", "difficulty"}
    missing = required - set(raw_json.keys())
    if missing:
        raise ValidationError(f"LLM response missing required fields: {missing}")

    q_type_normalized = question_type.lower().strip()
    if q_type_normalized == "mcq":
        options = raw_json.get("options")
        if not options or len(options) != 4:
            raise ValidationError("MCQ questions must have exactly 4 options.")

    bloom_level = normalize_str(raw_json["bloom_level"])
    difficulty = normalize_str(raw_json["difficulty"])

    if bloom_level not in VALID_BLOOM_LEVELS:
        raise ValidationError(
            f"LLM returned invalid bloom_level '{raw_json['bloom_level']}'. "
            f"Must be one of: {sorted(VALID_BLOOM_LEVELS)}"
        )
    if difficulty not in VALID_DIFFICULTIES:
        raise ValidationError(
            f"LLM returned invalid difficulty '{raw_json['difficulty']}'. "
            "Must be one of: easy, medium, hard"
        )

    topic_val = raw_json.get("topic") or topic

    return GeneratedQuestion(
        question=q_text,
        question_text=q_text,
        options=raw_json.get("options"),
        starter_code=raw_json.get("starter_code"),
        test_cases=raw_json.get("test_cases"),
        correct_answer=raw_json["correct_answer"],
        explanation=raw_json["explanation"],
        bloom_level=bloom_level,
        difficulty=difficulty,
        topic=topic_val,
        source_chunks=chunks_used,
        source_chunk_ids=chunks_used,
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
    context_chunks: Optional[list[dict]] = None,
    extra_instruction: str = "",
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
        context_chunks: Pre-retrieved chunks to use instead of calling
                    ``retrieve_context`` again.  Lets the caller (e.g. the
                    validation stage) reuse the exact same context that the
                    question was grounded in.  ``None`` triggers retrieval.
        extra_instruction: Optional corrective note appended to the prompt, used
                    when regenerating after a failed pre-delivery validation
                    (e.g. "avoid this duplicate", "ground the answer in sources").

    Returns:
        GeneratedQuestion (validated Pydantic model)

    Raises:
        ValidationError: If the LLM returns malformed/invalid JSON after 1 retry.
        NoContextError: If no study material exists for the subject/topic (404).
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
    # Callers may pass in already-retrieved chunks so the prompt and the
    # downstream answerability check share the exact same source material.
    if context_chunks is None:
        context_chunks = retrieve_context(
            topic=topic,
            subject=subject,
            bloom_level=bloom_level,
            difficulty=difficulty,
            collection=chroma_collection,
        )

    # ── No source material -> nothing to ground a question on ─────────────────
    # If neither the college nor the public tier has any material for this
    # subject + topic, fail fast with a clear 404 rather than asking the LLM to
    # invent a question from thin air.
    if not context_chunks:
        raise NoContextError(
            f"No study material exists for {subject} / {topic} yet. "
            "Upload a college or public document for this subject and topic first."
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
    if extra_instruction:
        prompt = f"{prompt}\n\nADDITIONAL INSTRUCTION:\n{extra_instruction}"

    # ── Step 3: Resolve client ────────────────────────────────────────────────
    # If no client is injected, create the real GeminiAdapter. Test mocks pass
    # their own object exposing ``generate_content(prompt)``.
    client = llm_client if llm_client is not None else _configure_genai()

    # ── Step 4: LLM round-trip ────────────────────────────────────────────────
    # llm_utils handles the transient-error backoff and the single malformed-JSON
    # retry (shared with the evaluation service). `time.sleep` is threaded through
    # so tests can patch it at the module level.
    def _request(prompt_text: str) -> str:
        return llm_utils.request_text(client, prompt_text, sleep=time.sleep)

    try:
        return llm_utils.call_json_with_retry(
            request_fn=_request,
            prompt=prompt,
            parse_fn=lambda raw: _validate_and_parse(raw, question_type, topic=topic),
        )
    except ValidationError as second_err:
        logger.error("Second LLM attempt also failed: %s", second_err)
        raise QueryMindError(
            "Question generation failed: LLM returned malformed output after retry.",
            status_code=502,
            code="GENERATION_FAILED",
        ) from second_err
