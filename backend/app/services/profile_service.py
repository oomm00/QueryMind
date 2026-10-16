"""
Profile Service — QueryMind
============================
Builds the learner's knowledge profile consumed by ``GET /profile/{user_id}``.

Sources of truth
----------------
* ``mastery_records`` — one row per ``(user, subject, topic)``. Holds the EMA
  ``mastery_score`` and a per-Bloom JSON breakdown (``{"remember": 0.8, ...}``).
  These values are the authoritative mastery figures.
* ``attempts`` (joined to ``questions``) — used for the raw attempt counts
  (total attempts, per-Bloom attempt counts) and the overall average score.

The response shape is fixed by :class:`ProfileResponse` / :class:`TopicMastery`
and is consumed by the frontend ``DashboardPage`` selectors
(``selectPerTopicAverages`` / ``selectPerBloomAverages``).

A user with no attempts/mastery data gets a valid **empty state**
(zeros and an empty breakdown) — never a 404 and never placeholder data.
"""

from __future__ import annotations

import json
import uuid
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.models import Attempt, MasteryRecord, Question
from app.schemas.schemas import ProfileResponse, TopicMastery


def _load_bloom_breakdown(raw: str | None) -> dict[str, float]:
    """Decode a ``mastery_records.bloom_breakdown`` JSON string.

    Tolerates ``None``, malformed JSON, non-dict payloads, and non-numeric
    values by ignoring the offending entries rather than raising.
    """
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return {}
    if not isinstance(data, dict):
        return {}
    breakdown: dict[str, float] = {}
    for key, value in data.items():
        try:
            score = float(value)
        except (TypeError, ValueError):
            continue
        breakdown[str(key)] = max(0.0, min(1.0, score))
    return breakdown


def build_profile(user_id: uuid.UUID, db: Session) -> ProfileResponse:
    """Aggregate ``user_id``'s mastery data into a :class:`ProfileResponse`.

    ``mastery_records`` provide the per-topic / per-Bloom mastery scores;
    ``attempts`` provide the counts and the overall average. The result is a
    flat ``mastery_breakdown`` of ``(topic, bloom_level)`` rows, each carrying
    the Bloom-level mastery score and the number of attempts at that level.
    """
    # ── Raw attempts: totals + overall average ──────────────────────────────
    attempts = db.query(Attempt).filter(Attempt.user_id == user_id).all()
    total_attempts = len(attempts)
    scored_values = [a.score for a in attempts if a.score is not None]
    average_score = (
        round(float(sum(scored_values) / len(scored_values)), 4)
        if scored_values
        else 0.0
    )

    # ── Per-(topic, bloom) attempt counts from the attempt history ──────────
    rows = (
        db.query(Question.topic, Question.bloom_level)
        .join(Attempt, Attempt.question_id == Question.id)
        .filter(Attempt.user_id == user_id)
        .all()
    )
    attempts_by_topic_bloom: dict[tuple[str, str], int] = defaultdict(int)
    for topic, bloom_level in rows:
        if topic and bloom_level:
            attempts_by_topic_bloom[(topic, bloom_level)] += 1

    # ── Mastery scores from mastery_records (authoritative) ─────────────────
    records = (
        db.query(MasteryRecord)
        .filter(MasteryRecord.user_id == user_id)
        .order_by(MasteryRecord.topic)
        .all()
    )

    mastery_breakdown: list[TopicMastery] = []

    for record in records:
        breakdown = _load_bloom_breakdown(record.bloom_breakdown)
        for bloom_level, score in sorted(breakdown.items()):
            key = (record.topic, bloom_level)
            mastery_breakdown.append(
                TopicMastery(
                    topic=record.topic,
                    bloom_level=bloom_level,
                    mastery_score=round(score, 4),
                    attempts=attempts_by_topic_bloom.get(key, 0),
                )
            )

    # ── Fallback: attempts with no mastery record yet (defensive) ───────────
    # Keeps the breakdown complete if an attempt predates the mastery write.
    if not records:
        fallback_scores: dict[tuple[str, str], list[float]] = defaultdict(list)
        detail_rows = (
            db.query(Question.topic, Question.bloom_level, Attempt.score)
            .join(Attempt, Attempt.question_id == Question.id)
            .filter(Attempt.user_id == user_id)
            .all()
        )
        for topic, bloom_level, score in detail_rows:
            if topic and bloom_level and score is not None:
                fallback_scores[(topic, bloom_level)].append(score)
        for (topic, bloom_level), scores in sorted(fallback_scores.items()):
            mastery_breakdown.append(
                TopicMastery(
                    topic=topic,
                    bloom_level=bloom_level,
                    mastery_score=round(sum(scores) / len(scores), 4),
                    attempts=len(scores),
                )
            )

    return ProfileResponse(
        user_id=user_id,
        total_attempts=total_attempts,
        average_score=average_score,
        mastery_breakdown=mastery_breakdown,
        stub=False,
    )
