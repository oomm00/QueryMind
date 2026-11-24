"""Item 3: generation always returns a usable question."""

from __future__ import annotations

import time
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.base import Base
from app.models.models import Question
from app.schemas.schemas import GeneratedQuestion
from app.services import generation_service, validation_service
from app.services.evaluation_service import evaluate_answer_provisional
from app.services.generation_fallback import (
    generate_one,
    load_bank,
    seed_bank,
)


def _generated(text: str = "A valid deadlock question?") -> GeneratedQuestion:
    return GeneratedQuestion(
        question=text,
        correct_answer="Break the circular wait.",
        explanation="grounded",
        bloom_level="remember",
        difficulty="easy",
        source="live",
    )


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    db = Session()
    yield db
    db.close()


def test_bank_has_eight_questions_per_rung_per_topic():
    bank = load_bank()
    topics = {e["topic"] for e in bank}
    assert len(topics) >= 10
    assert len(bank) == len(topics) * 48
    for topic in topics:
        for rung in ("remember", "understand", "apply", "analyze", "evaluate", "create"):
            assert sum(1 for e in bank if e["topic"] == topic and e["bloom_level"] == rung) == 8


def test_bank_seeding_is_idempotent_and_marked(db_session):
    bank = load_bank()
    assert seed_bank(db_session) == len(bank)
    assert db_session.query(Question).count() == len(bank)
    assert seed_bank(db_session) == 0
    assert db_session.query(Question).count() == len(bank)
    assert {q.source for q in db_session.query(Question).all()} == {"bank"}


def test_offline_mode_never_calls_llm_and_returns_bank(db_session, monkeypatch):
    monkeypatch.setattr(settings, "offline_demo_mode", True)

    def _must_not_call(*args, **kwargs):
        raise AssertionError("LLM must not be called in offline demo mode")

    monkeypatch.setattr(generation_service, "generate_question", _must_not_call)
    result = generate_one(
        db=db_session, subject="OS", topic="Deadlocks", bloom_level="remember",
        difficulty="easy", question_type="open", context_chunks=[],
        alignment_client=None, excluded_texts=set(), deadline=time.monotonic() + 60.0,
    )
    assert result.source == "bank"
    assert result.question
    assert result.correct_answer


def test_duplicate_retries_with_new_angle(db_session, monkeypatch):
    monkeypatch.setattr(settings, "offline_demo_mode", False)
    calls = []

    def _gen(*args, **kwargs):
        calls.append(kwargs.get("extra_instruction", ""))
        return _generated()

    def _validate(**kwargs):
        if len(calls) == 1:
            return {"passed": False, "reason_code": "duplicate"}
        return {"passed": True}

    monkeypatch.setattr(generation_service, "generate_question", _gen)
    monkeypatch.setattr(validation_service, "validate_question", _validate)
    result = generate_one(
        db=db_session, subject="OS", topic="Deadlocks", bloom_level="remember",
        difficulty="easy", question_type="open", context_chunks=[],
        alignment_client=None, excluded_texts=set(), deadline=time.monotonic() + 60.0,
    )
    assert result.source == "live"
    assert len(calls) == 2
    assert "DIFFERENT angle" in calls[1]


def test_near_bloom_mismatch_regenerates_strictly_then_accepts_actual(db_session, monkeypatch):
    monkeypatch.setattr(settings, "offline_demo_mode", False)
    notes = []

    def _gen(*args, **kwargs):
        notes.append(kwargs.get("extra_instruction", ""))
        return _generated()

    monkeypatch.setattr(generation_service, "generate_question", _gen)
    monkeypatch.setattr(
        validation_service, "validate_question",
        lambda **k: {
            "passed": False,
            "reason_code": "cognitive",
            "cognitive_alignment_check": {"detected_level": "understand", "distance": 1},
        },
    )
    result = generate_one(
        db=db_session, subject="OS", topic="Deadlocks", bloom_level="remember",
        difficulty="easy", question_type="open", context_chunks=[],
        alignment_client=None, excluded_texts=set(), deadline=time.monotonic() + 60.0,
    )
    assert result.bloom_level == "understand"
    assert "classified as understand" in result.context_warning
    assert len(notes) == 2
    assert "STRICT BLOOM RETRY" in notes[1]


def test_far_bloom_mismatch_falls_back_after_two_calls(db_session, monkeypatch):
    monkeypatch.setattr(settings, "offline_demo_mode", False)
    calls = []
    monkeypatch.setattr(
        generation_service, "generate_question",
        lambda *a, **k: (calls.append(1) or _generated()),
    )
    monkeypatch.setattr(
        validation_service, "validate_question",
        lambda **k: {
            "passed": False,
            "reason_code": "cognitive",
            "cognitive_alignment_check": {"detected_level": "create", "distance": 5},
        },
    )
    result = generate_one(
        db=db_session, subject="OS", topic="Deadlocks", bloom_level="remember",
        difficulty="easy", question_type="open", context_chunks=[],
        alignment_client=None, excluded_texts=set(), deadline=time.monotonic() + 60.0,
    )
    assert len(calls) == 2
    assert result.source in {"cache", "bank"}


def test_expired_deadline_falls_back(db_session, monkeypatch):
    monkeypatch.setattr(settings, "offline_demo_mode", False)

    def _must_not_call(*args, **kwargs):
        raise AssertionError("deadline already expired")

    monkeypatch.setattr(generation_service, "generate_question", _must_not_call)
    result = generate_one(
        db=db_session, subject="OS", topic="Deadlocks", bloom_level="remember",
        difficulty="easy", question_type="open", context_chunks=[],
        alignment_client=None, excluded_texts=set(), deadline=0.0,
    )
    assert result.source in {"cache", "bank"}


def test_provisional_evaluator_is_deterministic_and_labelled():
    question = SimpleNamespace(
        question_text="What is mutual exclusion?",
        reference_answer="Mutual exclusion means only one process holds a resource at a time.",
    )
    first = evaluate_answer_provisional(question, "Mutual exclusion one process resource")
    second = evaluate_answer_provisional(question, "Mutual exclusion one process resource")
    assert first == second
    assert first["evaluation_mode"] == "provisional"
    assert 0 <= first["overall_score"] <= 100
