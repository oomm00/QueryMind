"""
Application configuration — loaded from environment / .env file.
"""

from pathlib import Path
from typing import Any, List, Union
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

    # LLM reliability (env: LLM_TIMEOUT_SECONDS / LLM_MAX_CONCURRENCY)
    llm_timeout_seconds: float = 45.0   # hard per-call timeout; a slower call is
                                        # treated as transient and retried
    llm_max_concurrency: int = 3        # max simultaneous Gemini calls per process

    # Retrieval cache (env: RETRIEVAL_CACHE_TTL_SECONDS / RETRIEVAL_CACHE_MAX_ENTRIES)
    retrieval_cache_ttl_seconds: float = 300.0   # 5 minutes
    retrieval_cache_max_entries: int = 256

    @model_validator(mode="after")
    def _default_eval_model(self) -> "Settings":
        """Fall back to ``llm_model`` when ``LLM_EVAL_MODEL`` is not set."""
        if not self.llm_eval_model:
            self.llm_eval_model = self.llm_model
        return self


settings = Settings()
