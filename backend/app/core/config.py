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
    llm_model: str = "gemini-flash-lite-latest"
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
    # NOTE ON DEFAULTS: the shipped default is a ``*-lite`` model, which has the
    # most generous free-tier quota and needs no billing. ``low`` is the lowest
    # thinking level accepted across the Gemini 3 family — ``minimal`` is REJECTED
    # by some models with a 400 ("Thinking level MINIMAL is not supported for this
    # model"), so ``low`` is the safe universal default. Models that do support
    # ``minimal`` (e.g. gemini-3.5-flash-lite) can opt in via
    # ``LLM_THINKING_LEVEL=minimal``. ``LLM_THINKING_BUDGET`` is for Gemini 2.5
    # models (which use ``thinkingBudget`` instead of ``thinkingLevel``).
    llm_thinking_level: str = "low"
    llm_thinking_budget: Optional[int] = None
    # Generation-only thinking level (env: LLM_GEN_THINKING_LEVEL). Question
    # design benefits from more reasoning than the low-latency evaluation default
    # above, so generation gets its own knob. Per the Gemini docs every
    # Gemini 3-family model supports minimal/low/medium/high (the flash-lite
    # models default to minimal), so "medium" is safe across the shipped model
    # list; Gemini 2.5 models ignore levels and use thinking_budget instead.
    llm_gen_thinking_level: str = "medium"
    # Generation output cap (env: LLM_GEN_MAX_OUTPUT_TOKENS). Thinking tokens
    # count toward max_output_tokens, so the shared 2048 evaluation cap starves
    # the JSON answer once thinking is medium/high — generation gets a roomier
    # default of its own. The GeminiAdapter additionally retries a
    # finish_reason=MAX_TOKENS response once with a doubled cap instead of
    # surfacing truncated JSON as malformed.
    llm_gen_max_output_tokens: int = 8192
    llm_max_output_tokens: int = 2048  # evaluation hard cap; thinking tokens count toward it

    # LLM reliability (env: LLM_TIMEOUT_SECONDS / LLM_MAX_CONCURRENCY)
    llm_timeout_seconds: float = 45.0   # hard per-call timeout; a slower call is
                                        # treated as transient and retried
    llm_max_concurrency: int = 3        # max simultaneous Gemini calls per process

    # Ordered fallback models (env: LLM_FALLBACK_MODELS, comma-separated). When the
    # primary model returns a quota error (429 / RESOURCE_EXHAUSTED) or keeps
    # returning 503 after the built-in retries, the call is retried against the next
    # model in this list instead of failing the request. Empty (this code default)
    # keeps the single-model behaviour exactly as before; the committed
    # ``.env.example`` ships a sensible lite-model fallback list. Raw value; use
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

    @field_validator("llm_thinking_level", "llm_gen_thinking_level")
    @classmethod
    def _normalize_thinking_level(cls, value: Any) -> str:
        """Normalize the level so ``LOW`` / `` low `` behave like ``low``."""
        return str(value or "").strip().lower()

    # ── Bloom alignment gate (cognitive-alignment LLM check) ──────────────
    # Tolerance map, env override BLOOM_ALIGNMENT_TOLERANCE: comma-separated
    # "level=N" pairs with a "default" entry, e.g.
    # "remember=1,understand=1,default=0". A generated question whose
    # LLM-classified ACTUAL Bloom level is within N steps (remember->create)
    # of the requested level still passes; anything farther fails and triggers
    # one corrective regeneration, then a clean 422. Shipped default: 1 step
    # for the two lowest recall-style levels, 0 steps for apply and above.
    bloom_alignment_tolerance: str = "remember=1,understand=1,default=0"

    def tolerance_for(self, bloom_level: str) -> int:
        """Alignment tolerance in Bloom steps for *bloom_level*."""
        return self.bloom_alignment_tolerance_map.get(
            (bloom_level or "").strip().lower(),
            self.bloom_alignment_tolerance_map.get("default", 0),
        )

    @property
    def bloom_alignment_tolerance_map(self) -> dict[str, int]:
        """Parsed form of ``bloom_alignment_tolerance`` (always has 'default')."""
        parsed: dict[str, int] = {"default": 0}
        for part in (self.bloom_alignment_tolerance or "").split(","):
            part = part.strip()
            if not part or "=" not in part:
                continue
            key, _, value = part.partition("=")
            try:
                parsed[key.strip().lower()] = max(0, int(value.strip()))
            except ValueError:
                continue
        return parsed

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
