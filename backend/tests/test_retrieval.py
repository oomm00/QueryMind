"""
Unit Tests — Two-Tier Retrieval Service
=======================================
Covers:
1. College material with score >= SIMILARITY_THRESHOLD -> no fallback occurs.
2. College material with score < SIMILARITY_THRESHOLD -> falls back to public knowledge base.
3. Chunks are correctly ranked in descending order of similarity score.
4. Empty college material -> falls back to public knowledge base.
5. Neither tier clears the threshold -> best-available college chunks are returned
   (college preferred over public).
6. College empty and public below threshold -> best-available public chunks returned.
7. Both tiers empty -> [] is returned.
8. The default query text is "<subject> <topic>".
"""

from unittest.mock import MagicMock
import pytest

from app.services.retrieval import retrieve_context, SIMILARITY_THRESHOLD


def test_college_material_above_threshold_no_fallback():
    """When college material scores >= SIMILARITY_THRESHOLD, it should be returned directly without fallback."""
    mock_collection = MagicMock()

    # Distance 0.12 -> similarity 1 - 0.12 = 0.88 (>= 0.45)
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
    """When the top college score is < SIMILARITY_THRESHOLD, retrieval must fall back to public."""
    mock_collection = MagicMock()

    # First call (college): weak similarity (dist 0.60 -> score 0.40 < 0.45)
    college_response = {
        "documents": [["Vague college syllabus mention of transactions"]],
        "metadatas": [[
            {"source_type": "college", "subject": "DBMS", "topic": "Transactions", "source_doc": "syllabus.pdf"},
        ]],
        "distances": [[0.60]],
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


def test_best_available_college_when_neither_tier_clears_threshold():
    """If neither tier clears the threshold, best-available COLLEGE chunks are returned."""
    mock_collection = MagicMock()

    # College 0.40 (< 0.45) but present; public 0.30 (< 0.45). College must win.
    college_response = {
        "documents": [["Weakly related college note"]],
        "metadatas": [[
            {"source_type": "college", "subject": "OS", "topic": "Deadlocks", "source_doc": "lec.pdf"},
        ]],
        "distances": [[0.60]],   # score 0.40
    }
    public_response = {
        "documents": [["Weakly related public note"]],
        "metadatas": [[
            {"source_type": "public", "subject": "OS", "topic": "Deadlocks", "source_doc": "wiki.txt"},
        ]],
        "distances": [[0.70]],   # score 0.30
    }
    mock_collection.query.side_effect = [college_response, public_response]

    results = retrieve_context(topic="Deadlocks", subject="OS", collection=mock_collection)

    assert mock_collection.query.call_count == 2
    assert len(results) == 1
    assert results[0]["source_type"] == "college"
    assert results[0]["source_doc"] == "lec.pdf"
    assert results[0]["score"] == 0.40


def test_best_available_public_when_college_empty_and_public_below_threshold():
    """With no college chunks and public below threshold, best-available public chunks are returned."""
    mock_collection = MagicMock()

    empty_college = {"documents": [[]], "metadatas": [[]], "distances": [[]]}
    weak_public = {
        "documents": [["Some weakly related public excerpt"]],
        "metadatas": [[{"source_type": "public", "subject": "OS", "topic": "Deadlocks", "source_doc": "wiki.txt"}]],
        "distances": [[0.70]],   # score 0.30 (< 0.45)
    }
    mock_collection.query.side_effect = [empty_college, weak_public]

    results = retrieve_context(topic="Deadlocks", subject="OS", collection=mock_collection)

    assert mock_collection.query.call_count == 2
    assert len(results) == 1
    assert results[0]["source_type"] == "public"
    assert results[0]["score"] == 0.30


def test_returns_empty_when_both_tiers_empty():
    """When neither tier has any chunk at all, retrieval returns [] (caller raises NO_CONTEXT)."""
    mock_collection = MagicMock()
    empty = {"documents": [[]], "metadatas": [[]], "distances": [[]]}
    mock_collection.query.side_effect = [empty, empty]

    results = retrieve_context(topic="Deadlocks", subject="OS", collection=mock_collection)

    assert mock_collection.query.call_count == 2
    assert results == []


def test_default_query_text_is_subject_and_topic():
    """With no explicit query_text, the default must be '<subject> <topic>'."""
    mock_collection = MagicMock()
    mock_collection.query.return_value = {
        "documents": [["On-topic college chunk"]],
        "metadatas": [[{"source_type": "college", "subject": "OS", "topic": "Deadlocks", "source_doc": "lec.pdf"}]],
        "distances": [[0.12]],
    }

    retrieve_context(topic="Deadlocks", subject="OS", collection=mock_collection)

    assert mock_collection.query.call_args.kwargs["query_texts"] == ["OS Deadlocks"]


def test_subject_none_searches_topic_only_across_subjects():
    """``subject=None`` must drop the subject filter and query on the topic alone.

    The frontend derives ``subject`` from the free-text topic, so the generate
    route retries with ``subject=None`` when the exact (subject, topic) filter
    finds nothing.
    """
    mock_collection = MagicMock()
    mock_collection.query.return_value = {
        "documents": [["Concurrency college chunk"]],
        "metadatas": [[{"source_type": "college", "subject": "OS", "topic": "Concurrency", "source_doc": "os.pdf"}]],
        "distances": [[0.12]],
    }

    results = retrieve_context(topic="Concurrency", subject=None, collection=mock_collection)

    where = mock_collection.query.call_args.kwargs["where"]
    assert where == {"$and": [{"source_type": "college"}, {"topic": "Concurrency"}]}
    # The default query text must be the topic alone when there is no subject.
    assert mock_collection.query.call_args.kwargs["query_texts"] == ["Concurrency"]
    assert len(results) == 1
    assert results[0]["source_doc"] == "os.pdf"
