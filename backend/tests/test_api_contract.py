"""
Tests — Backend ↔ Frontend API Contract Alignment
=================================================
Regression tests for the backend fixes that align the API with the calls the
frontend actually makes (see the API contract audit).

Covered here:
1. ``POST /questions/generate`` returns the persisted ``question_id`` so the
   frontend can submit the answer against it.
2. ``POST /questions/generate`` retries with a topic-only retrieval when the
   exact (subject, topic) filter yields no material — the frontend's adapter
   derives ``subject`` from the free-text ``topic`` (subject == topic), which
   would otherwise never match material filed under a real subject.
3. ``POST /questions/generate`` rejects a *persistent* near-duplicate with a
   stable, machine-readable ``DUPLICATE_QUESTION`` code plus an actionable
   message ("try a different topic or Bloom level"), while non-duplicate
   validation failures keep the generic ``VALIDATION_ERROR`` code.
4. ``GET /documents`` and ``GET /documents/topics`` expose exactly the fields
   the Upload page reads (its document table and its subject/topic
   suggestions); behavioural coverage lives in ``tests/test_documents_api.py``.

Related contract fixes are covered next to their feature tests:
- file-only multipart upload -> ``tests/test_ingestion_service.py``
- ``criteria_scores`` 0-1 scale + ``GET /attempts/history`` -> ``tests/test_attempts_api.py``
- topic-only retrieval (``subject=None``) -> ``tests/test_retrieval.py``
"""

from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import questions as questions_module
from app.api.deps import get_current_user
from app.db.session import get_db
from app.main import create_app
from app.models.base import Base
from app.models.models import Document, Question, User
from app.schemas.schemas import GeneratedQuestion

import app.models.models  # noqa: F401 — register models on Base.metadata


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def authed_client(db_session):
    user = User(
        id=uuid.uuid4(),
        email=f"contract_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app), user


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generated() -> GeneratedQuestion:
    return GeneratedQuestion(
        question="Explain how Two-Phase Locking prevents dirty reads.",
        correct_answer="Exclusive locks are held until commit, so uncommitted data is never read.",
        explanation="Grounded in the transactions lecture.",
        bloom_level="analyze",
        difficulty="hard",
        source_chunks=["transactions.pdf"],
    )


_PASS = {
    "passed": True,
    "duplicate_check": {"is_duplicate": False, "similarity": 0.1},
    "answerability_check": {"is_answerable": True, "best_match_score": 0.8},
    "reason": None,
}

# Exactly what the frontend adapter sends: subject collapsed onto the topic.
_PAYLOAD = {
    "topic": "Concurrency",
    "subject": "Concurrency",
    "bloom_level": "analyze",
    "difficulty": "hard",
    "question_type": "open",
}

# A validation verdict that failed BECAUSE the question was a near-duplicate.
# It carries reason_code="duplicate", which the route maps to DUPLICATE_QUESTION.
_DUPLICATE = {
    "passed": False,
    "duplicate_check": {"is_duplicate": True, "similarity": 0.96, "similar_to_id": "abc123"},
    "answerability_check": {"is_answerable": True, "best_match_score": 0.8},
    "reason": "Duplicate question: 0.96 similarity with existing question abc123 (threshold 0.9).",
    "reason_code": "duplicate",
}

# A validation verdict that failed for a NON-duplicate reason: it must keep the
# generic VALIDATION_ERROR code rather than DUPLICATE_QUESTION.
_ANSWERABILITY_FAIL = {
    "passed": False,
    "duplicate_check": {"is_duplicate": False, "similarity": 0.1},
    "answerability_check": {"is_answerable": False, "best_match_score": 0.2},
    "reason": "Answer not grounded in source material: best chunk similarity 0.2 < 0.3.",
    "reason_code": "answerability",
}


def _patch_generation(monkeypatch):
    monkeypatch.setattr(
        questions_module,
        "generate_question",
        MagicMock(side_effect=lambda **kwargs: _generated()),
    )
    monkeypatch.setattr(
        questions_module,
        "validate_question",
        MagicMock(return_value=_PASS),
    )


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_generate_returns_persisted_question_id(authed_client, db_session, monkeypatch):
    """The response must carry a `question_id` that maps to a stored Question row."""
    client, _ = authed_client
    _patch_generation(monkeypatch)
    monkeypatch.setattr(
        questions_module,
        "retrieve_context",
        lambda **kwargs: [{"text": "2PL context.", "source_doc": "lec.pdf"}],
    )

    resp = client.post("/questions/generate", json=_PAYLOAD)

    assert resp.status_code == 200
    body = resp.json()
    assert body["question_id"], "generate must return a question_id for the client to submit against"

    persisted = (
        db_session.query(Question)
        .filter(Question.id == uuid.UUID(body["question_id"]))
        .first()
    )
    assert persisted is not None
    assert persisted.topic == "Concurrency"
    assert persisted.bloom_level == "analyze"


def test_generate_falls_back_to_topic_only_retrieval(authed_client, monkeypatch):
    """When the exact (subject, topic) filter is empty, retry with subject=None."""
    client, _ = authed_client
    _patch_generation(monkeypatch)

    calls: list[dict] = []

    def _retrieve(**kwargs):
        calls.append(kwargs)
        # Exact (subject, topic) lookup finds nothing; the topic-only retry does.
        return [] if kwargs.get("subject") is not None else [
            {"text": "Concurrency context.", "source_doc": "os_concurrency.pdf"}
        ]

    monkeypatch.setattr(questions_module, "retrieve_context", _retrieve)

    resp = client.post("/questions/generate", json=_PAYLOAD)

    assert resp.status_code == 200
    assert len(calls) == 2
    assert calls[0]["subject"] == "Concurrency"      # first: exact filter
    assert calls[0]["topic"] == "Concurrency"
    assert calls[1]["subject"] is None               # fallback: topic-only
    assert calls[1]["topic"] == "Concurrency"


def test_generate_does_not_fall_back_when_material_found(authed_client, monkeypatch):
    """A successful exact lookup must not trigger a second (fallback) retrieval."""
    client, _ = authed_client
    _patch_generation(monkeypatch)

    calls: list[dict] = []

    def _retrieve(**kwargs):
        calls.append(kwargs)
        return [{"text": "Concurrency context.", "source_doc": "os_concurrency.pdf"}]

    monkeypatch.setattr(questions_module, "retrieve_context", _retrieve)

    resp = client.post("/questions/generate", json=_PAYLOAD)

    assert resp.status_code == 200
    assert len(calls) == 1
    assert calls[0]["subject"] == "Concurrency"


def _patch_failing_validation(monkeypatch, verdict: dict):
    """Patch generation so BOTH the first attempt and the retry fail validation.

    The route only rejects after the corrective regeneration, so both the first
    and the second ``validate_question`` call must return the failing verdict.
    """
    monkeypatch.setattr(
        questions_module,
        "generate_question",
        MagicMock(side_effect=lambda **kwargs: _generated()),
    )
    monkeypatch.setattr(
        questions_module,
        "validate_question",
        MagicMock(return_value=verdict),
    )
    monkeypatch.setattr(
        questions_module,
        "retrieve_context",
        lambda **kwargs: [{"text": "2PL context.", "source_doc": "lec.pdf"}],
    )


def test_duplicate_rejection_is_machine_readable(authed_client, monkeypatch):
    """A persistent near-duplicate must be 422 with code ``DUPLICATE_QUESTION``.

    Contract: clients branch on the stable ``code`` (not the prose) and can show
    the learner the actionable hint ("try a different topic or Bloom level").
    """
    client, _ = authed_client
    _patch_failing_validation(monkeypatch, _DUPLICATE)

    resp = client.post("/questions/generate", json=_PAYLOAD)

    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "DUPLICATE_QUESTION"
    assert "try a different topic or bloom level" in body["detail"].lower()
    # No stack trace or raw SDK text leaks into the detail.
    assert "traceback" not in body["detail"].lower()


def test_non_duplicate_validation_failure_keeps_generic_code(authed_client, monkeypatch):
    """A non-duplicate validation failure must NOT use the DUPLICATE_QUESTION code."""
    client, _ = authed_client
    _patch_failing_validation(monkeypatch, _ANSWERABILITY_FAIL)

    resp = client.post("/questions/generate", json=_PAYLOAD)

    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_ERROR"


def test_document_read_endpoints_expose_the_upload_page_contract(authed_client, db_session):
    """The Upload page reads these exact keys; renaming any of them breaks it."""
    client, user = authed_client

    row = Document(
        id=uuid.uuid4(),
        user_id=user.id,
        filename="deadlocks.md",
        subject="OS",
        topic="Deadlocks",
        source_type="college",
        status="ready",
        chunk_count=5,
    )
    row.created_at = datetime(2026, 1, 1, 12, 0, 0)
    db_session.add(row)
    db_session.commit()

    docs = client.get("/documents")
    assert docs.status_code == 200
    entry = docs.json()[0]
    assert set(entry) == {
        "document_id", "filename", "subject", "topic", "source_type",
        "course", "status", "chunk_count", "created_at",
    }
    assert entry["document_id"] == str(row.id)
    assert entry["filename"] == "deadlocks.md"
    assert entry["chunk_count"] == 5

    topics = client.get("/documents/topics")
    assert topics.status_code == 200
    assert topics.json() == [{"subject": "OS", "topics": ["Deadlocks"]}]
