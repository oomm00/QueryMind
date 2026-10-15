"""
Retrieval Service — Two-Tier College & Public Knowledge Base Search
===================================================================
1. Queries ChromaDB for documents with source_type="college", subject, and topic.
2. Measures cosine similarity against the query vector.
3. If no college chunks match or the top college similarity is < SIMILARITY_THRESHOLD,
   falls back to source_type="public" material.
4. If NEITHER tier clears the threshold, returns the best-available college chunks
   (preferred) or the best-available public chunks, rather than silently returning
   nothing. Only when both tiers are empty does it return [].
5. Returns top-k ranked chunks formatted as:
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

# Minimum top-1 college similarity required to serve Tier 1 directly.
#
# Calibrated empirically against the default all-MiniLM-L6-v2 embedding model:
# for short topic queries ("<subject> <topic>") against real college chunks,
# cosine similarities for on-topic material measured ~0.47-0.64. The previous
# 0.75 was therefore unreachable and college material was NEVER selected — every
# topic silently fell through to the public tier (or to nothing when no public
# material existed). 0.45 sits just below the observed on-topic band while still
# rejecting clearly off-topic matches.
SIMILARITY_THRESHOLD = 0.45


def get_chroma_client() -> ClientAPI:
    """Instantiate ChromaDB client connected to host:port from settings, with fallback to local persistent client."""
    chroma_settings = chromadb.config.Settings(anonymized_telemetry=False)
    try:
        client = chromadb.HttpClient(
            host=settings.chroma_host,
            port=settings.chroma_port,
            settings=chroma_settings,
        )
        client.heartbeat()
        return client
    except Exception as exc:
        logger.info(
            "ChromaDB HTTP service not reachable (%s); using local persistent client at ./chroma_data",
            exc,
        )
        import os
        from pathlib import Path
        # Look for chroma_data in current dir or repo root
        root_chroma = Path(__file__).resolve().parent.parent.parent.parent / "chroma_data"
        local_chroma = Path("chroma_data")
        chroma_path = str(root_chroma if root_chroma.exists() else local_chroma)
        return chromadb.PersistentClient(path=chroma_path)


def _query_collection(
    collection: Collection,
    query_text: str,
    source_type: str,
    subject: Optional[str],
    topic: str,
    n_results: int = 5,
) -> list[dict]:
    """Execute metadata-filtered similarity query on a Chroma collection.

    ``subject=None`` performs a topic-only search across every subject (used as a
    fallback when the caller has no reliable subject — e.g. the frontend derives
    ``subject`` from the free-text topic).
    """
    if subject is not None:
        where_filter: dict[str, Any] = {
            "$and": [
                {"source_type": source_type},
                {"subject": subject},
                {"topic": topic},
            ]
        }
    else:
        where_filter = {
            "$and": [
                {"source_type": source_type},
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
    subject: Optional[str] = None,
    bloom_level: str = "understand",
    difficulty: str = "medium",
    query_text: Optional[str] = None,
    top_k: int = 5,
    client: Optional[ClientAPI] = None,
    collection: Optional[Collection] = None,
) -> list[dict]:
    """Retrieve grounded context chunks with Two-Tier college priority and public fallback.

    Tier 1: Filter source_type="college", subject=subject, topic=topic.
    Tier 2: Fall back to source_type="public" if college results are empty or the
            top college score is below ``SIMILARITY_THRESHOLD``.
    If neither tier clears the threshold, the best-available chunks are returned
    (college preferred); [] is returned only when both tiers are empty.

    Pass ``subject=None`` to search by topic across every subject (used as a
    fallback when the caller cannot supply a reliable subject).
    """
    if collection is None:
        chroma_client = client or get_chroma_client()
        collection = chroma_client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    # Short "<subject> <topic>" queries score higher (and more consistently) than
    # the earlier long generic phrase, so build the default query from just those
    # two fields when the caller does not supply one. A topic-only search omits
    # the (absent) subject.
    search_query = query_text or (f"{subject} {topic}" if subject else topic)

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

    if public_chunks and public_chunks[0]["score"] >= SIMILARITY_THRESHOLD:
        return public_chunks

    # Neither tier cleared the threshold. Rather than silently returning nothing,
    # hand back the best material we do have — college preferred, then public — so
    # downstream generation still has something to ground on. The answerability
    # check in the generation pipeline is the safety net against weak matches.
    if college_chunks:
        logger.warning(
            "No chunk cleared the %.2f threshold; returning best-available college "
            "chunk(s) (top score %.4f) for %s / %s",
            SIMILARITY_THRESHOLD,
            college_chunks[0]["score"],
            subject,
            topic,
        )
        return college_chunks

    if public_chunks:
        logger.warning(
            "No college material and no public chunk cleared the %.2f threshold; "
            "returning best-available public chunk(s) (top score %.4f) for %s / %s",
            SIMILARITY_THRESHOLD,
            public_chunks[0]["score"],
            subject,
            topic,
        )
        return public_chunks

    logger.warning("No study material found in either tier for %s / %s", subject, topic)
    return []
