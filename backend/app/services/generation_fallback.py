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
import time
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import Question
from app.schemas.schemas import GeneratedQuestion
from app.services import generation_service, validation_service
from app.services.mastery_service import BLOOM_ORDER

logger = logging.getLogger("querymind.generation.fallback")

_BANK_PATH = Path(__file__).resolve().parents[1] / "data" / "demo_question_bank.json"
_BANK_CACHE: Optional[list[dict[str, Any]]] = None


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
    db: Session, *, subject: str, topic: str, bloom_level: str, excluded_texts: set[str]
) -> Optional[GeneratedQuestion]:
    rows = (
        db.query(Question)
        .filter(
            Question.topic == topic,
            Question.bloom_level == bloom_level,
            Question.source.in_(["live", "cache"]),
        )
        .order_by(Question.created_at.desc())
        .limit(25)
        .all()
    )
    for row in rows:
        if row.question_text in excluded_texts:
            continue
        return GeneratedQuestion(
            question=row.question_text,
            correct_answer=row.reference_answer or "Use the course material for this topic.",
            explanation="Previously validated question served from cache.",
            bloom_level=row.bloom_level,
            difficulty=row.difficulty,
            topic=topic,
            source="cache",
        )
    return None


def _question_from_bank(
    db: Session, *, subject: str, topic: str, bloom_level: str,
    excluded_texts: set[str],
) -> GeneratedQuestion:
    seed_bank(db)
    bank = load_bank()
    key = (topic or "").strip().lower()
    matches = [e for e in bank if e["topic"].strip().lower() == key and e["bloom_level"] == bloom_level]
    if not matches:  # still serve a valid question for an unknown topic
        matches = [e for e in bank if e["bloom_level"] == bloom_level]
    for entry in matches:
        if entry["question"] in excluded_texts:
            continue
        return GeneratedQuestion(
            question=entry["question"],
            correct_answer=entry["correct_answer"],
            explanation=entry["explanation"],
            bloom_level=entry["bloom_level"],
            difficulty=entry["difficulty"],
            topic=entry["topic"],
            source="bank",
            context_warning=(
                "Served from the seeded demo bank (no live LLM was used)."
                if settings.offline_demo_mode
                else None
            ),
        )
    # Every bank entry was already used in this batch — vary the wording rather
    # than returning nothing.
    base = matches[0]
    return GeneratedQuestion(
        question=f"{base['question']} (variant {len(excluded_texts) + 1})",
        correct_answer=base["correct_answer"],
        explanation=base["explanation"],
        bloom_level=base["bloom_level"],
        difficulty=base["difficulty"],
        topic=base["topic"],
        source="bank",
    )


def _fallback(
    db: Session, *, subject: str, topic: str, bloom_level: str,
    excluded_texts: set[str], reason: str,
) -> GeneratedQuestion:
    logger.warning("Generation falling back to cache/bank: %s", reason)
    cached = _question_from_cache(
        db, subject=subject, topic=topic, bloom_level=bloom_level,
        excluded_texts=excluded_texts,
    )
    result = cached or _question_from_bank(
        db, subject=subject, topic=topic, bloom_level=bloom_level,
        excluded_texts=excluded_texts,
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
) -> GeneratedQuestion:
    """Return one usable question, trying live generation within the deadline."""
    chunk_texts = [str(c.get("text", "")) for c in context_chunks]

    if not settings.offline_demo_mode:
        tolerance = settings.tolerance_for(bloom_level)
        strict_note: str | None = None
        for attempt in range(settings.generation_max_attempts):
            remaining = deadline - time.monotonic()
            if remaining < 2.0:
                return _fallback(
                    db, subject=subject, topic=topic, bloom_level=bloom_level,
                    excluded_texts=excluded_texts, reason="deadline exhausted",
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
        excluded_texts=excluded_texts,
        reason=("offline demo mode" if settings.offline_demo_mode
                else "live generation unavailable or invalid"),
    )


def _apply_adaptive_reason(generated: GeneratedQuestion, reason: str | None) -> None:
    if reason:
        generated.adaptive = True
        generated.adaptive_reason = reason
