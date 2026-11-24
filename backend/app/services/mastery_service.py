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
import math
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from app.models.models import Attempt, MasteryRecord, Question
from app.services.score_utils import normalize_score

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
    weighted_score = _clamp(normalize_score(score) * _difficulty_weight(difficulty))

    # Atomic create-or-lock: INSERT ... ON CONFLICT DO NOTHING makes concurrent
    # first attempts safe, then SELECT ... FOR UPDATE serialises the EMA update.
    values = {
        "user_id": user_id,
        "subject": subject,
        "topic": topic,
        "mastery_score": MASTERY_MIN,
        "attempts_count": 0,
        "bloom_breakdown": "{}",
    }
    dialect = db.get_bind().dialect.name
    insert = (
        postgresql.insert(MasteryRecord) if dialect == "postgresql" else sqlite.insert(MasteryRecord)
    )
    db.execute(
        insert.values(**values).on_conflict_do_nothing(
            index_elements=["user_id", "subject", "topic"]
        )
    )
    record = db.execute(
        select(MasteryRecord)
        .where(
            MasteryRecord.user_id == user_id,
            MasteryRecord.subject == subject,
            MasteryRecord.topic == topic,
        )
        .with_for_update()
    ).scalar_one()

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


# ── Stage 11: deterministic next-rung decision ────────────────────────────────
# One ordered ladder (bloom + difficulty). One answer moves AT MOST one rung.
RUNG_LADDER: tuple[tuple[str, str], ...] = (
    ("remember", "easy"),
    ("understand", "easy"),
    ("apply", "medium"),
    ("analyze", "medium"),
    ("evaluate", "hard"),
    ("create", "hard"),
)
PROMOTE_SCORE = 0.75

# ── Adaptive Pacing Constants (Task 4) ────────────────────────────────────────
MIN_QUESTIONS_BEFORE_PROMOTION = 4
PROMOTION_AVG_THRESHOLD = 0.70
PROMOTION_MIN_INDIVIDUAL_SCORE = 0.40

MIN_QUESTIONS_BEFORE_DEMOTION = 3
DEMOTION_AVG_THRESHOLD = 0.40
DEMOTE_SCORE = 0.40
ADAPTIVE_HISTORY_LIMIT = 24
_FIRST_RUNG_REASON = "No prior attempts for this topic — starting at Remember/Easy."


def clamp_rung(rung: object) -> int:
    """Coerce any rung input into the ladder's valid index range."""
    try:
        value = int(rung)  # type: ignore[arg-type]
    except (TypeError, ValueError, OverflowError):
        return 0
    return max(0, min(len(RUNG_LADDER) - 1, value))


def rung_from_labels(bloom_level: str | None, difficulty: str | None) -> int:
    """Map stored labels to a rung; unknown labels fall back to the easiest rung."""
    bloom = (bloom_level or "").strip().lower()
    diff = (difficulty or "").strip().lower()
    for index, (known_bloom, known_diff) in enumerate(RUNG_LADDER):
        if bloom == known_bloom and diff == known_diff:
            return index
    for index, (known_bloom, _) in enumerate(RUNG_LADDER):
        if bloom == known_bloom:
            return index
    for index, (_, known_diff) in enumerate(RUNG_LADDER):
        if diff == known_diff:
            return index
    return 0


def labels_from_rung(rung: object) -> tuple[str, str]:
    """Return the (bloom_level, difficulty) labels for a rung index."""
    return RUNG_LADDER[clamp_rung(rung)]


def _clean_scores(scores: object) -> list[float]:
    """Drop None/NaN/infinite/out-of-range scores; never raise."""
    cleaned: list[float] = []
    for raw in scores or ():  # type: ignore[union-attr]
        try:
            value = float(raw)
        except (TypeError, ValueError, OverflowError):
            continue
        if not math.isfinite(value) or value < 0.0 or value > 1.0:
            continue
        cleaned.append(value)
    return cleaned


def _format_rung(rung: int) -> str:
    bloom, difficulty = labels_from_rung(rung)
    return f"{bloom.capitalize()}/{difficulty.capitalize()}"


def next_rung(
    current_rung: object,
    recent_scores: object,
    *,
    demotion_pending: bool = False,
) -> tuple[int, str]:
    """Pure decision: return ``(new_rung, human_readable_reason)``.

    Task 4 pacing:
    - Learner must answer at least 4 questions at a level before moving up.
    - Move UP one level when the last 4 answers at this level average >= 0.70 and none < 0.40.
    - Move DOWN one level only when the last 3 answers at this level average < 0.40 (never below level 1 / rung 0).
    - After a move down, history resets, requiring 4 fresh answers before moving up again.
    - Between thresholds = stay.
    - One level at a time, always.
    """
    current = clamp_rung(current_rung)
    scores = _clean_scores(recent_scores)
    here = _format_rung(current)
    n = len(scores)

    if n == 0:
        return current, f"No prior attempts for this topic — starting at {here}."

    # 1. Demotion check: last 3 answers at this level average < 0.40
    if n >= MIN_QUESTIONS_BEFORE_DEMOTION:
        last_3 = scores[-3:]
        avg_3 = sum(last_3) / 3.0
        if avg_3 < DEMOTION_AVG_THRESHOLD:
            if current > 0:
                target = current - 1
                return target, (
                    f"Last 3 answers at {here} averaged {avg_3:.0%} (< 40%) -> "
                    f"moving down to {_format_rung(target)}."
                )
            return current, (
                f"Last 3 answers at {here} averaged {avg_3:.0%} (< 40%) — "
                "already at the lowest level, staying."
            )

    # 2. Promotion check: last 4 answers at this level average >= 0.70 and none < 0.40
    if n >= MIN_QUESTIONS_BEFORE_PROMOTION:
        last_4 = scores[-4:]
        avg_4 = sum(last_4) / 4.0
        min_4 = min(last_4)
        if avg_4 >= PROMOTION_AVG_THRESHOLD and min_4 >= PROMOTION_MIN_INDIVIDUAL_SCORE:
            target = clamp_rung(current + 1)
            if target == current:
                return current, (
                    f"Last 4 answers at {here} averaged {avg_4:.0%} — "
                    "already at the highest level, staying."
                )
            return target, (
                f"Last 4 answers at {here} averaged {avg_4:.0%} (none below 40%) -> "
                f"moving up to {_format_rung(target)}."
            )
        elif min_4 < PROMOTION_MIN_INDIVIDUAL_SCORE:
            return current, (
                f"{n} questions answered at {here}, average {avg_4:.0%} "
                f"(one score was {min_4:.0%} < 40%) — staying at {here}."
            )
        else:
            return current, (
                f"{n} questions answered at {here}, average {avg_4:.0%} "
                f"(< 70%) — staying at {here}."
            )

    # 3. Accumulating attempts (< 4)
    avg = sum(scores) / n
    return current, (
        f"{n}/{MIN_QUESTIONS_BEFORE_PROMOTION} questions answered at {here}, "
        f"average {avg:.0%} — staying at {here}."
    )


def _adaptive_state(
    user_id: uuid.UUID, subject: str, topic: str, db: Session
) -> tuple[int, bool, list[float], str]:
    """Replay the learner's real attempts to derive the current rung."""
    from app.services.generation_fallback import canonical_topic_key
    canonical = canonical_topic_key(topic)
    key_topic = canonical.lower()
    raw_key = (topic or "").strip().lower()
    keys = list({key_topic, raw_key})

    rows = (
        db.query(Attempt.score)
        .join(Question, Attempt.question_id == Question.id)
        .filter(
            Attempt.user_id == user_id,
            func.lower(Question.topic).in_(keys),
        )
        .order_by(Attempt.created_at.asc(), Attempt.id.asc())
        .limit(ADAPTIVE_HISTORY_LIMIT)
        .all()
    )
    if not rows:
        return 0, False, [], _FIRST_RUNG_REASON

    rung = 0
    demotion_pending = False
    history: list[float] = []
    reason = _FIRST_RUNG_REASON
    for (score,) in rows:
        history.append(score)
        target, reason = next_rung(rung, history, demotion_pending=demotion_pending)
        if target != rung:
            demotion_pending = target < rung
            rung = target
            history = []  # scores at the new rung start fresh
    return rung, demotion_pending, history, reason

def adaptive_recommendation(
    user_id: uuid.UUID, subject: str, topic: str, db: Session
) -> dict:
    """One call returning the next level plus the reason the UI can display."""
    rung, pending, history, reason = _adaptive_state(user_id, subject, topic, db)
    bloom, difficulty = labels_from_rung(rung)
    return {
        "bloom_level": bloom,
        "difficulty": difficulty,
        "reason": reason,
        "rung": rung,
        "demotion_pending": pending,
        "recent_scores": history,
    }


def recommend_next(
    user_id: uuid.UUID, subject: str, topic: str, db: Session
) -> dict:
    """Pick the next ``bloom_level``/``difficulty`` from actual recent attempts."""
    rec = adaptive_recommendation(user_id, subject, topic, db)
    return {"bloom_level": rec["bloom_level"], "difficulty": rec["difficulty"]}


def explain_recommendation(
    user_id: uuid.UUID, subject: str, topic: str, db: Session
) -> str:
    """Human-readable justification for :func:`recommend_next`'s choice."""
    return adaptive_recommendation(user_id, subject, topic, db)["reason"]
