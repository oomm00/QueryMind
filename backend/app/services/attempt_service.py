"""
Attempt Service — STUB
=======================
Real implementation will: send the user's answer + reference answer to
an LLM evaluator, compute a rubric-based score, generate targeted feedback,
persist the attempt, and update the KnowledgeProfile.
"""

import uuid

from app.schemas.schemas import AttemptFeedback


STUB_FEEDBACK = (
    "[STUB] Your answer demonstrates a reasonable understanding of the topic. "
    "In the real implementation, the AI evaluator will provide specific, "
    "rubric-based feedback here."
)

STUB_CORRECT_ANSWER = (
    "[STUB] The reference answer will be retrieved from the question record "
    "and shown here after submission."
)


def submit_attempt_stub(
    question_id: uuid.UUID,
    user_id: uuid.UUID,
    user_answer: str,
) -> AttemptFeedback:
    """Returns a hardcoded score and feedback."""
    return AttemptFeedback(
        attempt_id=uuid.uuid4(),
        score=0.75,          # Placeholder 75 %
        feedback=STUB_FEEDBACK,
        correct_answer=STUB_CORRECT_ANSWER,
        stub=True,
    )
