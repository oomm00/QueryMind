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
import time
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

# ── Transient-Error Retry Configuration ───────────────────────────────────────
# Retries are for *transport/availability* failures (503, 429, timeouts) and are
# completely separate from the JSON-validation retry performed in generate_question().
LLM_MAX_RETRIES = 3               # retries after the initial attempt
LLM_BACKOFF_BASE_SECONDS = 1.0    # exponential: 1s, 2s, 4s
TRANSIENT_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}

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


# ── Transient-Error Detection & Retrying ──────────────────────────────────────

def _is_transient_error(exc: Exception) -> bool:
    """Return True if *exc* looks like a retryable, transient LLM/network error.

    Covers HTTP 5xx / 429 responses (e.g. ``google.genai.errors.ServerError``),
    timeouts, connection failures, and messages that mention temporary
    unavailability. Application-level :class:`QueryMindError` exceptions are never
    treated as transient.
    """
    # QueryMindError subclasses carry an app-level status_code (422/429/...) and
    # must not be confused with transport errors.
    if isinstance(exc, QueryMindError):
        return False

    for attr in ("status_code", "code", "http_status"):
        value = getattr(exc, attr, None)
        if isinstance(value, int) and value in TRANSIENT_STATUS_CODES:
            return True

    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True

    try:  # httpx timeouts / transport errors
        import httpx

        if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
            return True
    except Exception:  # pragma: no cover - httpx is always installed in prod
        pass

    message = str(exc).lower()
    needles = (
        "timeout", "timed out", "unavailable", "high demand", "overloaded",
        "rate limit", "temporarily", "connection reset", "connection aborted",
        "503", "429",
    )
    return any(needle in message for needle in needles)


def _generate_with_retry(client: Any, prompt: str) -> Any:
    """Call ``client.generate_content(prompt)`` with exponential-backoff retries.

    Only *transient* failures (503/429/timeout/connection) are retried; permanent
    errors are raised immediately. After the retries are exhausted a
    :class:`QueryMindError` (503 / ``LLM_CALL_FAILED``) is raised.
    """
    attempts = LLM_MAX_RETRIES + 1
    last_exc: Optional[Exception] = None

    for attempt in range(attempts):
        try:
            return client.generate_content(prompt)
        except Exception as exc:  # noqa: BLE001 — re-raised below if not transient
            if not _is_transient_error(exc):
                raise
            last_exc = exc
            if attempt == attempts - 1:
                break
            delay = LLM_BACKOFF_BASE_SECONDS * (2 ** attempt)
            logger.warning(
                "Transient LLM error on attempt %d/%d: %s — retrying in %.1fs",
                attempt + 1, attempts, exc, delay,
            )
            time.sleep(delay)

    raise QueryMindError(
        f"LLM call failed after {attempts} attempts due to transient errors: {last_exc}",
        status_code=503,
        code="LLM_CALL_FAILED",
    ) from last_exc


# ── JSON Extraction & Validation ──────────────────────────────────────────────

def _extract_json(text: str) -> dict:
    """Extract JSON object from LLM response, stripping markdown fences if present."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()
    return json.loads(text)


def _validate_and_parse(raw_json: dict, question_type: str) -> GeneratedQuestion:
    """Validate LLM output dict against GeneratedQuestion schema.

    ``bloom_level`` and ``difficulty`` are normalized (``strip()`` + ``lower()``)
    *before* enum validation, so values like ``"ANALYZE"`` / ``"Medium"`` returned
    by the LLM still match ``"analyze"`` / ``"medium"``.
    """
    required = {"question", "correct_answer", "explanation", "bloom_level", "difficulty", "source_chunks"}
    missing = required - set(raw_json.keys())
    if missing:
        raise ValidationError(f"LLM response missing required fields: {missing}")

    if question_type == "mcq":
        options = raw_json.get("options")
        if not options or len(options) != 4:
            raise ValidationError("MCQ questions must have exactly 4 options.")

    bloom_level = str(raw_json["bloom_level"]).strip().lower()
    difficulty = str(raw_json["difficulty"]).strip().lower()

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

    return GeneratedQuestion(
        question=raw_json["question"],
        options=raw_json.get("options"),
        correct_answer=raw_json["correct_answer"],
        explanation=raw_json["explanation"],
        bloom_level=bloom_level,
        difficulty=difficulty,
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
    # If no client is injected, create the real GeminiAdapter.
    # Test mocks pass their own object here — _call_llm always uses the same
    # ``.generate_content(prompt)`` interface regardless.
    client = llm_client if llm_client is not None else _configure_genai()

    # ── Inner helper: one LLM round-trip ─────────────────────────────────────
    def _call_llm(extra_instruction: str = "") -> GeneratedQuestion:
        full_prompt = prompt if not extra_instruction else prompt + f"\n\n{extra_instruction}"
        try:
            response = _generate_with_retry(client, full_prompt)
            raw_text = response.text
        except QueryMindError:
            raise
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
