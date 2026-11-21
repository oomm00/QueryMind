"""
Question Routes — /questions
==============================
Endpoints for AI-powered question generation with Bloom's taxonomy, retrieval,
and pre-delivery validation (pipeline Stage 5). Requires authentication on all
routes.
"""

from __future__ import annotations

import logging
import time
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.exceptions import (
    BloomAlignmentError,
    DuplicateQuestionError,
    LLMNotConfiguredError,
    NotFoundError,
    ValidationError,
    QueryMindError,
)
from app.core.timing import stage
from app.db.session import get_db
from app.models.models import Attempt, Question, User
from app.schemas.schemas import (
    AnswerEvaluationResponse,
    GenerateQuestionRequest,
    GeneratedQuestion,
    GeneratedQuestionsResponse,
    SubmitAnswerRequest,
)
from app.services.attempt_service import submit_attempt_core
from app.services.generation_fallback import generate_one, persist_generated_question
from app.services.generation_service import _configure_genai
from app.services.mastery_service import adaptive_recommendation
from app.services.retrieval import retrieve_context
from app.services.validation_service import validate_question

logger = logging.getLogger("querymind.questions")

router = APIRouter()


@router.post(
    "/generate",
    response_model=GeneratedQuestionsResponse,
    summary="Generate a valid question (live LLM, cache, or seeded demo bank)",
)
def generate_questions(
    payload: GenerateQuestionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GeneratedQuestionsResponse:
    """Always return ``num_questions`` usable questions in ONE request.

    Retrieval and the adaptive rung choice happen once. Each question is produced
    by :func:`generate_one`, which tries the LLM within a hard deadline, handles
    duplicates/Bloom mismatches server-side, then degrades to cached questions and
    finally the seeded bank. A question is never thrown away after two LLM calls.
    """
    deadline = time.monotonic() + settings.generation_deadline_seconds

    # ── Adaptive selection (one ordered ladder, from mastery_records) ─────────
    bloom_level = payload.bloom_level
    difficulty = payload.difficulty
    generation_topic = (payload.topic or "").strip() or "Uploaded notes"
    generation_subject = (payload.subject or "").strip() or "General"
    adaptive_reason: str | None = None
    if payload.adaptive:
        recommendation = adaptive_recommendation(
            current_user.id, generation_subject, generation_topic, db
        )
        bloom_level = recommendation["bloom_level"]
        difficulty = recommendation["difficulty"]
        adaptive_reason = recommendation["reason"]

    # Retrieval is skipped entirely in offline demo mode.
    context_chunks: list[dict] = []
    if not settings.offline_demo_mode:
        with stage("retrieve"):
            context_chunks = retrieve_context(
                topic=None if payload.uploaded_only and not payload.topic else generation_topic,
                subject=None if payload.uploaded_only and not payload.topic else generation_subject,
                bloom_level=bloom_level,
                difficulty=difficulty,
                public_only=not payload.uploaded_only,
                college_only=payload.uploaded_only,
            )
            if not context_chunks and not payload.uploaded_only:
                context_chunks = retrieve_context(
                    topic=generation_topic, subject=None, bloom_level=bloom_level,
                    difficulty=difficulty, public_only=True,
                )

    alignment_client = None
    if not settings.offline_demo_mode:
        try:
            alignment_client = _configure_genai(
                thinking_level=settings.llm_thinking_level,
                max_output_tokens=settings.llm_max_output_tokens,
            )
        except LLMNotConfiguredError:
            alignment_client = None

    results: list[GeneratedQuestion] = []
    excluded_texts: set[str] = set()
    for _ in range(payload.num_questions):
        with stage("generate"):
            generated = generate_one(
                db=db,
                subject=generation_subject,
                topic=generation_topic,
                bloom_level=bloom_level,
                difficulty=difficulty,
                question_type=payload.question_type,
                context_chunks=context_chunks,
                alignment_client=alignment_client,
                excluded_texts=excluded_texts,
                deadline=deadline,
                adaptive_reason=adaptive_reason,
            )
        if payload.adaptive:
            generated.adaptive = True
            generated.adaptive_reason = generated.adaptive_reason or adaptive_reason
        persisted = persist_generated_question(
            db=db,
            generated=generated,
            subject=generation_subject,
            topic=generation_topic,
            question_type=payload.question_type,
        )
        generated.question_id = persisted.id
        results.append(generated)
        excluded_texts.add(generated.question)

    return GeneratedQuestionsResponse(**results[0].model_dump(), questions=results)


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
    """Grade an answer through the shared attempt core (one transaction)."""
    question = db.query(Question).filter(Question.id == question_id).first()
    if question is None:
        raise NotFoundError(f"Question {question_id} not found")

    with stage("evaluate"):
        result = submit_attempt_core(
            db=db,
            user_id=current_user.id,
            question=question,
            answer_text=payload.answer,
            submission_id=payload.submission_id,
        )

    return AnswerEvaluationResponse(
        attempt_id=result["attempt_id"],
        question_id=result["question_id"],
        scores=result["scores"],
        overall_score=result["overall_score"],
        feedback=result["feedback"],
        missing_points=result["missing_points"],
        strengths=result["strengths"],
        reference_answer=result["reference_answer"],
        evaluation_mode=result["evaluation_mode"],
        duplicate_submission=result.get("duplicate_submission", False),
    )
