"""
Mastery Profiling & Adaptive Question Selection — QueryMind
============================================================
Implements pipeline **Stage 10** (mastery profile update) and **Stage 11**
(adaptive next-question selection) from the QueryMind technical blueprint.

Formula
-------
The blueprint defines a recency-weighted mastery update — an exponential moving
average (Stage 10)::

    new_mastery = α × new_score + (1 − α) × old_mastery      (α ≈ 0.3)

This module follows that formula with ``EMA_ALPHA = 0.3``. Two extensions are
layered on top, per the feature brief:

* one record per ``(user, subject, topic)`` (the blueprint sketched per-Bloom
  rows; we keep one row and store the per-Bloom breakdown in a JSON column), and
* the incoming score is weighted by question difficulty so a hard question moves
  the estimate more than an easy one.

The **first** attempt for a ``(user, subject, topic)`` seeds the score directly
(there is no history to average against). Mastery is always clamped to ``0..1``.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.models import Attempt, MasteryRecord, Question

logger = logging.getLogger("querymind.mastery")


# ── Tuning constants ──────────────────────────────────────────────────────────

# Blueprint Stage 10 recency weight (α ≈ 0.3).
EMA_ALPHA = 0.3

MASTERY_MIN = 0.0
MASTERY_MAX = 1.0

# Difficulty weighting: a hard question counts more than an easy one.
DIFFICULTY_WEIGHTS: dict[str, float] = {"easy": 0.8, "medium": 1.0, "hard": 1.2}
DEFAULT_DIFFICULTY_WEIGHT = 1.0  # unknown difficulty -> neutral weight

# Mastery bands driving the next-question recommendation.
MASTERY_LOW_THRESHOLD = 0.4   # below -> recall level (remember/understand, easy)
MASTERY_HIGH_THRESHOLD = 0.7  # above -> higher order (analyze/evaluate/create, hard)

# "Struggling" rule: step the recommendation down one level if the last N
# attempts were all below this score.
STRUGGLE_SCORE_THRESHOLD = 0.3
STRUGGLE_LOOKBACK = 2

# Base recommendation per band: (bloom_level, difficulty).
RECOMMEND_NO_HISTORY = ("remember", "easy")
RECOMMEND_LOW = ("remember", "easy")
RECOMMEND_MID = ("apply", "medium")
RECOMMEND_HIGH = ("analyze", "hard")

# Ordered cognitive / difficulty ladders used by the one-level step-down.
BLOOM_ORDER = ("remember", "understand", "apply", "analyze", "evaluate", "create")
DIFFICULTY_ORDER = ("easy", "medium", "hard")


# ── Small helpers ─────────────────────────────────────────────────────────────

def _clamp(value: float, lo: float = MASTERY_MIN, hi: float = MASTERY_MAX) -> float:
    """Keep a score inside [lo, hi]."""
    return max(lo, min(hi, float(value)))


def _difficulty_weight(difficulty: str | None) -> float:
    """Map a difficulty label to its weight (unknown labels are neutral)."""
    key = (difficulty or "").strip().lower()
    return DIFFICULTY_WEIGHTS.get(key, DEFAULT_DIFFICULTY_WEIGHT)


def _ema(old: float, weighted_score: float) -> float:
    """One exponential-moving-average step, clamped to [0, 1]."""
    return _clamp(EMA_ALPHA * weighted_score + (1.0 - EMA_ALPHA) * old)


def _load_breakdown(raw: str | None) -> dict[str, float]:
    """Decode the per-Bloom JSON column, tolerating malformed/empty values."""
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        logger.warning("Discarding malformed mastery bloom_breakdown: %r", raw)
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, float] = {}
    for key, value in data.items():
        try:
            out[str(key)] = _clamp(float(value))
        except (TypeError, ValueError):
            continue
    return out


def _lookup(db: Session, user_id: uuid.UUID, subject: str, topic: str) -> MasteryRecord | None:
    return (
        db.query(MasteryRecord)
        .filter(
            MasteryRecord.user_id == user_id,
            MasteryRecord.subject == subject,
            MasteryRecord.topic == topic,
        )
        .first()
    )


# ── Stage 10: update mastery ──────────────────────────────────────────────────

def update_mastery(
    user_id: uuid.UUID,
    subject: str,
    topic: str,
    score: float,
    bloom_level: str,
    difficulty: str,
    db: Session,
) -> MasteryRecord:
    """Fold one attempt into the learner's mastery profile for (subject, topic).

    * ``score`` is the attempt score in ``0..1``.
    * The score is weighted by ``difficulty`` and clamped to ``0..1``.
    * The first attempt **seeds** the score; later attempts apply the EMA rule.
    * The per-Bloom breakdown uses the same EMA, keyed by ``bloom_level``.

    The record is flushed but **not committed** — the caller owns the
    transaction so it can be grouped with the surrounding writes (the attempt).
    """
    weighted_score = _clamp(float(score) * _difficulty_weight(difficulty))

    record = _lookup(db, user_id, subject, topic)
    if record is None:
        record = MasteryRecord(
            user_id=user_id,
            subject=subject,
            topic=topic,
            mastery_score=MASTERY_MIN,
            attempts_count=0,
            bloom_breakdown="{}",
        )
        db.add(record)

    # Top-level mastery: seed on the first attempt, EMA afterwards.
    if (record.attempts_count or 0) == 0:
        record.mastery_score = weighted_score
    else:
        record.mastery_score = _ema(record.mastery_score or MASTERY_MIN, weighted_score)
    record.attempts_count = (record.attempts_count or 0) + 1

    # Per-Bloom breakdown (same EMA, seeded on the first attempt at that level).
    breakdown = _load_breakdown(record.bloom_breakdown)
    old_bloom = breakdown.get(bloom_level)
    breakdown[bloom_level] = (
        weighted_score if old_bloom is None else _ema(old_bloom, weighted_score)
    )
    record.bloom_breakdown = json.dumps(breakdown)

    record.last_updated = datetime.now(timezone.utc)
    db.flush()
    return record


# ── Read helpers ──────────────────────────────────────────────────────────────

def get_mastery(
    user_id: uuid.UUID,
    subject: str | None = None,
    topic: str | None = None,
    db: Session | None = None,
) -> list[MasteryRecord]:
    """Return the caller's mastery records, optionally filtered by subject/topic."""
    query = db.query(MasteryRecord).filter(MasteryRecord.user_id == user_id)
    if subject:
        query = query.filter(MasteryRecord.subject == subject)
    if topic:
        query = query.filter(MasteryRecord.topic == topic)
    return query.order_by(MasteryRecord.subject, MasteryRecord.topic).all()


def record_to_dict(record: MasteryRecord) -> dict:
    """Serialize a MasteryRecord for the API (decodes the JSON breakdown)."""
    return {
        "subject": record.subject,
        "topic": record.topic,
        "mastery_score": record.mastery_score or MASTERY_MIN,
        "attempts_count": record.attempts_count or 0,
        "bloom_breakdown": _load_breakdown(record.bloom_breakdown),
        "last_updated": record.last_updated,
    }


# ── Stage 11: adaptive next-question selection ────────────────────────────────

def _is_struggling(
    user_id: uuid.UUID, subject: str, topic: str, db: Session
) -> bool:
    """True when the last ``STRUGGLE_LOOKBACK`` attempts were all below threshold."""
    rows = (
        db.query(Attempt.score)
        .join(Question, Attempt.question_id == Question.id)
        .filter(
            Attempt.user_id == user_id,
            Question.subject == subject,
            Question.topic == topic,
        )
        .order_by(Attempt.created_at.desc(), Attempt.id.desc())
        .limit(STRUGGLE_LOOKBACK)
        .all()
    )
    scores = [score for (score,) in rows]
    return len(scores) == STRUGGLE_LOOKBACK and all(
        score is not None and score < STRUGGLE_SCORE_THRESHOLD for score in scores
    )


def _step_down(bloom_level: str, difficulty: str) -> tuple[str, str]:
    """Move one rung down the Bloom and difficulty ladders (clamped at the floor)."""
    bloom_index = BLOOM_ORDER.index(bloom_level) if bloom_level in BLOOM_ORDER else 0
    diff_index = (
        DIFFICULTY_ORDER.index(difficulty) if difficulty in DIFFICULTY_ORDER else 0
    )
    return (
        BLOOM_ORDER[max(0, bloom_index - 1)],
        DIFFICULTY_ORDER[max(0, diff_index - 1)],
    )


def _recommend(
    user_id: uuid.UUID, subject: str, topic: str, db: Session
) -> tuple[str, str, str]:
    """Core recommendation: returns (bloom_level, difficulty, reason)."""
    record = _lookup(db, user_id, subject, topic)
    has_history = record is not None and (record.attempts_count or 0) > 0
    mastery = (record.mastery_score or MASTERY_MIN) if has_history else MASTERY_MIN

    if not has_history:
        bloom_level, difficulty = RECOMMEND_NO_HISTORY
        reason = (
            "No prior attempts for this topic — starting at recall level "
            f"({bloom_level}/{difficulty})."
        )
    elif mastery < MASTERY_LOW_THRESHOLD:
        bloom_level, difficulty = RECOMMEND_LOW
        reason = (
            f"Mastery {mastery:.2f} is below {MASTERY_LOW_THRESHOLD} — staying at "
            f"recall level ({bloom_level}/{difficulty})."
        )
    elif mastery <= MASTERY_HIGH_THRESHOLD:
        bloom_level, difficulty = RECOMMEND_MID
        reason = (
            f"Mastery {mastery:.2f} is in the {MASTERY_LOW_THRESHOLD}–"
            f"{MASTERY_HIGH_THRESHOLD} band — moving to application "
            f"({bloom_level}/{difficulty})."
        )
    else:
        bloom_level, difficulty = RECOMMEND_HIGH
        reason = (
            f"Mastery {mastery:.2f} is above {MASTERY_HIGH_THRESHOLD} — moving to "
            f"higher-order thinking ({bloom_level}/{difficulty})."
        )

    if has_history and _is_struggling(user_id, subject, topic, db):
        bloom_level, difficulty = _step_down(bloom_level, difficulty)
        reason += (
            f" Stepped down one level: the last {STRUGGLE_LOOKBACK} attempts were "
            f"all below {STRUGGLE_SCORE_THRESHOLD}."
        )

    return bloom_level, difficulty, reason


def recommend_next(
    user_id: uuid.UUID, subject: str, topic: str, db: Session
) -> dict:
    """Pick the next ``bloom_level`` and ``difficulty`` for this learner.

    Rules:
      * no history / mastery < 0.4  -> remember (recall), easy
      * 0.4 <= mastery <= 0.7       -> apply, medium
      * mastery > 0.7               -> analyze, hard
      * step down one level when the last 2 attempts were both below 0.3.
    """
    bloom_level, difficulty, _ = _recommend(user_id, subject, topic, db)
    return {"bloom_level": bloom_level, "difficulty": difficulty}


def explain_recommendation(
    user_id: uuid.UUID, subject: str, topic: str, db: Session
) -> str:
    """Human-readable justification for :func:`recommend_next`'s choice."""
    return _recommend(user_id, subject, topic, db)[2]
