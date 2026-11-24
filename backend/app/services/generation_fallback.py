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
import re
import threading
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import NoContextError, TopicQuestionsUnavailableError
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
        p1 = Path(__file__).resolve().parent / "demo_question_bank.json"
        p2 = Path(__file__).resolve().parents[1] / "data" / "demo_question_bank.json"
        path = p1 if p1.exists() else p2
        _BANK_CACHE = json.loads(path.read_text(encoding="utf-8"))
    return _BANK_CACHE


KNOWN_TOPIC_CANONICAL: dict[str, str] = {
    "race condition": "Race Conditions",
    "race conditions": "Race Conditions",
    "deadlock": "Deadlocks",
    "deadlocks": "Deadlocks",
    "concurrency": "Concurrency",
    "semaphore": "Semaphores",
    "semaphores": "Semaphores",
    "paging": "Paging and Virtual Memory",
    "virtual memory": "Paging and Virtual Memory",
    "paging and virtual memory": "Paging and Virtual Memory",
    "cpu scheduling": "CPU Scheduling",
    "scheduling": "CPU Scheduling",
    "transaction": "Transactions",
    "transactions": "Transactions",
    "transactions and acid": "Transactions",
    "acid": "Transactions",
    "normalization": "Normalization",
    "database normalization": "Normalization",
    "indexing": "Indexing",
    "database indexing": "Indexing",
    "sql join": "SQL Joins",
    "sql joins": "SQL Joins",
    "join": "SQL Joins",
    "joins": "SQL Joins",
    "dynamic programming": "Dynamic Programming",
    "binary search tree": "Binary Search Trees",
    "binary search trees": "Binary Search Trees",
    "bst": "Binary Search Trees",
    "tcp congestion control": "TCP Congestion Control",
    "congestion control": "TCP Congestion Control",
}

TOPIC_TO_SUBJECT: dict[str, str] = {
    "Race Conditions": "OS",
    "Deadlocks": "OS",
    "Semaphores": "OS",
    "Paging and Virtual Memory": "OS",
    "CPU Scheduling": "OS",
    "Transactions and ACID": "DBMS",
    "Transactions": "DBMS",
    "Normalization": "DBMS",
    "Indexing": "DBMS",
    "SQL Joins": "DBMS",
    "Dynamic Programming": "DSA",
    "Binary Search Trees": "DSA",
    "TCP Congestion Control": "CN",
}


def canonical_topic_key(topic: str | None) -> str:
    """Normalize and resolve the single authoritative topic key for a topic name."""
    raw = (topic or "").strip()
    if not raw:
        return "General"
    cleaned = " ".join(raw.split())
    lowered = cleaned.lower()
    if lowered in KNOWN_TOPIC_CANONICAL:
        return KNOWN_TOPIC_CANONICAL[lowered]
    return cleaned


def canonical_subject_for_topic(topic: str, db: Session | None = None) -> str | None:
    """Return the authoritative subject for a well-known topic.

    Prevents splitting a student's mastery records across arbitrary subject tags
    (e.g., Deadlocks under both OS and DBMS).
    """
    canonical = canonical_topic_key(topic)
    if canonical in TOPIC_TO_SUBJECT:
        return TOPIC_TO_SUBJECT[canonical]
    key = (topic or "").strip().lower()
    if not key:
        return None
    for entry in load_bank():
        if entry.get("topic", "").strip().lower() in (key, canonical.lower()):
            return entry.get("subject")
    if db is not None:
        row = (
            db.query(Question.subject)
            .filter(
                func.lower(Question.topic).in_([key, canonical.lower()]),
                Question.source == "bank",
            )
            .first()
        )
        if row and row[0]:
            return row[0]
    return None


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
    target_subject = subject
    if not target_subject or target_subject.lower() == "general":
        target_subject = canonical_subject_for_topic(topic, db) or subject
    if target_subject and target_subject.lower() != "general":
        query = query.filter(func.lower(Question.subject) == target_subject.lower())
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
    subject: str | None = None,
) -> list[Question]:
    """Unserved rows first: target rung, then adjacent rungs, then any rung.

    Only when the whole pool is exhausted do we allow a repeat, so a 30-question
    demo never shows the same bank question while a fresh one is available.
    """
    seed_bank(db)
    canonical = canonical_topic_key(topic)
    key = canonical.lower()
    raw_key = (topic or "").strip().lower()
    keys_to_match = list({key, raw_key})
    if "transactions" in key:
        keys_to_match.extend(["transactions", "transactions and acid"])
    if "paging" in key:
        keys_to_match.extend(["paging", "virtual memory", "paging and virtual memory"])

    query = db.query(Question).filter(Question.source == "bank")
    topic_rows = query.filter(func.lower(Question.topic).in_(keys_to_match)).all()
    if not topic_rows:
        # STRICT DEMO REQUIREMENT: Never serve a question from a different topic!
        return []

    target_subject = subject
    if not target_subject or target_subject.lower() == "general":
        target_subject = canonical_subject_for_topic(canonical, db) or subject
    if target_subject and target_subject.lower() != "general":
        subj_matches = [r for r in topic_rows if r.subject.lower() == target_subject.lower()]
        if subj_matches:
            topic_rows = subj_matches
    rows = topic_rows

    index = BLOOM_ORDER.index(bloom_level) if bloom_level in BLOOM_ORDER else 0
    rung_order = [index]
    for distance in range(1, len(BLOOM_ORDER)):
        for candidate in (index - distance, index + distance):
            if 0 <= candidate < len(BLOOM_ORDER):
                rung_order.append(candidate)

    # Excluding the whole pool must not crash generation: a repeat is the last
    # resort, not an empty candidate list.
    candidate_pool = [row for row in rows if row.question_text not in excluded_texts] or rows
    buckets: dict[str, list[Question]] = {rung: [] for rung in BLOOM_ORDER}
    for row in candidate_pool:
        buckets.setdefault(row.bloom_level, []).append(row)

    ordered = [row for rung in rung_order for row in buckets.get(BLOOM_ORDER[rung], [])]
    unserved = [row for row in ordered if row.id not in served_ids]
    return unserved or ordered


def _question_from_bank(
    db: Session, *, subject: str, topic: str, bloom_level: str,
    excluded_texts: set[str], served_ids: set[uuid.UUID],
) -> Optional[GeneratedQuestion]:
    candidates = _bank_candidates(
        db, topic=topic, bloom_level=bloom_level,
        excluded_texts=excluded_texts, served_ids=served_ids,
        subject=subject,
    )
    if not candidates:
        bank = load_bank()
        canonical = canonical_topic_key(topic)
        key = canonical.lower()
        raw_key = (topic or "").strip().lower()
        keys_to_match = {key, raw_key}
        if "transactions" in key:
            keys_to_match.update(["transactions", "transactions and acid"])
        if "paging" in key:
            keys_to_match.update(["paging", "virtual memory", "paging and virtual memory"])
        matches = [
            entry for entry in bank
            if entry.get("topic", "").strip().lower() in keys_to_match
        ]
        if not matches:
            # STRICT DEMO REQUIREMENT: Never serve a question from a different topic!
            return None
        level_matches = [e for e in matches if e["bloom_level"] == bloom_level] or matches
        entry = level_matches[0]
        return GeneratedQuestion(
            question=entry["question"],
            correct_answer=entry["correct_answer"],
            explanation=entry["explanation"],
            bloom_level=entry["bloom_level"],
            difficulty=entry["difficulty"],
            topic=canonical,
            source="bank",
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
        topic=canonical_topic_key(topic),
        source="bank",
        context_warning=warning,
    )


def _question_from_uploaded_context(
    context_chunks: list[dict],
    *,
    topic: str,
    bloom_level: str,
    difficulty: str,
    excluded_texts: set[str],
    reason: str,
) -> GeneratedQuestion:
    """Build a gradeable question directly from retrieved uploaded text.

    Offline demo mode has no LLM, and a live LLM call can still fail. Neither is
    a reason to leave uploaded-only generation: the retrieved chunk is real
    study material, so turn one of its sentences into a cloze question and keep
    the source document and the stored topic as provenance.
    """
    chunk = context_chunks[0]
    text = str(chunk.get("text", "")).strip()
    source_doc = str(chunk.get("source_doc") or "uploaded document")
    served_topic = str(chunk.get("topic") or topic)

    # PDFs put the title on its own line. Split on newlines as well as sentence
    # punctuation so the title is not glued to the first useful sentence.
    sentences = [
        part.strip()
        for part in re.split(r"(?<=[.!?])\s+|\n+", text)
        if part.strip()
    ]
    informative = [part for part in sentences if len(part.split()) >= 6] or sentences or [text]

    def build(sentence: str) -> tuple[str, str]:
        clean = sentence.rstrip(".!?")
        match = re.search(
            r"\b(A|An|The)\s+([^.!?]+?)\s+"
            r"(is|are|means|refers to|happens when|loads|stores|maps|requires|holds|waits for)\s+"
            r"(.+)$",
            clean,
            re.IGNORECASE,
        )
        if match:
            subject_phrase = f"{match.group(1)} {match.group(2)}".strip()
            verb = match.group(3).lower()
            rest = match.group(4).strip()
            return (
                f"According to your uploaded material, what {verb} {rest}?",
                subject_phrase,
            )
        return (
            f"According to your uploaded material, what is the key point about {served_topic}?",
            clean,
        )

    candidates = [build(sentence) for sentence in informative]
    question, answer = next(
        (pair for pair in candidates if pair[0] not in excluded_texts),
        candidates[0],
    )
    return GeneratedQuestion(
        question=question,
        correct_answer=answer,
        explanation=f"Grounded in the uploaded document {source_doc}.",
        bloom_level=bloom_level,
        difficulty=difficulty,
        topic=served_topic,
        requested_topic=topic,
        served_topic=served_topic,
        source_chunks=[source_doc],
        source="uploaded",
        context_warning=(
            f"{reason} Grounded in uploaded text from {source_doc}; "
            f"stored topic is '{served_topic}'."
        ),
    )


def _fallback(
    db: Session, *, subject: str, topic: str, bloom_level: str,
    excluded_texts: set[str], served_ids: set[uuid.UUID], reason: str,
) -> Optional[GeneratedQuestion]:
    logger.warning("Generation falling back to cache/bank: %s", reason)
    cached = _question_from_cache(
        db, subject=subject, topic=topic, bloom_level=bloom_level,
        excluded_texts=excluded_texts, served_ids=served_ids,
    )
    result = cached or _question_from_bank(
        db, subject=subject, topic=topic, bloom_level=bloom_level,
        excluded_texts=excluded_texts, served_ids=served_ids,
    )
    if result is None:
        return None
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
    uploaded_only: bool = False,
) -> GeneratedQuestion:
    """Return one usable question, trying live generation within the deadline."""
    served_ids = served_ids or set()
    chunk_texts = [str(c.get("text", "")) for c in context_chunks]

    if uploaded_only and not context_chunks:
        raise NoContextError(
            f"No uploaded material covers '{topic}'. Upload a document first."
        )

    if uploaded_only and settings.offline_demo_mode:
        return _question_from_uploaded_context(
            context_chunks,
            topic=topic,
            bloom_level=bloom_level,
            difficulty=difficulty,
            excluded_texts=excluded_texts,
            reason="Offline demo mode; no LLM call was made.",
        )

    last_usable_generated: GeneratedQuestion | None = None
    last_validation: dict | None = None

    def fallback(reason: str) -> GeneratedQuestion:
        if uploaded_only and context_chunks:
            return _question_from_uploaded_context(
                context_chunks,
                topic=topic,
                bloom_level=bloom_level,
                difficulty=difficulty,
                excluded_texts=excluded_texts,
                reason=reason,
            )
        fb_result = _fallback(
            db, subject=subject, topic=topic, bloom_level=bloom_level,
            excluded_texts=excluded_texts, served_ids=served_ids, reason=reason,
        )
        if fb_result is not None:
            return fb_result
        if last_usable_generated is not None:
            v_reason = (last_validation or {}).get("reason", "validation advisory")
            logger.warning(
                "No bank questions for topic '%s'. Serving live-generated question despite notice (%s) to maintain session continuity.",
                topic,
                v_reason,
            )
            last_usable_generated.context_warning = f"Live generated: {v_reason}"
            _apply_adaptive_reason(last_usable_generated, adaptive_reason)
            return last_usable_generated
        raise TopicQuestionsUnavailableError(
            topic=topic,
            reason=reason,
            offline=settings.offline_demo_mode,
        )

    if not settings.offline_demo_mode:
        tolerance = settings.tolerance_for(bloom_level)
        strict_note: str | None = None
        for attempt in range(settings.generation_max_attempts):
            remaining = deadline - time.monotonic()
            logger.info("Starting live generation attempt %d of %d (remaining=%.1fs)", attempt + 1, settings.generation_max_attempts, remaining)
            if remaining < 2.0:
                return fallback("deadline exhausted")

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
                    deadline=deadline,
                    uploaded_only=uploaded_only,
                )
                existing_candidates: list[Question] = []
                if served_ids:
                    existing_candidates = db.query(Question).filter(Question.id.in_(served_ids)).all()
                validation = validation_service.validate_question(
                    generated=generated.model_dump(),
                    subject=subject,
                    topic=topic,
                    source_chunks=chunk_texts,
                    db=db,
                    requested_bloom=bloom_level,
                    llm_client=alignment_client,
                    existing=existing_candidates,
                )
                logger.info("Validation result attempt %d: passed=%s reason_code=%s reason=%s", attempt + 1, validation.get("passed"), validation.get("reason_code"), validation.get("reason"))
                if not validation.get("duplicate_check", {}).get("is_duplicate", False) or last_usable_generated is None:
                    last_usable_generated = generated
                    last_validation = validation
            except Exception as exc:  # LLM/quota/parse failures all degrade gracefully
                logger.warning("Live generation attempt %d failed: %s", attempt + 1, exc)
                if remaining > 5.0 and attempt < settings.generation_max_attempts - 1:
                    time.sleep(1.0)
                    continue
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
                dup_check = validation.get("duplicate_check") or {}
                sim_text = dup_check.get("similar_to_text")
                if sim_text:
                    excluded_texts.add(sim_text)
                if getattr(generated, "question", None):
                    excluded_texts.add(generated.question)
                continue  # next attempt gets an explicit "different angle" note
            # Other validation failures: one retry, then fallback.
            continue

    return fallback(
        "offline demo mode" if settings.offline_demo_mode
        else "live generation unavailable or invalid"
    )


def _apply_adaptive_reason(generated: GeneratedQuestion, reason: str | None) -> None:
    if reason:
        generated.adaptive = True
        generated.adaptive_reason = reason
