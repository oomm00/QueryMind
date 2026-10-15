"""
Adaptive Engine Interface — QueryMind
====================================
Interface for updating user mastery profiles after each attempt.
Owned by teammate (adaptive engine module). This module provides the
callable hook invoked by the answer evaluation and attempt submission service.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.models import KnowledgeProfile

logger = logging.getLogger("querymind.adaptive")


def update_mastery_profile(
    user_id: uuid.UUID,
    topic: str,
    bloom_level: str,
    score: float,
    db: Optional[Session] = None,
) -> dict:
    """Update user mastery profile after an evaluation attempt.

    Formula / adaptive updates are owned by the adaptive engine teammate.
    This hook is invoked by the evaluation/attempt submission pipeline.

    Args:
        user_id: ID of the user submitting the attempt.
        topic: Topic of the question (e.g. 'Transactions').
        bloom_level: Bloom cognitive level (e.g. 'analyze').
        score: Normalized attempt score (0.0 - 1.0).
        db: Optional active SQLAlchemy session for persistence.

    Returns:
        dict containing updated mastery status.
    """
    logger.info(
        "Updating mastery for user %s on %s:%s with score %.2f",
        user_id, topic, bloom_level, score,
    )

    if db is not None:
        try:
            profile = (
                db.query(KnowledgeProfile)
                .filter(
                    KnowledgeProfile.user_id == user_id,
                    KnowledgeProfile.topic == topic,
                    KnowledgeProfile.bloom_level == bloom_level,
                )
                .first()
            )

            if profile is None:
                profile = KnowledgeProfile(
                    user_id=user_id,
                    topic=topic,
                    bloom_level=bloom_level,
                    mastery_score=round(score, 4),
                    attempt_count=1,
                    total_attempts=1,
                    average_score=round(score, 4),
                )
                db.add(profile)
            else:
                profile.attempt_count = (profile.attempt_count or 0) + 1
                profile.total_attempts = (profile.total_attempts or 0) + 1
                # Standard running average baseline until teammate customizes with EMA / bandits
                prev_mastery = profile.mastery_score or 0.0
                n = profile.attempt_count
                profile.mastery_score = round(((prev_mastery * (n - 1)) + score) / n, 4)
                profile.average_score = profile.mastery_score
                profile.updated_at = datetime.utcnow()

            db.commit()
            db.refresh(profile)
            return {
                "user_id": str(user_id),
                "topic": topic,
                "bloom_level": bloom_level,
                "mastery_score": profile.mastery_score,
                "attempt_count": profile.attempt_count,
            }
        except Exception as exc:
            logger.warning("Could not persist mastery update to DB: %s", exc)

    return {
        "user_id": str(user_id),
        "topic": topic,
        "bloom_level": bloom_level,
        "score": score,
        "status": "updated",
    }
