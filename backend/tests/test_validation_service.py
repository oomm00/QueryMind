"""
Unit & endpoint Tests — Pre-Delivery Validation Service (Pipeline Stage 5)
=========================================================================
Covers:

Unit (embedding-based checks, embeddings monkeypatched — no model download):
1. Near-duplicate above threshold is flagged (with similar_to_id + score).
2. Distinct question passes.
3. Empty history for subject+topic is never a duplicate.
4. Answerable question passes (answer grounded in a source chunk).
5. Unanswerable question fails (answer unrelated to any chunk).
6. ``validate_question`` orchestrates both checks and reports a reason.

Endpoint (POST /questions/generate):
7. Validation passes on first try -> 200 and question is persisted.
8. Validation fails once, regeneration passes -> 200 (2 generation calls,
   the retry carries a corrective note).
9. Validation fails twice -> 422 with the validation reason, nothing persisted.
"""

from __future__ import annotations

from unittest.mock import MagicMock
from uuid import uuid4

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api import questions as questions_module
from app.api.deps import get_current_user
from app.db.session import get_db
from app.main import create_app
from app.schemas.schemas import GeneratedQuestion
from app.services import validation_service
from app.services.validation_service import (
    ANSWERABILITY_SIMILARITY_THRESHOLD,
    DUPLICATE_SIMILARITY_THRESHOLD,
    check_answerability,
    check_duplicate,
    validate_question,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fake_db(existing_questions) -> MagicMock:
    """A DB session mock whose ``.query(...).filter(...).all()`` returns the list."""
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = list(existing_questions)
    return db


def _fake_question(qid, text) -> MagicMock:
    q = MagicMock()
    q.id = qid
    q.question_text = text
    return q


def _vectors(*pairs) -> np.ndarray:
    return np.array(pairs, dtype="float32")


def _generated(**overrides) -> GeneratedQuestion:
    data = {
        "question": "Analyze how Two-Phase Locking prevents dirty reads.",
        "correct_answer": "2PL prevents dirty reads via exclusive locks held until commit.",
        "explanation": "Grounded in the transactions lecture.",
        "bloom_level": "analyze",
        "difficulty": "hard",
        "source_chunks": ["CSE302_DBMS_Lecture7_Transactions.pdf"],
    }
    data.update(overrides)
    return GeneratedQuestion(**data)


PAYLOAD = {
    "topic": "Transactions",
    "subject": "DBMS",
    "bloom_level": "analyze",
    "difficulty": "hard",
    "question_type": "open",
}


# ── check_duplicate ───────────────────────────────────────────────────────────

def test_near_duplicate_detected_above_threshold(monkeypatch):
    """A near-identical stored question must be flagged as a duplicate."""
    existing = _fake_question(uuid4(), "Explain 2PL and how it prevents dirty reads.")
    db = _fake_db([existing])

    # new vs existing -> cosine ≈ 0.99995 (well above 0.85)
    monkeypatch.setattr(
        validation_service,
        "embed_texts",
        lambda texts: _vectors([1.0, 0.0], [0.99, 0.01]),
    )

    result = check_duplicate(
        "Analyze how 2PL prevents dirty reads.", "DBMS", "Transactions", db
    )

    assert result["is_duplicate"] is True
    assert result["similar_to_id"] == str(existing.id)
    assert result["similarity"] > DUPLICATE_SIMILARITY_THRESHOLD


def test_distinct_question_passes(monkeypatch):
    """A semantically different question must not be flagged."""
    existing = _fake_question(uuid4(), "Explain 2PL and how it prevents dirty reads.")
    db = _fake_db([existing])

    # orthogonal vectors -> cosine 0 (< 0.85)
    monkeypatch.setattr(
        validation_service,
        "embed_texts",
        lambda texts: _vectors([1.0, 0.0], [0.0, 1.0]),
    )

    result = check_duplicate(
        "Design a sharding scheme for the orders table.", "DBMS", "Transactions", db
    )

    assert result["is_duplicate"] is False
    assert result["similarity"] < DUPLICATE_SIMILARITY_THRESHOLD


def test_no_existing_questions_is_never_duplicate(monkeypatch):
    """With no stored questions for subject+topic, nothing can be a duplicate."""
    db = _fake_db([])
    called = MagicMock()
    monkeypatch.setattr(validation_service, "embed_texts", called)

    result = check_duplicate("Any question text.", "DBMS", "Transactions", db)

    assert result["is_duplicate"] is False
    called.assert_not_called()  # short-circuits before embedding


# ── check_answerability ───────────────────────────────────────────────────────

def test_answerable_question_passes(monkeypatch):
    """An answer well-matched by a source chunk must be answerable."""
    monkeypatch.setattr(
        validation_service,
        "embed_texts",
        lambda texts: _vectors([1.0, 0.0], [0.9, 0.1]),
    )

    result = check_answerability(
        {"correct_answer": "2PL uses growing/shrinking lock phases."},
        ["Source chunk about two-phase locking."],
    )

    assert result["is_answerable"] is True
    assert result["best_match_score"] >= ANSWERABILITY_SIMILARITY_THRESHOLD


def test_unanswerable_question_fails(monkeypatch):
    """An answer unrelated to every chunk must fail the grounding check."""
    monkeypatch.setattr(
        validation_service,
        "embed_texts",
        lambda texts: _vectors([1.0, 0.0], [0.0, 1.0]),
    )

    result = check_answerability(
        {"correct_answer": "The answer is 42."},
        ["Source chunk about database transactions."],
    )

    assert result["is_answerable"] is False
    assert result["best_match_score"] < ANSWERABILITY_SIMILARITY_THRESHOLD


def test_answerability_with_no_source_chunks_fails():
    """No retrieved context means the answer cannot be grounded."""
    result = check_answerability({"correct_answer": "Something."}, [])

    assert result["is_answerable"] is False
    assert result["best_match_score"] == 0.0


# ── validate_question orchestration ───────────────────────────────────────────

def test_validate_question_passes_when_both_checks_pass(monkeypatch):
    db = _fake_db([])
    monkeypatch.setattr(
        validation_service, "embed_texts", lambda texts: _vectors([1.0, 0.0], [0.9, 0.1])
    )

    result = validate_question(
        _generated(), "DBMS", "Transactions", ["A grounded chunk."], db
    )

    assert result["passed"] is True
    assert result["reason"] is None


def test_validate_question_reports_duplicate_reason(monkeypatch):
    existing = _fake_question(uuid4(), "Analyze how Two-Phase Locking prevents dirty reads.")
    db = _fake_db([existing])
    monkeypatch.setattr(
        validation_service,
        "embed_texts",
        lambda texts: _vectors([1.0, 0.0], [0.99, 0.01]),
    )

    result = validate_question(
        _generated(), "DBMS", "Transactions", ["A grounded chunk."], db
    )

    assert result["passed"] is False
    assert result["duplicate_check"]["is_duplicate"] is True
    assert "Duplicate" in result["reason"]


def test_validate_question_embeds_question_exactly_once(monkeypatch):
    """The new question text must be embedded in ONE batch, shared by both checks."""
    existing = _fake_question(uuid4(), "Some previously stored question text.")
    db = _fake_db([existing])

    calls: list[list[str]] = []

    def _recording_embed(texts):
        calls.append(list(texts))
        # One vector per requested text keeps shapes valid for both checks.
        return np.tile(np.array([[1.0, 0.0]], dtype="float32"), (len(texts), 1))

    monkeypatch.setattr(validation_service, "embed_texts", _recording_embed)

    question_text = _generated().question
    validate_question(_generated(), "DBMS", "Transactions", ["A grounded chunk."], db)

    batches_containing_question = [c for c in calls if question_text in c]
    assert len(batches_containing_question) == 1
    # That single batch must contain ONLY the question (existing questions are
    # embedded separately, reusing the shared vector).
    assert batches_containing_question[0] == [question_text]


# ── Endpoint: POST /questions/generate ────────────────────────────────────────

@pytest.fixture
def api_client():
    """App with auth + DB dependencies overridden; lifespan intentionally not run."""
    app = create_app()
    fake_db = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: MagicMock()
    app.dependency_overrides[get_db] = lambda: fake_db
    client = TestClient(app)
    try:
        yield client, fake_db
    finally:
        app.dependency_overrides.clear()


def _patch_pipeline(monkeypatch, *, validate_side_effect, generated=None):
    """Patch retrieval, generation and validation inside the questions module."""
    from app.services.retrieval import retrieve_context  # noqa: F401

    monkeypatch.setattr(
        questions_module,
        "retrieve_context",
        lambda **kwargs: [{"text": "Transactions use ACID + 2PL.", "source_doc": "lec.pdf"}],
    )
    gen_result = generated or _generated()
    mock_gen = MagicMock(return_value=gen_result)
    monkeypatch.setattr(questions_module, "generate_question", mock_gen)

    mock_validate = MagicMock(side_effect=validate_side_effect)
    monkeypatch.setattr(questions_module, "validate_question", mock_validate)
    return mock_gen, mock_validate


_PASS = {
    "passed": True,
    "duplicate_check": {"is_duplicate": False, "similarity": 0.1},
    "answerability_check": {"is_answerable": True, "best_match_score": 0.8},
    "reason": None,
}
_FAIL_DUP = {
    "passed": False,
    "duplicate_check": {"is_duplicate": True, "similar_to_id": "abc", "similarity": 0.93},
    "answerability_check": {"is_answerable": True, "best_match_score": 0.8},
    "reason": "Duplicate question (threshold 0.85).",
}


def test_endpoint_returns_question_when_validation_passes(api_client, monkeypatch):
    client, fake_db = api_client
    mock_gen, mock_validate = _patch_pipeline(monkeypatch, validate_side_effect=[_PASS])

    resp = client.post("/questions/generate", json=PAYLOAD)

    assert resp.status_code == 200
    assert mock_gen.call_count == 1
    assert mock_validate.call_count == 1
    fake_db.add.assert_called_once()
    fake_db.commit.assert_called_once()


def test_endpoint_regenerates_once_after_failure(api_client, monkeypatch):
    client, fake_db = api_client
    mock_gen, mock_validate = _patch_pipeline(
        monkeypatch, validate_side_effect=[_FAIL_DUP, _PASS]
    )

    resp = client.post("/questions/generate", json=PAYLOAD)

    assert resp.status_code == 200
    assert mock_gen.call_count == 2                       # original + 1 regeneration
    assert mock_validate.call_count == 2

    # The regeneration must carry a corrective note in the prompt.
    retry_kwargs = mock_gen.call_args_list[1].kwargs
    assert retry_kwargs.get("extra_instruction")
    assert "DIFFERENT" in retry_kwargs["extra_instruction"]
    fake_db.add.assert_called_once()


def test_endpoint_returns_422_when_still_invalid_after_retry(api_client, monkeypatch):
    client, fake_db = api_client
    mock_gen, mock_validate = _patch_pipeline(
        monkeypatch, validate_side_effect=[_FAIL_DUP, _FAIL_DUP]
    )

    resp = client.post("/questions/generate", json=PAYLOAD)

    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert "Duplicate" in body["detail"]

    assert mock_gen.call_count == 2                       # only ONE retry
    fake_db.add.assert_not_called()                       # nothing persisted
