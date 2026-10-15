"""
Validation Service Alias — QueryMind
====================================
Re-exports the validation service implementation so both:
  `from app.services.validation import validate_question`
and
  `from app.services.validation_service import validate_question`
work seamlessly.
"""

from app.services.validation_service import (  # noqa: F401
    ANSWERABILITY_SIMILARITY_THRESHOLD,
    DUPLICATE_SIMILARITY_THRESHOLD,
    check_answerability,
    check_cognitive_alignment,
    check_duplicate,
    embed_texts,
    validate_question,
)
