# 16 — Configuration reference

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

Settings are loaded from environment variables and the backend `.env`; Compose
also supplies in-network overrides. Production secrets belong in Render/Vercel
provider settings, not Git.

| Variable | Default/example | Effect |
|---|---|---|
| `APP_ENV` | development | environment label |
| `SECRET_KEY` | development placeholder | JWT signing |
| `DEBUG` | true | logging/debug mode |
| `DATABASE_URL` | SQLite example | SQLAlchemy/Alembic target |
| `ALLOWED_ORIGINS` | localhost list | CORS allow list |
| `CHROMA_HOST/PORT` | localhost/8001 | vector service |
| `GEMINI_API_KEY` | empty | generation/evaluation provider |
| `LLM_MODEL` | `gemini-flash-lite-latest` | primary model |
| `LLM_FALLBACK_MODELS` | example list | quota/availability fallback |
| `LLM_TIMEOUT_SECONDS` | 45 | per-call timeout |
| `LLM_MAX_CONCURRENCY` | 3 | concurrent provider calls |
| `LLM_MAX_OUTPUT_TOKENS` | 2048 | evaluation output cap |
| `WARMUP_ON_STARTUP` | true | startup preload |
| `RETRIEVAL_CACHE_TTL_SECONDS` | 300 | cache lifetime |
| `RETRIEVAL_CACHE_MAX_ENTRIES` | 256 | cache capacity |
| `VITE_API_BASE_URL` | localhost:8000 | browser API base |

Authoritative sources are [`backend/app/core/config.py`](../../backend/app/core/config.py),
[`.env.example`](../../.env.example), [`frontend/.env.example`](../../frontend/.env.example),
and [`docker-compose.yml`](../../docker-compose.yml). Values containing keys,
passwords, or full URLs are intentionally not reproduced here.

