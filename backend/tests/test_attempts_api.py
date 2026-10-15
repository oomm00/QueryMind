"""
Tests — Attempt Submission & Rubric Evaluation API (/attempts/submit)
=====================================================================
Covers:
1. POST /attempts/submit requires authentication (401).
2. Unknown question returns 404.
3. Blank/empty answer returns 422.
4. Successful evaluation returns 200, persists Attempt with criteria_scores JSONB,
   and triggers update_mastery_profile in the adaptive engine.
5. 5-criterion rubric weights calculation (35% conceptual, 25% completeness,
   20% technical depth, 10% example/application, 10% clarity).
"""

from __future__ import annotations

import json
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.db.session import get_db
from app.main import create_app
from app.models.base import Base
from app.models.models import Attempt, KnowledgeProfile, MasteryRecord, Question, User
from app.api import attempts as attempts_module  # noqa: F401
from app.services import evaluation_service
from app.services.evaluation_service import compute_overall_score, evaluate_answer


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
        email="student@querymind.edu",
        hashed_password="pw",
        full_name="Jane Doe",
        is_active=True,
    )


@pytest.fixture
def sample_question(test_db):
    q = Question(
        topic="Transactions",
        subject="DBMS",
        bloom_level="analyze",
        difficulty="hard",
        question_text="Analyze why Strict 2PL prevents cascading aborts.",
        reference_answer="Strict 2PL holds exclusive locks until commit or abort, guaranteeing that no transaction reads uncommitted data.",
    )
    test_db.add(q)
    test_db.commit()
    test_db.refresh(q)
    return q


def test_5_criteria_overall_score_calculation():
    # 35% conceptual, 25% completeness, 20% technical depth, 10% example, 10% clarity
    scores = {
        "conceptual_correctness": 10,  # 10 * 0.35 = 3.5
        "completeness": 8,            # 8 * 0.25 = 2.0
        "technical_depth": 9,         # 9 * 0.20 = 1.8
        "example_application": 7,     # 7 * 0.10 = 0.7
        "clarity": 10,                # 10 * 0.10 = 1.0
    }
    # (3.5 + 2.0 + 1.8 + 0.7 + 1.0) * 10 = 90.0
    overall = compute_overall_score(scores)
    assert overall == 90.0


def test_submit_attempt_unauthenticated(test_db, sample_question):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    client = TestClient(app)

    response = client.post(
        "/attempts/submit",
        json={"question_id": str(sample_question.id), "user_answer": "Some answer"},
    )
    assert response.status_code == 401


def test_submit_attempt_question_not_found(test_db, mock_user):
    test_db.add(mock_user)
    test_db.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    app.dependency_overrides[get_current_user] = lambda: mock_user
    client = TestClient(app)

    response = client.post(
        "/attempts/submit",
        json={"question_id": str(uuid.uuid4()), "user_answer": "Valid answer"},
    )
    assert response.status_code == 404


def test_submit_attempt_empty_answer_fails(test_db, mock_user, sample_question):
    test_db.add(mock_user)
    test_db.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    app.dependency_overrides[get_current_user] = lambda: mock_user
    client = TestClient(app)

    response = client.post(
        "/attempts/submit",
        json={"question_id": str(sample_question.id), "user_answer": "   "},
    )
    assert response.status_code == 422


def test_submit_attempt_success_persists_jsonb_and_updates_mastery(
    test_db, mock_user, sample_question, monkeypatch
):
    test_db.add(mock_user)
    test_db.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    app.dependency_overrides[get_current_user] = lambda: mock_user

    judge_output = {
        "scores": {
            "conceptual_correctness": 9,
            "completeness": 8,
            "technical_depth": 9,
            "example_application": 8,
            "clarity": 10,
        },
        "feedback": "Superb explanation of exclusive lock holding until commit.",
        "missing_points": ["Could mention timestamp ordering as an alternative"],
        "strengths": ["Clear explanation of cascading abort prevention"],
    }

    mock_llm = MagicMock()
    mock_resp = MagicMock()
    mock_resp.text = json.dumps(judge_output)
    mock_llm.generate_content.return_value = mock_resp

    monkeypatch.setattr(
        evaluation_service,
        "_configure_judge_client",
        lambda: mock_llm,
    )

    client = TestClient(app)
    response = client.post(
        "/attempts/submit",
        json={
            "question_id": str(sample_question.id),
            "answer_text": "Strict 2PL holds write locks until commit, preventing dirty reads.",
            "time_taken_seconds": 45,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["question_id"] == str(sample_question.id)
    # 9*.35 + 8*.25 + 9*.20 + 8*.10 + 10*.10 = 3.15 + 2.0 + 1.8 + 0.8 + 1.0 = 8.75 -> 87.5
    assert data["overall_score"] == 87.5
    assert data["score"] == 0.875
    assert data["criteria_scores"]["conceptual_correctness"] == 0.9
    assert data["feedback"] == judge_output["feedback"]
    assert "cascading abort prevention" in data["strengths"][0]

    # Verify database persistence with JSONB criteria_scores
    saved_attempt = (
        test_db.query(Attempt)
        .filter(Attempt.id == uuid.UUID(data["attempt_id"]))
        .first()
    )
    assert saved_attempt is not None
    assert saved_attempt.user_id == mock_user.id
    assert saved_attempt.score == 0.875
    assert saved_attempt.criteria_scores["conceptual_correctness"] == 9
    assert saved_attempt.criteria_scores["technical_depth"] == 9

    # Verify adaptive engine updated knowledge_profile
    profile = (
        test_db.query(KnowledgeProfile)
        .filter(
            KnowledgeProfile.user_id == mock_user.id,
            KnowledgeProfile.topic == sample_question.topic,
            KnowledgeProfile.bloom_level == sample_question.bloom_level,
        )
        .first()
    )
    assert profile is not None
    assert profile.attempt_count == 1
    assert profile.mastery_score == 0.875


def _mock_judge(monkeypatch, scores, *, feedback="ok", missing=None, strengths=None):
    """Point the judge client at a canned JSON response."""
    judge_output = {
        "scores": scores,
        "feedback": feedback,
        "missing_points": missing or [],
        "strengths": strengths or [],
    }
    mock_llm = MagicMock()
    mock_resp = MagicMock()
    mock_resp.text = json.dumps(judge_output)
    mock_llm.generate_content.return_value = mock_resp
    monkeypatch.setattr(
        evaluation_service, "_configure_judge_client", lambda: mock_llm
    )


def test_submit_attempt_updates_both_mastery_stores(
    test_db, mock_user, sample_question, monkeypatch
):
    """The frontend's only submit path must feed BOTH mastery stores.

    - ``knowledge_profiles`` (adaptive_service / running average)
    - ``mastery_records``   (mastery_service / EMA — what ``recommend_next`` and
      ``adaptive=true`` generation read)
    """
    test_db.add(mock_user)
    test_db.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    app.dependency_overrides[get_current_user] = lambda: mock_user

    _mock_judge(
        monkeypatch,
        {
            "conceptual_correctness": 9,
            "completeness": 8,
            "technical_depth": 9,
            "example_application": 8,
            "clarity": 10,
        },
        feedback="Superb.",
        strengths=["Clear explanation of cascading abort prevention"],
    )

    client = TestClient(app)
    response = client.post(
        "/attempts/submit",
        json={
            "question_id": str(sample_question.id),
            "answer_text": "Strict 2PL holds write locks until commit.",
        },
    )
    assert response.status_code == 200

    # ── EMA store (mastery_records) ──
    record = (
        test_db.query(MasteryRecord)
        .filter(
            MasteryRecord.user_id == mock_user.id,
            MasteryRecord.subject == sample_question.subject,
            MasteryRecord.topic == sample_question.topic,
        )
        .first()
    )
    assert record is not None
    assert record.attempts_count == 1
    # First attempt seeds: clamp(0.875 * hard weight 1.2) = clamp(1.05) = 1.0
    assert record.mastery_score == 1.0
    assert json.loads(record.bloom_breakdown)[sample_question.bloom_level] == 1.0

    # ── running-average store (knowledge_profiles) — still updated ──
    profile = (
        test_db.query(KnowledgeProfile)
        .filter(
            KnowledgeProfile.user_id == mock_user.id,
            KnowledgeProfile.topic == sample_question.topic,
        )
        .first()
    )
    assert profile is not None
    assert profile.attempt_count == 1


def test_submit_attempt_survives_mastery_record_failure(
    test_db, mock_user, sample_question, monkeypatch
):
    """A failure writing mastery_records must not lose the student's attempt."""
    test_db.add(mock_user)
    test_db.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    app.dependency_overrides[get_current_user] = lambda: mock_user

    _mock_judge(
        monkeypatch,
        {
            "conceptual_correctness": 5,
            "completeness": 5,
            "technical_depth": 5,
            "example_application": 5,
            "clarity": 5,
        },
    )

    def _boom(*args, **kwargs):
        raise RuntimeError("mastery_records store is down")

    monkeypatch.setattr(attempts_module, "update_mastery", _boom, raising=True)

    client = TestClient(app)
    response = client.post(
        "/attempts/submit",
        json={
            "question_id": str(sample_question.id),
            "answer_text": "A reasonable attempt that must still be saved.",
        },
    )

    assert response.status_code == 200
    data = response.json()

    # The attempt is persisted even though the mastery write blew up.
    saved = (
        test_db.query(Attempt)
        .filter(Attempt.id == uuid.UUID(data["attempt_id"]))
        .first()
    )
    assert saved is not None

    # No mastery_record leaked from the failed write.
    assert (
        test_db.query(MasteryRecord)
        .filter(MasteryRecord.user_id == mock_user.id)
        .count()
        == 0
    )


# ── GET /attempts/history/{user_id} ──────────────────────────────────────────

def test_attempt_history_unauthenticated(test_db, sample_question):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    client = TestClient(app)

    response = client.get(f"/attempts/history/{uuid.uuid4()}")
    assert response.status_code == 401


def test_attempt_history_forbidden_for_other_user(test_db, mock_user, sample_question):
    test_db.add(mock_user)
    test_db.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    app.dependency_overrides[get_current_user] = lambda: mock_user
    client = TestClient(app)

    response = client.get(f"/attempts/history/{uuid.uuid4()}")
    assert response.status_code == 403


def test_attempt_history_returns_caller_rows(test_db, mock_user, sample_question):
    test_db.add(mock_user)
    test_db.commit()
    attempt = Attempt(
        user_id=mock_user.id,
        question_id=sample_question.id,
        user_answer="Strict 2PL prevents cascading aborts.",
        score=0.9,
        feedback="Good.",
        criteria_scores={"conceptual_correctness": 9},
    )
    test_db.add(attempt)
    test_db.commit()
    test_db.refresh(attempt)

    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    app.dependency_overrides[get_current_user] = lambda: mock_user
    client = TestClient(app)

    response = client.get(f"/attempts/history/{mock_user.id}")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 1
    row = body[0]
    assert row["attempt_id"] == str(attempt.id)
    assert row["question_id"] == str(sample_question.id)
    assert row["topic"] == "Transactions"
    assert row["bloom_level"] == "analyze"
    assert row["difficulty"] == "hard"
    assert row["score"] == 0.9


def test_attempt_history_empty_for_user_without_attempts(test_db, mock_user):
    test_db.add(mock_user)
    test_db.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    app.dependency_overrides[get_current_user] = lambda: mock_user
    client = TestClient(app)

    response = client.get(f"/attempts/history/{mock_user.id}")
    assert response.status_code == 200
    assert response.json() == []
