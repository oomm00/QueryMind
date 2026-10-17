"""
Unit Tests — LLM model fallback on quota errors (``LLM_FALLBACK_MODELS``)
=======================================================================
Covers the demo-readiness addition:

1. Settings parsing of the comma-separated ``LLM_FALLBACK_MODELS`` env var.
2. :func:`app.services.llm_utils.resolve_model_chain` — primary-first,
   de-duplicated, ``None`` when unconfigured (= unchanged behaviour).
3. :func:`app.services.llm_utils.is_model_fallback_error` classification.
4. :func:`app.services.llm_utils.request_text`:
   - primary 429  -> fallback model serves the request;
   - every model fails -> clean ``502 / LLM_MODELS_EXHAUSTED`` (no raw SDK error);
   - no fallbacks configured -> the historical ``503 / LLM_CALL_FAILED`` path.
5. Service wiring: generation + evaluation pick up the chain, and a total outage
   surfaces through the FastAPI handler as structured JSON (never a stack trace).
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings, settings
from app.core.exceptions import QueryMindError, ValidationError
from app.models.models import Question
from app.services import evaluation_service as es
from app.services import generation_service as gs
from app.services import llm_utils


# ── Test doubles ──────────────────────────────────────────────────────────────

class _RateLimited(Exception):
    """Mimics a google.genai 429 / RESOURCE_EXHAUSTED (quota) error."""

    status_code = 429

    def __init__(self, model: str = "") -> None:
        super().__init__(f"429 RESOURCE_EXHAUSTED: quota exceeded for {model}")


class _ServerError(Exception):
    """Mimics a google.genai 503 UNAVAILABLE error."""

    status_code = 503

    def __init__(self) -> None:
        super().__init__("503 UNAVAILABLE: model is overloaded")


class _Resp:
    def __init__(self, text: str) -> None:
        self.text = text


class _ScriptedClient:
    """A client whose behaviour is keyed by the model id it is called with.

    ``behaviour`` maps ``model -> str | Exception | callable(prompt)``. Every call
    is recorded as ``(model, prompt)`` in :attr:`calls`. Calls made without an
    explicit model (the single-model path) resolve to :attr:`default_model`.
    """

    def __init__(self, behaviour: dict[str, Any], default_model: str = "primary") -> None:
        self._behaviour = behaviour
        self._default_model = default_model
        self.calls: list[tuple[Optional[str], str]] = []

    def generate_content(self, prompt: str, model: Optional[str] = None) -> _Resp:
        effective = model or self._default_model
        self.calls.append((effective, prompt))
        handler = self._behaviour.get(effective)
        if handler is None:
            raise AssertionError(f"unexpected model call: {effective!r}")
        if isinstance(handler, Exception):
            raise handler
        if callable(handler):
            return _Resp(handler(prompt))
        return _Resp(handler)

    def models_called(self) -> list[Optional[str]]:
        return [model for model, _ in self.calls]


@pytest.fixture(autouse=True)
def _no_backoff(monkeypatch):
    """Zero the retry backoff so the 4-attempt retry loop is instant."""
    monkeypatch.setattr(llm_utils, "LLM_BACKOFF_BASE_SECONDS", 0.0)


def _valid_gen_json() -> str:
    return json.dumps(
        {
            "question": "What is 2PL?",
            "question_text": "What is 2PL?",
            "correct_answer": "Two-phase locking.",
            "explanation": "It has growing and shrinking phases.",
            "bloom_level": "understand",
            "difficulty": "medium",
            "topic": "Transactions",
            "source_chunks": ["d.pdf"],
            "source_chunk_ids": ["d.pdf"],
        }
    )


def _valid_eval_json() -> str:
    return json.dumps(
        {
            "scores": {
                "conceptual_correctness": 8,
                "completeness": 7,
                "technical_depth": 7,
                "example_application": 6,
                "clarity": 8,
            },
            "feedback": "Solid answer.",
            "missing_points": [],
            "strengths": ["Accurate"],
        }
    )


# ── 1. Settings ───────────────────────────────────────────────────────────────

def test_fallback_models_default_empty():
    assert Settings(_env_file=None).fallback_models == []


def test_fallback_models_comma_separated(monkeypatch):
    monkeypatch.setenv("LLM_FALLBACK_MODELS", " gemini-3.7-flash , gemini-3.5-flash-lite ,,")
    assert Settings(_env_file=None).fallback_models == [
        "gemini-3.7-flash",
        "gemini-3.5-flash-lite",
    ]


def test_fallback_models_json_list(monkeypatch):
    monkeypatch.setenv("LLM_FALLBACK_MODELS", '["a", "b"]')
    assert Settings(_env_file=None).fallback_models == ["a", "b"]


def test_fallback_models_blank_is_empty(monkeypatch):
    monkeypatch.setenv("LLM_FALLBACK_MODELS", "   ")
    assert Settings(_env_file=None).fallback_models == []


# ── 2. resolve_model_chain ────────────────────────────────────────────────────

def test_resolve_chain_none_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "llm_fallback_models", [])
    assert llm_utils.resolve_model_chain("primary") is None


def test_resolve_chain_primary_first_and_dedup(monkeypatch):
    monkeypatch.setattr(
        settings, "llm_fallback_models", ["fb1", "primary", "fb2", "fb1"]
    )
    assert llm_utils.resolve_model_chain("primary") == ["primary", "fb1", "fb2"]


def test_resolve_chain_only_primary_is_none(monkeypatch):
    monkeypatch.setattr(settings, "llm_fallback_models", ["primary"])
    assert llm_utils.resolve_model_chain("primary") is None


# ── 3. is_model_fallback_error ────────────────────────────────────────────────

def test_is_model_fallback_error_quota_and_503():
    assert llm_utils.is_model_fallback_error(_RateLimited("m")) is True
    assert llm_utils.is_model_fallback_error(_ServerError()) is True


def test_is_model_fallback_error_unwraps_our_wrapper():
    outer = QueryMindError("wrapper", status_code=503, code="LLM_CALL_FAILED")
    outer.__cause__ = _RateLimited("m")
    assert llm_utils.is_model_fallback_error(outer) is True
    assert llm_utils.is_model_fallback_error(
        QueryMindError("x", status_code=503, code="LLM_CALL_FAILED")
    ) is True


def test_is_model_fallback_error_rejects_non_quota():
    assert llm_utils.is_model_fallback_error(ValidationError("nope")) is False
    assert llm_utils.is_model_fallback_error(
        QueryMindError("bad", status_code=422, code="VALIDATION_ERROR")
    ) is False
    assert llm_utils.is_model_fallback_error(ValueError("unrelated failure")) is False


# ── 4. request_text behaviour ─────────────────────────────────────────────────

def test_request_text_primary_success_ignores_fallback():
    client = _ScriptedClient({"primary": "OK"})
    out = llm_utils.request_text(
        client, "p", sleep=lambda _: None, models=["primary", "fb1"]
    )
    assert out == "OK"
    assert client.models_called() == ["primary"]


def test_request_text_falls_back_on_quota():
    client = _ScriptedClient({"primary": _RateLimited("primary"), "fb1": "FALLBACK OK"})
    out = llm_utils.request_text(
        client, "p", sleep=lambda _: None, models=["primary", "fb1"]
    )
    assert out == "FALLBACK OK"
    called = client.models_called()
    # primary is retried (LLM_MAX_RETRIES + 1 attempts) before the fallback runs.
    assert called.count("primary") == llm_utils.LLM_MAX_RETRIES + 1
    assert called.count("fb1") == 1
    assert called[0] == "primary"


def test_request_text_falls_back_on_persistent_503():
    client = _ScriptedClient({"primary": _ServerError(), "fb1": "OK"})
    out = llm_utils.request_text(
        client, "p", sleep=lambda _: None, models=["primary", "fb1"]
    )
    assert out == "OK"
    assert "fb1" in client.models_called()


def test_request_text_all_models_fail_is_clean_502():
    client = _ScriptedClient(
        {"primary": _RateLimited("primary"), "fb1": _RateLimited("fb1")}
    )
    with pytest.raises(QueryMindError) as ei:
        llm_utils.request_text(
            client, "p", sleep=lambda _: None, models=["primary", "fb1"]
        )
    err = ei.value
    assert err.status_code == 502
    assert err.code == "LLM_MODELS_EXHAUSTED"
    # The detail is human-readable and names the models that were tried.
    assert "primary" in err.detail and "fb1" in err.detail
    assert "RESOURCE_EXHAUSTED" not in err.detail  # no raw SDK text leaked


def test_request_text_no_fallbacks_is_unchanged_503():
    """No chain configured -> behaviour exactly as before (503 LLM_CALL_FAILED)."""
    client = _ScriptedClient({"primary": _RateLimited("primary")})
    with pytest.raises(QueryMindError) as ei:
        llm_utils.request_text(client, "p", sleep=lambda _: None)  # models=None
    assert ei.value.status_code == 503
    assert ei.value.code == "LLM_CALL_FAILED"


def test_request_text_non_fallback_error_does_not_try_next_model():
    client = _ScriptedClient({"primary": ValueError("bad request 400")})
    with pytest.raises(QueryMindError) as ei:
        llm_utils.request_text(
            client, "p", sleep=lambda _: None, models=["primary", "fb1"]
        )
    assert ei.value.code == "LLM_CALL_FAILED"
    assert client.models_called() == ["primary"]


# ── 5. Service wiring ─────────────────────────────────────────────────────────

def test_generate_question_uses_fallback_chain(monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "primary")
    monkeypatch.setattr(settings, "llm_fallback_models", ["fb1"])
    client = _ScriptedClient(
        {"primary": _RateLimited("primary"), "fb1": _valid_gen_json()}
    )
    monkeypatch.setattr(gs, "_configure_genai", lambda *a, **k: client)

    question = gs.generate_question(
        topic="Transactions",
        subject="DBMS",
        bloom_level="understand",
        difficulty="medium",
        context_chunks=[{"text": "ctx", "source_doc": "d.pdf"}],
    )
    assert question.question == "What is 2PL?"
    assert "fb1" in client.models_called()


def test_generate_question_total_outage_raises_502(monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "primary")
    monkeypatch.setattr(settings, "llm_fallback_models", ["fb1"])
    client = _ScriptedClient(
        {"primary": _RateLimited("primary"), "fb1": _RateLimited("fb1")}
    )
    monkeypatch.setattr(gs, "_configure_genai", lambda *a, **k: client)

    with pytest.raises(QueryMindError) as ei:
        gs.generate_question(
            topic="Transactions",
            subject="DBMS",
            bloom_level="understand",
            difficulty="medium",
            context_chunks=[{"text": "ctx", "source_doc": "d.pdf"}],
        )
    assert ei.value.status_code == 502
    assert ei.value.code == "LLM_MODELS_EXHAUSTED"


def test_evaluate_answer_uses_fallback_chain(monkeypatch):
    monkeypatch.setattr(settings, "llm_eval_model", "jprimary")
    monkeypatch.setattr(settings, "llm_fallback_models", ["fb1"])
    client = _ScriptedClient(
        {"jprimary": _RateLimited("jprimary"), "fb1": _valid_eval_json()}
    )
    monkeypatch.setattr(es, "_configure_judge_client", lambda *a, **k: client)

    question = Question(
        subject="DBMS",
        topic="Transactions",
        bloom_level="understand",
        difficulty="medium",
        question_text="What is 2PL?",
        reference_answer="Two-phase locking.",
    )
    result = es.evaluate_answer(question=question, student_answer="It locks in two phases.")
    assert 0 <= result["overall_score"] <= 100
    assert "fb1" in client.models_called()


# ── 6. End-to-end: clean 502 JSON (never a stack trace) ───────────────────────

@pytest.fixture
def api_client(monkeypatch):
    from app.api.deps import get_current_user
    from app.db.session import get_db
    from app.main import create_app
    from app.models.base import Base
    from app.models.models import User

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Session()
    user = User(
        id=uuid.uuid4(), email="fallback@example.com", hashed_password="x", is_active=True
    )
    db.add(user)
    db.commit()

    import app.main as main

    monkeypatch.setattr(main, "warm_up", lambda: {})  # no models/Chroma in a unit test
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    db.close()
    engine.dispose()


def test_total_model_outage_returns_clean_502_json(api_client, monkeypatch):
    from app.api import questions as questions_api

    monkeypatch.setattr(
        questions_api,
        "retrieve_context",
        lambda **kwargs: [{"text": "ctx", "source_doc": "d.pdf"}],
    )

    def _boom(**kwargs):
        raise QueryMindError(
            "All configured LLM models are unavailable right now "
            "(primary, fb1). Please try again later.",
            status_code=502,
            code="LLM_MODELS_EXHAUSTED",
        )

    monkeypatch.setattr(questions_api, "generate_question", _boom)

    resp = api_client.post(
        "/questions/generate",
        json={
            "topic": "Transactions",
            "subject": "DBMS",
            "bloom_level": "understand",
            "difficulty": "medium",
            "question_type": "open",
        },
    )
    assert resp.status_code == 502
    body = resp.json()
    assert body["code"] == "LLM_MODELS_EXHAUSTED"
    assert "unavailable" in body["detail"]
    assert "Traceback" not in resp.text
    assert "RESOURCE_EXHAUSTED" not in resp.text
