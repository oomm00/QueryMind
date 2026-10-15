"""
Ingestion Service Alias — QueryMind
====================================
Re-exports the document ingestion pipeline from :mod:`app.services.ingestion_service`
so both:
  `from app.services.ingestion import ingest_document`
and
  `from app.services.ingestion_service import ingest_document`
work seamlessly across the codebase.
"""

from app.services.ingestion_service import (  # noqa: F401
    CHUNK_OVERLAP_CHARS,
    CHUNK_SIZE_CHARS,
    COLLECTION_NAME,
    MAX_FILE_SIZE_BYTES,
    MIN_CHUNK_CHARS,
    SUPPORTED_EXTENSIONS,
    VALID_SOURCE_TYPES,
    chunk_text,
    extract_text,
    get_chroma_client,
    ingest_document,
    sanitize_filename,
)
