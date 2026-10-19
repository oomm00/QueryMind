# 00 — Executive summary

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

QueryMind helps a learner practise a chosen subject and topic. A learner can
upload study material, receive a question grounded in that material, answer it,
and receive rubric-based feedback. Attempts are persisted and feed mastery
records used by adaptive generation. The implemented backend is real rather
than a mock: authentication, document ingestion, retrieval, Gemini generation,
evaluation, attempts, and mastery routes are present
([`README.md`](../../README.md), [`backend/app/main.py`](../../backend/app/main.py)).

The current branch is `feature/full-experience`; the requested “main” branch
state was not checked out. Existing application edits were preserved.

## Technical detail

The browser is a Vite-built React SPA. `frontend/src/api/client.js` reads
`VITE_API_BASE_URL`, adds a bearer token from `localStorage` key `qm_token`, and
maps non-2xx responses to `ApiError`. The FastAPI factory registers auth,
questions, documents, attempts, profile, and mastery routers
([`frontend/src/api/client.js`](../../frontend/src/api/client.js),
[`backend/app/main.py`](../../backend/app/main.py)).

The end-to-end session is: register/login; upload PDF, DOCX, TXT, or MD; extract
and chunk text; embed and upsert chunks; request a Bloom/difficulty-targeted
question; validate and persist it; submit an answer; evaluate against the
five-criterion rubric; persist an attempt; and update both adaptive stores
([`backend/app/api/documents.py`](../../backend/app/api/documents.py),
[`backend/app/api/questions.py`](../../backend/app/api/questions.py),
[`backend/app/api/attempts.py`](../../backend/app/api/attempts.py)).

## Deep dive / ownership

The repository documentation names Om for architecture/backend, Saumya for
React frontend, and Pavitra for database schema and AI prompts in the supplied
project brief. That ownership statement is not encoded in application code;
confirm current ownership with the team.

Implemented does not mean production-complete. The repository supplies a Render
blueprint but no Chroma production service, and the frontend deployment requires
`VITE_API_BASE_URL` to be configured outside the repository
([`render.yaml`](../../render.yaml), [`frontend/.env.production.example`](../../frontend/.env.production.example)).

