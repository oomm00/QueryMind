"""
Retrieval Service — Two-Tier College & Public Knowledge Base Search
===================================================================
1. Queries ChromaDB for documents with source_type="college", subject, and topic.
2. Measures cosine similarity against the query vector.
3. If no college chunks match or the top similarity score is < 0.75,
   falls back to source_type="public" material.
4. Returns top-k ranked chunks formatted as:
   {"text": ..., "source_type": ..., "score": ..., "source_doc": ...}
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import chromadb
from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection

from app.core.config import settings

logger = logging.getLogger("querymind.retrieval")

COLLECTION_NAME = "querymind_documents"
SIMILARITY_THRESHOLD = 0.75


def get_chroma_client() -> ClientAPI:
    """Instantiate ChromaDB client connected to host:port from settings."""
    chroma_settings = chromadb.config.Settings(anonymized_telemetry=False)
    return chromadb.HttpClient(
        host=settings.chroma_host,
        port=settings.chroma_port,
        settings=chroma_settings,
    )


def _query_collection(
    collection: Collection,
    query_text: str,
    source_type: str,
    subject: str,
    topic: str,
    n_results: int = 5,
) -> list[dict]:
    """Execute metadata-filtered similarity query on a Chroma collection."""
    where_filter: dict[str, Any] = {
        "$and": [
            {"source_type": source_type},
            {"subject": subject},
            {"topic": topic},
        ]
    }

    try:
        results = collection.query(
            query_texts=[query_text],
            n_results=n_results,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as exc:
        logger.warning(
            "Query failed with metadata filter (source_type=%s, subject=%s, topic=%s): %s",
            source_type,
            subject,
            topic,
            exc,
        )
        return []

    documents = results.get("documents", [[]])[0] if results.get("documents") else []
    metadatas = results.get("metadatas", [[]])[0] if results.get("metadatas") else []
    distances = results.get("distances", [[]])[0] if results.get("distances") else []

    ranked_chunks: list[dict] = []
    for doc, meta, dist in zip(documents, metadatas, distances):
        # In cosine distance space [0, 2], similarity is 1.0 - distance
        similarity_score = round(max(0.0, 1.0 - dist), 4)
        ranked_chunks.append({
            "text": doc,
            "source_type": meta.get("source_type", source_type),
            "score": similarity_score,
            "source_doc": meta.get("source_doc", "unknown"),
        })

    # Sort descending by similarity score
    ranked_chunks.sort(key=lambda x: x["score"], reverse=True)
    return ranked_chunks[:n_results]


def retrieve_context(
    topic: str,
    subject: str,
    bloom_level: str = "understand",
    difficulty: str = "medium",
    query_text: Optional[str] = None,
    top_k: int = 5,
    client: Optional[ClientAPI] = None,
    collection: Optional[Collection] = None,
) -> list[dict]:
    """Retrieve grounded context chunks with Two-Tier college priority and public fallback.

    Tier 1: Filter source_type="college", subject=subject, topic=topic.
    Tier 2: Fall back to source_type="public" if college results are empty or top score < 0.75.
    """
    if collection is None:
        chroma_client = client or get_chroma_client()
        collection = chroma_client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    search_query = query_text or f"{subject} {topic} {bloom_level} {difficulty} concept and explanation"

    # Tier 1: College material
    college_chunks = _query_collection(
        collection=collection,
        query_text=search_query,
        source_type="college",
        subject=subject,
        topic=topic,
        n_results=top_k,
    )

    if college_chunks and college_chunks[0]["score"] >= SIMILARITY_THRESHOLD:
        logger.info(
            "Retrieved %d college chunks (top score: %.4f) for %s / %s",
            len(college_chunks),
            college_chunks[0]["score"],
            subject,
            topic,
        )
        return college_chunks

    # Tier 2: Public fallback
    fallback_reason = (
        "no chunks found"
        if not college_chunks
        else f"top score {college_chunks[0]['score']} < {SIMILARITY_THRESHOLD}"
    )
    logger.info(
        "College search fallback (%s) -> Querying public knowledge base for %s / %s",
        fallback_reason,
        subject,
        topic,
    )

    public_chunks = _query_collection(
        collection=collection,
        query_text=search_query,
        source_type="public",
        subject=subject,
        topic=topic,
        n_results=top_k,
    )

    return public_chunks
