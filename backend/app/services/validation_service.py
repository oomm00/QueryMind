"""
Validation Service — Pre-Delivery Question Validation (Pipeline Stage 5)
========================================================================
Runs immediately after generation and before a question is persisted/returned.

Two cheap, embedding-based checks — no extra LLM calls (they run on every
generated question):

1. ``check_duplicate``      — cosine similarity of the new question against
                              existing questions already stored for the same
                              subject + topic.
2. ``check_answerability``  — cosine similarity of the question's correct answer
                              against the retrieved source chunks, to confirm the
                              answer is grounded in the material.

Embeddings reuse ChromaDB's default embedding function
(``all-MiniLM-L6-v2``, 384-d) — i.e. the exact same model/vector space the
vector store uses — so no new embedding dependency is introduced.

Performance
-----------
``validate_question`` embeds the new question **once** and shares that vector
with both checks, and runs the duplicate and answerability checks **concurrently**
(they are independent and both embedding-bound). The stored duplicate candidates
are read on the caller's thread before the pool starts, so no DB session is
touched from a worker thread.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional, Sequence

import numpy as np
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import Question

logger = logging.getLogger("querymind.validation")

# ── Thresholds ────────────────────────────────────────────────────────────────
DUPLICATE_SIMILARITY_THRESHOLD = 0.90     # > 0.90 cosine similarity => duplicate triggers regeneration
ANSWERABILITY_SIMILARITY_THRESHOLD = 0.50  # answer must match a chunk at least this well
KEYWORD_OVERLAP_THRESHOLD = 0.30           # secondary signal threshold for grounding


# ── Embedding helpers (reuse ChromaDB's default model) ────────────────────────

_embedding_function = None


def _get_embedding_function():
    """Lazily build ChromaDB's default embedding function (all-MiniLM-L6-v2).

    Kept lazy so importing this module never triggers a model download, and
    tests can monkeypatch :func:`embed_texts` without touching the model.
    """
    global _embedding_function
    if _embedding_function is None:
        from chromadb.utils import embedding_functions

        _embedding_function = embedding_functions.DefaultEmbeddingFunction()
    return _embedding_function


def embed_texts(texts: Sequence[str]) -> np.ndarray:
    """Embed a list of texts into an ``(n, dim)`` float32 array."""
    if not texts:
        return np.zeros((0, 0), dtype="float32")
    vectors = _get_embedding_function()(list(texts))
    return np.asarray(vectors, dtype="float32")


def _cosine_similarities(query_vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Cosine similarity between one vector and each row of ``matrix``."""
    q = query_vec.reshape(-1)
    q_norm = np.linalg.norm(q)
    row_norms = np.linalg.norm(matrix, axis=1)
    denom = np.clip(q_norm * row_norms, 1e-12, None)
    return (matrix @ q) / denom


def _compute_keyword_overlap(text: str, context_chunks: list[str]) -> float:
    """Compute secondary grounding signal: fraction of keywords appearing in context."""
    stop_words = {
        "the", "and", "that", "this", "with", "from", "for", "are", "was", "were",
        "have", "has", "had", "what", "when", "where", "which", "how", "why", "who",
        "than", "then", "into", "over", "under", "more", "such", "only", "about",
    }
    words = re.findall(r"\b[a-zA-Z]{4,}\b", text.lower())
    keywords = [w for w in words if w not in stop_words]
    if not keywords:
        return 0.0

    combined_context = " ".join(context_chunks).lower()
    matched = sum(1 for kw in keywords if kw in combined_context)
    return round(matched / len(keywords), 4)


# ── Check 1: Duplicate detection ──────────────────────────────────────────────

def _query_existing(
    db: Session,
    subject: str,
    topic: str,
) -> list[Question]:
    """Stored questions for the same ``subject`` + ``topic`` (duplicate candidates)."""
    return (
        db.query(Question)
        .filter(Question.subject == subject, Question.topic == topic)
        .all()
    )


def check_duplicate(
    question_text: str,
    subject: str,
    topic: str,
    db: Session,
    *,
    question_vec: Optional[np.ndarray] = None,
    existing: Optional[list[Question]] = None,
) -> dict:
    """Flag ``question_text`` as a duplicate of an existing question.

    Only questions stored for the same ``subject`` + ``topic`` are compared.
    Similarity is embedding cosine similarity (not exact string matching).

    ``question_vec`` lets the caller pass in an already-computed embedding of
    ``question_text`` (the orchestrator embeds the question once and shares it
    with the answerability check), in which case only the stored questions are
    embedded. ``existing`` lets the caller pass in pre-fetched rows so this
    function performs no DB I/O — required when it is run on a worker thread,
    since SQLAlchemy sessions are not thread-safe.
    """
    if existing is None:
        existing = _query_existing(db, subject, topic)
    if not existing:
        return {"is_duplicate": False, "similarity": 0.0}

    if question_vec is None:
        vectors = embed_texts([question_text] + [q.question_text for q in existing])
        new_vec, existing_vecs = vectors[:1], vectors[1:]
    else:
        # Question embedding already computed by the caller — reuse it and only
        # embed the stored questions we compare against.
        new_vec = np.asarray(question_vec, dtype="float32").reshape(1, -1)
        vectors = embed_texts([q.question_text for q in existing])
        existing_vecs = vectors[: len(existing)]

    sims = _cosine_similarities(new_vec[0], existing_vecs)
    best_idx = int(np.argmax(sims))
    best_score = float(sims[best_idx])

    if best_score >= DUPLICATE_SIMILARITY_THRESHOLD:
        logger.info(
            "Duplicate question detected (score=%.4f >= %.2f) vs question %s",
            best_score, DUPLICATE_SIMILARITY_THRESHOLD, existing[best_idx].id,
        )
        return {
            "is_duplicate": True,
            "similar_to_id": str(existing[best_idx].id),
            "similarity": round(best_score, 4),
        }

    return {"is_duplicate": False, "similarity": round(best_score, 4)}


# ── Check 2: Answerability / grounding ────────────────────────────────────────

def check_answerability(
    question: dict,
    source_chunks: list[str],
    *,
    question_vec: Optional[np.ndarray] = None,
) -> dict:
    """Confirm the question's answer is grounded in the retrieved source chunks.

    Combines:
    1. Primary signal: embedding cosine similarity between the answer and chunks.
    2. Secondary signal: keyword overlap between the answer/question and context.

    When there is no reference answer to ground on, the question text itself is
    used; if the caller already embedded that question (``question_vec``) it is
    reused rather than embedded a second time.
    """
    answer = ""
    if isinstance(question, dict):
        answer = question.get("correct_answer") or question.get("question") or ""
    else:  # defensive: allow objects with attributes
        answer = getattr(question, "correct_answer", "") or getattr(question, "question", "") or ""

    chunk_texts = [str(c) for c in (source_chunks or []) if c and str(c).strip()]
    if not answer.strip() or not chunk_texts:
        return {"is_answerable": False, "best_match_score": 0.0, "keyword_overlap": 0.0}

    # Did the answer fall back to the question text? If so we can reuse the
    # caller's question embedding instead of embedding the same text again.
    has_reference = bool(
        (question.get("correct_answer") if isinstance(question, dict)
         else getattr(question, "correct_answer", "")) or ""
    )
    if not has_reference and question_vec is not None:
        answer_vec = np.asarray(question_vec, dtype="float32").reshape(1, -1)
        chunk_vecs = embed_texts(chunk_texts)
    else:
        vectors = embed_texts([answer] + chunk_texts)
        answer_vec, chunk_vecs = vectors[:1], vectors[1:]

    sims = _cosine_similarities(answer_vec[0], chunk_vecs)
    best_score = float(np.max(sims))
    keyword_overlap = _compute_keyword_overlap(answer, chunk_texts)

    # Primary check is embedding similarity; secondary keyword signal reinforces borderline cases
    is_answerable = (
        best_score >= ANSWERABILITY_SIMILARITY_THRESHOLD
        or (best_score >= (ANSWERABILITY_SIMILARITY_THRESHOLD - 0.10) and keyword_overlap >= KEYWORD_OVERLAP_THRESHOLD)
    )

    return {
        "is_answerable": is_answerable,
        "best_match_score": round(best_score, 4),
        "keyword_overlap": keyword_overlap,
    }


# ── Check 3: Cognitive alignment check ────────────────────────────────────────

def check_stem_alignment(question_text: str, requested_bloom: str) -> dict:
    """Deterministic stem check (Step 3b).

    The question must open with a stem from the requested level's verb list and
    never with a forbidden lower-level verb. Delegates to
    :func:`generation_service.check_stem` — the single source of truth shared
    with the generation prompt and scripts/bloom_audit.py — and shapes the
    result like the other checks so it travels in the combined verdict.
    """
    from app.services.generation_service import VALID_BLOOM_LEVELS, check_stem

    requested = (requested_bloom or "").lower().strip()
    if requested not in VALID_BLOOM_LEVELS:
        return {
            "is_compliant": True,
            "stem": None,
            "allowed_hit": None,
            "forbidden_hit": None,
            "violations": [],
            "reason": "No constraint specified",
        }

    result = check_stem(question_text, requested)
    violations: list[str] = []
    if result["forbidden_hit"]:
        violations.append(
            f"opening uses forbidden lower-level verb '{result['forbidden_hit']}'"
        )
    if not result["allowed_hit"]:
        violations.append(
            f"question does not open with a required {requested} stem "
            f"(first word: '{result['stem']}')"
        )
    return {
        "is_compliant": not violations,
        "stem": result["stem"],
        "allowed_hit": result["allowed_hit"],
        "forbidden_hit": result["forbidden_hit"],
        "violations": violations,
        "reason": "Opening stem is valid" if not violations else "; ".join(violations),
    }


def check_cognitive_alignment(
    question_text: str,
    requested_bloom: str,
    llm_client: Optional[Any] = None,
) -> dict:
    """Cognitive-alignment gate (Step 3c): classify the question's ACTUAL Bloom
    level with an LLM judge and compare it against the requested level using the
    configured per-level tolerance (``settings.bloom_alignment_tolerance``,
    shipped default: 1 step for remember/understand, 0 for apply and above).

    The verdict (actual level, distance, tolerance) travels in the combined
    validation result so a corrective regeneration gets the specific mismatch as
    ``extra_instruction``. When no level is requested, no judge is configured,
    or the judge itself fails (quota, malformed verdict), the gate is skipped
    (``evaluated`` False, ``is_aligned`` True) — a judge hiccup must never fail
    an otherwise-valid generated question.
    """
    from app.services.generation_service import BLOOM_ORDER, VALID_BLOOM_LEVELS

    requested = (requested_bloom or "").lower().strip()
    if requested not in VALID_BLOOM_LEVELS:
        return {
            "is_aligned": True,
            "evaluated": False,
            "detected_level": requested or "unknown",
            "requested_level": requested,
            "distance": None,
            "tolerance": 0,
            "reason": "No constraint specified",
        }
    if llm_client is None:
        return {
            "is_aligned": True,
            "evaluated": False,
            "detected_level": None,
            "requested_level": requested,
            "distance": None,
            "tolerance": settings.tolerance_for(requested),
            "reason": "Alignment judge not configured — gate skipped",
        }

    from app.services import llm_utils

    def _parse(raw: dict) -> str:
        actual = str(raw.get("actual_level", "")).strip().lower()
        if actual not in VALID_BLOOM_LEVELS:
            raise ValueError(f"unknown actual_level {actual!r}")
        return actual

    prompt = (
        "Classify the ACTUAL Bloom's Taxonomy level that the exam question below "
        "demands of a student.\n\n"
        "Levels (low to high):\n"
        "- remember: recall facts, terms, definitions\n"
        "- understand: explain or paraphrase in own words\n"
        "- apply: use the concept in a concrete, specific situation\n"
        "- analyze: break into parts, compare, distinguish causes from effects\n"
        "- evaluate: judge or critique against criteria\n"
        "- create: design or synthesize something new\n\n"
        f"Question:\n{question_text}\n\n"
        "Return ONLY a raw JSON object:\n"
        '{"actual_level": "<one of: remember|understand|apply|analyze|evaluate|create>"}'
    )
    try:
        actual = llm_utils.call_json_with_retry(
            lambda p: llm_utils.request_text(
                llm_client,
                p,
                models=llm_utils.resolve_model_chain(settings.llm_model),
            ),
            prompt,
            _parse,
        )
    except Exception as exc:
        logger.warning("Cognitive alignment judge failed — gate skipped: %s", exc)
        return {
            "is_aligned": True,
            "evaluated": False,
            "detected_level": None,
            "requested_level": requested,
            "distance": None,
            "tolerance": settings.tolerance_for(requested),
            "reason": f"alignment judge failed ({type(exc).__name__}) — gate skipped",
        }

    distance = abs(BLOOM_ORDER.index(actual) - BLOOM_ORDER.index(requested))
    tolerance = settings.tolerance_for(requested)
    return {
        "is_aligned": distance <= tolerance,
        "evaluated": True,
        "detected_level": actual,
        "requested_level": requested,
        "distance": distance,
        "tolerance": tolerance,
        "reason": (
            f"question classified as '{actual}' (requested '{requested}', "
            f"distance {distance}, tolerance {tolerance})"
        ),
    }


# ── Orchestrator ──────────────────────────────────────────────────────────────

def validate_question(
    generated: Any,
    subject: str,
    topic: str,
    source_chunks: list[str],
    db: Session,
    requested_bloom: Optional[str] = None,
    llm_client: Optional[Any] = None,
) -> dict:
    """Run all validation checks and return a combined verdict.

    ``generated`` may be a ``GeneratedQuestion`` model or a plain dict.

    Checks:
    1. Duplicate detection: embedding similarity against stored questions <= 0.90.
    2. Answerability check: embedding similarity to retrieved context + keyword overlap.
    3. Stem check: deterministic — the question must open with an allowed verb for
       the requested Bloom level and no forbidden lower-level verb.
    4. Cognitive alignment gate: an LLM classifies the question's ACTUAL Bloom
       level; it must sit within the configured tolerance of the requested one
       (skipped when no judge client is passed).

    Returns::

        {
          "passed": bool,
          "duplicate_check": {...},
          "answerability_check": {...},
          "stem_check": {...},
          "cognitive_alignment_check": {...},
          "reason": str | None,
          "reason_code": "duplicate" | "answerability" | "stem" | "cognitive" | None,
        }
    """
    payload = generated if isinstance(generated, dict) else generated.model_dump()
    bloom = requested_bloom or payload.get("bloom_level") or ""
    question_text = payload["question"]

    # Deterministic stem check (Step 3b) — no embeddings, no LLM, runs first.
    stem_check = check_stem_alignment(question_text, bloom)

    # Fetch the duplicate candidates up front, on the CALLER's thread:
    # SQLAlchemy sessions are not thread-safe, so the concurrent checks below
    # must not touch the session themselves.
    existing = _query_existing(db, subject, topic)

    # Embed the new question exactly ONCE and share the vector with both checks.
    # Only computed when a check actually needs it:
    #   * duplicate check -> whenever there is stored history to compare against
    #   * answerability   -> when there is no reference answer to ground on, so
    #                        the check falls back to embedding the question text
    reference = (payload.get("correct_answer") or "") if isinstance(payload, dict) else ""
    question_vec: Optional[np.ndarray] = None
    if existing or not reference.strip():
        question_vec = embed_texts([question_text])[0]

    # The two checks are independent → run them concurrently so their embedding
    # work overlaps instead of running back-to-back.
    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="qm-validate") as pool:
        dup_future = pool.submit(
            check_duplicate,
            question_text,
            subject,
            topic,
            db,
            question_vec=question_vec,
            existing=existing,
        )
        ans_future = pool.submit(
            check_answerability,
            payload,
            source_chunks,
            question_vec=question_vec,
        )
        duplicate_check = dup_future.result()
        answerability_check = ans_future.result()

    cognitive_check = check_cognitive_alignment(
        question_text=payload["question"],
        requested_bloom=bloom,
        llm_client=llm_client,
    )

    passed = (
        (not duplicate_check["is_duplicate"])
        and answerability_check["is_answerable"]
        and stem_check["is_compliant"]
        and cognitive_check["is_aligned"]
    )

    reason: Optional[str] = None
    # Machine-readable companion to *reason* so callers can map a failure to a
    # specific error code (e.g. DUPLICATE_QUESTION) without string-matching the
    # human-readable text. One of "duplicate" / "answerability" / "stem" /
    # "cognitive", or None when the question passed.
    reason_code: Optional[str] = None
    if duplicate_check["is_duplicate"]:
        reason_code = "duplicate"
        reason = (
            f"Duplicate question: {duplicate_check.get('similarity')} similarity "
            f"with existing question {duplicate_check.get('similar_to_id')} "
            f"(threshold {DUPLICATE_SIMILARITY_THRESHOLD})."
        )
    elif not answerability_check["is_answerable"]:
        reason_code = "answerability"
        reason = (
            f"Answer not grounded in source material: best chunk similarity "
            f"{answerability_check.get('best_match_score')} < "
            f"{ANSWERABILITY_SIMILARITY_THRESHOLD}."
        )
    elif not stem_check["is_compliant"]:
        reason_code = "stem"
        reason = f"Bloom stem violation for level '{bloom}': {stem_check['reason']}."
    elif not cognitive_check["is_aligned"]:
        reason_code = "cognitive"
        reason = (
            f"Cognitive level mismatch: question reads as "
            f"'{cognitive_check.get('detected_level')}' but '{bloom}' was requested "
            f"(distance {cognitive_check.get('distance')} > tolerance "
            f"{cognitive_check.get('tolerance')})."
        )

    return {
        "passed": passed,
        "duplicate_check": duplicate_check,
        "answerability_check": answerability_check,
        "stem_check": stem_check,
        "cognitive_alignment_check": cognitive_check,
        "reason": reason,
        "reason_code": reason_code,
    }
