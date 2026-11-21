"""Demo-safe generation orchestration: live → cache → seeded bank.

A /generate request always returns at least one usable question. The LLM path
is attempted first (bounded by a hard deadline and a small attempt budget);
duplicates and Bloom mismatches are handled server-side. If the LLM is offline,
out of quota, or simply too slow, previously validated questions and finally the
seeded demo bank are served instead. Every returned question carries ``source``.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import Question
from app.schemas.schemas import GeneratedQuestion
from app.services import generation_service, validation_service
from app.services.mastery_service import BLOOM_ORDER

logger = logging.getLogger("querymind.generation.fallback")

_BANK_PATH = Path(__file__).resolve().parents[1] / "data" / "demo_question_bank.json"
_BANK_CACHE: Optional[list[dict[str, Any]]] = None

# ── Served-question registry ──────────────────────────────────────────────────
# A demo session must not serve the same question twice while unserved bank or
# cached questions remain. The key is (user, topic); live/cache/bank ids are all
# tracked here. Bounded so a long-running process cannot grow without limit.
_served_lock = threading.Lock()
_served: dict[tuple[str, str], deque[uuid.UUID]] = {}
_MAX_SERVED = 512


def _served_key(user_id: Any, topic: str) -> tuple[str, str]:
    return (str(user_id), (topic or "").strip().lower())


def served_question_ids(user_id: Any, topic: str) -> set[uuid.UUID]:
    with _served_lock:
        return set(_served.get(_served_key(user_id, topic), ()))


def mark_served(user_id: Any, topic: str, question_id: uuid.UUID) -> None:
    key = _served_key(user_id, topic)
    with _served_lock:
        queue = _served.setdefault(key, deque(maxlen=_MAX_SERVED))
        if question_id not in queue:
            queue.append(question_id)


def reset_served_for_tests() -> None:
    with _served_lock:
        _served.clear()


def load_bank() -> list[dict[str, Any]]:
    global _BANK_CACHE
    if _BANK_CACHE is None:
        _BANK_CACHE = json.loads(_BANK_PATH.read_text(encoding="utf-8"))
    return _BANK_CACHE


def seed_bank(db: Session) -> int:
    """Idempotently insert bank questions that are not already in the DB."""
    added = 0
    for entry in load_bank():
        exists = (
            db.query(Question.id)
            .filter(
                Question.question_text == entry["question"],
                Question.topic == entry["topic"],
            )
            .first()
        )
        if exists:
            continue
        db.add(
            Question(
                subject=entry["subject"],
                topic=entry["topic"],
                bloom_level=entry["bloom_level"],
                difficulty=entry["difficulty"],
                question_type=entry.get("question_type", "open"),
                question_text=entry["question"],
                reference_answer=entry["correct_answer"],
                source="bank",
            )
        )
        added += 1
    if added:
        db.commit()
        logger.info("Seeded %d demo-bank questions", added)
    return added


def persist_generated_question(
    db: Session,
    generated: GeneratedQuestion,
    subject: str,
    topic: str,
    question_type: str = "open",
) -> Question:
    """Store a validated/fallback question so later runs can de-duplicate it."""
    question = Question(
        subject=subject,
        topic=topic,
        bloom_level=generated.bloom_level,
        difficulty=generated.difficulty,
        question_type=question_type,
        question_text=generated.question,
        options=generated.options,
        starter_code=generated.starter_code,
        test_cases=generated.test_cases,
        reference_answer=generated.correct_answer,
        source_chunk_ids=generated.source_chunk_ids or generated.source_chunks,
        source=generated.source,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


def _bloom_distance(requested: str, actual: str | None) -> int:
    if not actual or actual not in BLOOM_ORDER or requested not in BLOOM_ORDER:
        return 99
    return abs(BLOOM_ORDER.index(requested) - BLOOM_ORDER.index(actual))


def _question_from_cache(
    db: Session, *, subject: str, topic: str, bloom_level: str,
    excluded_texts: set[str], served_ids: set[uuid.UUID],
) -> Optional[GeneratedQuestion]:
    query = (
        db.query(Question)
        .filter(
            Question.topic == topic,
            Question.bloom_level == bloom_level,
            Question.source.in_(["live", "cache"]),
        )
        .order_by(Question.created_at.desc())
    )
    if served_ids:
        query = query.filter(Question.id.notin_(served_ids))
    rows = query.limit(50).all()
    for row in rows:
        if row.question_text in excluded_texts:
            continue
        return GeneratedQuestion(
            question_id=row.id,
            question=row.question_text,
            correct_answer=row.reference_answer or "Use the course material for this topic.",
            explanation="Previously validated question served from cache.",
            bloom_level=row.bloom_level,
            difficulty=row.difficulty,
            topic=topic,
            source="cache",
        )
    return None


def _bank_candidates(
    db: Session, *, topic: str, bloom_level: str,
    excluded_texts: set[str], served_ids: set[uuid.UUID],
) -> list[Question]:
    """Unserved rows first: target rung, then adjacent rungs, then any rung.

    Only when the whole pool is exhausted do we allow a repeat, so a 30-question
    demo never shows the same bank question while a fresh one is available.
    """
    seed_bank(db)
    key = (topic or "").strip().lower()
    query = db.query(Question).filter(Question.source == "bank")
    topic_rows = query.filter(func.lower(Question.topic) == key).all()
    rows = topic_rows or query.all()  # unknown topic still gets a valid bank question

    index = BLOOM_ORDER.index(bloom_level) if bloom_level in BLOOM_ORDER else 0
    rung_order = [index]
    for distance in range(1, len(BLOOM_ORDER)):
        for candidate in (index - distance, index + distance):
            if 0 <= candidate < len(BLOOM_ORDER):
                rung_order.append(candidate)

    buckets: dict[str, list[Question]] = {rung: [] for rung in BLOOM_ORDER}
    for row in rows:
        if row.question_text in excluded_texts:
            continue
        buckets.setdefault(row.bloom_level, []).append(row)

    ordered = [row for rung in rung_order for row in buckets.get(BLOOM_ORDER[rung], [])]
    unserved = [row for row in ordered if row.id not in served_ids]
    return unserved or ordered


def _question_from_bank(
    db: Session, *, subject: str, topic: str, bloom_level: str,
    excluded_texts: set[str], served_ids: set[uuid.UUID],
) -> GeneratedQuestion:
    candidates = _bank_candidates(
        db, topic=topic, bloom_level=bloom_level,
        excluded_texts=excluded_texts, served_ids=served_ids,
    )
    row = candidates[0]
    reused = row.id in served_ids
    warning = None
    if settings.offline_demo_mode:
        warning = "Served from the seeded demo bank (no live LLM was used)."
    if reused:
        warning = f"{warning or ''} Bank pool exhausted for this topic; reusing a served question.".strip()
    return GeneratedQuestion(
        question_id=row.id,
        question=row.question_text,
        correct_answer=row.reference_answer or "Use the course material for this topic.",
        explanation=f"Bank question for {row.topic}/{row.bloom_level}.",
        bloom_level=row.bloom_level,
        difficulty=row.difficulty,
        topic=row.topic,
        source="bank",
        context_warning=warning,
    )


def _fallback(
    db: Session, *, subject: str, topic: str, bloom_level: str,
    excluded_texts: set[str], served_ids: set[uuid.UUID], reason: str,
) -> GeneratedQuestion:
    logger.warning("Generation falling back to cache/bank: %s", reason)
    cached = _question_from_cache(
        db, subject=subject, topic=topic, bloom_level=bloom_level,
        excluded_texts=excluded_texts, served_ids=served_ids,
    )
    result = cached or _question_from_bank(
        db, subject=subject, topic=topic, bloom_level=bloom_level,
        excluded_texts=excluded_texts, served_ids=served_ids,
    )
    result.context_warning = (
        f"{result.context_warning or ''} Fallback reason: {reason}".strip()
    )
    return result


def generate_one(
    *,
    db: Session,
    subject: str,
    topic: str,
    bloom_level: str,
    difficulty: str,
    question_type: str,
    context_chunks: list[dict],
    alignment_client: Any | None,
    excluded_texts: set[str],
    deadline: float,
    adaptive_reason: str | None = None,
    served_ids: Optional[set[uuid.UUID]] = None,
) -> GeneratedQuestion:
    """Return one usable question, trying live generation within the deadline."""
    served_ids = served_ids or set()
    chunk_texts = [str(c.get("text", "")) for c in context_chunks]

    if not settings.offline_demo_mode:
        tolerance = settings.tolerance_for(bloom_level)
        strict_note: str | None = None
        for attempt in range(settings.generation_max_attempts):
            remaining = deadline - time.monotonic()
            if remaining < 2.0:
                return _fallback(
                    db, subject=subject, topic=topic, bloom_level=bloom_level,
                    excluded_texts=excluded_texts, served_ids=served_ids,
                    reason="deadline exhausted",
                )

            notes: list[str] = []
            if excluded_texts:
                notes.append(
                    "Avoid these previously used questions and do not rephrase them: "
                    + " | ".join(list(excluded_texts)[-4:])
                )
            if attempt:
                notes.append(
                    "Use a DIFFERENT angle and concrete example from the previous "
                    "attempt. Follow the requested Bloom level exactly."
                )
            if strict_note:
                notes.append(strict_note)
            try:
                generated = generation_service.generate_question(
                    topic=topic,
                    subject=subject,
                    bloom_level=bloom_level,
                    difficulty=difficulty,
                    question_type=question_type,
                    context_chunks=context_chunks,
                    extra_instruction="\n".join(notes),
                    timeout=settings.generation_call_timeout_seconds,
                    max_models=settings.generation_max_fallback_models,
                )
                validation = validation_service.validate_question(
                    generated=generated.model_dump(),
                    subject=subject,
                    topic=topic,
                    source_chunks=chunk_texts,
                    db=db,
                    requested_bloom=bloom_level,
                    llm_client=alignment_client,
                )
            except Exception as exc:  # LLM/quota/parse failures all degrade gracefully
                logger.warning("Live generation attempt %d failed: %s", attempt + 1, exc)
                break

            if validation["passed"]:
                _apply_adaptive_reason(generated, adaptive_reason)
                return generated

            reason_code = validation.get("reason_code")
            if reason_code == "cognitive":
                cog = validation.get("cognitive_alignment_check") or {}
                actual = str(cog.get("detected_level"))
                distance = _bloom_distance(bloom_level, actual)
                if attempt == 0:
                    # One strict regeneration is always worth trying before we
                    # accept a near miss or fall back.
                    strict_note = (
                        f"STRICT BLOOM RETRY: the previous question was classified "
                        f"as '{actual}' (distance {distance}, tolerance {tolerance}) "
                        f"instead of '{bloom_level}'. Rewrite it so its cognitive "
                        f"demand is unmistakably '{bloom_level}'."
                    )
                    logger.warning(
                        "Bloom mismatch distance %d — regenerating once with a strict prompt",
                        distance,
                    )
                    continue
                if distance <= 2:
                    # Do not discard a usable question after two LLM calls: keep
                    # the ACTUAL classified level and store/return that instead.
                    generated.bloom_level = actual
                    generated.difficulty = difficulty
                    generated.context_warning = (
                        f"Requested {bloom_level}, classified as {actual} "
                        f"(distance {distance}); storing the classified level."
                    )
                    _apply_adaptive_reason(generated, adaptive_reason)
                    logger.info("Accepted Bloom level %s within distance 2", actual)
                    return generated
                logger.warning("Bloom mismatch distance %d > 2 after strict retry — falling back", distance)
                break
            if reason_code == "duplicate":
                continue  # next attempt gets an explicit "different angle" note
            # Other validation failures: one retry, then fallback.
            continue

    return _fallback(
        db, subject=subject, topic=topic, bloom_level=bloom_level,
        excluded_texts=excluded_texts, served_ids=served_ids,
        reason=("offline demo mode" if settings.offline_demo_mode
                else "live generation unavailable or invalid"),
    )


def _apply_adaptive_reason(generated: GeneratedQuestion, reason: str | None) -> None:
    if reason:
        generated.adaptive = True
        generated.adaptive_reason = reason
