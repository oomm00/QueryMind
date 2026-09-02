"""
Question Routes — /questions
"""

from fastapi import APIRouter

from app.schemas.schemas import GenerateQuestionRequest, GenerateQuestionResponse
from app.services.question_service import generate_questions_stub

router = APIRouter()


@router.post(
    "/generate",
    response_model=GenerateQuestionResponse,
    summary="Generate questions for a topic",
)
async def generate_questions(payload: GenerateQuestionRequest):
    """
    **Stub** — returns a hardcoded sample question matching the requested
    topic / Bloom level / difficulty. Real implementation will call the
    LLM via the RAG pipeline.
    """
    return generate_questions_stub(
        topic=payload.topic,
        bloom_level=payload.bloom_level,
        difficulty=payload.difficulty,
        num_questions=payload.num_questions,
    )
