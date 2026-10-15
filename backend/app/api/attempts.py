"""
Attempt Routes — /attempts
===========================
Accepts student answers to questions, runs rubric-based LLM-as-judge evaluation,
persists the score and criteria_scores (JSONB) in the database, updates the user's
adaptive mastery profile, and returns detailed constructive feedback.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.db.session import get_db
from app.models.models import Attempt, Question, User
from app.schemas.schemas import (
    AttemptFeedback,
    AttemptHistoryItem,
    SubmitAttemptRequest,
)
from app.services.adaptive_service import update_mastery_profile
from app.services.evaluation_service import evaluate_answer
from app.services.mastery_service import update_mastery

logger = logging.getLogger("querymind.attempts")

router = APIRouter()


def _normalize_criteria_scores(scores: dict[str, int]) -> dict[str, float]:
    """Rubric sub-scores are stored 0-10 but exposed 0-1 to match the client contract."""
    return {name: round(value / 10.0, 4) for name, value in scores.items()}


@router.post(
    "/submit",
    response_model=AttemptFeedback,
    summary="Submit an answer for rubric-based LLM evaluation",
)
def submit_attempt(
    payload: SubmitAttemptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttemptFeedback:
    """Submit a student answer for rubric-based evaluation.

    1. Retrieves question by question_id.
    2. Validates student answer (non-empty).
    3. Evaluates answer against weighted 5-criterion rubric (LLM-as-judge).
    4. Computes overall score in code.
    5. Persists Attempt with criteria_scores stored as JSONB.
    6. Calls adaptive engine's update_mastery_profile function.
    7. Returns comprehensive feedback with score breakdowns and missing points.
    """
    question = db.query(Question).filter(Question.id == payload.question_id).first()
    if question is None:
        raise NotFoundError(f"Question with ID {payload.question_id} not found.")

    answer_text = (payload.answer_text or payload.user_answer or "").strip()
    if not answer_text:
        raise ValidationError("Answer text must not be empty.")

    # Determine user identity
    user_id = current_user.id if current_user is not None else payload.user_id
    if user_id is None:
        # Fallback to a deterministic test UUID if neither token nor payload provides user_id
        user_id = uuid.UUID("00000000-0000-0000-0000-000000000001")

    # Evaluate answer with LLM judge
    evaluation = evaluate_answer(question=question, student_answer=answer_text)

    # Persist attempt
    attempt = Attempt(
        user_id=user_id,
        question_id=question.id,
        user_answer=answer_text,
        score=round(evaluation["overall_score"] / 100.0, 4),
        feedback=evaluation["feedback"],
        criteria_scores=evaluation["scores"],
        evaluation_data=json.dumps(evaluation),
        time_taken_seconds=payload.time_taken_seconds,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    # Call adaptive engine's mastery update function (knowledge_profiles store).
    try:
        update_mastery_profile(
            user_id=user_id,
            topic=question.topic,
            bloom_level=question.bloom_level,
            score=attempt.score,
            db=db,
        )
    except Exception as exc:
        logger.warning("Adaptive engine mastery update error: %s", exc)

    # Fold this attempt into the EMA mastery store (mastery_records). The
    # adaptive engine's recommend_next() — used by adaptive=true generation —
    # reads this store, so without this write adaptive mode never adapts for
    # frontend clients (which only call /attempts/submit). Mirrors the defensive
    # pattern in questions.py submit-answer: the attempt is already committed, so
    # a mastery failure must never surface to the caller.
    try:
        with db.begin_nested():
            update_mastery(
                user_id=user_id,
                subject=question.subject,
                topic=question.topic,
                score=attempt.score,
                bloom_level=question.bloom_level,
                difficulty=question.difficulty,
                db=db,
            )
        db.commit()
    except Exception:  # defensive: the answer must survive a mastery failure
        logger.exception(
            "Mastery update failed for user=%s subject=%s topic=%s; "
            "attempt=%s was still saved",
            user_id, question.subject, question.topic, attempt.id,
        )

    return AttemptFeedback(
        attempt_id=attempt.id,
        question_id=question.id,
        score=attempt.score,
        overall_score=evaluation["overall_score"],
        criteria_scores=_normalize_criteria_scores(evaluation["scores"]),
        feedback=evaluation["feedback"],
        missing_points=evaluation.get("missing_points", []),
        strengths=evaluation.get("strengths", []),
        correct_answer=question.reference_answer,
        stub=False,
    )


@router.get(
    "/history/{user_id}",
    response_model=list[AttemptHistoryItem],
    summary="List a user's past attempts with question metadata",
)
def get_attempt_history(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AttemptHistoryItem]:
    """Return the caller's attempts, newest first.

    The path ``user_id`` must match the authenticated user — a learner may only
    read their own history.
    """
    if user_id != current_user.id:
        raise ForbiddenError("You can only view your own attempt history")

    rows = (
        db.query(Attempt, Question)
        .join(Question, Attempt.question_id == Question.id)
        .filter(Attempt.user_id == user_id)
        .order_by(Attempt.created_at.desc())
        .all()
    )
    return [
        AttemptHistoryItem(
            attempt_id=attempt.id,
            question_id=attempt.question_id,
            topic=question.topic,
            bloom_level=question.bloom_level,
            difficulty=question.difficulty,
            score=attempt.score,
            submitted_at=attempt.created_at,
        )
        for attempt, question in rows
    ]
