# 18 — Deployment

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

Local Compose runs PostgreSQL, Chroma, and the backend. The backend image is
Python 3.11, installs CPU-only Torch, installs requirements, preloads the
embedding model, runs migrations, and starts Uvicorn. Vercel hosts the static
frontend; Render’s blueprint hosts the API and managed PostgreSQL.

## Local topology

Compose publishes API 8000, PostgreSQL 5432, and Chroma host port 8001 while
the backend dials Chroma’s in-network port 8000. Database and Chroma named
volumes provide local persistence
([`docker-compose.yml`](../../docker-compose.yml)).

## Production runbook

1. Render service root directory: `backend`; Dockerfile: `Dockerfile`.
2. Supply `GEMINI_API_KEY`, exact `ALLOWED_ORIGINS`, and a persistent Chroma
   host/port because the blueprint does not create Chroma
   ([`render.yaml`](../../render.yaml)).
3. Render runs `alembic upgrade head` before Uvicorn
   ([`backend/Dockerfile`](../../backend/Dockerfile)).
4. Create Vercel project with root `frontend`, `npm run build`, output `dist`.
5. Set `VITE_API_BASE_URL` to the public Render API URL
   ([`README.md`](../../README.md), [`frontend/.env.production.example`](../../frontend/.env.production.example)).
6. Verify `/health`, registration/login, upload, generation, submit, and
   profile flows.
7. Seed demo material with `scripts/seed_demo.py` against the public API.

Needs input from Om: provider dashboard values, the actual persistent Chroma
deployment, and rollback policy are not present in Git.

