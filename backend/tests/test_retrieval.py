"""
Unit Tests — Two-Tier Retrieval Service
=======================================
Covers:
1. College material with score >= 0.75 -> no fallback occurs.
2. College material with score < 0.75 -> falls back to public knowledge base.
3. Chunks are correctly ranked in descending order of similarity score.
4. Empty college material -> falls back to public knowledge base.
"""

from unittest.mock import MagicMock
import pytest

from app.services.retrieval import retrieve_context, SIMILARITY_THRESHOLD


def test_college_material_above_threshold_no_fallback():
    """When college material scores >= 0.75, it should be returned directly without fallback."""
    mock_collection = MagicMock()

    # Distance 0.12 -> similarity 1 - 0.12 = 0.88 (>= 0.75)
    mock_collection.query.return_value = {
        "documents": [["College note: ACID transactions in depth", "College lab: 2PL concurrency"]],
        "metadatas": [[
            {"source_type": "college", "subject": "DBMS", "topic": "Transactions", "source_doc": "lecture.pdf"},
            {"source_type": "college", "subject": "DBMS", "topic": "Transactions", "source_doc": "lab.pdf"},
        ]],
        "distances": [[0.12, 0.20]],
    }

    results = retrieve_context(
        topic="Transactions",
        subject="DBMS",
        bloom_level="analyze",
        difficulty="hard",
        collection=mock_collection,
    )

    # Assert collection.query was called only once (no fallback)
    assert mock_collection.query.call_count == 1
    call_kwargs = mock_collection.query.call_args.kwargs
    assert call_kwargs["where"] == {
        "$and": [
            {"source_type": "college"},
            {"subject": "DBMS"},
            {"topic": "Transactions"},
        ]
    }


    assert len(results) == 2
    assert results[0]["source_type"] == "college"
    assert results[0]["score"] == 0.88
    assert results[1]["score"] == 0.80
    assert results[0]["score"] >= SIMILARITY_THRESHOLD


def test_college_material_below_threshold_falls_back_to_public():
    """When college material scores < 0.75, retrieval must fall back to public knowledge base."""
    mock_collection = MagicMock()

    # First call (college): low similarity (dist 0.35 -> score 0.65 < 0.75)
    college_response = {
        "documents": [["Vague college syllabus mention of transactions"]],
        "metadatas": [[
            {"source_type": "college", "subject": "DBMS", "topic": "Transactions", "source_doc": "syllabus.pdf"},
        ]],
        "distances": [[0.35]],
    }

    # Second call (public): strong similarity (dist 0.10 -> score 0.90)
    public_response = {
        "documents": [["Public documentation: Postgres MVCC and Isolation levels"]],
        "metadatas": [[
            {"source_type": "public", "subject": "DBMS", "topic": "Transactions", "source_doc": "postgres.md"},
        ]],
        "distances": [[0.10]],
    }

    mock_collection.query.side_effect = [college_response, public_response]

    results = retrieve_context(
        topic="Transactions",
        subject="DBMS",
        bloom_level="apply",
        difficulty="medium",
        collection=mock_collection,
    )

    # Must be called twice: 1st college, 2nd public fallback
    assert mock_collection.query.call_count == 2

    first_call_where = mock_collection.query.call_args_list[0].kwargs["where"]
    second_call_where = mock_collection.query.call_args_list[1].kwargs["where"]

    assert first_call_where["$and"][0]["source_type"] == "college"
    assert second_call_where["$and"][0]["source_type"] == "public"


    assert len(results) == 1
    assert results[0]["source_type"] == "public"
    assert results[0]["score"] == 0.90
    assert results[0]["source_doc"] == "postgres.md"


def test_returned_chunks_in_correct_ranked_order():
    """Returned chunks must always be sorted in descending order of similarity score."""
    mock_collection = MagicMock()

    # Return distances out of order: 0.18 (score 0.82), 0.05 (score 0.95), 0.12 (score 0.88)
    mock_collection.query.return_value = {
        "documents": [["Chunk B", "Chunk A (Best)", "Chunk C"]],
        "metadatas": [[
            {"source_type": "college", "source_doc": "docB.pdf"},
            {"source_type": "college", "source_doc": "docA.pdf"},
            {"source_type": "college", "source_doc": "docC.pdf"},
        ]],
        "distances": [[0.18, 0.05, 0.12]],
    }

    results = retrieve_context(
        topic="Concurrency",
        subject="OS",
        collection=mock_collection,
    )

    scores = [r["score"] for r in results]
    assert scores == [0.95, 0.88, 0.82]
    assert results[0]["text"] == "Chunk A (Best)"
    assert results[0]["source_doc"] == "docA.pdf"


def test_empty_college_results_falls_back_to_public():
    """When college query returns zero chunks, it must gracefully fall back to public."""
    mock_collection = MagicMock()

    mock_collection.query.side_effect = [
        # Empty college
        {"documents": [[]], "metadatas": [[]], "distances": [[]]},
        # Public results
        {
            "documents": [["Public textbook excerpt on Dynamic Programming"]],
            "metadatas": [[{"source_type": "public", "source_doc": "clrs.txt"}]],
            "distances": [[0.15]],
        },
    ]

    results = retrieve_context(
        topic="Dynamic Programming",
        subject="Algorithms",
        collection=mock_collection,
    )

    assert mock_collection.query.call_count == 2
    assert len(results) == 1
    assert results[0]["source_type"] == "public"
    assert results[0]["score"] == 0.85
