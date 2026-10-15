"""
Document Routes — /documents
=============================
Handles document upload, text extraction (PDF / TXT), chunking (~500 tokens),
embedding, and storage in ChromaDB and PostgreSQL.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import ValidationError
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import DocumentUploadResponse
from app.services.ingestion import ingest_document

logger = logging.getLogger("querymind.documents")

router = APIRouter()


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    summary="Upload and ingest a document into the knowledge base",
)
async def upload_document(
    file: UploadFile = File(..., description="Document file to ingest (PDF, TXT, MD)"),
    subject: str = Form(..., description="Subject name, e.g. 'DBMS'"),
    topic: Optional[str] = Form(None, description="Topic name, e.g. 'Transactions'"),
    course: Optional[str] = Form(None, description="Course code, e.g. 'CSE302'"),
    source_type: str = Form("college", description="'college' (priority) or 'public' (fallback)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentUploadResponse:
    """Ingest a PDF or text document:

    1. Reads uploaded file content.
    2. Extracts clean text via pdfplumber/pypdf.
    3. Splits text into ~500-token chunks with ~50-token overlap.
    4. Generates embeddings using sentence-transformers (all-MiniLM-L6-v2) and stores in ChromaDB.
    5. Records document in PostgreSQL `documents` table.
    """
    if not file.filename:
        raise ValidationError("File must have a valid filename.")

    contents = await file.read()
    if not contents:
        raise ValidationError("Uploaded file is empty.")

    result = ingest_document(
        file_bytes=contents,
        filename=file.filename,
        subject=subject,
        topic=topic,
        course=course,
        source_type=source_type,
        user_id=current_user.id,
        db=db,
    )

    return DocumentUploadResponse(**result)
