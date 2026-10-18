"""
Document Routes — /documents
============================
- ``POST /upload`` ingests college/public material into the shared ChromaDB
  collection so it becomes retrievable by question generation.
- ``GET /documents`` lists the caller's own uploads (the Upload page's table).
- ``GET /documents/topics`` groups distinct (subject, topic) pairs per subject
  across all shared documents plus the caller's own — the suggestion lists
  both the Upload and Generate pages need, because retrieval filters on an
  exact subject/topic match.

Requires authentication on all routes.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import PayloadTooLargeError, ValidationError
from app.db.session import get_db
from app.models.models import Document, User
from app.schemas.schemas import DocumentOut, SubjectTopicsOut, DocumentUploadResponse
from app.services import ingestion_service
from app.services.ingestion_service import ingest_document

logger = logging.getLogger("querymind.documents")

router = APIRouter()


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    summary="Upload a document to make it retrievable for question generation",
)
def upload_document(
    file: UploadFile = File(..., description="PDF, DOCX, TXT or MD file"),
    subject: Optional[str] = Form(
        None, description="e.g. OS (defaults to 'General' when omitted)"
    ),
    topic: Optional[str] = Form(
        None, description="e.g. Deadlocks (defaults to 'General' when omitted)"
    ),
    source_type: str = Form("college", description="college | public"),
    course: Optional[str] = Form(None, description="e.g. CSE302"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentUploadResponse:
    """Ingest an uploaded document into the knowledge base.

    - Validates the extension (PDF/DOCX/TXT/MD), a non-empty body, and a 10 MB cap.
    - Extracts text, chunks it, and upserts embeddings into the shared
      ``querymind_documents`` collection with the metadata ``retrieve_context``
      filters on.
    - Sanitises the filename (only the basename is stored as ``source_doc``).
    - Persists a :class:`Document` record.
    - Requires a valid JWT Bearer token.

    ``subject`` and ``topic`` are optional: minimal clients (e.g. the frontend's
    ``documentsApi.upload(file)``) send only the file, in which case both default
    to ``"General"``.
    """
    max_bytes = ingestion_service.MAX_FILE_SIZE_BYTES
    contents = file.file.read(max_bytes + 1)
    if len(contents) > max_bytes:
        raise PayloadTooLargeError(
            f"File exceeds the maximum upload size of "
            f"{max_bytes // (1024 * 1024)} MB"
        )
    if not contents:
        raise ValidationError("Uploaded file is empty")

    subject = (subject or "").strip() or "General"
    topic = (topic or "").strip() or "General"

    result = ingest_document(
        file_bytes=contents,
        filename=file.filename or "",
        subject=subject,
        topic=topic,
        source_type=source_type,
        db=db,
        user_id=current_user.id,
    )
    return DocumentUploadResponse(**result)


@router.get(
    "/topics",
    response_model=list[SubjectTopicsOut],
    summary="Distinct subject/topic pairs from shared + own documents",
)
def list_document_topics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SubjectTopicsOut]:
    """Suggestions for the Upload and Generate pages.

    Question retrieval filters on an exact ``(subject, topic)`` match, so the
    frontend must offer the values that actually exist rather than free text:
    one entry per subject (A-Z), with that subject's topics distinct and A-Z
    inside it. Rows with no subject or topic are skipped — a suggestion that
    can never match material would be worse than none.

    Scope is every **shared** document plus the caller's own.
    ``documents.is_private`` does not exist yet (it arrives with Generation
    V2), so today every row is shared; once the column lands the predicate
    below becomes ``is_private IS FALSE OR user_id == current_user.id`` so one
    user's private uploads never surface in another user's suggestions. The
    ``current_user`` dependency stays regardless: this route requires auth.
    """
    pairs = (
        db.query(Document.subject, Document.topic)
        .filter(
            # Shared-for-everyone today; the is_private clause joins here later.
            Document.subject.isnot(None),
            Document.subject != "",
            Document.topic.isnot(None),
            Document.topic != "",
        )
        .distinct()
        .order_by(Document.subject, Document.topic)
        .all()
    )

    grouped: dict[str, list[str]] = {}
    for subject, topic in pairs:
        grouped.setdefault(subject, []).append(topic)

    return [SubjectTopicsOut(subject=subject, topics=topics) for subject, topics in grouped.items()]


@router.get(
    "",
    response_model=list[DocumentOut],
    summary="List the current user's uploaded documents, newest first",
)
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DocumentOut]:
    """The document table on the Upload page.

    Only the caller's own rows — embeddings are shared at retrieval time, but
    the upload history is private to its uploader. Newest upload first.
    ``subject``/``topic`` are reported exactly as the upload response reports
    them (``"General"`` when a row predates the caller filling them in).
    """
    documents = (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc(), Document.id.desc())
        .all()
    )

    return [
        DocumentOut(
            document_id=document.id,
            filename=document.filename,
            subject=document.subject or "General",
            topic=document.topic or "General",
            source_type=document.source_type,
            course=document.course,
            status=document.status,
            chunk_count=document.chunk_count,
            created_at=document.created_at,
        )
        for document in documents
    ]
