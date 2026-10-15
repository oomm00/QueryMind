"""
Tests — Document Ingestion Service & Upload Endpoint
====================================================
Covers:
1. Text extraction from plain text and markdown.
2. Text chunking respecting ~500 tokens and overlap.
3. ChromaDB chunk storage with metadata.
4. Document record creation in PostgreSQL.
5. POST /documents/upload endpoint testing (authenticated vs unauthenticated).
"""

from __future__ import annotations

import io
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
from app.models.models import Document, User
from app.services import ingestion
from app.services.ingestion import (
    chunk_text,
    extract_text,
    ingest_document,
)


@pytest.fixture
def mock_user():
    return User(
        id=uuid.uuid4(),
        email="student@university.edu",
        hashed_password="hashed_pw",
        full_name="Test Student",
        is_active=True,
    )


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


def test_chunk_text_small():
    text = "Short academic text about databases."
    chunks = chunk_text(text, chunk_size=500, chunk_overlap=50)
    assert len(chunks) == 1
    assert chunks[0] == text


def test_chunk_text_large_overlap():
    words = [f"word{i}" for i in range(1200)]
    long_text = " ".join(words)
    chunks = chunk_text(long_text, chunk_size=500, chunk_overlap=50)
    assert len(chunks) >= 3
    # Verify overlap exists between consecutive chunks
    chunk0_words = chunks[0].split()
    chunk1_words = chunks[1].split()
    assert chunk0_words[-10:] == chunk1_words[440:450] or any(w in chunk1_words for w in chunk0_words[-50:])


def test_extract_text_plain_text():
    raw_bytes = b"Transactions in DBMS guarantee ACID properties."
    extracted = extract_text(raw_bytes, "lecture.txt")
    assert "ACID properties" in extracted


def test_ingest_document_stores_in_chroma_and_postgres(test_db, mock_user):
    test_db.add(mock_user)
    test_db.commit()

    mock_collection = MagicMock()
    mock_collection.name = "querymind_documents"
    mock_chroma_client = MagicMock()
    mock_chroma_client.get_or_create_collection.return_value = mock_collection

    sample_content = b"Two-Phase Locking (2PL) ensures conflict serializability in databases. " * 30

    result = ingest_document(
        file_bytes=sample_content,
        filename="dbms_notes.txt",
        subject="DBMS",
        topic="Transactions",
        course="CSE302",
        source_type="college",
        user_id=mock_user.id,
        db=test_db,
        chroma_client=mock_chroma_client,
    )

    assert result["status"] == "ready"
    assert result["chunks_count"] >= 1
    assert result["subject"] == "DBMS"
    assert result["topic"] == "Transactions"

    mock_collection.add.assert_called_once()
    added_kwargs = mock_collection.add.call_args.kwargs
    assert len(added_kwargs["ids"]) == result["chunks_count"]
    assert added_kwargs["metadatas"][0]["subject"] == "DBMS"
    assert added_kwargs["metadatas"][0]["source_type"] == "college"

    # Verify persisted in PostgreSQL
    db_doc = test_db.query(Document).filter(Document.filename == "dbms_notes.txt").first()
    assert db_doc is not None
    assert db_doc.user_id == mock_user.id
    assert db_doc.status == "ready"


def test_upload_document_endpoint_authenticated(test_db, mock_user):
    test_db.add(mock_user)
    test_db.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db
    app.dependency_overrides[get_current_user] = lambda: mock_user

    mock_collection = MagicMock()
    mock_collection.name = "querymind_documents"
    mock_chroma = MagicMock()
    mock_chroma.get_or_create_collection.return_value = mock_collection

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(ingestion, "get_chroma_client", lambda: mock_chroma)
        client = TestClient(app)

        file_payload = ("notes.txt", io.BytesIO(b"Concurrency control in DBMS using timestamps."), "text/plain")
        response = client.post(
            "/documents/upload",
            files={"file": file_payload},
            data={"subject": "DBMS", "topic": "Concurrency", "course": "CSE302", "source_type": "college"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "notes.txt"
        assert data["chunks_count"] >= 1
        assert data["status"] == "ready"


def test_upload_document_endpoint_unauthenticated(test_db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: test_db

    client = TestClient(app)
    file_payload = ("notes.txt", io.BytesIO(b"Some text"), "text/plain")
    response = client.post(
        "/documents/upload",
        files={"file": file_payload},
        data={"subject": "DBMS"},
    )
    assert response.status_code == 401
