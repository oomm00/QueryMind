"""MAX_TOKENS truncation handling in GeminiAdapter (Bloom follow-up).

Root cause reproduced live (2026-10-18): ``max_output_tokens`` is a COMBINED
thinking + output budget on Gemini 3 models.  At thinking=medium the DP/apply
call drew 1828 thinking tokens against the old 2048 cap, leaving only ~204
tokens for the JSON answer -> ``finish_reason=MAX_TOKENS`` -> JSON cut
mid-string -> previously surfaced as ``GENERATION_FAILED: LLM returned
malformed output after retry``.

These tests pin the fix:
1. every Gemini call logs ``finish_reason`` + prompt/output/thinking usage;
2. a ``MAX_TOKENS`` response is retried ONCE with a doubled cap (ceil 65536),
   NOT handed upstream as "malformed JSON";
3. a second truncation is passed through (the JSON-retry path is last resort);
4. generation clients default to ``LLM_GEN_MAX_OUTPUT_TOKENS`` (8192) while
   evaluation-class callers keep their own cap.
"""
from __future__ import annotations

import json
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

pytest.importorskip("google.genai")

from app.services.generation_service import (  # noqa: E402
    GeminiAdapter,
    _finish_reason,
    _usage_metadata,
)


# ── Fakes ─────────────────────────────────────────────────────────────────────

def _response(
    text: str,
    finish: str = "STOP",
    prompt: int = 0,
    output: int = 0,
    thinking: int = 0,
):
    """Stand-in for a google.genai response with finish_reason + usage metadata."""
    return SimpleNamespace(
        text=text,
        candidates=[SimpleNamespace(finish_reason=SimpleNamespace(name=finish))],
        usage_metadata=SimpleNamespace(
            prompt_token_count=prompt,
            candidates_token_count=output,
            thoughts_token_count=thinking,
        ),
    )


class _FakeModels:
    def __init__(self, *responses):
        self._queue = list(responses)
        self.calls: list[SimpleNamespace] = []

    def generate_content(self, model=None, contents=None, config=None):
        self.calls.append(SimpleNamespace(model=model, contents=contents, config=config))
        return self._queue.pop(0)


def _adapter(*responses, max_output_tokens: int | None = 2048):
    models = _FakeModels(*responses)
    adapter = GeminiAdapter(
        SimpleNamespace(models=models),
        "gemini-test",
        0.5,
        thinking_level="low",
        max_output_tokens=max_output_tokens,
    )
    return adapter, models


# ── 1. MAX_TOKENS -> retry once with a doubled cap ───────────────────────────

def test_max_tokens_retries_once_with_doubled_cap():
    truncated = _response('{"question": "par', finish="MAX_TOKENS", output=204, thinking=1828)
    full = _response('{"question": "full"}', finish="STOP", output=474, thinking=1710)
    adapter, models = _adapter(truncated, full)

    resp = adapter.generate_content("build me a question")

    assert resp is full
    assert len(models.calls) == 2
    assert models.calls[0].config.max_output_tokens == 2048
    assert models.calls[1].config.max_output_tokens == 4096  # doubled


def test_stop_response_is_not_retried():
    ok = _response('{"question": "fine"}')
    adapter, models = _adapter(ok)

    assert adapter.generate_content("p") is ok
    assert len(models.calls) == 1


def test_max_tokens_without_cap_is_not_retried():
    truncated = _response("x", finish="MAX_TOKENS")
    adapter, models = _adapter(truncated, max_output_tokens=None)

    assert adapter.generate_content("p") is truncated
    assert len(models.calls) == 1


def test_retry_cap_is_capped_at_65536():
    truncated = _response("x", finish="MAX_TOKENS")
    full = _response("y")
    adapter, models = _adapter(truncated, full, max_output_tokens=40000)

    adapter.generate_content("p")

    assert models.calls[1].config.max_output_tokens == 65536


def test_second_truncation_is_returned_without_third_call():
    first = _response("a", finish="MAX_TOKENS")
    second = _response("b", finish="MAX_TOKENS")
    adapter, models = _adapter(first, second)

    resp = adapter.generate_content("p")

    assert resp is second
    assert len(models.calls) == 2  # original + ONE retry, no loop


# ── 2. Logging: finish_reason + prompt/output/thinking token usage ───────────

def test_every_call_logs_finish_reason_and_usage(caplog):
    ok = _response('{"q": 1}', prompt=1075, output=393, thinking=1477)
    adapter, _ = _adapter(ok)

    with caplog.at_level(logging.INFO, logger="querymind.generation"):
        adapter.generate_content("p")

    msgs = [r.getMessage() for r in caplog.records]
    assert any(
        "finish_reason=STOP" in m
        and "'prompt': 1075" in m
        and "'output': 393" in m
        and "'thinking': 1477" in m
        for m in msgs
    )


def test_max_tokens_retry_logs_warning_with_both_caps(caplog):
    truncated = _response("a", finish="MAX_TOKENS", output=204, thinking=1828)
    full = _response("b", finish="STOP")
    adapter, _ = _adapter(truncated, full)

    with caplog.at_level(logging.INFO, logger="querymind.generation"):
        adapter.generate_content("p")

    msgs = [r.getMessage() for r in caplog.records]
    assert any(
        "finish_reason=MAX_TOKENS" in m and "retrying once with max_output_tokens=4096" in m
        for m in msgs
    )
    # The retried (successful) call is logged too, with the final STOP.
    assert any("finish_reason=STOP" in m for m in msgs)


# ── 3. Metadata helpers are safe on odd/test-double shapes ───────────────────

def test_finish_reason_helper_handles_odd_shapes():
    assert _finish_reason(None) is None
    assert _finish_reason(SimpleNamespace(candidates=[])) is None
    assert _finish_reason(SimpleNamespace(candidates=None)) is None
    assert _finish_reason(
        SimpleNamespace(candidates=[SimpleNamespace(finish_reason="STOP")])
    ) == "STOP"
    assert _finish_reason(
        SimpleNamespace(
            candidates=[SimpleNamespace(finish_reason=SimpleNamespace(name="MAX_TOKENS"))]
        )
    ) == "MAX_TOKENS"
    # MagicMock attributes are not strings -> None (never triggers the retry).
    assert _finish_reason(MagicMock()) is None


def test_usage_metadata_helper_keeps_only_real_ints():
    assert _usage_metadata(None) is None
    resp = SimpleNamespace(
        usage_metadata=SimpleNamespace(
            prompt_token_count=10,
            candidates_token_count=20,
            thoughts_token_count=None,  # thinking disabled
        )
    )
    assert _usage_metadata(resp) == {"prompt": 10, "output": 20}
    # Test doubles fabricate non-int attributes; they must be filtered out.
    assert _usage_metadata(MagicMock()) is None


# ── 4. Integration: generate_question survives a truncated first attempt ─────

_VALID_FULL_JSON = json.dumps(
    {
        "question": "Using the schedule in the material, compute the optimal cost.",
        "correct_answer": "15",
        "explanation": "Bottom-up tabulation over the recurrence.",
        "bloom_level": "apply",
        "difficulty": "medium",
        "options": [],
        "source_chunks": [],
    }
)


def test_generate_question_survives_truncation_via_adapter_retry(monkeypatch):
    from app.services import generation_service as gs

    monkeypatch.setattr(
        gs,
        "retrieve_context",
        lambda *a, **k: [
            {
                "text": "DP solves knapsack via tabulation.",
                "chunk_id": "c1",
                "source_doc": "algo-notes.pdf",
            }
        ],
    )
    truncated = _response('{"question": "Knaps', finish="MAX_TOKENS", output=204, thinking=1828)
    full = _response(_VALID_FULL_JSON, finish="STOP", output=474, thinking=1710)
    adapter, models = _adapter(truncated, full)

    q = gs.generate_question(
        topic="Dynamic Programming",
        subject="Algorithms",
        bloom_level="apply",
        difficulty="medium",
        question_type="descriptive",
        llm_client=adapter,
    )

    # The truncated first response never reaches the malformed-JSON path:
    # exactly one transport-level retry happened and the full answer won.
    assert q.question_text.startswith("Using the schedule")
    assert len(models.calls) == 2
    assert models.calls[1].config.max_output_tokens == 4096
