"""
Application configuration — loaded from environment / .env file.
"""

from pathlib import Path
from typing import Any, List, Optional, Union
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the backend `.env` deterministically (backend/app/core/config.py ->
# parents[2] == backend/) so settings load identically regardless of the current
# working directory. The repo-root `.env` is used only by docker-compose.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_env: str = "development"
    secret_key: str = "changeme-supersecret-key-in-production"
    debug: bool = True

    # Database
    database_url: str = "sqlite:///./querymind.db"

    # CORS
    allowed_origins: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    @property
    def cors_origins(self) -> List[str]:
        if isinstance(self.allowed_origins, str):
            if self.allowed_origins.startswith("[") and self.allowed_origins.endswith("]"):
                import json
                return json.loads(self.allowed_origins)
            return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]
        return self.allowed_origins

    # Chroma
    chroma_host: str = "localhost"
    chroma_port: int = 8001

    # LLM
    openai_api_key: str = "sk-placeholder"
    gemini_api_key: str = ""           # Set GEMINI_API_KEY in .env
    llm_model: str = "gemini-3.8-flash"
    # Judge model. Left empty by default so it inherits LLM_MODEL (env: LLM_EVAL_MODEL).
    # Set it explicitly to route generation and evaluation to different models
    # (e.g. a cheaper/less rate-limited model for scoring).
    llm_eval_model: str = ""
    llm_temperature: float = 0.3       # Low temp for deterministic structured output
    llm_eval_temperature: float = 0.0  # Minimal temp for consistent rubric scoring

    # LLM thinking control + output cap (env: LLM_THINKING_LEVEL / LLM_THINKING_BUDGET
    # / LLM_MAX_OUTPUT_TOKENS). Both generation and evaluation emit short, structured
    # JSON, so they do not need deep reasoning: the default keeps thinking at the
    # lowest level the *configuration* model supports.
    #
    # NOTE ON DEFAULTS: the shipped default model is ``gemini-3.8-flash``, whose
    # documented thinking levels are low/medium/high — ``minimal`` is REJECTED with a
    # 400 ("Thinking level MINIMAL is not supported for this model"). ``low`` is
    # therefore the lowest universally-valid level across the Gemini 3 family and is
    # what we default to. Models that do support ``minimal`` (e.g. gemini-3.5-flash-lite)
    # can opt in via ``LLM_THINKING_LEVEL=minimal``. ``LLM_THINKING_BUDGET`` is for
    # Gemini 2.5 models (which use ``thinkingBudget`` instead of ``thinkingLevel``).
    llm_thinking_level: str = "low"
    llm_thinking_budget: Optional[int] = None
    llm_max_output_tokens: int = 2048  # hard cap; thinking tokens count toward it

    # LLM reliability (env: LLM_TIMEOUT_SECONDS / LLM_MAX_CONCURRENCY)
    llm_timeout_seconds: float = 45.0   # hard per-call timeout; a slower call is
                                        # treated as transient and retried
    llm_max_concurrency: int = 3        # max simultaneous Gemini calls per process

    # Ordered fallback models (env: LLM_FALLBACK_MODELS, comma-separated). When the
    # primary model returns a quota error (429 / RESOURCE_EXHAUSTED) or keeps
    # returning 503 after the built-in retries, the call is retried against the next
    # model in this list instead of failing the request. Empty (the default) keeps
    # the single-model behaviour exactly as before. Raw value; use
    # ``settings.fallback_models`` for the parsed list (mirrors ALLOWED_ORIGINS).
    llm_fallback_models: Union[List[str], str] = []

    # Retrieval cache (env: RETRIEVAL_CACHE_TTL_SECONDS / RETRIEVAL_CACHE_MAX_ENTRIES)
    retrieval_cache_ttl_seconds: float = 300.0   # 5 minutes
    retrieval_cache_max_entries: int = 256

    # Startup warm-up (env: WARMUP_ON_STARTUP). When true the FastAPI lifespan
    # pre-loads the embedding model, Chroma collection and structured-output
    # schemas so the first request does not pay that one-time cost.
    warmup_on_startup: bool = True

    @field_validator("llm_thinking_budget", mode="before")
    @classmethod
    def _blank_budget_is_none(cls, value: Any) -> Any:
        """Treat an empty LLM_THINKING_BUDGET (or ``none``/``off``) as unset."""
        if value is None:
            return None
        if isinstance(value, str):
            text = value.strip().lower()
            if text in ("", "none", "off", "unset", "null"):
                return None
        return value

    @field_validator("llm_thinking_level")
    @classmethod
    def _normalize_thinking_level(cls, value: Any) -> str:
        """Normalize the level so ``LOW`` / `` low `` behave like ``low``."""
        return str(value or "").strip().lower()

    @property
    def fallback_models(self) -> List[str]:
        """Parsed ``LLM_FALLBACK_MODELS`` (comma-separated, or a JSON list).

        ``pydantic-settings`` would otherwise demand a JSON array for a ``List[str]``
        field, so — exactly like ``ALLOWED_ORIGINS`` above — the raw value is accepted
        as-is and split here. Blank / ``none`` / ``off`` / ``null`` mean "no fallbacks".
        """
        value = self.llm_fallback_models
        if isinstance(value, str):
            text = value.strip()
            if not text or text.lower() in ("[]", "none", "off", "null"):
                return []
            if text.startswith("["):
                import json

                try:
                    parsed = json.loads(text)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    pass  # fall through to comma splitting
            return [part.strip() for part in text.split(",") if part.strip()]
        return [str(item).strip() for item in value if str(item).strip()]

    @model_validator(mode="after")
    def _default_eval_model(self) -> "Settings":
        """Fall back to ``llm_model`` when ``LLM_EVAL_MODEL`` is not set."""
        if not self.llm_eval_model:
            self.llm_eval_model = self.llm_model
        return self


settings = Settings()
