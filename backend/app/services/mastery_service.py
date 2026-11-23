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

    No database, network, LLM, clock or random calls. ``recent_scores`` are the
    learner's real scores at the current rung, oldest first, with the newest
    last. After a demotion, two consecutive scores >= 0.75 are required to
    promote again.
    """
    current = clamp_rung(current_rung)
    scores = _clean_scores(recent_scores)
    here = _format_rung(current)

    if not scores:
        return current, f"No valid recent scores — staying at {here}."

    latest = scores[-1]
    pct = f"{latest:.0%}"

    if latest < DEMOTE_SCORE:
        target = clamp_rung(current - 1)
        if target == current:
            return current, f"Scored {pct} on {here} — already at the lowest rung, staying."
        return target, f"Scored {pct} on {here} -> moving down to {_format_rung(target)}."

    if latest >= PROMOTE_SCORE:
        if demotion_pending:
            streak = 0
            for value in reversed(scores):
                if value >= PROMOTE_SCORE:
                    streak += 1
                else:
                    break
            if streak < 2:
                return current, (
                    f"Scored {pct} on {here} — {streak}/2 consecutive scores at or "
                    "above 75% before moving up."
                )
        target = clamp_rung(current + 1)
        if target == current:
            return current, f"Scored {pct} on {here} — already at the highest rung, staying."
        return target, f"Scored {pct} on {here} -> moving up to {_format_rung(target)}."

    return current, f"Scored {pct} on {here} — between 40% and 75%, staying."


def _adaptive_state(
    user_id: uuid.UUID, subject: str, topic: str, db: Session
) -> tuple[int, bool, list[float], str]:
    """Replay the learner's real attempts to derive the current rung.

    The EMA in ``mastery_records`` stays for display only; this replay uses the
    actual attempt scores so one good or bad answer changes the next question
    immediately (with one-rung and hysteresis guards).

    Matched by topic (case-insensitive) so that bank fallbacks (e.g. OS-tagged
    bank questions for a student practicing Deadlocks) and uploaded notes advance
    the same adaptive ladder seamlessly.
    """
    key_topic = (topic or "").strip().lower()
    rows = (
        db.query(Attempt.score)
        .join(Question, Attempt.question_id == Question.id)
        .filter(
            Attempt.user_id == user_id,
            func.lower(Question.topic) == key_topic,
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
