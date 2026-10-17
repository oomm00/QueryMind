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

def check_cognitive_alignment(
    question_text: str,
    requested_bloom: str,
    llm_client: Optional[Any] = None,
) -> dict:
    """Lightweight check verifying the generated question's phrasing matches requested Bloom level."""
    from app.services.generation_service import BLOOM_VERBS, VALID_BLOOM_LEVELS

    requested = (requested_bloom or "").lower().strip()
    if not requested or requested not in VALID_BLOOM_LEVELS:
        return {"is_aligned": True, "detected_level": requested or "unknown", "reason": "No constraint specified"}

    # Heuristic verification of cognitive verbs in the question phrasing
    target_verbs = BLOOM_VERBS.get(requested, [])
    has_target_verb = any(re.search(rf"\b{re.escape(v)}\b", question_text.lower()) for v in target_verbs)

    # If lightweight LLM client is provided, query it for alignment verdict
    if llm_client is not None:
        prompt = (
            f"You are an academic assessment validator. Determine whether the following question "
            f"is phrased to assess the Bloom's Taxonomy cognitive level '{requested.upper()}'.\n\n"
            f"Question:\n{question_text}\n\n"
            f"Return ONLY a JSON object:\n"
            f'{{"is_aligned": true/false, "detected_level": "{requested}", "reason": "concise explanation"}}'
        )
        try:
            from app.services import llm_utils

            resp = llm_utils.request_text(llm_client, prompt)
            parsed = llm_utils.extract_json(resp)
            if isinstance(parsed, dict) and "is_aligned" in parsed:
                return {
                    "is_aligned": bool(parsed.get("is_aligned")),
                    "detected_level": str(parsed.get("detected_level", requested)),
                    "reason": str(parsed.get("reason", "")),
                }
        except Exception as exc:
            logger.warning("Cognitive alignment check via LLM encountered an issue: %s", exc)

    is_aligned = has_target_verb or len(question_text.split()) >= 4
    return {
        "is_aligned": is_aligned,
        "detected_level": requested,
        "reason": "Phrased with cognitive action verbs" if has_target_verb else "Syntactic structure aligns with cognitive demand",
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
    3. Cognitive alignment check: phrasing matches requested Bloom level.

    Returns::

        {
          "passed": bool,
          "duplicate_check": {...},
          "answerability_check": {...},
          "cognitive_alignment_check": {...},
          "reason": str | None,
          "reason_code": "duplicate" | "answerability" | "cognitive" | None,
        }
    """
    payload = generated if isinstance(generated, dict) else generated.model_dump()
    bloom = requested_bloom or payload.get("bloom_level") or ""
    question_text = payload["question"]

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
        and cognitive_check["is_aligned"]
    )

    reason: Optional[str] = None
    # Machine-readable companion to *reason* so callers can map a failure to a
    # specific error code (e.g. DUPLICATE_QUESTION) without string-matching the
    # human-readable text. One of "duplicate" / "answerability" / "cognitive",
    # or None when the question passed.
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
    elif not cognitive_check["is_aligned"]:
        reason_code = "cognitive"
        reason = (
            f"Cognitive level mismatch: question does not assess Bloom level '{bloom}' "
            f"({cognitive_check.get('reason')})."
        )

    return {
        "passed": passed,
        "duplicate_check": duplicate_check,
        "answerability_check": answerability_check,
        "cognitive_alignment_check": cognitive_check,
        "reason": reason,
        "reason_code": reason_code,
    }
