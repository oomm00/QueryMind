"""
Tests — Retrieval TTL cache
===========================
Covers:

1. A second identical (subject, topic, query_text) call is served from cache and
   never touches Chroma again.
2. The cache entry expires after RETRIEVAL_CACHE_TTL_SECONDS.
3. Ingesting a document for a (subject, topic) evicts its cached entries, so the
   freshly uploaded material is visible on the very next query.
4. Different (subject / topic / query_text) keys do not collide.
5. An injected collection bypasses the cache entirely (callers that own the store
   are never memoized).

All Chroma access is mocked — the real store is never touched.
"""

from __future__ import annotations

import time
from unittest.mock import MagicMock

import pytest

import app.services.retrieval as retrieval
from app.services.ingestion_service import ingest_document


@pytest.fixture(autouse=True)
def _isolated_cache():
    """Every test starts and ends with an empty cache."""
    retrieval.clear_retrieval_cache()
    yield
    retrieval.clear_retrieval_cache()


def _client_returning(collection: MagicMock) -> MagicMock:
    client = MagicMock()
    client.get_or_create_collection.return_value = collection
    return client


def _college_hit() -> dict:
    """A query() response whose top college chunk clears SIMILARITY_THRESHOLD."""
    return {
        "documents": [["ACID transactions and two-phase locking in concurrency control."]],
        "metadatas": [[{
            "source_type": "college",
            "subject": "DBMS",
            "topic": "Transactions",
            "source_doc": "lecture_notes.txt",
        }]],
        "distances": [[0.1]],  # similarity = 1 - 0.1 = 0.9
    }


def test_second_identical_call_does_not_hit_chroma(monkeypatch):
    collection = MagicMock()
    collection.query.return_value = _college_hit()
    monkeypatch.setattr(retrieval, "get_chroma_client", lambda: _client_returning(collection))

    first = retrieval.retrieve_context(topic="Transactions", subject="DBMS")
    second = retrieval.retrieve_context(topic="Transactions", subject="DBMS")

    assert collection.query.call_count == 1          # second call was a cache hit
    assert first == second
    assert retrieval.retrieval_cache_size() == 1


def test_cache_expires_after_ttl(monkeypatch):
    collection = MagicMock()
    collection.query.return_value = _college_hit()
    monkeypatch.setattr(retrieval, "get_chroma_client", lambda: _client_returning(collection))
    monkeypatch.setattr(retrieval, "RETRIEVAL_CACHE_TTL_SECONDS", 0.05)

    retrieval.retrieve_context(topic="Transactions", subject="DBMS")
    assert collection.query.call_count == 1

    time.sleep(0.12)  # outlive the (patched) TTL
    retrieval.retrieve_context(topic="Transactions", subject="DBMS")

    assert collection.query.call_count == 2          # expired -> re-queried


def test_ingest_invalidates_cached_entries(monkeypatch):
    collection = MagicMock()
    collection.query.return_value = _college_hit()
    monkeypatch.setattr(retrieval, "get_chroma_client", lambda: _client_returning(collection))

    retrieval.retrieve_context(topic="Deadlocks", subject="OS")
    retrieval.retrieve_context(topic="Deadlocks", subject="OS")
    assert collection.query.call_count == 1
    assert retrieval.retrieval_cache_size() == 1

    # Upserting a new document for OS / Deadlocks must drop the stale entry.
    ingest_document(
        b"A deadlock is a circular wait among processes, each holding a resource "
        b"and waiting for another. All four Coffman conditions must hold at once.",
        "deadlocks.txt",
        "OS",
        "Deadlocks",
        "college",
        None,
        collection=MagicMock(),
    )
    assert retrieval.retrieval_cache_size() == 0

    retrieval.retrieve_context(topic="Deadlocks", subject="OS")
    assert collection.query.call_count == 2          # invalidated -> re-queried


def test_cache_keyed_per_subject_topic_and_query(monkeypatch):
    collection = MagicMock()
    collection.query.return_value = _college_hit()
    monkeypatch.setattr(retrieval, "get_chroma_client", lambda: _client_returning(collection))

    retrieval.retrieve_context(topic="Transactions", subject="DBMS")
    retrieval.retrieve_context(topic="Transactions", subject="OS")            # subject differs
    retrieval.retrieve_context(
        topic="Transactions", subject="DBMS", query_text="custom rewrite"
    )                                                                          # query differs

    assert collection.query.call_count == 3
    assert retrieval.retrieval_cache_size() == 3


def test_injected_collection_bypasses_cache():
    collection = MagicMock()
    collection.query.return_value = _college_hit()

    retrieval.retrieve_context(topic="Transactions", subject="DBMS", collection=collection)
    retrieval.retrieve_context(topic="Transactions", subject="DBMS", collection=collection)

    assert collection.query.call_count == 2          # never memoized
    assert retrieval.retrieval_cache_size() == 0
