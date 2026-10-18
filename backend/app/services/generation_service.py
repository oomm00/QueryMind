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
import re
import time
from functools import lru_cache
from typing import Any, Optional

from app.core.config import settings
from app.core.exceptions import LLMNotConfiguredError, NoContextError, QueryMindError, ValidationError
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

# ── Per-Level Bloom Spec (prompt + deterministic stem check) ──────────────────
#: Canonical low -> high ordering; |index difference| == distance in levels.
BLOOM_ORDER: list[str] = ["remember", "understand", "apply", "analyze", "evaluate", "create"]

#: Levels whose questions must hinge on a concrete scenario / numbers / a case.
APPLY_PLUS_LEVELS = {"apply", "analyze", "evaluate", "create"}

#: Minimum retrieved-context size (chars) for an Apply+ question to be grounded.
THIN_CONTEXT_MIN_CHARS = 250

#: Structured per-level spec used by the generation prompt: what the cognitive
#: operation is, one good and one bad example (style only — examples never
#: carry content that could leak into a generated question).
BLOOM_LEVEL_SPECS: dict[str, dict[str, str]] = {
    "remember": {
        "definition": (
            "Recall or recognize facts, terminology, or definitions exactly as "
            "learned - retrieval without transformation."
        ),
        "good": "'State the three ACID properties of a transaction.' (asks for the known list verbatim)",
        "bad": "'Explain why atomicity matters in a banking workload.' (that demands understanding, not recall)",
    },
    "understand": {
        "definition": (
            "Explain an idea in your own words - paraphrase, summarize, classify, "
            "or illustrate its meaning."
        ),
        "good": "'Explain, in your own words, how two-phase locking guarantees serializability.'",
        "bad": "'Define two-phase locking.' (a bare definition is remember-level)",
    },
    "apply": {
        "definition": (
            "Use the concept to solve a problem in a concrete, specific situation - "
            "work something out, do not just talk about it."
        ),
        "good": (
            "'Apply the two-phase locking rule to this 3-schedule example: which "
            "schedules are conflict-serializable? Show the precedence-graph step.'"
        ),
        "bad": "'Explain how two-phase locking works.' (a generic explanation is understand-level)",
    },
    "analyze": {
        "definition": (
            "Break the concept into parts and examine how they relate - compare, "
            "contrast, distinguish causes from effects. ONE analytical task per "
            "question: never bundle a compare sub-task together with a separate "
            "explain, summarize, or evaluate sub-task (e.g. 'compare X and Y, "
            "and then explain why Z' is two tasks). The colon clause that "
            "sharpens the single task is fine."
        ),
        "good": (
            "'Differentiate strict 2PL from rigorous 2PL in the scenario above: "
            "for each blocked transaction, name which protocol's rule produces "
            "its outcome.' (one differentiation task)"
        ),
        "bad": "'List the lock modes used in 2PL.' (flat enumeration is remember-level)",
    },
    "evaluate": {
        "definition": (
            "Make and defend a judgement - critique, assess, or argue for/against "
            "something against explicit criteria."
        ),
        "good": (
            "'Judge whether READ COMMITTED is adequate for the order system described "
            "above: justify your verdict against the anomaly risks shown in the material.'"
        ),
        "bad": "'Describe what READ COMMITTED isolation does.' (restating behaviour is understand-level)",
    },
    "create": {
        "definition": (
            "Synthesize the studied elements into something new - a plan, model, "
            "design, or solution that did not exist before."
        ),
        "good": (
            "'Design a deadlock-recovery policy for the resource-allocation graph "
            "above: propose the rollback rule and justify how it preserves the "
            "studied invariants.'"
        ),
        "bad": "'Summarize the techniques for handling deadlocks.' (recombining known facts is understand-level)",
    },
}


def _forbidden_stems_for(level: str) -> list[str]:
    """Lower-level verbs that must not open a *level* question.

    Union of the allowed verbs of every strictly lower level, minus the verbs
    this level legitimately owns (e.g. ``outline`` belongs to both remember and
    understand, so it is not forbidden at understand).
    """
    allowed_here = set(BLOOM_VERBS.get(level, []))
    if level not in BLOOM_ORDER:
        return []
    forbidden: list[str] = []
    for lower in BLOOM_ORDER[: BLOOM_ORDER.index(level)]:
        for verb in BLOOM_VERBS.get(lower, []):
            if verb not in allowed_here and verb not in forbidden:
                forbidden.append(verb)
    return forbidden


#: Per-level forbidden stems (lower-level verbs) - deterministic, single source
#: of truth shared by the generation prompt, the validation stem check, and
#: scripts/bloom_audit.py.
BLOOM_FORBIDDEN_VERBS: dict[str, list[str]] = {
    lvl: _forbidden_stems_for(lvl) for lvl in BLOOM_ORDER
}


def _verb_regex(verb: str) -> "re.Pattern[str]":
    """Word-boundary regex for *verb* plus common inflections.

    ``use`` matches use/uses/used/using (via the drop-e gerund), ``list`` matches
    list/lists/listed/listing, ``assess`` matches assess/assesses/assessed/
    harmless extras like ``assesss`` never occur in text.
    """
    v = re.escape(verb)
    if verb.endswith("e"):
        gerund = re.escape(verb[:-1]) + r"ing"
        endings = rf"{v}s|{v}es|{v}d|{gerund}"
    else:
        endings = rf"{v}s|{v}es|{v}ed|{v}ing"
    return re.compile(rf"\b(?:{v}|{endings})\b")


def extract_stem(question_text: str) -> str:
    """First alphabetic word of the question, lowercased ('' when empty)."""
    words = re.findall(r"[A-Za-z]+", (question_text or "").strip())
    return words[0].lower() if words else ""


def check_stem(question_text: str, bloom_level: str) -> dict:
    """Deterministic stem compliance for *bloom_level* (Step 3b).

    A question is compliant when its opening (first ~6 words) contains a stem
    from the level's own verb list AND its stem zone (first 3 words) contains no
    forbidden lower-level verb. The narrower forbidden zone keeps legitimate
    Apply+ phrasings like "Using the schedule above, ..." passing while still
    rejecting openings such as "Define ...", "Explain ...", "What is ..." at
    higher levels.

    Returns a dict with ``stem``, ``allowed_hit``, ``forbidden_hit`` and
    ``is_compliant`` (True when there is no constraint to check either).
    """
    if bloom_level not in BLOOM_VERBS:
        return {
            "stem": extract_stem(question_text),
            "allowed_hit": None,
            "forbidden_hit": None,
            "is_compliant": True,
            "opening": "",
        }
    words = [w.lower() for w in re.findall(r"[A-Za-z]+", (question_text or ""))]
    allowed = BLOOM_VERBS.get(bloom_level, [])
    forbidden = BLOOM_FORBIDDEN_VERBS.get(bloom_level, [])
    opening = " ".join(words[:6])
    stem_zone = " ".join(words[:3])
    allowed_hit = next(
        (v for v in allowed if _verb_regex(v).search(opening)), None
    )
    forbidden_hit = next(
        (v for v in forbidden if _verb_regex(v).search(stem_zone)), None
    )
    return {
        "stem": words[0] if words else "",
        "allowed_hit": allowed_hit,
        "forbidden_hit": forbidden_hit,
        "is_compliant": allowed_hit is not None and forbidden_hit is None,
        "opening": opening,
    }

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

    Also the single place the request ``GenerateContentConfig`` is assembled:
    ``response_schema`` (structured output), ``max_output_tokens`` (hard output
    cap) and ``thinking_config`` (reasoning-effort control) are all applied here
    for both generation and evaluation.
    """

    def __init__(
        self,
        client: Any,
        model: str,
        temperature: float,
        response_schema: Any = None,
        thinking_level: Any = None,
        thinking_budget: Any = None,
        max_output_tokens: Any = None,
    ) -> None:
        self._client = client
        self._model = model
        self._temperature = temperature
        self._response_schema = response_schema
        self._thinking_level = thinking_level
        self._thinking_budget = thinking_budget
        self._max_output_tokens = max_output_tokens

    def generate_content(self, prompt: str, model: Optional[str] = None) -> Any:
        """Call the Gemini API and return a response object with a ``.text`` attribute.

        ``model`` overrides the adapter's configured model for this call; the
        model-fallback path uses it to pin each attempt to a specific model.

        Every call logs the Gemini ``finish_reason`` plus token usage (prompt /
        output / thinking) so truncation is diagnosable from the logs alone.
        A ``finish_reason=MAX_TOKENS`` response — thinking tokens count toward
        ``max_output_tokens``, so a capped call can run out of budget before the
        JSON answer is finished — is retried **once** with a doubled cap instead
        of being handed upstream as "malformed JSON".  If the second attempt is
        still truncated the (still-truncated) response is returned and the
        existing JSON-retry path takes over as the last resort.
        """
        from google.genai import types as genai_types  # local import keeps module-level clean

        config_kwargs = {
            "temperature": self._temperature,
            "response_mime_type": "application/json",
        }
        if self._response_schema is not None:
            config_kwargs["response_schema"] = self._response_schema
        if self._max_output_tokens:
            config_kwargs["max_output_tokens"] = self._max_output_tokens
        thinking = llm_utils.build_thinking_config(
            self._thinking_level, self._thinking_budget
        )
        if thinking is not None:
            config_kwargs["thinking_config"] = thinking

        response = self._client.models.generate_content(
            model=model or self._model,
            contents=prompt,
            config=genai_types.GenerateContentConfig(**config_kwargs),
        )
        reason = _finish_reason(response)
        if reason == "MAX_TOKENS" and config_kwargs.get("max_output_tokens"):
            retry_cap = min(int(config_kwargs["max_output_tokens"]) * 2, 65536)
            logger.warning(
                "Gemini finish_reason=MAX_TOKENS model=%s cap=%s usage=%s — "
                "retrying once with max_output_tokens=%d",
                model or self._model,
                config_kwargs["max_output_tokens"],
                _usage_metadata(response),
                retry_cap,
            )
            config_kwargs["max_output_tokens"] = retry_cap
            response = self._client.models.generate_content(
                model=model or self._model,
                contents=prompt,
                config=genai_types.GenerateContentConfig(**config_kwargs),
            )
            reason = _finish_reason(response)
        logger.info(
            "Gemini call model=%s finish_reason=%s usage=%s thinking=%s",
            model or self._model,
            reason,
            _usage_metadata(response),
            self._thinking_level,
        )
        return response


def _finish_reason(response: Any) -> Optional[str]:
    """Best-effort ``finish_reason`` name from a google.genai response.

    Returns ``None`` for missing/non-string reasons (including MagicMock
    responses in tests), so callers can compare against ``"MAX_TOKENS"`` safely.
    """
    try:
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return None
        reason = getattr(candidates[0], "finish_reason", None)
        name = getattr(reason, "name", None)
        if isinstance(name, str):
            return name
        if isinstance(reason, str):
            return reason
    except Exception:  # pragma: no cover - defensive on odd response shapes
        return None
    return None


def _usage_metadata(response: Any) -> Optional[dict]:
    """Prompt/output/thinking token counts from a google.genai response.

    Only real ``int`` values are kept: test doubles (MagicMock) fabricate
    non-int attributes and must not leak into logs or assertions.
    """
    try:
        usage = getattr(response, "usage_metadata", None)
        if usage is None:
            return None
        out = {}
        for key, attr in (
            ("prompt", "prompt_token_count"),
            ("output", "candidates_token_count"),
            ("thinking", "thoughts_token_count"),
        ):
            value = getattr(usage, attr, None)
            if isinstance(value, int):
                out[key] = value
        return out or None
    except Exception:  # pragma: no cover - defensive on odd response shapes
        return None


@lru_cache(maxsize=1)
def _generation_schema() -> Any:
    """Build a Gemini ``Schema`` describing the generated-question JSON shape.

    Returning ``None`` (when google.genai is unavailable) keeps the previous
    behavior: JSON-mode without a schema. The existing JSON-retry fallback in
    :func:`llm_utils.call_json_with_retry` still applies.

    Memoized: constructing the schema imports ``google.genai.types`` and builds
    a nested object graph, so it is done once per process rather than per call.
    """
    try:
        from google.genai import types as genai_types  # type: ignore
    except Exception:  # pragma: no cover - optional dependency path
        return None
    T = genai_types.Type
    return genai_types.Schema(
        type=T.OBJECT,
        properties={
            "question": {"type": T.STRING},
            "question_text": {"type": T.STRING},
            "options": {"type": T.ARRAY, "items": {"type": T.STRING}},
            "starter_code": {"type": T.STRING},
            "test_cases": {
                "type": T.ARRAY,
                "items": {
                    "type": T.OBJECT,
                    "properties": {
                        "input": {"type": T.STRING},
                        "output": {"type": T.STRING},
                        "explanation": {"type": T.STRING},
                    },
                    "required": ["input", "output"],
                },
            },
            "correct_answer": {"type": T.STRING},
            "explanation": {"type": T.STRING},
            "bloom_level": {"type": T.STRING},
            "difficulty": {"type": T.STRING},
            "topic": {"type": T.STRING},
            "source_chunks": {"type": T.ARRAY, "items": {"type": T.STRING}},
            "source_chunk_ids": {"type": T.ARRAY, "items": {"type": T.STRING}},
        },
        required=["question", "question_text", "correct_answer", "explanation", "bloom_level", "difficulty"],
    )


def _configure_genai(
    response_schema: Any = None,
    thinking_level: Optional[str] = None,
    max_output_tokens: Optional[int] = None,
) -> GeminiAdapter:
    """Configure and return a ``GeminiAdapter`` backed by a real google.genai client.

    ``thinking_level`` defaults to the generation-specific setting
    (``LLM_GEN_THINKING_LEVEL``, medium) and the output cap to the
    generation-specific setting (``LLM_GEN_MAX_OUTPUT_TOKENS``, 8192) — small
    validation/judgement callers pass the lower evaluation level and cap to
    keep latency (and blast radius) down.
    """
    api_key = settings.gemini_api_key
    if not api_key:
        raise LLMNotConfiguredError()
    import google.genai as genai  # local import to avoid top-level side-effects during tests

    client = genai.Client(api_key=api_key)
    return GeminiAdapter(
        client,
        settings.llm_model,
        settings.llm_temperature,
        response_schema=response_schema,
        thinking_level=thinking_level or settings.llm_gen_thinking_level,
        thinking_budget=settings.llm_thinking_budget,
        max_output_tokens=(
            max_output_tokens
            if max_output_tokens is not None
            else settings.llm_gen_max_output_tokens
        ),
    )


# ── Prompt Builder ────────────────────────────────────────────────────────────

def _build_prompt(
    topic: str,
    subject: str,
    bloom_level: str,
    difficulty: str,
    question_type: str,
    context_chunks: list[dict],
) -> str:
    """Construct the full generation prompt with retrieved context and Bloom verb anchoring.

    The Bloom section is a structured per-level spec (Step 3a): cognitive
    operation definition, required opening stems, forbidden lower-level stems,
    one good + one bad example, and the Apply+ concrete-scenario rule.
    """
    spec = BLOOM_LEVEL_SPECS.get(bloom_level, {})
    allowed_stems = BLOOM_VERBS.get(bloom_level, ["explain"])
    allowed_hint = ", ".join(allowed_stems)
    forbidden_stems = BLOOM_FORBIDDEN_VERBS.get(bloom_level, [])
    forbidden_hint = ", ".join(forbidden_stems) if forbidden_stems else "(none at this level)"
    concrete_rule = ""
    if bloom_level in APPLY_PLUS_LEVELS:
        concrete_rule = (
            "CONCRETE SCENARIO RULE: the question must hinge on a concrete scenario, "
            "specific numbers, or a small case drawn from the SOURCE MATERIAL above "
            "(e.g. a given schedule, dataset, code snippet, or measured case) — "
            "never a bare 'explain/describe X' phrasing.\n"
        )

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
Cognitive operation: {spec.get("definition", "")}
REQUIRED OPENING: begin the question with ONE of these stems/verbs: {allowed_hint}.
FORBIDDEN OPENING: never begin a {bloom_level} question with these lower-level verbs: {forbidden_hint}.
{concrete_rule}Good example (style only — never copy its content): {spec.get("good", "")}
Bad example (wrong cognitive level — never produce this): {spec.get("bad", "")}

QUESTION TYPE: {q_type_instruction}

SOURCE MATERIAL (base your question on this content):
{context_section}

INSTRUCTIONS:
1. The question MUST be directly answerable from the source material above.
2. Start the question with one of the required stems/verbs above — a deterministic stem check rejects any question that opens with a forbidden lower-level verb.
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

    # ── Thin-context guard for Apply+ levels (Step 3e) ───────────────────────
    # Apply+ questions must hinge on a concrete case from the material; when the
    # retrieved context is very thin, say so in `context_warning` (and log it)
    # instead of silently shipping a generic question.
    context_chars = sum(len(str(c.get("text", ""))) for c in context_chunks)
    context_warning: Optional[str] = None
    if bloom_level in APPLY_PLUS_LEVELS and context_chars < THIN_CONTEXT_MIN_CHARS:
        context_warning = (
            f"Retrieved context for {subject} / {topic} is thin "
            f"({context_chars} characters < {THIN_CONTEXT_MIN_CHARS} needed) for a "
            f"{bloom_level} question — the question may not be grounded in a concrete "
            "scenario. Upload more detailed material for reliable Apply+ questions."
        )
        logger.warning("THIN_CONTEXT %s", context_warning)

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
    if llm_client is not None:
        client = llm_client
        model_chain = None
    else:
        client = _configure_genai(response_schema=_generation_schema())
        # LLM_FALLBACK_MODELS: on a quota/503 error, retry against the next model.
        model_chain = llm_utils.resolve_model_chain(settings.llm_model)

    # ── Step 4: LLM round-trip ────────────────────────────────────────────────
    # llm_utils handles the transient-error backoff, the cross-model fallback and
    # the single malformed-JSON retry (shared with the evaluation service).
    # `time.sleep` is threaded through so tests can patch it at the module level.
    def _request(prompt_text: str) -> str:
        return llm_utils.request_text(
            client, prompt_text, sleep=time.sleep, models=model_chain
        )

    def _parse(raw: dict) -> GeneratedQuestion:
        generated = _validate_and_parse(raw, question_type, topic=topic)
        if context_warning and not generated.context_warning:
            generated.context_warning = context_warning
        return generated

    try:
        return llm_utils.call_json_with_retry(
            request_fn=_request,
            prompt=prompt,
            parse_fn=_parse,
        )
    except ValidationError as second_err:
        logger.error("Second LLM attempt also failed: %s", second_err)
        raise QueryMindError(
            "Question generation failed: LLM returned malformed output after retry.",
            status_code=502,
            code="GENERATION_FAILED",
        ) from second_err
