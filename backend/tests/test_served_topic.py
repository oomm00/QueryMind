"""The topic a question is filed under must match what the learner was served."""

from __future__ import annotations

from app.api.questions import resolve_served_topic


def test_a_live_paraphrase_keeps_the_typed_topic():
    assert resolve_served_topic(
        requested="Paging and Virtual Memory",
        source="live",
        generated_topic="Virtual Memory and Paging",
        generated_served_topic=None,
    ) == "Paging and Virtual Memory"


def test_a_bank_or_cache_fallback_reports_the_topic_it_actually_served():
    # Under Task 1 & 2 rules: Attempts and mastery are always recorded under the
    # canonical requested topic, never a different fallback topic.
    assert resolve_served_topic(
        requested="Amoeba Tax Accounting",
        source="bank",
        generated_topic="Deadlocks",
        generated_served_topic=None,
    ) == "Amoeba Tax Accounting"
    assert resolve_served_topic(
        requested="Amoeba Tax Accounting",
        source="cache",
        generated_topic="CPU Scheduling",
        generated_served_topic="CPU Scheduling",
    ) == "Amoeba Tax Accounting"


def test_uploaded_only_uses_the_stored_document_topic():
    assert resolve_served_topic(
        requested="Virtual Memory",
        source="live",
        generated_topic="Virtual Memory",
        generated_served_topic=None,
        uploaded_topic="Virtual Memory Primer",
    ) == "Virtual Memory Primer"
