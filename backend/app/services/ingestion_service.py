"""
Ingestion Service — Document Upload, Text Extraction, Chunking & Embedding
==========================================================================
Turns an uploaded college/public document (PDF, DOCX, TXT, MD) into retrievable
chunks in the *same* ChromaDB collection that :mod:`app.services.retrieval`
queries, using the *same* metadata shape and the *same* embedding function.

Pipeline::

    file bytes ──extract_text──▶ raw text
               ──chunk_text────▶ chunks
               ──upsert────────▶ ChromaDB ("querymind_documents", cosine space)
               ──persist───────▶ Document row (filename, subject, topic, ...)

Chunk IDs are deterministic (sha256 of ``source_doc + chunk_index + content``) so
re-uploading the same file simply overwrites the existing vectors (upsert) rather
than creating duplicates.
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
import re
import uuid
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import ValidationError
from app.models.models import Document
# Reuse retrieval's client factory + collection name so ingestion and retrieval
# always talk to the exact same store (never create a second client setup), and
# invalidate retrieval's TTL cache after an upsert so new material is visible.
from app.services.retrieval import (
    COLLECTION_NAME,
    get_default_collection,
    invalidate_retrieval_cache,
)

logger = logging.getLogger("querymind.ingestion")


# ── Tunable constants ─────────────────────────────────────────────────────────

SUPPORTED_EXTENSIONS: frozenset[str] = frozenset({".pdf", ".docx", ".txt", ".md"})
VALID_SOURCE_TYPES: frozenset[str] = frozenset({"college", "public"})

MAX_FILE_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB

# ~500 tokens ≈ ~2000 characters; 12.5 % overlap keeps context across chunks.
CHUNK_SIZE_CHARS: int = 2000
CHUNK_OVERLAP_CHARS: int = 250
# Chunks shorter than this are considered near-empty and dropped (e.g. stray
# headers, page numbers, or the tail of a document).
MIN_CHUNK_CHARS: int = 80

# Chroma requires scalar metadata values; we store str/int only.
_METADATA_SCALAR_KEYS = ("source_type", "subject", "topic", "source_doc", "chunk_index")


# ── Filename / input validation ───────────────────────────────────────────────

def sanitize_filename(filename: Optional[str]) -> str:
    """Return just the basename, guarding against path traversal.

    Strips any directory component (both ``/`` and Windows ``\\``), leading/trailing
    whitespace, and rejects names that reduce to nothing / ``.`` / ``..``.
    """
    if not filename or not filename.strip():
        raise ValidationError("A filename is required")

    # Normalise Windows separators then take the final path component.
    base = os.path.basename(filename.replace("\\", "/").strip())
    base = base.strip()

    if base in ("", ".", ".."):
        raise ValidationError(f"Invalid filename: {filename!r}")
    return base


def _validate_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValidationError(
            f"Unsupported file type '{ext or '(none)'}'. "
            f"Supported types: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )
    return ext


def _validate_source_type(source_type: str) -> str:
    value = (source_type or "").strip().lower()
    if value not in VALID_SOURCE_TYPES:
        raise ValidationError(
            f"Invalid source_type '{source_type}'. Must be one of: "
            f"{', '.join(sorted(VALID_SOURCE_TYPES))}"
        )
    return value


# ── Text extraction ───────────────────────────────────────────────────────────

def _extract_pdf(file_bytes: bytes) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as exc:  # malformed / not a PDF
        raise ValidationError(f"Could not read PDF file: {exc}") from exc

    if reader.is_encrypted:
        # Try the empty-password unlock, common for "owner-only" protected PDFs.
        try:
            if reader.decrypt("") == 0:
                raise ValidationError("PDF is encrypted and cannot be read")
        except ValidationError:
            raise
        except Exception as exc:
            raise ValidationError("PDF is encrypted and cannot be read") from exc

    page_texts: list[str] = []
    for page in reader.pages:
        try:
            page_texts.append(page.extract_text() or "")
        except Exception as exc:  # a single bad page shouldn't kill the upload
            logger.warning("Failed to extract text from a PDF page: %s", exc)

    return "\n".join(page_texts)


def _extract_docx(file_bytes: bytes) -> str:
    import docx  # python-docx

    try:
        document = docx.Document(io.BytesIO(file_bytes))
    except Exception as exc:
        raise ValidationError(f"Could not read DOCX file: {exc}") from exc

    parts: list[str] = [p.text for p in document.paragraphs]
    # Include table cell text too — lecture notes often put key facts in tables.
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                parts.append(cell.text)
    return "\n".join(parts)


def _extract_plain_text(file_bytes: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return file_bytes.decode(encoding)
        except (UnicodeDecodeError, UnicodeError):
            continue
    # latin-1 never fails, so this is effectively unreachable.
    return file_bytes.decode("utf-8", errors="replace")


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract plain text from an uploaded document.

    Supports ``.pdf`` (pypdf), ``.docx`` (python-docx), ``.txt`` and ``.md``.
    Raises :class:`ValidationError` for unsupported types, empty files, and
    PDFs/other documents with no extractable text (e.g. scanned images).
    """
    if not file_bytes:
        raise ValidationError("Uploaded file is empty")

    source_doc = sanitize_filename(filename)
    ext = _validate_extension(source_doc)

    if ext == ".pdf":
        text = _extract_pdf(file_bytes)
    elif ext == ".docx":
        text = _extract_docx(file_bytes)
    else:  # .txt / .md
        text = _extract_plain_text(file_bytes)

    if not text or not text.strip():
        if ext == ".pdf":
            raise ValidationError(
                f"No extractable text found in '{source_doc}'. It may be a scanned "
                "image-only PDF or contain only graphics; run OCR before uploading."
            )
        raise ValidationError(f"No extractable text found in '{source_doc}'")

    return text


# ── Chunking ──────────────────────────────────────────────────────────────────

_SENTENCE_BOUNDARY_RE = re.compile(r"(?<=[.!?])\s+")


def _split_paragraphs(text: str) -> list[str]:
    normalised = text.replace("\r\n", "\n").replace("\r", "\n")
    return [p.strip() for p in re.split(r"\n\s*\n", normalised) if p.strip()]


def _split_sentences(paragraph: str) -> list[str]:
    """Split a paragraph on sentence boundaries (falling back to the whole paragraph)."""
    parts = _SENTENCE_BOUNDARY_RE.split(paragraph)
    return [p.strip() for p in parts if p.strip()]


def _split_oversized_unit(unit: str, chunk_size: int) -> list[str]:
    """Hard-split a single sentence that is longer than ``chunk_size``."""
    if len(unit) <= chunk_size:
        return [unit]
    return [unit[i:i + chunk_size] for i in range(0, len(unit), chunk_size)]


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE_CHARS,
    overlap: int = CHUNK_OVERLAP_CHARS,
) -> list[str]:
    """Split ``text`` into sentence-aware, overlapping chunks.

    - Chunks are packed from whole sentences, so cuts don't land mid-sentence
      (except for a single sentence longer than ``chunk_size``, which is hard-split).
    - Each chunk is at most ``chunk_size`` characters.
    - Consecutive chunks share their last ~``overlap`` characters (whole sentences),
      giving the retriever cross-chunk context.
    - Chunks shorter than :data:`MIN_CHUNK_CHARS` are dropped.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be in the range [0, chunk_size)")

    # Flatten to sentence units (paragraph boundaries preserved for readability).
    units: list[str] = []
    for paragraph in _split_paragraphs(text):
        for sentence in _split_sentences(paragraph):
            units.extend(_split_oversized_unit(sentence, chunk_size))

    if not units:
        return []

    chunks: list[str] = []
    total = len(units)
    start = 0

    while start < total:
        picked: list[str] = []
        length = 0
        cursor = start

        while cursor < total:
            addition = len(units[cursor]) + (1 if picked else 0)  # +1 for the joining space
            if picked and length + addition > chunk_size:
                break
            picked.append(units[cursor])
            length += addition
            cursor += 1
            if length >= chunk_size:
                break

        chunk = " ".join(picked).strip()
        if len(chunk) >= MIN_CHUNK_CHARS:
            chunks.append(chunk)

        if cursor >= total:
            break

        # Re-enter the next chunk with the trailing sentences of this one so that
        # consecutive chunks overlap by ~`overlap` characters.
        overlap_len = 0
        back = cursor
        while back - 1 > start and overlap_len < overlap:
            back -= 1
            overlap_len += len(units[back]) + 1
        start = back if back > start else start + 1  # guarantee forward progress

    return chunks


# ── ChromaDB helpers ──────────────────────────────────────────────────────────

def _get_default_collection() -> Any:
    """Return the shared retrieval collection (process-wide memoized handle).

    Delegates to :func:`retrieval.get_default_collection` so ingestion and
    retrieval share the same client/collection and never rebuild the Chroma
    connection per upload. The same default embedding function (Chroma's bundled
    all-MiniLM-L6-v2) is used, so ingested vectors live in the same space.
    """
    return get_default_collection()


def _chunk_id(source_doc: str, chunk_index: int, content: str) -> str:
    """Deterministic, content-addressed chunk ID (stable across re-uploads)."""
    digest = hashlib.sha256(
        f"{source_doc}\0{chunk_index}\0{content}".encode("utf-8")
    ).hexdigest()
    return digest


def _build_metadata(
    source_doc: str,
    subject: str,
    topic: str,
    source_type: str,
    chunk_index: int,
) -> dict[str, Any]:
    """Metadata shape that :func:`retrieval.retrieve_context` filters on.

    The where-filter uses ``source_type`` / ``subject`` / ``topic``; ``source_doc``
    and ``chunk_index`` travel alongside for provenance and ordering.
    """
    return {
        "source_type": source_type,
        "subject": subject,
        "topic": topic,
        "source_doc": source_doc,
        "chunk_index": chunk_index,
    }


# ── Persistence ───────────────────────────────────────────────────────────────

def _persist_document_record(
    db: Session,
    *,
    user_id: Optional[uuid.UUID],
    source_doc: str,
    subject: str,
    topic: str,
    source_type: str,
    chunk_count: int,
) -> Document:
    """Insert (or update) the Document row describing this upload.

    Re-uploading the same file by the same user for the same subject/topic is
    treated as an update rather than creating a duplicate row.
    """
    if user_id is None:
        raise ValidationError("An uploader (user_id) is required to persist a document")

    existing = (
        db.query(Document)
        .filter(
            Document.user_id == user_id,
            Document.filename == source_doc,
            Document.subject == subject,
            Document.topic == topic,
            Document.source_type == source_type,
        )
        .first()
    )

    if existing is not None:
        existing.chunk_count = chunk_count
        existing.chroma_collection = COLLECTION_NAME
        existing.status = "ready"
        db.commit()
        db.refresh(existing)
        return existing

    document = Document(
        user_id=user_id,
        filename=source_doc,
        storage_path=None,           # files are processed in memory, never written to disk
        chroma_collection=COLLECTION_NAME,
        subject=subject,
        topic=topic,
        source_type=source_type,
        status="ready",
        chunk_count=chunk_count,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


# ── Main entry point ──────────────────────────────────────────────────────────

def ingest_document(
    file_bytes: bytes,
    filename: str,
    subject: str,
    topic: str,
    source_type: str,
    db: Optional[Session] = None,
    *,
    user_id: Optional[uuid.UUID] = None,
    collection: Optional[Any] = None,
) -> dict:
    """Extract, chunk, embed and store a document so it becomes retrievable.

    Args:
        file_bytes: Raw uploaded bytes (processed in memory; never written to disk).
        filename: Original filename; only the basename is kept as ``source_doc``.
        subject: e.g. "OS".
        topic: e.g. "Deadlocks".
        source_type: ``"college"`` or ``"public"``.
        db: SQLAlchemy session used to persist the :class:`Document` record.
        user_id: Uploader (required when ``db`` is provided).
        collection: Optional Chroma collection (injected in tests). Defaults to the
            shared retrieval collection.

    Returns:
        ``{"document": str, "chunks_ingested": int, "subject": str, "topic": str,
        "source_type": str, "document_id": str | None}``
    """
    source_type = _validate_source_type(source_type)

    subject = (subject or "").strip()
    topic = (topic or "").strip()
    if not subject:
        raise ValidationError("subject must not be empty")
    if not topic:
        raise ValidationError("topic must not be empty")

    source_doc = sanitize_filename(filename)

    raw_text = extract_text(file_bytes, source_doc)
    chunks = chunk_text(raw_text)
    if not chunks:
        raise ValidationError(
            f"No usable content could be extracted from '{source_doc}'"
        )

    if collection is None:
        collection = _get_default_collection()

    ids = [_chunk_id(source_doc, i, chunk) for i, chunk in enumerate(chunks)]
    metadatas = [
        _build_metadata(source_doc, subject, topic, source_type, i)
        for i in range(len(chunks))
    ]

    # Upsert (not add): deterministic IDs make re-uploads idempotent.
    collection.upsert(ids=ids, documents=chunks, metadatas=metadatas)

    # The documents for this (subject, topic) just changed, so any cached
    # retrieval for them is stale — drop it before anything can serve it.
    invalidate_retrieval_cache(subject, topic)

    document_id: Optional[str] = None
    if db is not None:
        document = _persist_document_record(
            db,
            user_id=user_id,
            source_doc=source_doc,
            subject=subject,
            topic=topic,
            source_type=source_type,
            chunk_count=len(chunks),
        )
        document_id = str(document.id)

    logger.info(
        "Ingested '%s' (%s / %s / %s): %d chunks",
        source_doc, subject, topic, source_type, len(chunks),
    )

    return {
        "document": source_doc,
        "chunks_ingested": len(chunks),
        "subject": subject,
        "topic": topic,
        "source_type": source_type,
        "document_id": document_id,
    }
