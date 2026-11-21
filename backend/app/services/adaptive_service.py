"""Derived mastery view — deliberately non-authoritative.

``mastery_records`` is the single source of truth for adaptive decisions. The
legacy ``knowledge_profiles`` table is retained for backwards compatibility but
the answer path no longer writes it. This module keeps the old callable hook and
returns a derived, validated view so callers that still import it do not break.
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.services.score_utils import normalize_score

# Kept as an alias so legacy imports do not break; no longer written by us.
LEGACY_TABLE = "knowledge_profiles"


def update_mastery_profile(
    user_id: uuid.UUID,
    topic: str,
    bloom_level: str,
    score: float,
    db: Optional[Session] = None,
) -> dict:
    """Validate the score and return a derived profile view (no DB writes)."""
    validated = normalize_score(score)
    return {
        "user_id": str(user_id),
        "topic": topic,
        "bloom_level": bloom_level,
        "score": validated,
        "mastery_score": validated,
        "status": "derived",
        "source_of_truth": "mastery_records",
    }
