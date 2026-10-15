"""
Question Generation Service Alias — QueryMind
==============================================
Re-exports the generation service implementation so both:
  `from app.services.generation import generate_question`
and
  `from app.services.generation_service import generate_question`
work seamlessly.
"""

from app.services.generation_service import (  # noqa: F401
    BLOOM_VERBS,
    GeminiAdapter,
    GeneratedQuestion,
    LLM_MAX_RETRIES,
    VALID_BLOOM_LEVELS,
    VALID_DIFFICULTIES,
    generate_question,
)
