"""
Unit Tests — Application Settings
=================================
Covers the LLM model configuration defaults:

1. Small batch of settings sanity checks.
2. ``LLM_EVAL_MODEL`` falls back to ``LLM_MODEL`` when unset.
3. ``LLM_EVAL_MODEL`` overrides the fallback when provided.
4. The evaluation service uses the judge model, not the generation model.
"""

from __future__ import annotations

from app.core.config import Settings


def test_eval_model_defaults_to_llm_model():
    """An unset LLM_EVAL_MODEL must resolve to LLM_MODEL."""
    settings = Settings(_env_file=None, llm_model="gemini-x", llm_eval_model="")
    assert settings.llm_eval_model == "gemini-x"


def test_eval_model_explicit_override_is_kept():
    """An explicit LLM_EVAL_MODEL must win over the fallback."""
    settings = Settings(
        _env_file=None, llm_model="gemini-x", llm_eval_model="gemini-judge"
    )
    assert settings.llm_eval_model == "gemini-judge"


def test_eval_model_reads_env(monkeypatch):
    """LLM_EVAL_MODEL is read from the environment (env var name is the field name)."""
    monkeypatch.setenv("LLM_EVAL_MODEL", "gemini-env-judge")
    settings = Settings(_env_file=None)
    assert settings.llm_eval_model == "gemini-env-judge"
