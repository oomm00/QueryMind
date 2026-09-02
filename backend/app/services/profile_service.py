"""
Profile Service — STUB
=======================
Real implementation will: query the KnowledgeProfile table,
aggregate attempt history by topic + Bloom level, compute
rolling mastery scores, and return structured data for the
frontend dashboard.
"""

import uuid

from app.schemas.schemas import ProfileResponse, TopicMastery


STUB_MASTERY = [
    TopicMastery(topic="Python Basics",       bloom_level="remember",   mastery_score=0.90, attempts=12),
    TopicMastery(topic="Python Basics",       bloom_level="understand", mastery_score=0.78, attempts=8),
    TopicMastery(topic="Data Structures",     bloom_level="apply",      mastery_score=0.55, attempts=5),
    TopicMastery(topic="Algorithms",          bloom_level="analyze",    mastery_score=0.40, attempts=3),
    TopicMastery(topic="System Design",       bloom_level="evaluate",   mastery_score=0.20, attempts=1),
]


def get_profile_stub(user_id: uuid.UUID) -> ProfileResponse:
    """Returns hardcoded mastery data for any user_id."""
    return ProfileResponse(
        user_id=user_id,
        total_attempts=29,
        average_score=0.57,
        mastery_breakdown=STUB_MASTERY,
        stub=True,
    )
