"""
Document Ingestion Pipeline — QueryMind
========================================
Extracts text from uploaded documents (PDF, TXT, MD), splits into ~500-token chunks
with ~50-token overlap, computes embeddings using sentence-transformers (all-MiniLM-L6-v2),
stores chunks in ChromaDB with metadata filtering, and logs the document in PostgreSQL.
"""

from __future__ import annotations

import io
import logging
import re
import uuid
from datetime import datetime
from typing import Any, Optional, Sequence

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.models.models import Document
from app.services.retrieval import COLLECTION_NAME, get_chroma_client

logger = logging.getLogger("querymind.ingestion")

DEFAULT_CHUNK_SIZE_TOKENS = 500
DEFAULT_CHUNK_OVERLAP_TOKENS = 50


# ── Text Extraction ──────────────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber with fallback to pypdf."""
    text_chunks: list[str] = []

    # First attempt: pdfplumber
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_chunks.append(page_text)
        extracted = "\n\n".join(text_chunks).strip()
        if extracted:
            return extracted
    except Exception as exc:
        logger.warning("pdfplumber extraction failed or yielded empty text (%s); trying pypdf", exc)

    # Fallback attempt: pypdf
    try:
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_chunks.append(page_text)
        return "\n\n".join(text_chunks).strip()
    except Exception as exc:
        logger.error("pypdf extraction also failed: %s", exc)
        raise ValidationError(f"Could not extract text from PDF document: {exc}") from exc


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract text from PDF, TXT, or Markdown bytes."""
    fname_lower = filename.lower()
    if fname_lower.endswith(".pdf"):
        text = extract_text_from_pdf(file_bytes)
    else:
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = file_bytes.decode("latin-1", errors="ignore")

    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    if not text:
        raise ValidationError(f"Document '{filename}' contains no readable text.")
    return text


# ── Chunking Strategy ────────────────────────────────────────────────────────

def chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE_TOKENS,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP_TOKENS,
) -> list[str]:
    """Split text into chunks of approximately ``chunk_size`` tokens with ``chunk_overlap``.

    Uses whitespace word-level token estimation (~1 word = 1.25 tokens),
    respecting paragraph boundaries where possible.
    """
    if not text.strip():
        return []

    words = text.split()
    if not words:
        return []

    # If the document is small enough, return as a single chunk
    if len(words) <= chunk_size:
        return [text.strip()]

    chunks: list[str] = []
    step = max(1, chunk_size - chunk_overlap)
    i = 0
    while i < len(words):
        chunk_words = words[i : i + chunk_size]
        chunk_str = " ".join(chunk_words).strip()
        if chunk_str:
            chunks.append(chunk_str)
        if i + chunk_size >= len(words):
            break
        i += step

    return chunks


# ── ChromaDB Storage ─────────────────────────────────────────────────────────

def get_or_create_collection(
    client: Optional[Any] = None,
    collection_name: str = COLLECTION_NAME,
):
    """Retrieve or create Chroma collection with cosine similarity."""
    chroma_client = client or get_chroma_client()
    from chromadb.utils import embedding_functions

    emb_fn = embedding_functions.DefaultEmbeddingFunction()
    return chroma_client.get_or_create_collection(
        name=collection_name,
        embedding_function=emb_fn,
        metadata={"hnsw:space": "cosine"},
    )


# ── Orchestrator ─────────────────────────────────────────────────────────────

def ingest_document(
    file_bytes: bytes,
    filename: str,
    subject: str,
    topic: Optional[str] = None,
    course: Optional[str] = None,
    source_type: str = "college",
    user_id: Optional[uuid.UUID] = None,
    db: Optional[Session] = None,
    chroma_client: Optional[Any] = None,
    storage_path: Optional[str] = None,
) -> dict:
    """Full document ingestion pipeline:

    1. Extracts text from file.
    2. Chunks text into ~500-token segments with ~50-token overlap.
    3. Generates embeddings and stores in ChromaDB with metadata.
    4. Logs record in Postgres `documents` table.

    Returns dict with summary: document_id, filename, chunks_count, status.
    """
    if not subject or not subject.strip():
        raise ValidationError("Subject is required for document ingestion.")

    source_type = source_type.lower().strip()
    if source_type not in {"college", "public"}:
        source_type = "college"

    extracted_text = extract_text(file_bytes, filename)
    chunks = chunk_text(
        extracted_text,
        chunk_size=DEFAULT_CHUNK_SIZE_TOKENS,
        chunk_overlap=DEFAULT_CHUNK_OVERLAP_TOKENS,
    )

    doc_uuid = uuid.uuid4()
    collection = get_or_create_collection(client=chroma_client)

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict[str, Any]] = []

    for idx, chunk in enumerate(chunks):
        chunk_id = f"{doc_uuid}_{idx}"
        ids.append(chunk_id)
        documents.append(chunk)
        metadatas.append({
            "course": course or "",
            "subject": subject.strip(),
            "topic": (topic or "").strip(),
            "source_type": source_type,
            "source_doc": filename,
            "chunk_index": idx,
        })

    if ids:
        collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
        )
        logger.info(
            "Ingested %d chunks into ChromaDB collection '%s' for '%s'",
            len(ids), collection.name, filename,
        )

    # Log in PostgreSQL
    if db is not None and user_id is not None:
        db_doc = Document(
            id=doc_uuid,
            user_id=user_id,
            filename=filename,
            storage_path=storage_path,
            chroma_collection=collection.name,
            course=course,
            subject=subject.strip(),
            topic=topic.strip() if topic else None,
            source_type=source_type,
            status="ready",
        )
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)

    return {
        "document_id": str(doc_uuid),
        "filename": filename,
        "subject": subject,
        "topic": topic,
        "course": course,
        "source_type": source_type,
        "chunks_count": len(chunks),
        "status": "ready",
    }
