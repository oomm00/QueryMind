"""Attempt submission core — one write path for both answer endpoints.

The evaluator runs BEFORE the short write transaction. The Attempt and its
``mastery_records`` update then commit atomically. ``submission_id`` makes a
re-submission idempotent: one Attempt per (user, question, submission_id).
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from typing import Any, Callable

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationError
from app.models.models import Attempt, Question
from app.services.evaluation_service import evaluate_answer
from app.services.mastery_service import update_mastery
from app.services.score_utils import normalize_score

logger = logging.getLogger("querymind.attempts")

Evaluator = Callable[..., dict[str, Any]]


def _normalize_criteria_scores(scores: dict[str, int]) -> dict[str, float]:
    """Rubric sub-scores are stored 0-10 but exposed 0-1 to the client contract."""
    return {name: round(value / 10.0, 4) for name, value in scores.items()}


def _submission_id(
    user_id: uuid.UUID,
    question_id: uuid.UUID,
    answer_text: str,
    provided: str | None,
) -> str:
    if provided:
        return provided[:128]
    digest = hashlib.sha256(
        f"{user_id}|{question_id}|{answer_text}".encode("utf-8")
    ).hexdigest()
    return f"auto:{digest}"


def _result(
    *,
    attempt_id: uuid.UUID,
    question_id: uuid.UUID,
    submission_id: str | None,
    score: float,
    reference_answer: str | None,
    evaluation: dict[str, Any],
    evaluation_mode: str | None,
) -> dict[str, Any]:
    scores = evaluation.get("scores") or {}
    return {
        "attempt_id": attempt_id,
        "question_id": question_id,
        "score": score,
        "overall_score": round(score * 100.0, 4),
        "scores": scores,
        "criteria_scores": _normalize_criteria_scores(scores),
        "feedback": evaluation.get("feedback", ""),
        "missing_points": evaluation.get("missing_points", []),
        "strengths": evaluation.get("strengths", []),
        "reference_answer": reference_answer,
        "evaluation_mode": evaluation_mode,
        "submission_id": submission_id,
    }


def _stored_result(
    db: Session,
    *,
    user_id: uuid.UUID,
    question_id: uuid.UUID,
    submission_id: str,
    reference_answer: str | None,
    evaluation_mode: str | None,
) -> dict[str, Any] | None:
    existing = (
        db.query(Attempt)
        .filter(
            Attempt.user_id == user_id,
            Attempt.question_id == question_id,
            Attempt.submission_id == submission_id,
        )
        .first()
    )
    if existing is None:
        return None
    stored = json.loads(existing.evaluation_data or "{}")
    result = _result(
        attempt_id=existing.id,
        question_id=question_id,
        submission_id=existing.submission_id,
        score=existing.score,
        reference_answer=reference_answer,
        evaluation=stored,
        evaluation_mode=evaluation_mode,
    )
    result["duplicate_submission"] = True
    return result


def submit_attempt_core(
    *,
    db: Session,
    user_id: uuid.UUID,
    question: Question,
    answer_text: str,
    submission_id: str | None = None,
    time_taken_seconds: int | None = None,
    evaluator: Evaluator | None = None,
    evaluation_mode: str | None = "llm",
) -> dict[str, Any]:
    """Evaluate, persist and fold into mastery atomically; idempotent by submission id.

    If ``submission_id`` is missing, a server-generated key is used. That key is
    stable for an identical answer but is NOT a client idempotency guarantee —
    a warning is logged in that case.
    """
    answer_text = (answer_text or "").strip()
    if not answer_text:
        raise ValidationError("Answer text must not be empty.")

    # Capture ORM primitives before any rollback/expire.
    question_id = question.id
    q_subject = question.subject
    q_topic = question.topic
    q_bloom = question.bloom_level
    q_difficulty = question.difficulty
    q_reference = question.reference_answer

    sid = _submission_id(user_id, question_id, answer_text, submission_id)
    if not submission_id:
        logger.warning(
            "submission_id missing for user=%s question=%s; using server-generated "
            "key (not client-idempotent across retries)",
            user_id, question_id,
        )

    existing = _stored_result(
        db,
        user_id=user_id,
        question_id=question_id,
        submission_id=sid,
        reference_answer=q_reference,
        evaluation_mode=evaluation_mode,
    )
    if existing is not None:
        return existing

    # ── No DB transaction / row lock is held across the LLM call ─────────────
    judge = evaluator or evaluate_answer  # resolved at call time so tests can patch it
    evaluation = judge(question=question, student_answer=answer_text)
    score = normalize_score(evaluation["overall_score"] / 100.0)
    db.rollback()  # end the read-only transaction opened by the duplicate check

    # ── Short write transaction: attempt + mastery, commit together ──────────
    try:
        with db.begin():
            attempt = Attempt(
                user_id=user_id,
                question_id=question_id,
                user_answer=answer_text,
                score=round(score, 4),
                feedback=evaluation.get("feedback", ""),
                criteria_scores=evaluation.get("scores") or {},
                evaluation_data=json.dumps(evaluation),
                submission_id=sid,
                time_taken_seconds=time_taken_seconds,
            )
            db.add(attempt)
            db.flush()
            attempt_id = attempt.id

            update_mastery(
                user_id=user_id,
                subject=q_subject,
                topic=q_topic,
                score=round(score, 4),
                bloom_level=q_bloom,
                difficulty=q_difficulty,
                db=db,
            )
    except IntegrityError:
        # Another worker won the insert race for the same submission_id.
        db.rollback()
        winner = _stored_result(
            db,
            user_id=user_id,
            question_id=question_id,
            submission_id=sid,
            reference_answer=q_reference,
            evaluation_mode=evaluation_mode,
        )
        if winner is not None:
            return winner
        raise

    result = _result(
        attempt_id=attempt_id,
        question_id=question_id,
        submission_id=sid,
        score=round(score, 4),
        reference_answer=q_reference,
        evaluation=evaluation,
        evaluation_mode=evaluation_mode,
    )
    result["duplicate_submission"] = False
    return result
