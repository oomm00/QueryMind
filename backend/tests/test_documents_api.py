"""
Tests — Document read endpoints (GET /documents, GET /documents/topics)
========================================================================
These power the frontend's Upload page: the per-user document table and the
subject/topic suggestion lists both pages build their pickers from. Ingestion
itself stays in tests/test_ingestion_service.py; what is asserted here is the
read side: authentication, per-user scoping of the document list, shared
(union own) topic suggestions, newest-first ordering, distinct grouping, and
the exact response fields the frontend reads.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.db.session import get_db
from app.main import create_app
from app.models.base import Base
from app.models.models import Document, User

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
        email=f"docs_{uuid.uuid4().hex[:8]}@example.com",
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

_T0 = datetime(2026, 1, 1, 12, 0, 0)


def _add_document(
    user: User,
    *,
    subject: str | None,
    topic: str | None,
    filename: str = "notes.md",
    created_at: datetime | None = None,
    source_type: str = "college",
    status: str = "ready",
    chunk_count: int | None = 3,
    course: str | None = None,
) -> Document:
    row = Document(
        id=uuid.uuid4(),
        user_id=user.id,
        filename=filename,
        subject=subject,
        topic=topic,
        source_type=source_type,
        status=status,
        chunk_count=chunk_count,
        course=course,
    )
    # Explicit so "newest first" never depends on insert timing.
    row.created_at = created_at or _T0
    return row


def _other_user(db_session) -> User:
    other = User(
        id=uuid.uuid4(),
        email=f"other_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    return other


# ── Auth ──────────────────────────────────────────────────────────────────────

def test_list_requires_authentication(db_session):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    client = TestClient(app)

    resp = client.get("/documents")

    assert resp.status_code == 401


def test_topics_requires_authentication(db_session):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    client = TestClient(app)

    resp = client.get("/documents/topics")

    assert resp.status_code == 401


# ── GET /documents ────────────────────────────────────────────────────────────

def test_list_returns_own_documents_newest_first(authed_client, db_session):
    client, user = authed_client
    other = _other_user(db_session)

    db_session.add(_add_document(user, subject="OS", topic="Deadlocks",
                                 filename="old.md", created_at=_T0))
    db_session.add(_add_document(user, subject="DBMS", topic="Transactions",
                                 filename="new.md",
                                 created_at=_T0 + timedelta(hours=1)))
    db_session.add(_add_document(other, subject="OS", topic="Mutex",
                                 filename="someone_else.md",
                                 created_at=_T0 + timedelta(hours=2)))
    db_session.commit()

    resp = client.get("/documents")

    assert resp.status_code == 200
    body = resp.json()
    assert [row["filename"] for row in body] == ["new.md", "old.md"]
    assert all(row["filename"] != "someone_else.md" for row in body)


def test_list_response_carries_the_fields_the_page_reads(authed_client, db_session):
    client, user = authed_client
    db_session.add(_add_document(user, subject="OS", topic="Deadlocks",
                                 filename="deadlocks.md", source_type="public",
                                 status="ready", chunk_count=7, course="CSE302"))
    db_session.commit()

    resp = client.get("/documents")

    assert resp.status_code == 200
    row = resp.json()[0]
    assert set(row) == {
        "document_id", "filename", "subject", "topic", "source_type",
        "course", "status", "chunk_count", "created_at",
    }
    assert row["document_id"]  # a real UUID string
    uuid.UUID(row["document_id"])
    assert row["filename"] == "deadlocks.md"
    assert row["subject"] == "OS"
    assert row["topic"] == "Deadlocks"
    assert row["source_type"] == "public"
    assert row["course"] == "CSE302"
    assert row["status"] == "ready"
    assert row["chunk_count"] == 7
    assert row["created_at"]  # ISO timestamp the page can format


def test_list_is_empty_for_a_user_with_no_uploads(authed_client, db_session):
    client, user = authed_client
    other = _other_user(db_session)
    db_session.add(_add_document(other, subject="OS", topic="Paging"))
    db_session.commit()

    resp = client.get("/documents")

    assert resp.status_code == 200
    assert resp.json() == []


def test_list_reports_missing_subject_topic_as_general(authed_client, db_session):
    client, user = authed_client
    db_session.add(_add_document(user, subject=None, topic=None,
                                 filename="legacy.md"))
    db_session.commit()

    resp = client.get("/documents")

    assert resp.status_code == 200
    row = resp.json()[0]
    assert row["subject"] == "General"
    assert row["topic"] == "General"


# ── GET /documents/topics ─────────────────────────────────────────────────────

def test_topics_groups_distinct_pairs_per_subject(authed_client, db_session):
    client, user = authed_client
    other = _other_user(db_session)

    db_session.add(_add_document(user, subject="OS", topic="Deadlocks",
                                 filename="a.md"))
    db_session.add(_add_document(user, subject="OS", topic="Deadlocks",
                                 filename="b.md"))   # duplicate pair
    db_session.add(_add_document(user, subject="OS", topic="Paging",
                                 filename="c.md"))
    db_session.add(_add_document(user, subject="DBMS", topic="Transactions",
                                 filename="d.md"))
    db_session.add(_add_document(user, subject=None, topic=None,
                                 filename="unfiled.md"))          # skipped
    db_session.add(_add_document(other, subject="OS", topic="Mutex",
                                 filename="other.md"))            # shared → shown
    db_session.commit()

    resp = client.get("/documents/topics")

    assert resp.status_code == 200
    assert resp.json() == [
        {"subject": "DBMS", "topics": ["Transactions"]},
        {"subject": "OS", "topics": ["Deadlocks", "Mutex", "Paging"]},
    ]


def test_topics_is_empty_without_documents(authed_client):
    client, _ = authed_client

    resp = client.get("/documents/topics")

    assert resp.status_code == 200
    assert resp.json() == []


def test_second_user_sees_shared_topics_but_not_the_document_list(db_session):
    """Suggestions are shared across users; the document table never is."""
    first = User(
        id=uuid.uuid4(),
        email=f"first_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
    )
    second = User(
        id=uuid.uuid4(),
        email=f"second_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
    )
    db_session.add_all([first, second])
    db_session.commit()
    db_session.add(_add_document(first, subject="OS", topic="Deadlocks",
                                 filename="first_user.md"))
    db_session.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: second
    client = TestClient(app)

    docs = client.get("/documents")
    assert docs.status_code == 200
    assert docs.json() == []  # the first user's upload is not listed for others

    topics = client.get("/documents/topics")
    assert topics.status_code == 200
    assert topics.json() == [{"subject": "OS", "topics": ["Deadlocks"]}]
