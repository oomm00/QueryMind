"""
Unit & Endpoint Tests — Document Ingestion Service
==================================================
Covers:

Extraction:
1. .txt, .md, .docx and .pdf extraction works.
2. Unsupported types are rejected.
3. Empty files and scanned/image-only (text-less) PDFs are rejected.

Chunking:
4. Chunks respect the size cap and the overlap, and are never empty.

Ingestion:
5. Re-ingesting the same file does not duplicate chunks (deterministic IDs + upsert).
6. Metadata shape matches exactly what ``retrieve_context`` filters on.
7. A Document row is persisted (filename, subject, topic, source_type, chunk_count).
8. Bad source_type is rejected.
9. Filenames are sanitised (no path traversal).

Endpoint (POST /documents/upload):
10. 401 unauthenticated.
11. 413 oversize.
12. 422 bad source_type / empty file.
13. 200 success (persists the attempt and returns the ingest summary).

A mocked in-memory Chroma collection is used throughout — the real ./chroma_data
store is never touched (and no embedding model is downloaded).
"""

from __future__ import annotations

import hashlib
import io
import uuid

import chromadb
import docx
import pytest
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.core.exceptions import ValidationError
from app.db.session import get_db
from app.main import create_app
from app.models.base import Base
from app.models.models import Document, User
from app.services import ingestion_service
from app.services.ingestion_service import (
    CHUNK_OVERLAP_CHARS,
    CHUNK_SIZE_CHARS,
    MAX_FILE_SIZE_BYTES,
    MIN_CHUNK_CHARS,
    chunk_text,
    extract_text,
    ingest_document,
    sanitize_filename,
)
from app.services.retrieval import retrieve_context

import app.models.models  # noqa: F401 — register models on Base.metadata


# ── Fixtures / helpers ────────────────────────────────────────────────────────

class _DeterministicEF(EmbeddingFunction):
    """Tiny, offline embedding function so tests never download a model.

    Identical text -> identical vector, which is all the tests need.
    """

    def __call__(self, input: Documents) -> Embeddings:
        return [
            [b / 255.0 for b in hashlib.sha256(text.encode("utf-8")).digest()[:16]]
            for text in input
        ]

    def name(self) -> str:  # pragma: no cover - trivial
        return "deterministic-test-ef"


@pytest.fixture
def mem_collection():
    client = chromadb.EphemeralClient()
    return client.get_or_create_collection(
        name="test_ingest_docs",
        metadata={"hnsw:space": "cosine"},
        embedding_function=_DeterministicEF(),
    )


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


def _make_pdf(*paragraphs: str) -> bytes:
    """Build a minimal one-page PDF containing the given text."""
    content = ["BT", "/F1 12 Tf", "72 720 Td", "14 TL"]
    for i, para in enumerate(paragraphs):
        safe = para.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        if i > 0:
            content.append("T*")
        content.append(f"({safe}) Tj")
    content.append("ET")
    stream = "\n".join(content).encode("latin-1")

    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_pos = len(out)
    size = len(objs) + 1
    out += f"xref\n0 {size}\n".encode() + b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
    return bytes(out)


def _blank_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _make_docx(*paragraphs: str) -> bytes:
    document = docx.Document()
    for para in paragraphs:
        document.add_paragraph(para)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _long_text(sentences: int = 60) -> str:
    sentence = "Sentence number {i} explains a concept in reasonable detail for testing purposes."
    return " ".join(sentence.format(i=i) for i in range(sentences))


def _common_overlap(a: str, b: str) -> int:
    """Length of the longest suffix of ``a`` that is a prefix of ``b``."""
    for length in range(min(len(a), len(b)), 0, -1):
        if a[-length:] == b[:length]:
            return length
    return 0


# ── Extraction tests ──────────────────────────────────────────────────────────

def test_extract_txt_and_md():
    assert "Deadlock detection" in extract_text(b"Deadlock detection uses a wait-for graph.", "notes.txt")
    md = b"# Deadlocks\n\nA deadlock is a circular wait."
    assert "# Deadlocks" in extract_text(md, "notes.md")


def test_extract_docx():
    data = _make_docx(
        "Deadlock detection uses a wait-for graph.",
        "Coffman conditions include circular wait.",
    )
    text = extract_text(data, "os_deadlocks.docx")
    assert "wait-for graph" in text
    assert "circular wait" in text


def test_extract_pdf():
    data = _make_pdf(
        "Deadlocks occur when four Coffman conditions hold simultaneously.",
        "A resource allocation graph detects cycles.",
    )
    text = extract_text(data, "deadlocks.pdf")
    assert "Coffman conditions" in text
    assert "resource allocation graph" in text


def test_unsupported_type_rejected():
    with pytest.raises(ValidationError, match="Unsupported file type"):
        extract_text(b"some bytes", "notes.rtf")


def test_empty_file_rejected():
    with pytest.raises(ValidationError, match="empty"):
        extract_text(b"", "notes.txt")


def test_scanned_or_textless_pdf_rejected():
    with pytest.raises(ValidationError, match="No extractable text"):
        extract_text(_blank_pdf(), "scanned.pdf")


# ── Chunking tests ────────────────────────────────────────────────────────────

def test_chunking_respects_size_and_overlap():
    chunks = chunk_text(_long_text(), chunk_size=400, overlap=50)

    assert len(chunks) > 2
    assert all(len(c) <= 400 for c in chunks)
    # No empty / near-empty chunks survive.
    assert all(c.strip() and len(c) >= MIN_CHUNK_CHARS for c in chunks)
    # Consecutive chunks overlap by at least the requested amount.
    overlaps = [_common_overlap(a, b) for a, b in zip(chunks, chunks[1:])]
    assert overlaps and all(o >= 50 for o in overlaps)


def test_chunking_default_bounds():
    chunks = chunk_text(_long_text(80))
    assert chunks
    assert all(len(c) <= CHUNK_SIZE_CHARS for c in chunks)
    assert all(len(c) >= MIN_CHUNK_CHARS for c in chunks)
    overlaps = [_common_overlap(a, b) for a, b in zip(chunks, chunks[1:])]
    assert all(o >= CHUNK_OVERLAP_CHARS for o in overlaps)


def test_chunking_drops_near_empty_chunks():
    assert chunk_text("tiny.") == []          # < MIN_CHUNK_CHARS
    assert chunk_text("   \n\n\t  ") == []     # whitespace only


# ── Ingestion tests ───────────────────────────────────────────────────────────

def test_reingesting_same_file_does_not_duplicate(mem_collection, db_session):
    data = (
        b"Deadlock detection uses a wait-for graph to find cycles in the system. "
        b"A cycle in the graph indicates that the system is deadlocked."
    )
    user_id = uuid.uuid4()

    first = ingest_document(data, "deadlocks.txt", "OS", "Deadlocks", "college",
                            db_session, user_id=user_id, collection=mem_collection)
    count_after_first = mem_collection.count()

    second = ingest_document(data, "deadlocks.txt", "OS", "Deadlocks", "college",
                             db_session, user_id=user_id, collection=mem_collection)

    assert mem_collection.count() == count_after_first  # upsert, not duplicate
    assert first["chunks_ingested"] == second["chunks_ingested"]
    # Document row is updated, not duplicated.
    assert db_session.query(Document).count() == 1


def test_metadata_shape_matches_retrieval_filter(mem_collection, db_session):
    content = (
        "A deadlock occurs when a set of processes are blocked waiting for resources "
        "held by each other, forming a circular wait. The four Coffman conditions are "
        "mutual exclusion, hold and wait, no preemption, and circular wait."
    )
    ingest_document(content.encode(), "deadlocks.txt", "OS", "Deadlocks", "college",
                    db_session, user_id=uuid.uuid4(), collection=mem_collection)

    stored = mem_collection.get(where={"source_doc": "deadlocks.txt"}, include=["metadatas"])
    assert stored["metadatas"]
    for meta in stored["metadatas"]:
        assert set(meta.keys()) >= {"source_type", "subject", "topic", "source_doc", "chunk_index"}
        assert meta["source_type"] == "college"
        assert meta["subject"] == "OS"
        assert meta["topic"] == "Deadlocks"

    # Round-trip through the real retrieval path (same filter retrieve_context uses).
    chunk_text_value = mem_collection.get(where={"source_doc": "deadlocks.txt"}, include=["documents"])["documents"][0]
    results = retrieve_context(
        topic="Deadlocks",
        subject="OS",
        query_text=chunk_text_value,
        collection=mem_collection,
    )
    assert results
    assert results[0]["source_type"] == "college"
    assert results[0]["source_doc"] == "deadlocks.txt"
    assert results[0]["score"] >= 0.75


def test_ingest_persists_document_record(mem_collection, db_session):
    data = (
        b"The wait-for graph is used for deadlock detection in operating systems. "
        b"A cycle in the wait-for graph means the system is deadlocked."
    )
    user_id = uuid.uuid4()

    result = ingest_document(data, "os_notes.txt", "OS", "Deadlocks", "college",
                             db_session, user_id=user_id, collection=mem_collection)

    assert result["document"] == "os_notes.txt"
    assert result["subject"] == "OS"
    assert result["topic"] == "Deadlocks"
    assert result["source_type"] == "college"
    assert result["chunks_ingested"] >= 1
    assert result["document_id"]

    document = db_session.query(Document).one()
    assert str(document.id) == result["document_id"]
    assert document.filename == "os_notes.txt"
    assert document.subject == "OS"
    assert document.topic == "Deadlocks"
    assert document.source_type == "college"
    assert document.chunk_count == result["chunks_ingested"]
    assert document.status == "ready"
    assert document.user_id == user_id


def test_ingest_rejects_bad_source_type(mem_collection):
    with pytest.raises(ValidationError, match="source_type"):
        ingest_document(b"text", "a.txt", "OS", "Deadlocks", "lecture", None, collection=mem_collection)


def test_sanitize_filename_blocks_path_traversal():
    assert sanitize_filename("../../etc/passwd.txt") == "passwd.txt"
    assert sanitize_filename(r"C:\Users\a\notes.md") == "notes.md"
    with pytest.raises(ValidationError):
        sanitize_filename("../")
    with pytest.raises(ValidationError):
        sanitize_filename("")


# ── Endpoint tests ────────────────────────────────────────────────────────────

def _authed_client(db_session, mem_collection, monkeypatch, user=None):
    # Route the service's default collection to the in-memory one (no model download).
    monkeypatch.setattr(ingestion_service, "_get_default_collection", lambda: mem_collection)

    app = create_app()
    if user is None:
        user = User(
            id=uuid.uuid4(),
            email=f"uploader_{uuid.uuid4().hex[:8]}@example.com",
            hashed_password="x",
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app), user


def _post_upload(client, *, filename="deadlocks.txt", content=b"Deadlock content here.", subject="OS",
                 topic="Deadlocks", source_type="college"):
    return client.post(
        "/documents/upload",
        data={"subject": subject, "topic": topic, "source_type": source_type},
        files={"file": (filename, content, "application/octet-stream")},
    )


def test_endpoint_401_unauthenticated(db_session):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    client = TestClient(app)

    resp = _post_upload(client)
    assert resp.status_code == 401


def test_endpoint_413_oversize(db_session, mem_collection, monkeypatch):
    client, _ = _authed_client(db_session, mem_collection, monkeypatch)
    monkeypatch.setattr(ingestion_service, "MAX_FILE_SIZE_BYTES", 1024)

    resp = _post_upload(client, content=b"x" * 2048)
    assert resp.status_code == 413
    assert resp.json()["code"] == "FILE_TOO_LARGE"


def test_endpoint_422_bad_source_type(db_session, mem_collection, monkeypatch):
    client, _ = _authed_client(db_session, mem_collection, monkeypatch)
    resp = _post_upload(client, source_type="lecture")
    assert resp.status_code == 422


def test_endpoint_422_empty_file(db_session, mem_collection, monkeypatch):
    client, _ = _authed_client(db_session, mem_collection, monkeypatch)
    resp = _post_upload(client, content=b"")
    assert resp.status_code == 422


def test_endpoint_200_success_persists(db_session, mem_collection, monkeypatch):
    client, user = _authed_client(db_session, mem_collection, monkeypatch)
    content = (
        b"Deadlock detection uses a wait-for graph. A cycle in the graph indicates a deadlock. "
        b"The four Coffman conditions are mutual exclusion, hold and wait, no preemption and circular wait."
    )

    resp = _post_upload(client, filename="C:\\uploads\\os_deadlocks.md", content=content, source_type="college")
    assert resp.status_code == 200
    body = resp.json()

    assert body["document"] == "os_deadlocks.md"  # basename only
    assert body["subject"] == "OS"
    assert body["topic"] == "Deadlocks"
    assert body["source_type"] == "college"
    assert body["chunks_ingested"] >= 1
    assert body["document_id"]

    document = db_session.query(Document).one()
    assert document.filename == "os_deadlocks.md"
    assert document.chunk_count == body["chunks_ingested"]
    assert document.user_id == user.id
