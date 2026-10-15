"""
Question Routes — /questions
==============================
Endpoints for AI-powered question generation with Bloom's taxonomy, retrieval,
and pre-delivery validation (pipeline Stage 5). Requires authentication on all
routes.
"""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError, ValidationError
from app.db.session import get_db
from app.models.models import Attempt, Question, User
from app.schemas.schemas import (
    AnswerEvaluationResponse,
    GenerateQuestionRequest,
    GeneratedQuestion,
    SubmitAnswerRequest,
)
from app.services.evaluation_service import evaluate_answer
from app.services.generation_service import generate_question
from app.services.mastery_service import (
    explain_recommendation,
    recommend_next,
    update_mastery,
)
from app.services.retrieval import retrieve_context
from app.services.validation_service import validate_question

logger = logging.getLogger("querymind.questions")

router = APIRouter()


def _correction_note(validation: dict) -> str:
    """Build the corrective prompt note for the one regeneration retry."""
    if validation.get("duplicate_check", {}).get("is_duplicate"):
        return (
            "Your previous question was too similar to a question that already "
            "exists for this topic. Generate a genuinely DIFFERENT question that "
            "tests a different aspect, definition, mechanism, or scenario."
        )
    return (
        "Your previous question's answer was not clearly supported by the SOURCE "
        "MATERIAL. Base both the question and the correct answer strictly on facts "
        "stated in the source material above."
    )


def _persist_question(
    db: Session,
    generated: GeneratedQuestion,
    subject: str,
    topic: str,
    question_type: str = "descriptive",
) -> Question:
    """Store a validated question so future generations can be de-duplicated."""
    question = Question(
        subject=subject,
        topic=topic,
        bloom_level=generated.bloom_level,
        difficulty=generated.difficulty,
        question_type=question_type,
        question_text=generated.question,
        options=generated.options,
        starter_code=generated.starter_code,
        test_cases=generated.test_cases,
        reference_answer=generated.correct_answer,
        source_chunk_ids=generated.source_chunk_ids or generated.source_chunks,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.post(
    "/generate",
    response_model=GeneratedQuestion,
    summary="Generate an AI question grounded in retrieved course material",
)
def generate_questions(
    payload: GenerateQuestionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GeneratedQuestion:
    """Generate a single Bloom-taxonomy-aligned question using RAG + LLM.

    - Retrieves relevant context from ChromaDB (college material priority, public fallback).
    - Constructs a structured prompt with Bloom's cognitive verb anchoring.
    - Calls Gemini to generate the question in validated JSON format.
    - Runs pre-delivery validation (duplicate detection + answerability). If the
      question fails, generation is retried ONCE with a corrective note; if it
      still fails, the request is rejected with HTTP 422 rather than returning a
      bad question.
    - Persists the validated question so later generations can be de-duplicated.
    - With ``adaptive=true``, the learner's mastery profile (Stage 11) chooses the
      Bloom level and difficulty instead of the supplied values.
    - Requires a valid JWT Bearer token.
    """
    # ── Adaptive selection (Stage 11) ─────────────────────────────────────────
    # When adaptive, ignore the supplied bloom_level/difficulty and let the
    # learner's mastery profile pick the target level.
    bloom_level = payload.bloom_level
    difficulty = payload.difficulty
    adaptive_reason: str | None = None
    if payload.adaptive:
        recommendation = recommend_next(
            current_user.id, payload.subject, payload.topic, db
        )
        bloom_level = recommendation["bloom_level"]
        difficulty = recommendation["difficulty"]
        adaptive_reason = explain_recommendation(
            current_user.id, payload.subject, payload.topic, db
        )
        logger.info(
            "Adaptive selection for user=%s %s/%s -> %s/%s",
            current_user.id, payload.subject, payload.topic, bloom_level, difficulty,
        )

    # Retrieve context once and reuse it for both generation and the
    # answerability check (so the check sees the exact material used).
    context_chunks = retrieve_context(
        topic=payload.topic,
        subject=payload.subject,
        bloom_level=bloom_level,
        difficulty=difficulty,
    )
    chunk_texts = [chunk["text"] for chunk in context_chunks]

    generated = generate_question(
        topic=payload.topic,
        subject=payload.subject,
        bloom_level=bloom_level,
        difficulty=difficulty,
        question_type=payload.question_type,
        context_chunks=context_chunks,
    )

    validation = validate_question(
        generated=generated.model_dump(),
        subject=payload.subject,
        topic=payload.topic,
        source_chunks=chunk_texts,
        db=db,
    )

    if not validation["passed"]:
        # ── Single regeneration attempt with a corrective note ────────────────
        generated = generate_question(
            topic=payload.topic,
            subject=payload.subject,
            bloom_level=bloom_level,
            difficulty=difficulty,
            question_type=payload.question_type,
            context_chunks=context_chunks,
            extra_instruction=_correction_note(validation),
        )
        validation = validate_question(
            generated=generated.model_dump(),
            subject=payload.subject,
            topic=payload.topic,
            source_chunks=chunk_texts,
            db=db,
        )
        if not validation["passed"]:
            raise ValidationError(
                "Generated question failed pre-delivery validation after "
                f"regeneration: {validation['reason']}"
            )

    _persist_question(
        db=db,
        generated=generated,
        subject=payload.subject,
        topic=payload.topic,
        question_type=payload.question_type,
    )

    # Surface which level the profile chose (and why) on the response.
    if payload.adaptive:
        generated.adaptive = True
        generated.adaptive_reason = adaptive_reason

    return generated


@router.post(
    "/{question_id}/submit-answer",
    response_model=AnswerEvaluationResponse,
    summary="Submit a student answer for rubric-based evaluation",
)
def submit_answer(
    question_id: uuid.UUID,
    payload: SubmitAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnswerEvaluationResponse:
    """Grade a student's answer to an existing question and persist the attempt.

    - Looks up the question (404 if unknown).
    - Runs the rubric-based LLM judge (correctness / completeness /
      depth_of_reasoning / clarity) and computes the weighted overall score (0-100).
    - Persists an :class:`Attempt` (score stored as 0-1, full rubric JSON in
      ``evaluation_data``).
    - Requires a valid JWT Bearer token.
    """
    question = db.query(Question).filter(Question.id == question_id).first()
    if question is None:
        raise NotFoundError(f"Question {question_id} not found")

    evaluation = evaluate_answer(question=question, student_answer=payload.answer)

    attempt = Attempt(
        user_id=current_user.id,
        question_id=question.id,
        user_answer=payload.answer,
        score=round(evaluation["overall_score"] / 100.0, 4),  # store 0-1 per model convention
        feedback=evaluation["feedback"],
        criteria_scores=evaluation["scores"],
        evaluation_data=json.dumps(evaluation),
    )
    db.add(attempt)
    db.flush()  # assign attempt.id inside the open transaction

    # ── Stage 10: fold this attempt into the learner's mastery profile ────────
    # Runs in the SAME transaction as the attempt, but inside a SAVEPOINT so a
    # failure in the mastery update rolls back only the mastery write — the
    # student's answer is never lost.
    try:
        with db.begin_nested():
            update_mastery(
                user_id=current_user.id,
                subject=question.subject,
                topic=question.topic,
                score=attempt.score,
                bloom_level=question.bloom_level,
                difficulty=question.difficulty,
                db=db,
            )
    except Exception:  # defensive: the answer must survive a mastery failure
        logger.exception(
            "Mastery update failed for user=%s subject=%s topic=%s; "
            "attempt=%s was still saved",
            current_user.id, question.subject, question.topic, attempt.id,
        )

    db.commit()
    db.refresh(attempt)

    try:
        from app.services.adaptive_service import update_mastery_profile

        update_mastery_profile(
            user_id=current_user.id,
            topic=question.topic,
            bloom_level=question.bloom_level,
            score=attempt.score,
            db=db,
        )
    except Exception:
        pass

    return AnswerEvaluationResponse(
        attempt_id=attempt.id,
        question_id=question.id,
        scores=evaluation["scores"],
        overall_score=evaluation["overall_score"],
        feedback=evaluation["feedback"],
        missing_points=evaluation["missing_points"],
        strengths=evaluation["strengths"],
        reference_answer=question.reference_answer,
    )
