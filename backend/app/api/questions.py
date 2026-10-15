"""
Question Routes — /questions
==============================
Endpoints for AI-powered question generation with Bloom's taxonomy, retrieval,
and pre-delivery validation (pipeline Stage 5). Requires authentication on all
routes.
"""

from __future__ import annotations

import json
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
from app.services.retrieval import retrieve_context
from app.services.validation_service import validate_question

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
) -> Question:
    """Store a validated question so future generations can be de-duplicated."""
    question = Question(
        subject=subject,
        topic=topic,
        bloom_level=generated.bloom_level,
        difficulty=generated.difficulty,
        question_text=generated.question,
        reference_answer=generated.correct_answer,
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
    - Requires a valid JWT Bearer token.
    """
    # Retrieve context once and reuse it for both generation and the
    # answerability check (so the check sees the exact material used).
    context_chunks = retrieve_context(
        topic=payload.topic,
        subject=payload.subject,
        bloom_level=payload.bloom_level,
        difficulty=payload.difficulty,
    )
    chunk_texts = [chunk["text"] for chunk in context_chunks]

    generated = generate_question(
        topic=payload.topic,
        subject=payload.subject,
        bloom_level=payload.bloom_level,
        difficulty=payload.difficulty,
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
            bloom_level=payload.bloom_level,
            difficulty=payload.difficulty,
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
    )
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
        evaluation_data=json.dumps(evaluation),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

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
