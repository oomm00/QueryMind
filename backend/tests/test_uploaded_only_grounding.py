"""Uploaded-only generation must use PDF text, not title-string luck."""

from __future__ import annotations

import time
from unittest.mock import MagicMock

import pytest

from app.core.config import settings
from app.core.exceptions import NoContextError
from app.services.generation_fallback import (
    _question_from_uploaded_context,
    generate_one,
)
from app.services.retrieval import retrieve_context


def test_uploaded_only_relaxes_the_stored_topic_title():
    """A PDF titled 'Virtual Memory Primer' answers 'Virtual Memory'."""
    collection = MagicMock()
    collection.query.return_value = {
        "documents": [["The page table maps virtual pages to physical frames."]],
        "metadatas": [[{
            "source_type": "college",
            "subject": "OS",
            "topic": "Virtual Memory Primer",
            "source_doc": "virtual-memory-primer.pdf",
        }]],
        "distances": [[0.12]],
    }

    chunks = retrieve_context(
        topic="Virtual Memory",
        subject="OS",
        college_only=True,
        strict_metadata=False,
        user_id="learner-1",
        collection=collection,
    )

    assert collection.query.call_args.kwargs["where"] == {
        "$and": [
            {"source_type": "college"},
            {"user_id": "learner-1"},
            {"subject": "OS"},
        ]
    }
    assert chunks[0]["topic"] == "Virtual Memory Primer"
    assert chunks[0]["source_doc"] == "virtual-memory-primer.pdf"
    assert chunks[0]["score"] == 0.88


def test_uploaded_only_without_chunks_refuses_to_use_the_bank(monkeypatch):
    monkeypatch.setattr(settings, "offline_demo_mode", True)
    with pytest.raises(NoContextError, match="No uploaded material covers"):
        generate_one(
            db=None,
            subject="OS",
            topic="Virtual Memory",
            bloom_level="remember",
            difficulty="easy",
            question_type="open",
            context_chunks=[],
            alignment_client=None,
            excluded_texts=set(),
            deadline=time.monotonic() + 30,
            uploaded_only=True,
        )


def test_offline_uploaded_question_is_grounded_in_pdf_text():
    chunk = {
        "text": (
            "Virtual Memory Primer The page table maps virtual pages to physical "
            "frames. A page fault happens when a required page is not in memory."
        ),
        "source_doc": "virtual-memory-primer.pdf",
        "topic": "Virtual Memory Primer",
        "subject": "OS",
        "score": 0.88,
    }

    generated = _question_from_uploaded_context(
        [chunk],
        topic="Virtual Memory",
        bloom_level="remember",
        difficulty="easy",
        excluded_texts=set(),
        reason="Offline demo mode; no LLM call was made.",
    )

    assert "maps virtual pages to physical frames" in generated.question
    assert generated.correct_answer == "The page table"
    assert generated.source == "uploaded"
    assert generated.requested_topic == "Virtual Memory"
    assert generated.served_topic == "Virtual Memory Primer"
    assert generated.source_chunks == ["virtual-memory-primer.pdf"]
    assert "virtual-memory-primer.pdf" in generated.context_warning
