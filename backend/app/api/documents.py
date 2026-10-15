"""
Document Routes — /documents
============================
Upload endpoint that ingests college/public material into the shared ChromaDB
collection so it becomes retrievable by question generation. Requires
authentication on all routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import PayloadTooLargeError, ValidationError
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import DocumentUploadResponse
from app.services import ingestion_service
from app.services.ingestion_service import ingest_document

router = APIRouter()


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    summary="Upload a document to make it retrievable for question generation",
)
def upload_document(
    file: UploadFile = File(..., description="PDF, DOCX, TXT or MD file"),
    subject: str = Form(..., description="e.g. OS"),
    topic: str = Form(..., description="e.g. Deadlocks"),
    source_type: str = Form(..., description="college | public"),
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

    Note: ``source_type="college"`` is **not** role-restricted — the :class:`User`
    model currently has no ``role`` field, so any authenticated user may upload
    college material. See the ingestion report for details.
    """
    # Read at most the limit + 1 byte so an oversized upload is never fully buffered.
    max_bytes = ingestion_service.MAX_FILE_SIZE_BYTES
    contents = file.file.read(max_bytes + 1)
    if len(contents) > max_bytes:
        raise PayloadTooLargeError(
            f"File exceeds the maximum upload size of "
            f"{max_bytes // (1024 * 1024)} MB"
        )
    if not contents:
        raise ValidationError("Uploaded file is empty")

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
