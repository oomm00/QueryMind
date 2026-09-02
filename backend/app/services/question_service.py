"""
Question Service — STUB
========================
Real implementation will: retrieve document chunks from ChromaDB,
call LLM to generate questions at the requested Bloom level / difficulty,
persist them to the DB, and return structured Question objects.
"""

import uuid

from app.schemas.schemas import GenerateQuestionResponse, QuestionOut


def generate_questions_stub(
    topic: str,
    bloom_level: str,
    difficulty: str,
    num_questions: int = 1,
) -> GenerateQuestionResponse:
    """
    Returns hardcoded sample questions — one per requested count.
    All questions share the same topic/level/difficulty from the request.
    """
    sample_questions = [
        QuestionOut(
            id=uuid.uuid4(),
            topic=topic,
            bloom_level=bloom_level,
            difficulty=difficulty,
            question_text=(
                f"[STUB] Explain the concept of '{topic}' "
                f"at the '{bloom_level}' level with a '{difficulty}' difficulty example."
            ),
            reference_answer=(
                f"[STUB] A model answer for '{topic}' at Bloom's '{bloom_level}' level "
                "would be placed here by the LLM in the real implementation."
            ),
        )
        for _ in range(num_questions)
    ]

    return GenerateQuestionResponse(questions=sample_questions, stub=True)
