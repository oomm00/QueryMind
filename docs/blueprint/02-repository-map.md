# 02 — Repository map

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

`backend/app` is the API and domain layer. `frontend/src` is the client.
Alembic owns schema history, `backend/tests` contains API/service tests, and
`scripts` contains seeding and audit utilities.

## Map

| Path | Purpose |
|---|---|
| [`backend/app/api`](../../backend/app/api) | FastAPI routes and dependencies |
| [`backend/app/core`](../../backend/app/core) | settings, errors, logging, rate limits, timing, warm-up |
| [`backend/app/models`](../../backend/app/models) | SQLAlchemy ORM models |
| [`backend/app/schemas`](../../backend/app/schemas) | Pydantic request/response contracts |
| [`backend/app/services`](../../backend/app/services) | auth, ingestion, retrieval, generation, evaluation, mastery |
| [`backend/alembic`](../../backend/alembic) | migration environment and revisions |
| [`backend/tests`](../../backend/tests) | backend test suite |
| [`frontend/src/api`](../../frontend/src/api) | fetch client, endpoint wrappers, adapters, mocks |
| [`frontend/src/pages`](../../frontend/src/pages) | routed React screens |
| [`frontend/src/components`](../../frontend/src/components) | reusable UI |
| [`frontend/src/content`](../../frontend/src/content) | bundled course and practice content |
| [`scripts`](../../scripts) | demo seed, Bloom audit, reports |
| [`docker-compose.yml`](../../docker-compose.yml) | local PostgreSQL/Chroma/API topology |
| [`backend/Dockerfile`](../../backend/Dockerfile) | production API image |
| [`render.yaml`](../../render.yaml) | Render blueprint |

## Deep dive

The backend separates transport validation (`schemas.py`) from persistence
(`models.py`) and domain operations (`services`). This makes service tests
possible without treating route handlers as the only unit of behaviour. The
frontend deliberately has a mock dispatcher, but the shipped example switches
real authentication/questions/documents on and keeps some profile/content
surfaces mocked ([`frontend/src/api/mocks/config.js`](../../frontend/src/api/mocks/config.js),
[`frontend/.env.example`](../../frontend/.env.example)).

