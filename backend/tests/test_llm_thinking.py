"""
Unit Tests — LLM thinking control, output cap, and startup warm-up
==================================================================
Covers the second performance pass:

1. ``LLM_THINKING_LEVEL`` / ``LLM_THINKING_BUDGET`` / ``LLM_MAX_OUTPUT_TOKENS``
   settings defaults + env overrides.
2. :func:`app.services.llm_utils.build_thinking_config` — level vs budget routing,
   the "off" tokens, and level-wins-over-budget (sending both is a 400).
3. ``GeminiAdapter`` forwards the thinking config + output cap into the request.
4. ``_configure_genai`` / ``_configure_judge_client`` wire the settings through.
5. :func:`app.core.warmup.warm_up` runs every step, times them, and never raises.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.core import warmup
from app.core.config import Settings
from app.services import llm_utils


# ── Settings ──────────────────────────────────────────────────────────────────

def test_thinking_defaults():
    settings = Settings(_env_file=None)
    assert settings.llm_thinking_level == "low"
    assert settings.llm_thinking_budget is None
    assert settings.llm_max_output_tokens == 2048
    # Generation gets its own (roomier) cap: thinking tokens count toward
    # max_output_tokens, and medium thinking alone can eat ~1-2k tokens. The
    # default thinking level is a per-Bloom map: low for recall-style levels
    # (same quality, ~2x faster), medium for the Apply+ concrete-scenario levels.
    assert settings.llm_gen_thinking_level == "remember=low,understand=low,default=medium"
    assert settings.llm_gen_max_output_tokens == 8192
    assert settings.warmup_on_startup is True


def test_thinking_env_overrides(monkeypatch):
    monkeypatch.setenv("LLM_THINKING_LEVEL", "MINIMAL")
    monkeypatch.setenv("LLM_THINKING_BUDGET", "512")
    monkeypatch.setenv("LLM_MAX_OUTPUT_TOKENS", "256")
    monkeypatch.setenv("LLM_GEN_MAX_OUTPUT_TOKENS", "4096")
    settings = Settings(_env_file=None)
    assert settings.llm_thinking_level == "minimal"  # normalized
    assert settings.llm_thinking_budget == 512
    assert settings.llm_max_output_tokens == 256
    assert settings.llm_gen_max_output_tokens == 4096


def test_blank_budget_is_treated_as_unset(monkeypatch):
    monkeypatch.setenv("LLM_THINKING_BUDGET", "")
    monkeypatch.setenv("LLM_THINKING_LEVEL", "off")
    settings = Settings(_env_file=None)
    assert settings.llm_thinking_budget is None
    assert settings.llm_thinking_level == "off"


# ── gen_thinking_level_for (per-Bloom-level thinking map) ────────────────────

def test_gen_thinking_level_map_resolution():
    s = Settings(_env_file=None)
    mapped = Settings(_env_file=None, llm_gen_thinking_level="remember=low,default=high")
    # Map: explicit rows win for their level, default covers the rest.
    assert mapped.gen_thinking_level_for("remember") == "low"
    assert mapped.gen_thinking_level_for("apply") == "high"
    assert mapped.gen_thinking_level_for("create") == "high"
    # The shipped default: low for recall-style, medium (default) for Apply+.
    assert s.gen_thinking_level_for("remember") == "low"
    assert s.gen_thinking_level_for("understand") == "low"
    assert s.gen_thinking_level_for("apply") == "medium"
    assert s.gen_thinking_level_for("analyze") == "medium"
    assert s.gen_thinking_level_for("evaluate") == "medium"
    assert s.gen_thinking_level_for("create") == "medium"


def test_gen_thinking_level_plain_value_is_global():
    # A value with no "=" is a single global level for every Bloom level.
    s = Settings(_env_file=None, llm_gen_thinking_level="medium")
    assert s.gen_thinking_level_for("remember") == "medium"
    assert s.gen_thinking_level_for("create") == "medium"


def test_gen_thinking_level_fallback_when_map_has_no_default():
    s = Settings(_env_file=None, llm_gen_thinking_level="remember=low")
    # No explicit row and no default -> raw setting text (model default path).
    assert s.gen_thinking_level_for("create") == "remember=low"


# ── build_thinking_config ─────────────────────────────────────────────────────

def test_build_thinking_config_off_tokens():
    for off in ("", "none", "off", "unset", "default", "null", None):
        assert llm_utils.build_thinking_config(off, None) is None


def test_build_thinking_config_level():
    pytest.importorskip("google.genai")
    config = llm_utils.build_thinking_config("minimal", None)
    assert config is not None
    assert "minimal" in str(config.thinking_level).lower()


def test_build_thinking_config_budget():
    pytest.importorskip("google.genai")
    config = llm_utils.build_thinking_config(None, 0)
    assert config is not None
    assert config.thinking_budget == 0


def test_level_wins_over_budget():
    """Both knobs set together would be a 400; the level must win."""
    pytest.importorskip("google.genai")
    config = llm_utils.build_thinking_config("low", 1024)
    assert config is not None
    assert config.thinking_level is not None
    assert config.thinking_budget is None


# ── GeminiAdapter ─────────────────────────────────────────────────────────────

def test_adapter_sends_thinking_config_and_output_cap():
    pytest.importorskip("google.genai")
    from app.services.generation_service import GeminiAdapter

    inner = MagicMock()
    adapter = GeminiAdapter(
        inner, "test-model", 0.1, thinking_level="minimal", max_output_tokens=512
    )
    adapter.generate_content("hello")

    _, kwargs = inner.models.generate_content.call_args
    config = kwargs["config"]
    assert config.max_output_tokens == 512
    assert config.thinking_config is not None
    assert "minimal" in str(config.thinking_config.thinking_level).lower()


def test_adapter_omits_thinking_when_disabled():
    from app.services.generation_service import GeminiAdapter

    inner = MagicMock()
    adapter = GeminiAdapter(inner, "test-model", 0.1)  # every optional knob unset
    adapter.generate_content("hello")

    _, kwargs = inner.models.generate_content.call_args
    config = kwargs["config"]
    assert getattr(config, "thinking_config", None) is None
    assert not getattr(config, "max_output_tokens", None)


# ── Settings are wired into the real clients ─────────────────────────────────

def test_configure_genai_wires_thinking_settings(monkeypatch):
    pytest.importorskip("google.genai")
    import google.genai as genai

    from app.services import generation_service as gs

    monkeypatch.setattr(gs.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(gs.settings, "llm_thinking_level", "low")
    monkeypatch.setattr(gs.settings, "llm_gen_thinking_level", "medium")
    monkeypatch.setattr(gs.settings, "llm_max_output_tokens", 333)
    monkeypatch.setattr(gs.settings, "llm_gen_max_output_tokens", 444)
    monkeypatch.setattr(genai, "Client", lambda *a, **k: MagicMock())

    # Generation defaults to its own (higher) thinking level and output cap —
    # thinking tokens count toward max_output_tokens, so the roomy generation
    # cap must come from LLM_GEN_MAX_OUTPUT_TOKENS, not the evaluation cap.
    adapter = gs._configure_genai(response_schema=None)
    assert adapter._thinking_level == "medium"
    assert adapter._max_output_tokens == 444

    # ...while a validation/judgement caller can pin the low evaluation level
    # and the small evaluation cap.
    adapter = gs._configure_genai(thinking_level="low", max_output_tokens=333)
    assert adapter._thinking_level == "low"
    assert adapter._max_output_tokens == 333


def test_configure_genai_resolves_thinking_per_bloom_level(monkeypatch):
    """The shipped per-level map routes recall-style levels to low thinking and
    Apply+ levels to medium, without the caller pinning a level."""
    pytest.importorskip("google.genai")
    import google.genai as genai

    from app.services import generation_service as gs

    monkeypatch.setattr(gs.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(
        gs.settings,
        "llm_gen_thinking_level",
        "remember=low,understand=low,default=medium",
    )
    monkeypatch.setattr(genai, "Client", lambda *a, **k: MagicMock())

    assert gs._configure_genai(bloom_level="remember")._thinking_level == "low"
    assert gs._configure_genai(bloom_level="understand")._thinking_level == "low"
    assert gs._configure_genai(bloom_level="apply")._thinking_level == "medium"
    assert gs._configure_genai(bloom_level="create")._thinking_level == "medium"
    # No bloom_level (e.g. schema warm-up) falls back to the default row.
    assert gs._configure_genai()._thinking_level == "medium"


def test_configure_judge_client_wires_thinking_settings(monkeypatch):
    pytest.importorskip("google.genai")
    import google.genai as genai

    from app.services import evaluation_service as es

    monkeypatch.setattr(es.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(es.settings, "llm_eval_model", "gemini-judge")
    monkeypatch.setattr(es.settings, "llm_thinking_level", "low")
    monkeypatch.setattr(es.settings, "llm_max_output_tokens", 777)
    monkeypatch.setattr(genai, "Client", lambda *a, **k: MagicMock())

    adapter = es._configure_judge_client(response_schema=None)
    assert adapter._model == "gemini-judge"
    assert adapter._thinking_level == "low"
    assert adapter._max_output_tokens == 777


# ── Startup warm-up ───────────────────────────────────────────────────────────

def test_warm_up_runs_every_step_in_order(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(warmup, "_load_embedding_model", lambda: calls.append("embedding"))
    monkeypatch.setattr(warmup, "_build_chroma_collection", lambda: calls.append("chroma"))
    monkeypatch.setattr(warmup, "_build_structured_schemas", lambda: calls.append("schemas"))

    timings = warmup.warm_up()

    assert calls == ["embedding", "chroma", "schemas"]
    assert set(timings) == {"embedding_model", "chroma_collection", "structured_schemas"}


def test_warm_up_never_raises_when_a_step_fails(monkeypatch):
    def boom() -> None:
        raise RuntimeError("chroma is down")

    monkeypatch.setattr(warmup, "_load_embedding_model", lambda: None)
    monkeypatch.setattr(warmup, "_build_chroma_collection", boom)
    monkeypatch.setattr(warmup, "_build_structured_schemas", lambda: None)

    timings = warmup.warm_up()  # must not propagate

    assert "chroma_collection" not in timings
    assert "embedding_model" in timings
    assert "structured_schemas" in timings


def test_lifespan_invokes_warm_up(monkeypatch):
    """The FastAPI lifespan must call warm_up() on startup."""
    from starlette.testclient import TestClient

    import app.main as main

    hits: list[int] = []
    monkeypatch.setattr(main, "warm_up", lambda: hits.append(1) or {})
    app = main.create_app()
    with TestClient(app):
        pass
    assert hits == [1]
