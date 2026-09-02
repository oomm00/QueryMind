"""
Attempt Routes — /attempts
"""

from fastapi import APIRouter

from app.schemas.schemas import AttemptFeedback, SubmitAttemptRequest
from app.services.attempt_service import submit_attempt_stub

router = APIRouter()


@router.post(
    "/submit",
    response_model=AttemptFeedback,
    summary="Submit an answer for evaluation",
)
async def submit_attempt(payload: SubmitAttemptRequest):
    """
    **Stub** — accepts an answer and returns a hardcoded score (0.75) with
    placeholder feedback. Real implementation will call the LLM evaluator,
    compute a rubric score, and persist the Attempt record.
    """
    return submit_attempt_stub(
        question_id=payload.question_id,
        user_id=payload.user_id,
        user_answer=payload.user_answer,
    )
