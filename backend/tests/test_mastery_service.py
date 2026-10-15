"""
Unit & Endpoint Tests — Mastery Profiling & Adaptive Selection
==============================================================
Covers the blueprint Stage 10 (EMA mastery update) and Stage 11 (adaptive
next-question selection) plus their wiring into the API.

Unit (no network):
 1. The first attempt seeds mastery (no averaging against 0).
 2. Later attempts move mastery by the exact EMA rule (α = 0.3).
 3. Hard questions move mastery more than easy ones; the weighted score and the
    resulting mastery are clamped to 0..1.
 4. The per-Bloom breakdown tracks each level with the same EMA.
 5. ``recommend_next`` picks the right level at every band / boundary.
 6. The "struggling" rule steps the recommendation down one level.

Endpoint (real in-memory DB unless noted):
 7. GET /mastery/me -> 401 when unauthenticated.
 8. GET /mastery/me returns only the caller's records (+ subject/topic filters).
 9. Submitting an answer updates mastery in the same transaction.
10. A mastery failure does NOT lose the persisted attempt.
11. POST /questions/generate?adaptive=true uses the recommendation and says why.
12. adaptive omitted -> behaviour unchanged (supplied level used).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.models  # noqa: F401 — register models on Base.metadata
from app.api import questions as questions_module
from app.api.deps import get_current_user
from app.db.session import get_db
from app.main import create_app
from app.models.base import Base
from app.models.models import Attempt, MasteryRecord, Question, User
from app.schemas.schemas import GeneratedQuestion
from app.services import mastery_service
from app.services.mastery_service import (
    EMA_ALPHA,
    get_mastery,
    recommend_next,
    update_mastery,
)


# ── Fixtures / helpers ────────────────────────────────────────────────────────

@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _add_user(db, email=None) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email or f"u{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def user(db) -> User:
    return _add_user(db)


def _seed_mastery(db, user, subject, topic, score, attempts=3):
    """Insert a mastery record directly so the band thresholds can be tested."""
    db.add(
        MasteryRecord(
            user_id=user.id,
            subject=subject,
            topic=topic,
            mastery_score=score,
            attempts_count=attempts,
            bloom_breakdown="{}",
        )
    )
    db.commit()


def _add_attempt(db, user, subject, topic, score, created_at):
    """Persist an attempt (with an explicit timestamp) for the struggle lookback."""
    question = Question(
        topic=topic,
        subject=subject,
        bloom_level="apply",
        difficulty="medium",
        question_text=f"seed question {uuid.uuid4().hex}",
    )
    db.add(question)
    db.flush()
    db.add(
        Attempt(
            user_id=user.id,
            question_id=question.id,
            user_answer="an answer",
            score=score,
            created_at=created_at,
        )
    )
    db.commit()


# ── Stage 10: EMA mastery update ──────────────────────────────────────────────

def test_first_attempt_seeds_mastery(db, user):
    record = update_mastery(user.id, "DBMS", "Transactions", 0.8, "apply", "medium", db)
    db.commit()

    assert record.attempts_count == 1
    # Seeded directly (NOT EMA-averaged against 0): 0.8 * 1.0 (medium) = 0.8
    assert record.mastery_score == pytest.approx(0.8)


def test_later_attempts_apply_exact_ema(db, user):
    update_mastery(user.id, "DBMS", "Transactions", 0.5, "apply", "medium", db)
    db.commit()
    # 0.3*1.0 + 0.7*0.5 = 0.65
    update_mastery(user.id, "DBMS", "Transactions", 1.0, "apply", "medium", db)
    db.commit()
    record = get_mastery(user.id, db=db)[0]
    assert record.mastery_score == pytest.approx(0.65)
    assert record.attempts_count == 2

    # 0.3*0.0 + 0.7*0.65 = 0.455
    update_mastery(user.id, "DBMS", "Transactions", 0.0, "apply", "medium", db)
    db.commit()
    record = get_mastery(user.id, db=db)[0]
    assert record.mastery_score == pytest.approx(0.455)
    assert record.attempts_count == 3


def test_ema_alpha_constant_is_point_three():
    # Guards the blueprint's α ≈ 0.3 if someone changes the constant.
    assert EMA_ALPHA == pytest.approx(0.3)


def test_hard_question_moves_mastery_more_than_easy(db, user):
    # Same raw score, different difficulty.
    update_mastery(user.id, "DBMS", "Normalization", 0.5, "apply", "hard", db)
    update_mastery(user.id, "DBMS", "Indexing", 0.5, "apply", "easy", db)
    db.commit()

    by_topic = {r.topic: r.mastery_score for r in get_mastery(user.id, db=db)}
    # hard: 0.5 * 1.2 = 0.6 ; easy: 0.5 * 0.8 = 0.4
    assert by_topic["Normalization"] == pytest.approx(0.6)
    assert by_topic["Indexing"] == pytest.approx(0.4)
    assert by_topic["Normalization"] > by_topic["Indexing"]


def test_weighted_score_is_clamped_to_one(db, user):
    # hard 0.9 -> 1.08 raw -> clamped to 1.0
    update_mastery(user.id, "DBMS", "Transactions", 0.9, "analyze", "hard", db)
    db.commit()
    record = get_mastery(user.id, db=db)[0]
    assert record.mastery_score == pytest.approx(1.0)


def test_mastery_stays_within_bounds_across_many_attempts(db, user):
    sequence = [
        (1.0, "hard"), (1.0, "hard"), (0.0, "easy"), (0.0, "easy"),
        (0.5, "medium"), (1.0, "hard"), (0.1, "easy"),
    ]
    for score, difficulty in sequence:
        update_mastery(user.id, "DBMS", "Transactions", score, "apply", difficulty, db)
        db.commit()
        record = get_mastery(user.id, db=db)[0]
        assert 0.0 <= record.mastery_score <= 1.0


def test_bloom_breakdown_tracks_each_level(db, user):
    update_mastery(user.id, "DBMS", "Transactions", 0.5, "apply", "medium", db)
    update_mastery(user.id, "DBMS", "Transactions", 1.0, "analyze", "medium", db)
    # apply is on its 2nd attempt: 0.3*0.4 + 0.7*0.5 = 0.47
    update_mastery(user.id, "DBMS", "Transactions", 0.4, "apply", "medium", db)
    db.commit()

    breakdown = json.loads(get_mastery(user.id, db=db)[0].bloom_breakdown)
    assert breakdown["apply"] == pytest.approx(0.47)
    assert breakdown["analyze"] == pytest.approx(1.0)


# ── Stage 11: recommend_next ──────────────────────────────────────────────────

def test_recommend_no_history_is_recall_easy(db, user):
    assert recommend_next(user.id, "DBMS", "Transactions", db) == {
        "bloom_level": "remember",
        "difficulty": "easy",
    }


@pytest.mark.parametrize(
    "mastery, expected",
    [
        (0.10, {"bloom_level": "remember", "difficulty": "easy"}),
        (0.39, {"bloom_level": "remember", "difficulty": "easy"}),
        (0.40, {"bloom_level": "apply", "difficulty": "medium"}),   # low boundary
        (0.55, {"bloom_level": "apply", "difficulty": "medium"}),
        (0.70, {"bloom_level": "apply", "difficulty": "medium"}),   # high boundary
        (0.71, {"bloom_level": "analyze", "difficulty": "hard"}),
        (0.95, {"bloom_level": "analyze", "difficulty": "hard"}),
    ],
)
def test_recommend_by_mastery_band(db, user, mastery, expected):
    _seed_mastery(db, user, "DBMS", "Transactions", mastery)
    assert recommend_next(user.id, "DBMS", "Transactions", db) == expected


def test_struggle_steps_down_one_level_from_mid(db, user):
    _seed_mastery(db, user, "DBMS", "Transactions", 0.5)  # base: apply/medium
    now = datetime.now(timezone.utc)
    _add_attempt(db, user, "DBMS", "Transactions", 0.1, now - timedelta(minutes=2))
    _add_attempt(db, user, "DBMS", "Transactions", 0.2, now - timedelta(minutes=1))

    assert recommend_next(user.id, "DBMS", "Transactions", db) == {
        "bloom_level": "understand",
        "difficulty": "easy",
    }


def test_struggle_steps_down_one_level_from_high(db, user):
    _seed_mastery(db, user, "DBMS", "Transactions", 0.9)  # base: analyze/hard
    now = datetime.now(timezone.utc)
    _add_attempt(db, user, "DBMS", "Transactions", 0.0, now - timedelta(minutes=2))
    _add_attempt(db, user, "DBMS", "Transactions", 0.1, now - timedelta(minutes=1))

    assert recommend_next(user.id, "DBMS", "Transactions", db) == {
        "bloom_level": "apply",
        "difficulty": "medium",
    }


def test_no_step_down_with_only_one_bad_attempt(db, user):
    _seed_mastery(db, user, "DBMS", "Transactions", 0.5)
    _add_attempt(
        db, user, "DBMS", "Transactions", 0.1,
        datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    assert recommend_next(user.id, "DBMS", "Transactions", db)["bloom_level"] == "apply"


def test_no_step_down_when_recent_attempts_are_mixed(db, user):
    _seed_mastery(db, user, "DBMS", "Transactions", 0.5)
    now = datetime.now(timezone.utc)
    _add_attempt(db, user, "DBMS", "Transactions", 0.1, now - timedelta(minutes=2))
    _add_attempt(db, user, "DBMS", "Transactions", 0.8, now - timedelta(minutes=1))
    assert recommend_next(user.id, "DBMS", "Transactions", db) == {
        "bloom_level": "apply",
        "difficulty": "medium",
    }


# ── get_mastery filtering ─────────────────────────────────────────────────────

def test_get_mastery_filters_by_subject_and_topic(db, user):
    update_mastery(user.id, "DBMS", "Transactions", 0.5, "apply", "medium", db)
    update_mastery(user.id, "OS", "Deadlocks", 0.5, "apply", "medium", db)
    db.commit()

    assert len(get_mastery(user.id, db=db)) == 2
    assert {r.subject for r in get_mastery(user.id, subject="OS", db=db)} == {"OS"}
    only = get_mastery(user.id, subject="DBMS", topic="Transactions", db=db)
    assert len(only) == 1 and only[0].topic == "Transactions"


# ── Endpoint fixtures / helpers ───────────────────────────────────────────────

def _question(bloom_level="analyze", difficulty="hard") -> Question:
    return Question(
        topic="Transactions",
        subject="DBMS",
        bloom_level=bloom_level,
        difficulty=difficulty,
        question_text="Analyze how Two-Phase Locking prevents dirty reads.",
        reference_answer="2PL holds exclusive locks until commit.",
    )


_CANNED_EVAL = {
    "scores": {"correctness": 8, "completeness": 8, "depth_of_reasoning": 8, "clarity": 8},
    "overall_score": 80.0,
    "feedback": "Solid answer.",
    "missing_points": [],
    "strengths": ["clear"],
}


def _authed_client(db, user):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


# ── GET /mastery/me ───────────────────────────────────────────────────────────

def test_mastery_me_401_unauthenticated(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)

    assert client.get("/mastery/me").status_code == 401


def test_mastery_me_returns_only_callers_records(db):
    caller = _add_user(db, "caller@example.com")
    other = _add_user(db, "other@example.com")
    update_mastery(caller.id, "DBMS", "Transactions", 0.8, "apply", "medium", db)
    update_mastery(other.id, "DBMS", "Transactions", 0.2, "remember", "easy", db)
    update_mastery(caller.id, "OS", "Deadlocks", 0.6, "apply", "medium", db)
    db.commit()

    client = _authed_client(db, caller)
    resp = client.get("/mastery/me")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2                                   # caller's two records only
    dbms = next(r for r in body if r["subject"] == "DBMS")
    assert dbms["mastery_score"] == pytest.approx(0.8)      # caller's, not other's 0.2
    assert dbms["attempts_count"] == 1
    assert "bloom_breakdown" in dbms


def test_mastery_me_subject_filter(db):
    caller = _add_user(db)
    update_mastery(caller.id, "DBMS", "Transactions", 0.8, "apply", "medium", db)
    update_mastery(caller.id, "OS", "Deadlocks", 0.6, "apply", "medium", db)
    db.commit()

    resp = _authed_client(db, caller).get("/mastery/me?subject=OS")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1 and body[0]["subject"] == "OS"


# ── submit-answer -> mastery, and the failure-isolation guarantee ─────────────

def test_submit_answer_updates_mastery(db, monkeypatch):
    user = _add_user(db)
    question = _question()  # analyze / hard
    db.add(question)
    db.commit()
    db.refresh(question)

    monkeypatch.setattr(
        questions_module, "evaluate_answer", MagicMock(return_value=_CANNED_EVAL)
    )
    resp = _authed_client(db, user).post(
        f"/questions/{question.id}/submit-answer",
        json={"answer": "2PL holds exclusive locks until commit."},
    )

    assert resp.status_code == 200
    db.expire_all()
    records = get_mastery(user.id, db=db)
    assert len(records) == 1
    # score 0.8 (hard) -> weighted 0.96 on the first attempt
    assert records[0].mastery_score == pytest.approx(0.96)
    assert records[0].attempts_count == 1


def test_mastery_failure_does_not_lose_the_attempt(db, monkeypatch):
    user = _add_user(db)
    question = _question()
    db.add(question)
    db.commit()
    db.refresh(question)

    monkeypatch.setattr(
        questions_module, "evaluate_answer", MagicMock(return_value=_CANNED_EVAL)
    )
    # Make the mastery update blow up AFTER the attempt has been added.
    monkeypatch.setattr(
        questions_module,
        "update_mastery",
        MagicMock(side_effect=RuntimeError("mastery store unavailable")),
    )

    resp = _authed_client(db, user).post(
        f"/questions/{question.id}/submit-answer",
        json={"answer": "2PL holds exclusive locks until commit."},
    )

    assert resp.status_code == 200                       # request still succeeds
    db.expire_all()
    assert db.query(Attempt).count() == 1                # the answer survived
    assert db.query(MasteryRecord).count() == 0          # mastery write rolled back


# ── POST /questions/generate adaptive flag ────────────────────────────────────

_GEN_PAYLOAD = {
    "topic": "Transactions",
    "subject": "DBMS",
    "bloom_level": "analyze",
    "difficulty": "hard",
    "question_type": "open",
}

_PASS = {
    "passed": True,
    "duplicate_check": {"is_duplicate": False, "similarity": 0.1},
    "answerability_check": {"is_answerable": True, "best_match_score": 0.8},
    "reason": None,
}


def _patch_generation(monkeypatch):
    """Patch retrieval/generation/validation in the questions module."""
    monkeypatch.setattr(
        questions_module,
        "retrieve_context",
        lambda **kwargs: [{"text": "Transactions use ACID + 2PL.", "source_doc": "lec.pdf"}],
    )

    def _fake_generate(**kwargs):
        return GeneratedQuestion(
            question="Explain 2PL.",
            correct_answer="Growing/shrinking phases.",
            explanation="Grounded in the lecture.",
            bloom_level=kwargs.get("bloom_level", "apply"),
            difficulty=kwargs.get("difficulty", "medium"),
            source_chunks=["lec.pdf"],
        )

    mock_gen = MagicMock(side_effect=_fake_generate)
    monkeypatch.setattr(questions_module, "generate_question", mock_gen)
    monkeypatch.setattr(
        questions_module, "validate_question", MagicMock(return_value=_PASS)
    )
    return mock_gen


def _generate_client(monkeypatch):
    app = create_app()
    fake_db = MagicMock()
    user = User(id=uuid.uuid4(), email="gen@example.com", hashed_password="x", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: fake_db
    return TestClient(app), fake_db, user


def test_generate_adaptive_true_uses_recommendation(monkeypatch):
    client, fake_db, user = _generate_client(monkeypatch)
    mock_gen = _patch_generation(monkeypatch)
    mock_rec = MagicMock(return_value={"bloom_level": "analyze", "difficulty": "hard"})
    monkeypatch.setattr(questions_module, "recommend_next", mock_rec)
    monkeypatch.setattr(
        questions_module,
        "explain_recommendation",
        MagicMock(return_value="Mastery 0.90 is above 0.7 — moving to analyze/hard."),
    )

    resp = client.post(
        "/questions/generate",
        json={**_GEN_PAYLOAD, "bloom_level": "remember", "difficulty": "easy", "adaptive": True},
    )

    assert resp.status_code == 200
    # The recommendation was used, NOT the supplied remember/easy.
    mock_rec.assert_called_once_with(user.id, "DBMS", "Transactions", fake_db)
    assert mock_gen.call_args.kwargs["bloom_level"] == "analyze"
    assert mock_gen.call_args.kwargs["difficulty"] == "hard"

    body = resp.json()
    assert body["adaptive"] is True
    assert "analyze" in body["adaptive_reason"]
    assert body["bloom_level"] == "analyze"
    assert body["difficulty"] == "hard"


def test_generate_without_adaptive_is_unchanged(monkeypatch):
    client, _, _ = _generate_client(monkeypatch)
    mock_gen = _patch_generation(monkeypatch)
    mock_rec = MagicMock()
    monkeypatch.setattr(questions_module, "recommend_next", mock_rec)

    resp = client.post("/questions/generate", json=_GEN_PAYLOAD)

    assert resp.status_code == 200
    mock_rec.assert_not_called()                          # adaptive path skipped
    assert mock_gen.call_args.kwargs["bloom_level"] == "analyze"
    assert mock_gen.call_args.kwargs["difficulty"] == "hard"
    body = resp.json()
    assert body["adaptive"] is False
    assert body["adaptive_reason"] is None


def test_generate_non_adaptive_missing_level_is_422(monkeypatch):
    """Non-adaptive requests must still supply bloom_level + difficulty."""
    client, _, _ = _generate_client(monkeypatch)
    resp = client.post(
        "/questions/generate",
        json={"topic": "Transactions", "subject": "DBMS", "question_type": "open"},
    )
    assert resp.status_code == 422
