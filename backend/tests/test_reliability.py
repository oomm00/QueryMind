"""
Tests — LLM reliability guards (hard timeout + concurrency cap)
===============================================================
Covers:

1. A Gemini call that hangs past the (patched) timeout is treated as a transient
   error, retried, and finally fails with a clean 503 / LLM_UNAVAILABLE — inside a
   sane wall-clock budget.
2. No more than ``LLM_MAX_CONCURRENCY`` Gemini calls ever run at the same time
   across concurrent callers.
3. A call that returns quickly is unaffected by the guards.

Everything is mocked — no real API calls or network access.
"""

from __future__ import annotations

import threading
import time
from unittest.mock import MagicMock

import pytest

from app.core.exceptions import QueryMindError
from app.services import llm_utils


class _Response:
    """Minimal stand-in for a genai response object."""

    def __init__(self, text: str = "{}") -> None:
        self.text = text


# ── 1. Hard timeout ───────────────────────────────────────────────────────────


def test_hung_llm_call_times_out_retries_then_fails(monkeypatch):
    """A call slower than the timeout is retried and ends as LLM_UNAVAILABLE (503)."""
    monkeypatch.setattr(llm_utils, "LLM_CALL_TIMEOUT_SECONDS", 0.05)

    client = MagicMock()

    def _slow_generate(prompt: str) -> _Response:
        time.sleep(0.5)          # far beyond the 0.05s patched timeout
        return _Response()

    client.generate_content.side_effect = _slow_generate

    started = time.monotonic()
    with pytest.raises(QueryMindError) as exc_info:
        llm_utils.generate_with_retry(client, "prompt", sleep=lambda _s: None)
    elapsed = time.monotonic() - started

    assert exc_info.value.code == "LLM_UNAVAILABLE"
    assert exc_info.value.status_code == 503
    # initial attempt + LLM_MAX_RETRIES retries were all dispatched
    assert client.generate_content.call_count == llm_utils.LLM_MAX_RETRIES + 1
    # 4 attempts x 0.05s wait (+ no real backoff sleep) is well under a second
    assert elapsed < 2.0


def test_fast_call_passes_through_unaffected(monkeypatch):
    """A call well within the timeout returns immediately (no retries)."""
    monkeypatch.setattr(llm_utils, "LLM_CALL_TIMEOUT_SECONDS", 5.0)

    client = MagicMock()
    client.generate_content.return_value = _Response("hello")

    result = llm_utils.generate_with_retry(client, "prompt", sleep=lambda _s: None)

    assert result.text == "hello"
    assert client.generate_content.call_count == 1


# ── 2. Concurrency cap ────────────────────────────────────────────────────────


def test_concurrency_is_capped_at_llm_max_concurrency():
    """Fire 2x the cap of concurrent calls; never more than the cap run at once."""
    limit = llm_utils.LLM_MAX_CONCURRENCY
    assert limit >= 1
    n_threads = limit * 2

    lock = threading.Lock()
    state = {"active": 0, "peak": 0}
    barrier = threading.Barrier(n_threads)

    def _worker() -> None:
        client = MagicMock()

        def _generate(prompt: str) -> _Response:
            with lock:
                state["active"] += 1
                state["peak"] = max(state["peak"], state["active"])
            time.sleep(0.15)   # hold the slot long enough to observe overlap
            with lock:
                state["active"] -= 1
            return _Response()

        client.generate_content.side_effect = _generate

        barrier.wait()  # release all callers at (roughly) the same instant
        llm_utils.generate_with_retry(client, "prompt", sleep=lambda _s: None)

    threads = [threading.Thread(target=_worker) for _ in range(n_threads)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)

    assert all(not t.is_alive() for t in threads), "a worker thread deadlocked"
    assert state["peak"] <= limit, f"concurrency cap breached: {state['peak']} > {limit}"
    assert state["peak"] == limit, f"cap not saturated ({state['peak']}), test is inconclusive"
