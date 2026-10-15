"""
Evaluation Service Alias — QueryMind
====================================
Re-exports the evaluation service implementation so both:
  `from app.services.evaluation import evaluate_answer`
and
  `from app.services.evaluation_service import evaluate_answer`
work seamlessly.
"""

from app.services.evaluation_service import (  # noqa: F401
    BLOOM_DEPTH_GUIDANCE,
    FIVE_CRITERIA_RUBRIC_WEIGHTS,
    LEGACY_RUBRIC_WEIGHTS,
    RUBRIC_CRITERIA,
    RUBRIC_WEIGHTS,
    SCORE_MAX,
    SCORE_MIN,
    compute_overall_score,
    evaluate_answer,
)
