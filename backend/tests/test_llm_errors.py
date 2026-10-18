"""
Tests — sanitized LLM errors + missing-API-key guards (tasks 2 & 3)
====================================================================

Task 2 — raw SDK/provider error text (429 payloads, quota tables, request ids)
must never reach an API-visible ``detail``. Every terminal LLM failure is
classified into ``503 / LLM_QUOTA_EXHAUSTED`` or ``503 / LLM_UNAVAILABLE``;
the raw text is logged server-side only and chained as ``__cause__``.

Task 3 — when ``GEMINI_API_KEY`` is missing:
  * the lifespan startup hook logs an ERROR,
  * ``/health`` reports ``llm_configured=false``,
  * generation/evaluation fail fast with a clean ``503 / LLM_NOT_CONFIGURED``.

Everything is mocked — no real API calls or network access.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.exceptions import (
    LLMNotConfiguredError,
    LLMQuotaExhaustedError,
    LLMUnavailableError,
)
from app.services import evaluation_service as es
from app.services import generation_service as gs
from app.services import llm_utils


# ── Raw provider texts that must never appear in a response ───────────────────

RAW_QUOTA_TEXT = "429 RESOURCE_EXHAUSTED: quota exceeded for primary; request_id=abc-123"
RAW_500_TEXT = "500 Internal Server Error: upstream blew up; request_id=def-456"
RAW_400_TEXT = "400 INVALID_ARGUMENT: malformed payload; request_id=ghi-789"


class _RateLimited(Exception):
    """Mimics a google.genai 429 / RESOURCE_EXHAUSTED (quota) error."""

    status_code = 429

    def __init__(self) -> None:
        super().__init__(RAW_QUOTA_TEXT)


class _ServerError(Exception):
    """Mimics a google.genai 500/503 server-side failure."""

    status_code = 500

    def __init__(self) -> None:
        super().__init__(RAW_500_TEXT)


class _Resp:
    def __init__(self, text: str = "{}") -> None:
        self.text = text


class _FailingClient:
    """A single-model client that always raises *error*."""

    def __init__(self, error: Exception) -> None:
        self.error = error
        self.calls = 0

    def generate_content(self, prompt: str) -> _Resp:
        self.calls += 1
        raise self.error


class _ScriptedClient:
    """Per-model behaviour for the fallback chain (model id -> Exception|str)."""

    def __init__(self, behaviour: dict[str, Any]) -> None:
        self._behaviour = behaviour
        self.calls: list[Optional[str]] = []

    def generate_content(self, prompt: str, model: Optional[str] = None) -> _Resp:
        effective = model or "primary"
        self.calls.append(effective)
        handler = self._behaviour[effective]
        if isinstance(handler, Exception):
            raise handler
        return _Resp(handler)


@pytest.fixture(autouse=True)
def _instant_backoff(monkeypatch):
    """Zero the retry backoff so the 4-attempt retry loop is instant."""
    monkeypatch.setattr(llm_utils, "LLM_BACKOFF_BASE_SECONDS", 0.0)


# ══ Task 2: classification + sanitization ════════════════════════════════════

def test_is_quota_error_classifier():
    # quota / rate-limit signals
    assert llm_utils.is_quota_error(_RateLimited()) is True
    assert llm_utils.is_quota_error(Exception("model is out of quota")) is True
    assert llm_utils.is_quota_error(LLMQuotaExhaustedError()) is True
    # a raw 429 found through the __cause__ chain counts too
    wrapper = ValueError("boom")
    wrapper.__cause__ = _RateLimited()
    assert llm_utils.is_quota_error(wrapper) is True
    # non-quota failures
    assert llm_utils.is_quota_error(_ServerError()) is False
    assert llm_utils.is_quota_error(LLMUnavailableError()) is False
    assert llm_utils.is_quota_error(
        TimeoutError("LLM call exceeded the 0.05s timeout")
    ) is False


def test_generate_with_retry_quota_failure_is_sanitized(caplog):
    client = _FailingClient(_RateLimited())
    with caplog.at_level(logging.ERROR, logger="querymind.llm"):
        with pytest.raises(LLMQuotaExhaustedError) as ei:
            llm_utils.generate_with_retry(client, "p", sleep=lambda _: None)

    err = ei.value
    assert err.status_code == 503
    assert err.code == "LLM_QUOTA_EXHAUSTED"
    # raw quota table / request id never reaches the API-visible detail
    assert RAW_QUOTA_TEXT not in err.detail
    assert "RESOURCE_EXHAUSTED" not in err.detail
    assert "request_id" not in err.detail
    # ...but the raw text IS logged server-side
    assert any(RAW_QUOTA_TEXT in r.getMessage() for r in caplog.records)


def test_generate_with_retry_non_quota_failure_is_sanitized(caplog):
    client = _FailingClient(_ServerError())
    with caplog.at_level(logging.ERROR, logger="querymind.llm"):
        with pytest.raises(LLMUnavailableError) as ei:
            llm_utils.generate_with_retry(client, "p", sleep=lambda _: None)

    err = ei.value
    assert err.status_code == 503
    assert err.code == "LLM_UNAVAILABLE"
    assert RAW_500_TEXT not in err.detail
    assert "Internal Server Error" not in err.detail
    assert any(RAW_500_TEXT in r.getMessage() for r in caplog.records)
    # the retries were all dispatched against the same model
    assert client.calls == llm_utils.LLM_MAX_RETRIES + 1


def test_request_text_non_transient_error_is_sanitized(caplog):
    """A permanent SDK error escaping the retry loop is still classified."""
    client = _FailingClient(ValueError(RAW_400_TEXT))
    with caplog.at_level(logging.ERROR, logger="querymind.llm"):
        with pytest.raises(LLMUnavailableError) as ei:
            llm_utils.request_text(client, "p", sleep=lambda _: None)

    err = ei.value
    assert err.status_code == 503
    assert err.code == "LLM_UNAVAILABLE"
    assert RAW_400_TEXT not in err.detail
    assert "INVALID_ARGUMENT" not in err.detail
    assert any(RAW_400_TEXT in r.getMessage() for r in caplog.records)
    assert client.calls == 1  # permanent errors are never retried


def test_request_text_chain_quota_exhaustion_is_sanitized(caplog):
    client = _ScriptedClient({"primary": _RateLimited(), "fb1": _RateLimited()})
    with caplog.at_level(logging.ERROR, logger="querymind.llm"):
        with pytest.raises(LLMQuotaExhaustedError) as ei:
            llm_utils.request_text(
                client, "p", sleep=lambda _: None, models=["primary", "fb1"]
            )

    err = ei.value
    assert err.status_code == 503
    assert err.code == "LLM_QUOTA_EXHAUSTED"
    # the detail names the models that were tried, but stays clean
    assert "primary" in err.detail and "fb1" in err.detail
    assert RAW_QUOTA_TEXT not in err.detail
    assert "RESOURCE_EXHAUSTED" not in err.detail
    assert any(RAW_QUOTA_TEXT in r.getMessage() for r in caplog.records)


def test_request_text_chain_non_quota_exhaustion_is_unavailable(caplog):
    client = _ScriptedClient({"primary": _ServerError(), "fb1": _ServerError()})
    with caplog.at_level(logging.ERROR, logger="querymind.llm"):
        with pytest.raises(LLMUnavailableError) as ei:
            llm_utils.request_text(
                client, "p", sleep=lambda _: None, models=["primary", "fb1"]
            )

    err = ei.value
    assert err.status_code == 503
    assert err.code == "LLM_UNAVAILABLE"
    assert "primary" in err.detail and "fb1" in err.detail
    assert RAW_500_TEXT not in err.detail
    assert "Internal Server Error" not in err.detail
    assert any(RAW_500_TEXT in r.getMessage() for r in caplog.records)


# ══ Task 3: missing GEMINI_API_KEY ═══════════════════════════════════════════

def _make_app(monkeypatch, caplog=None) -> Any:
    """Fresh app with the startup warm-up stubbed out (no models/Chroma).

    ``create_app()`` calls ``setup_logging()``, which removes *every* root
    logger handler — including pytest's caplog capture handler. When a caplog
    fixture is given, its handler is re-attached afterwards so the lifespan
    log records can actually be captured.
    """
    import app.main as main

    monkeypatch.setattr(main, "warm_up", lambda: {})
    app = main.create_app()
    if caplog is not None:
        logging.getLogger().addHandler(caplog.handler)
    return app


def test_health_reports_llm_configured_when_key_present(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "test-key-123")
    with TestClient(_make_app(monkeypatch)) as client:
        body = client.get("/health").json()
    assert body["status"] == "healthy"
    assert body["llm_configured"] is True


def test_health_reports_llm_configured_false_without_key(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    with TestClient(_make_app(monkeypatch)) as client:
        body = client.get("/health").json()
    assert body["status"] == "healthy"
    assert body["llm_configured"] is False


def test_startup_logs_error_when_api_key_missing(monkeypatch, caplog):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    app = _make_app(monkeypatch, caplog)
    with caplog.at_level(logging.ERROR, logger="querymind.app"):
        with TestClient(app):
            pass
    messages = [r.getMessage() for r in caplog.records]
    assert any("GEMINI_API_KEY" in m for m in messages), (
        "startup with an empty key must log an actionable ERROR"
    )


def test_startup_does_not_log_key_error_when_configured(monkeypatch, caplog):
    monkeypatch.setattr(settings, "gemini_api_key", "test-key-123")
    app = _make_app(monkeypatch, caplog)
    with caplog.at_level(logging.ERROR, logger="querymind.app"):
        with TestClient(app):
            pass
    # sanity: capture really is attached (setup_logging strips root handlers)
    assert caplog.handler in logging.getLogger().handlers
    assert not any(
        "GEMINI_API_KEY is not set" in r.getMessage() for r in caplog.records
    )


def test_generate_question_without_api_key_raises_clean_503(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    with pytest.raises(LLMNotConfiguredError) as ei:
        gs.generate_question(
            topic="Transactions",
            subject="DBMS",
            bloom_level="understand",
            difficulty="medium",
            context_chunks=[{"text": "ctx", "source_doc": "d.pdf"}],
        )
    err = ei.value
    assert err.status_code == 503
    assert err.code == "LLM_NOT_CONFIGURED"
    assert "GEMINI_API_KEY" in err.detail  # tells the operator what to set


def test_evaluate_answer_without_api_key_raises_clean_503(monkeypatch):
    from app.models.models import Question

    monkeypatch.setattr(settings, "gemini_api_key", "")
    question = Question(
        subject="DBMS",
        topic="Transactions",
        bloom_level="understand",
        difficulty="medium",
        question_text="What is 2PL?",
        reference_answer="Two-phase locking.",
    )
    with pytest.raises(LLMNotConfiguredError) as ei:
        es.evaluate_answer(question=question, student_answer="It locks in two phases.")
    err = ei.value
    assert err.status_code == 503
    assert err.code == "LLM_NOT_CONFIGURED"
    assert "GEMINI_API_KEY" in err.detail
