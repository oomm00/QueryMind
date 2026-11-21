"""
Attempt Routes — /attempts
===========================
Accepts student answers to questions, runs rubric-based LLM-as-judge evaluation,
persists the score and criteria_scores (JSONB) in the database, updates the user's
adaptive mastery profile, and returns detailed constructive feedback.
"""

from __future__ import annotations

import uuid  # needed to resolve postponed route annotations (uuid.UUID path params)

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import ForbiddenError, NotFoundError
from app.db.session import get_db
from app.models.models import Attempt, Question, User
from app.schemas.schemas import (
    AttemptFeedback,
    AttemptHistoryItem,
    SubmitAttemptRequest,
)
from app.services.attempt_service import submit_attempt_core

router = APIRouter()


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
    """Evaluate, persist and fold into mastery via the shared attempt core."""
    question = db.query(Question).filter(Question.id == payload.question_id).first()
    if question is None:
        raise NotFoundError(f"Question with ID {payload.question_id} not found.")

    result = submit_attempt_core(
        db=db,
        user_id=current_user.id,
        question=question,
        answer_text=payload.answer_text or payload.user_answer or "",
        submission_id=payload.submission_id,
        time_taken_seconds=payload.time_taken_seconds,
    )
    return AttemptFeedback(
        attempt_id=result["attempt_id"],
        question_id=result["question_id"],
        score=result["score"],
        overall_score=result["overall_score"],
        criteria_scores=result["criteria_scores"],
        feedback=result["feedback"],
        missing_points=result["missing_points"],
        strengths=result["strengths"],
        correct_answer=result["reference_answer"],
        stub=False,
        evaluation_mode=result["evaluation_mode"],
        duplicate_submission=result.get("duplicate_submission", False),
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
