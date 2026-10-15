"""
Application configuration — loaded from environment / .env file.
"""

from pathlib import Path
from typing import Any, List, Union
from pydantic import field_validator
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
    llm_temperature: float = 0.3       # Low temp for deterministic structured output


settings = Settings()
