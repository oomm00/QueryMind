"""
Tests — Profile API (/profile/{user_id})
========================================
Covers the real, database-backed knowledge profile:

1. ``GET /profile/{user_id}`` requires authentication (401).
2. A learner may only read their own profile (403 for another user).
3. A brand-new user gets a valid empty state (no 404, no fake data).
4. After attempts, the numbers match ``mastery_records`` (source of truth) and
   the response shape matches what the frontend selectors consume.
5. Per-Bloom rows are emitted per ``(topic, bloom_level)`` with the correct
   attempt counts.
6. ``mastery_records`` scores win over a naive average of attempt scores.
"""

from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.db.session import get_db
from app.main import create_app
from app.models.base import Base
from app.models.models import Attempt, MasteryRecord, Question, User
from app.services.mastery_service import update_mastery


@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    yield db
    db.close()


@pytest.fixture
def mock_user():
    return User(
        id=uuid.uuid4(),
        email="learner@querymind.edu",
        hashed_password="pw",
        full_name="Learner One",
        is_active=True,
    )


def _client(test_db, user: User | None = None) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


def _make_question(
    test_db,
    *,
    topic: str,
    subject: str = "DBMS",
    bloom_level: str,
    difficulty: str = "medium",
) -> Question:
    question = Question(
        topic=topic,
        subject=subject,
        bloom_level=bloom_level,
        difficulty=difficulty,
        question_text=f"Question about {topic} ({bloom_level}).",
        reference_answer="reference",
    )
    test_db.add(question)
    test_db.commit()
    test_db.refresh(question)
    return question


def _record_attempt(test_db, user: User, question: Question, score: float) -> Attempt:
    attempt = Attempt(
        user_id=user.id,
        question_id=question.id,
        user_answer="an answer",
        score=score,
        feedback="ok",
    )
    test_db.add(attempt)
    test_db.commit()
    test_db.refresh(attempt)
    return attempt


# ── Auth / ownership ─────────────────────────────────────────────────────────


def test_profile_unauthenticated_returns_401(test_db, mock_user):
    test_db.add(mock_user)
    test_db.commit()

    response = _client(test_db).get(f"/profile/{mock_user.id}")
    assert response.status_code == 401


def test_profile_forbidden_for_other_user(test_db, mock_user):
    test_db.add(mock_user)
    test_db.commit()

    other_user_id = uuid.uuid4()
    response = _client(test_db, mock_user).get(f"/profile/{other_user_id}")
    assert response.status_code == 403


# ── Empty state ──────────────────────────────────────────────────────────────


def test_profile_empty_state_for_new_user(test_db, mock_user):
    test_db.add(mock_user)
    test_db.commit()

    response = _client(test_db, mock_user).get(f"/profile/{mock_user.id}")
    assert response.status_code == 200

    body = response.json()
    assert body == {
        "user_id": str(mock_user.id),
        "total_attempts": 0,
        "average_score": 0.0,
        "mastery_breakdown": [],
        "stub": False,
    }


# ── Real aggregation ─────────────────────────────────────────────────────────


def test_profile_aggregates_match_mastery_records(test_db, mock_user):
    """Per-topic/Bloom mastery and counts come from mastery_records + attempts."""
    test_db.add(mock_user)
    test_db.commit()

    q_tx_1 = _make_question(test_db, topic="Transactions", bloom_level="apply")
    q_tx_2 = _make_question(test_db, topic="Transactions", bloom_level="apply")
    q_norm = _make_question(
        test_db, topic="Normalization", bloom_level="remember", difficulty="easy"
    )

    # Persist attempts and fold them into the EMA mastery store, exactly like
    # POST /attempts/submit does.
    for question, score in ((q_tx_1, 0.5), (q_tx_2, 1.0), (q_norm, 0.8)):
        _record_attempt(test_db, mock_user, question, score)
        update_mastery(
            user_id=mock_user.id,
            subject=question.subject,
            topic=question.topic,
            score=score,
            bloom_level=question.bloom_level,
            difficulty=question.difficulty,
            db=test_db,
        )
        test_db.commit()

    response = _client(test_db, mock_user).get(f"/profile/{mock_user.id}")
    assert response.status_code == 200
    body = response.json()

    # totals reflect the raw attempt history
    assert body["total_attempts"] == 3
    assert body["average_score"] == pytest.approx(round((0.5 + 1.0 + 0.8) / 3, 4))
    assert body["stub"] is False

    # ── breakdown matches mastery_records (source of truth) ──
    records = (
        test_db.query(MasteryRecord)
        .filter(MasteryRecord.user_id == mock_user.id)
        .all()
    )
    expected: dict[tuple[str, str], dict] = {}
    for record in records:
        for bloom_level, score in json.loads(record.bloom_breakdown).items():
            expected[(record.topic, bloom_level)] = {
                "mastery_score": round(float(score), 4),
            }

    got = {
        (row["topic"], row["bloom_level"]): row
        for row in body["mastery_breakdown"]
    }
    assert set(got) == set(expected)
    for key, want in expected.items():
        assert got[key]["mastery_score"] == pytest.approx(want["mastery_score"])

    # Attempts are attributed to the right (topic, bloom_level) rows.
    assert got[("Transactions", "apply")]["attempts"] == 2
    assert got[("Normalization", "remember")]["attempts"] == 1

    # mastery_records' EMA values win over a naive average of attempt scores
    # (Transactions: clamp(0.5*1.0) then EMA toward clamp(1.0*1.0) = 0.65).
    assert got[("Transactions", "apply")]["mastery_score"] == pytest.approx(0.65)


def test_profile_shape_matches_frontend_contract(test_db, mock_user):
    test_db.add(mock_user)
    test_db.commit()

    q = _make_question(
        test_db, topic="Indexing", bloom_level="analyze", difficulty="hard"
    )
    _record_attempt(test_db, mock_user, q, 0.9)

    body = _client(test_db, mock_user).get(f"/profile/{mock_user.id}").json()

    assert set(body.keys()) == {
        "user_id",
        "total_attempts",
        "average_score",
        "mastery_breakdown",
        "stub",
    }
    assert isinstance(body["mastery_breakdown"], list)
    for row in body["mastery_breakdown"]:
        assert set(row.keys()) == {
            "topic",
            "bloom_level",
            "mastery_score",
            "attempts",
        }
        assert 0.0 <= row["mastery_score"] <= 1.0
        assert isinstance(row["attempts"], int)


def test_profile_falls_back_to_attempts_without_mastery_records(test_db, mock_user):
    """Attempts predating the mastery write still surface in the breakdown."""
    test_db.add(mock_user)
    test_db.commit()

    q = _make_question(test_db, topic="Joins", bloom_level="understand")
    _record_attempt(test_db, mock_user, q, 0.6)
    _record_attempt(test_db, mock_user, q, 1.0)

    assert (
        test_db.query(MasteryRecord)
        .filter(MasteryRecord.user_id == mock_user.id)
        .count()
        == 0
    )

    body = _client(test_db, mock_user).get(f"/profile/{mock_user.id}").json()
    assert body["total_attempts"] == 2
    assert len(body["mastery_breakdown"]) == 1
    row = body["mastery_breakdown"][0]
    assert row["topic"] == "Joins"
    assert row["bloom_level"] == "understand"
    assert row["attempts"] == 2
    assert row["mastery_score"] == pytest.approx(0.8)
