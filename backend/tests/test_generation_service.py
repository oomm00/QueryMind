"""
Unit Tests — Question Generation Service
=========================================
Tests use mocked LLM clients and mocked ChromaDB collections.
No real API calls or network connections are made.

Covers:
1. Valid LLM response parses correctly into GeneratedQuestion schema.
2. Malformed JSON on first attempt triggers a retry.
3. Retry also failing raises a clear QueryMindError.
4. retrieve_context is called with the correct arguments.
5. MCQ validation: exactly 4 options required.
6. Invalid bloom_level / difficulty raises ValidationError before LLM call.
7. Empty retrieval (no study material) raises NO_CONTEXT (404) before any LLM call.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch, call
import pytest

from app.core.exceptions import QueryMindError, ValidationError
from app.schemas.schemas import GeneratedQuestion
from app.services.generation_service import generate_question, BLOOM_VERBS, LLM_MAX_RETRIES


# ── Fixtures ──────────────────────────────────────────────────────────────────

VALID_OPEN_RESPONSE = {
    "question": "Analyze how Two-Phase Locking (2PL) prevents dirty reads in concurrent DBMS transactions.",
    "correct_answer": (
        "In Two-Phase Locking, transactions acquire all needed locks in the growing phase and "
        "release them in the shrinking phase. This prevents dirty reads because a transaction "
        "cannot read data locked exclusively by another uncommitted transaction."
    ),
    "explanation": (
        "Based on the source material (CSE302_DBMS_Lecture7_Transactions.pdf), ACID properties "
        "require Isolation, which 2PL enforces by blocking reads on dirty (uncommitted) data."
    ),
    "bloom_level": "analyze",
    "difficulty": "hard",
    "source_chunks": ["CSE302_DBMS_Lecture7_Transactions.pdf"],
}

VALID_MCQ_RESPONSE = {
    "question": "Which of the following correctly describes the purpose of Two-Phase Locking?",
    "options": [
        "A) To speed up query execution by parallel reads",
        "B) To ensure serializability by controlling lock acquisition/release phases",
        "C) To compress transaction logs for faster replay",
        "D) To replicate data across multiple nodes automatically",
    ],
    "correct_answer": "B) To ensure serializability by controlling lock acquisition/release phases",
    "explanation": "Two-Phase Locking divides lock operations into a growing phase (acquire only) and a shrinking phase (release only), guaranteeing conflict serializability.",
    "bloom_level": "understand",
    "difficulty": "medium",
    "source_chunks": ["CSE302_DBMS_Lecture7_Transactions.pdf"],
}

FAKE_CONTEXT_CHUNKS = [
    {
        "text": "Transactions in DBMS must guarantee ACID properties...",
        "source_type": "college",
        "score": 0.88,
        "source_doc": "CSE302_DBMS_Lecture7_Transactions.pdf",
    }
]


def _make_llm_response(content: dict) -> MagicMock:
    """Create a mock LLM response object that returns JSON text."""
    mock_response = MagicMock()
    mock_response.text = json.dumps(content)
    return mock_response


def _make_llm_client(response_content: dict) -> MagicMock:
    """Create a mock LLM client that returns a fixed response."""
    mock_client = MagicMock()
    mock_client.generate_content.return_value = _make_llm_response(response_content)
    return mock_client


# ── Tests ─────────────────────────────────────────────────────────────────────

@patch("app.services.generation_service.retrieve_context")
def test_valid_open_response_parses_correctly(mock_retrieve):
    """A valid LLM JSON response should be parsed into a correct GeneratedQuestion."""
    mock_retrieve.return_value = FAKE_CONTEXT_CHUNKS
    mock_client = _make_llm_client(VALID_OPEN_RESPONSE)

    result = generate_question(
        topic="Transactions",
        subject="DBMS",
        bloom_level="analyze",
        difficulty="hard",
        question_type="open",
        llm_client=mock_client,
    )

    assert isinstance(result, GeneratedQuestion)
    assert "Two-Phase Locking" in result.question
    assert result.bloom_level == "analyze"
    assert result.difficulty == "hard"
    assert result.options is None   # open-ended, no MCQ options
    assert "CSE302_DBMS_Lecture7_Transactions.pdf" in result.source_chunks
    assert mock_client.generate_content.call_count == 1


@patch("app.services.generation_service.retrieve_context")
def test_valid_mcq_response_parses_correctly(mock_retrieve):
    """A valid MCQ LLM response should parse with 4 options."""
    mock_retrieve.return_value = FAKE_CONTEXT_CHUNKS
    mock_client = _make_llm_client(VALID_MCQ_RESPONSE)

    result = generate_question(
        topic="Transactions",
        subject="DBMS",
        bloom_level="understand",
        difficulty="medium",
        question_type="mcq",
        llm_client=mock_client,
    )

    assert isinstance(result, GeneratedQuestion)
    assert result.options is not None
    assert len(result.options) == 4
    assert result.options[1].startswith("B)")


@patch("app.services.generation_service.retrieve_context")
def test_no_context_raises_no_context_error(mock_retrieve):
    """When no study material exists for the subject/topic, fail fast with NO_CONTEXT (404)."""
    mock_retrieve.return_value = []
    mock_client = _make_llm_client(VALID_OPEN_RESPONSE)

    with pytest.raises(QueryMindError) as exc_info:
        generate_question(
            topic="Deadlocks", subject="OS", bloom_level="analyze",
            difficulty="medium", question_type="open", llm_client=mock_client,
        )

    assert exc_info.value.code == "NO_CONTEXT"
    assert exc_info.value.status_code == 404
    assert "no study material" in str(exc_info.value.detail).lower()
    mock_client.generate_content.assert_not_called()


@patch("app.services.generation_service.retrieve_context")
def test_malformed_json_first_attempt_triggers_retry(mock_retrieve):
    """When first LLM attempt returns malformed JSON, service must retry once."""
    mock_retrieve.return_value = FAKE_CONTEXT_CHUNKS
    mock_client = MagicMock()

    # First call: bad JSON; second call: good JSON
    bad_response = MagicMock()
    bad_response.text = "Here is your question: This is not JSON at all!"
    good_response = _make_llm_response(VALID_OPEN_RESPONSE)
    mock_client.generate_content.side_effect = [bad_response, good_response]

    result = generate_question(
        topic="Transactions",
        subject="DBMS",
        bloom_level="analyze",
        difficulty="hard",
        question_type="open",
        llm_client=mock_client,
    )

    assert isinstance(result, GeneratedQuestion)
    assert mock_client.generate_content.call_count == 2

    # Second call prompt should contain stricter instruction
    second_prompt = mock_client.generate_content.call_args_list[1].args[0]
    assert "ONLY a raw valid JSON" in second_prompt or "IMPORTANT" in second_prompt


@patch("app.services.generation_service.retrieve_context")
def test_both_attempts_failing_raises_querymind_error(mock_retrieve):
    """If both LLM attempts return malformed JSON, a QueryMindError must be raised."""
    mock_retrieve.return_value = FAKE_CONTEXT_CHUNKS
    mock_client = MagicMock()

    # Both calls return garbage
    garbage = MagicMock()
    garbage.text = "DEFINITELY NOT JSON {{{malformed"
    mock_client.generate_content.return_value = garbage

    with pytest.raises(QueryMindError) as exc_info:
        generate_question(
            topic="Transactions",
            subject="DBMS",
            bloom_level="analyze",
            difficulty="hard",
            question_type="open",
            llm_client=mock_client,
        )

    assert mock_client.generate_content.call_count == 2
    assert exc_info.value.code == "GENERATION_FAILED"
    assert "malformed" in str(exc_info.value.detail).lower() or "failed" in str(exc_info.value.detail).lower()


@patch("app.services.generation_service.retrieve_context")
def test_retrieve_context_called_with_correct_args(mock_retrieve):
    """retrieve_context must be called with exactly the topic/subject/bloom/difficulty passed in."""
    mock_retrieve.return_value = FAKE_CONTEXT_CHUNKS
    mock_client = _make_llm_client(VALID_OPEN_RESPONSE)

    generate_question(
        topic="Transactions",
        subject="DBMS",
        bloom_level="analyze",
        difficulty="hard",
        question_type="open",
        llm_client=mock_client,
    )

    mock_retrieve.assert_called_once_with(
        topic="Transactions",
        subject="DBMS",
        bloom_level="analyze",
        difficulty="hard",
        collection=None,
    )


@patch("app.services.generation_service.retrieve_context")
def test_invalid_bloom_level_raises_validation_error(mock_retrieve):
    """An invalid bloom_level must raise ValidationError before any LLM call."""
    mock_client = _make_llm_client(VALID_OPEN_RESPONSE)

    with pytest.raises(ValidationError) as exc_info:
        generate_question(
            topic="Transactions",
            subject="DBMS",
            bloom_level="memorize",   # invalid
            difficulty="medium",
            llm_client=mock_client,
        )

    mock_retrieve.assert_not_called()
    mock_client.generate_content.assert_not_called()
    assert "bloom_level" in str(exc_info.value.detail)


@patch("app.services.generation_service.retrieve_context")
def test_invalid_difficulty_raises_validation_error(mock_retrieve):
    """An invalid difficulty must raise ValidationError before any LLM call."""
    mock_client = _make_llm_client(VALID_OPEN_RESPONSE)

    with pytest.raises(ValidationError) as exc_info:
        generate_question(
            topic="Transactions",
            subject="DBMS",
            bloom_level="apply",
            difficulty="extreme",   # invalid
            llm_client=mock_client,
        )

    mock_retrieve.assert_not_called()
    assert "difficulty" in str(exc_info.value.detail)


@patch("app.services.generation_service.retrieve_context")
def test_mcq_missing_options_raises_validation_error(mock_retrieve):
    """MCQ response missing options field should trigger retry and ultimately fail with clear error."""
    mock_retrieve.return_value = FAKE_CONTEXT_CHUNKS
    mock_client = MagicMock()

    # Both attempts return MCQ response with wrong option count
    bad_mcq = {**VALID_OPEN_RESPONSE, "options": ["A) only one option"]}
    mock_client.generate_content.return_value = _make_llm_response(bad_mcq)

    with pytest.raises(QueryMindError) as exc_info:
        generate_question(
            topic="Transactions",
            subject="DBMS",
            bloom_level="analyze",
            difficulty="hard",
            question_type="mcq",
            llm_client=mock_client,
        )

    assert exc_info.value.code == "GENERATION_FAILED"


# ── Transient-error retry & casing normalization ──────────────────────────────

class FakeTransientError(Exception):
    """Stand-in for a real ``google.genai.errors.ServerError`` (e.g. 503)."""

    def __init__(self, status_code: int = 503, message: str = "503 UNAVAILABLE: high demand"):
        self.status_code = status_code
        super().__init__(message)


@patch("app.services.generation_service.retrieve_context")
@patch("app.services.generation_service.time.sleep")
def test_transient_error_is_retried_then_succeeds(mock_sleep, mock_retrieve):
    """A transient 503 must be retried with backoff, then succeed."""
    mock_retrieve.return_value = FAKE_CONTEXT_CHUNKS
    mock_client = MagicMock()
    mock_client.generate_content.side_effect = [
        FakeTransientError(),                       # first attempt: 503
        _make_llm_response(VALID_OPEN_RESPONSE),    # second attempt: OK
    ]

    result = generate_question(
        topic="Transactions", subject="DBMS", bloom_level="analyze",
        difficulty="hard", question_type="open", llm_client=mock_client,
    )

    assert isinstance(result, GeneratedQuestion)
    assert mock_client.generate_content.call_count == 2
    mock_sleep.assert_called_once_with(1.0)   # first backoff = 1s


@patch("app.services.generation_service.retrieve_context")
@patch("app.services.generation_service.time.sleep")
def test_persistent_transient_error_exhausts_retries(mock_sleep, mock_retrieve):
    """When every attempt is transient, retries exhaust and LLM_CALL_FAILED is raised."""
    mock_retrieve.return_value = FAKE_CONTEXT_CHUNKS
    mock_client = MagicMock()
    mock_client.generate_content.side_effect = FakeTransientError()

    with pytest.raises(QueryMindError) as exc_info:
        generate_question(
            topic="Transactions", subject="DBMS", bloom_level="analyze",
            difficulty="hard", question_type="open", llm_client=mock_client,
        )

    assert mock_client.generate_content.call_count == LLM_MAX_RETRIES + 1
    assert mock_sleep.call_count == LLM_MAX_RETRIES
    assert exc_info.value.code == "LLM_CALL_FAILED"


@patch("app.services.generation_service.retrieve_context")
@patch("app.services.generation_service.time.sleep")
def test_non_transient_error_is_not_retried(mock_sleep, mock_retrieve):
    """A permanent error (e.g. 400 bad request) must fail immediately, without retries."""
    mock_retrieve.return_value = FAKE_CONTEXT_CHUNKS
    mock_client = MagicMock()
    mock_client.generate_content.side_effect = ValueError("400 INVALID_ARGUMENT: bad request")

    with pytest.raises(QueryMindError) as exc_info:
        generate_question(
            topic="Transactions", subject="DBMS", bloom_level="analyze",
            difficulty="hard", question_type="open", llm_client=mock_client,
        )

    assert mock_client.generate_content.call_count == 1
    mock_sleep.assert_not_called()
    assert exc_info.value.code == "LLM_CALL_FAILED"


@patch("app.services.generation_service.retrieve_context")
def test_llm_output_casing_is_normalized(mock_retrieve):
    """Mixed-case bloom_level/difficulty from the LLM must be lowercased."""
    mock_retrieve.return_value = FAKE_CONTEXT_CHUNKS
    upper = {**VALID_OPEN_RESPONSE, "bloom_level": "ANALYZE", "difficulty": "  Hard  "}
    mock_client = _make_llm_client(upper)

    result = generate_question(
        topic="Transactions", subject="DBMS", bloom_level="analyze",
        difficulty="hard", question_type="open", llm_client=mock_client,
    )

    assert result.bloom_level == "analyze"
    assert result.difficulty == "hard"
    assert mock_client.generate_content.call_count == 1


@patch("app.services.generation_service.retrieve_context")
def test_llm_output_invalid_bloom_level_triggers_retry(mock_retrieve):
    """An out-of-enum bloom_level from the LLM must be rejected (triggers JSON retry)."""
    mock_retrieve.return_value = FAKE_CONTEXT_CHUNKS
    mock_client = MagicMock()
    bad = {**VALID_OPEN_RESPONSE, "bloom_level": "memorize"}
    mock_client.generate_content.return_value = _make_llm_response(bad)

    with pytest.raises(QueryMindError) as exc_info:
        generate_question(
            topic="Transactions", subject="DBMS", bloom_level="analyze",
            difficulty="hard", question_type="open", llm_client=mock_client,
        )

    assert mock_client.generate_content.call_count == 2  # original + 1 stricter retry
    assert exc_info.value.code == "GENERATION_FAILED"
