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
"""

from __future__ import annotations

import logging
from typing import Any, Optional, Sequence

import numpy as np
from sqlalchemy.orm import Session

from app.models.models import Question

logger = logging.getLogger("querymind.validation")

# ── Thresholds ────────────────────────────────────────────────────────────────
DUPLICATE_SIMILARITY_THRESHOLD = 0.85     # >= this cosine similarity => duplicate
ANSWERABILITY_SIMILARITY_THRESHOLD = 0.50  # answer must match a chunk at least this well


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


# ── Check 1: Duplicate detection ──────────────────────────────────────────────

def check_duplicate(
    question_text: str,
    subject: str,
    topic: str,
    db: Session,
) -> dict:
    """Flag ``question_text`` as a duplicate of an existing question.

    Only questions stored for the same ``subject`` + ``topic`` are compared.
    Similarity is embedding cosine similarity (not exact string matching).
    """
    existing: list[Question] = (
        db.query(Question)
        .filter(Question.subject == subject, Question.topic == topic)
        .all()
    )
    if not existing:
        return {"is_duplicate": False, "similarity": 0.0}

    vectors = embed_texts([question_text] + [q.question_text for q in existing])
    new_vec, existing_vecs = vectors[:1], vectors[1:]

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

def check_answerability(question: dict, source_chunks: list[str]) -> dict:
    """Confirm the question's answer is grounded in the retrieved source chunks.

    Embeds the ``correct_answer`` and each chunk; answerable if the best cosine
    similarity to any chunk meets :data:`ANSWERABILITY_SIMILARITY_THRESHOLD`.
    """
    answer = ""
    if isinstance(question, dict):
        answer = question.get("correct_answer") or ""
    else:  # defensive: allow objects with a correct_answer attribute
        answer = getattr(question, "correct_answer", "") or ""

    chunk_texts = [str(c) for c in (source_chunks or []) if c and str(c).strip()]
    if not answer.strip() or not chunk_texts:
        return {"is_answerable": False, "best_match_score": 0.0}

    vectors = embed_texts([answer] + chunk_texts)
    answer_vec, chunk_vecs = vectors[:1], vectors[1:]

    sims = _cosine_similarities(answer_vec[0], chunk_vecs)
    best_score = float(np.max(sims))

    return {
        "is_answerable": best_score >= ANSWERABILITY_SIMILARITY_THRESHOLD,
        "best_match_score": round(best_score, 4),
    }


# ── Orchestrator ──────────────────────────────────────────────────────────────

def validate_question(
    generated: Any,
    subject: str,
    topic: str,
    source_chunks: list[str],
    db: Session,
) -> dict:
    """Run all validation checks and return a combined verdict.

    ``generated`` may be a ``GeneratedQuestion`` model or a plain dict.

    Returns::

        {
          "passed": bool,
          "duplicate_check": {...},
          "answerability_check": {...},
          "reason": str | None,
        }

    ``passed`` is False if either check fails; ``reason`` explains which and why.
    """
    payload = generated if isinstance(generated, dict) else generated.model_dump()

    duplicate_check = check_duplicate(
        question_text=payload["question"],
        subject=subject,
        topic=topic,
        db=db,
    )
    answerability_check = check_answerability(
        question=payload,
        source_chunks=source_chunks,
    )

    passed = (not duplicate_check["is_duplicate"]) and answerability_check["is_answerable"]

    reason: Optional[str] = None
    if duplicate_check["is_duplicate"]:
        reason = (
            f"Duplicate question: {duplicate_check.get('similarity')} similarity "
            f"with existing question {duplicate_check.get('similar_to_id')} "
            f"(threshold {DUPLICATE_SIMILARITY_THRESHOLD})."
        )
    elif not answerability_check["is_answerable"]:
        reason = (
            f"Answer not grounded in source material: best chunk similarity "
            f"{answerability_check.get('best_match_score')} < "
            f"{ANSWERABILITY_SIMILARITY_THRESHOLD}."
        )

    return {
        "passed": passed,
        "duplicate_check": duplicate_check,
        "answerability_check": answerability_check,
        "reason": reason,
    }
