"""
Question Routes — /questions
==============================
Endpoints for AI-powered question generation with Bloom's taxonomy and retrieval.
Requires authentication on all routes except where noted.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.models import User
from app.schemas.schemas import (
    GenerateQuestionRequest,
    GenerateQuestionResponse,
    GeneratedQuestion,
    QuestionOut,
)
from app.services.generation_service import generate_question
from app.services.question_service import generate_questions_stub

import uuid

router = APIRouter()


@router.post(
    "/generate",
    response_model=GeneratedQuestion,
    summary="Generate an AI question grounded in retrieved course material",
)
def generate_questions(
    payload: GenerateQuestionRequest,
    current_user: User = Depends(get_current_user),
) -> GeneratedQuestion:
    """Generate a single Bloom-taxonomy-aligned question using RAG + LLM.

    - Retrieves relevant context from ChromaDB (college material priority, public fallback).
    - Constructs a structured prompt with Bloom's cognitive verb anchoring.
    - Calls Gemini to generate the question in validated JSON format.
    - Requires a valid JWT Bearer token.
    """
    return generate_question(
        topic=payload.topic,
        subject=payload.subject,
        bloom_level=payload.bloom_level,
        difficulty=payload.difficulty,
        question_type=payload.question_type,
    )
