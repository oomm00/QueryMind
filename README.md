# QueryMind 

> **AI-based adaptive question generation and answer evaluation platform.**

QueryMind helps learners prepare for topics using AI-generated questions that adapt to their knowledge profile. It supports Bloom's taxonomy levels, custom difficulty settings, and provides instant feedback with mastery tracking across sessions.

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Folder Structure](#folder-structure)
3. [Setup Instructions](#setup-instructions)
4. [Demo day (two repos)](#demo-day-two-repos)
5. [Environment flags](#environment-flags)
6. [Demo-day break/fix table](#demo-day-breakfix-table)
7. [LLM configuration & resilience](#llm-configuration--resilience)
8. [Production deployment](#production-deployment)
9. [License](#license)

---

## Project Overview

QueryMind is a full-stack web application that:
- Accepts a **learning goal, topic, Bloom's level, and difficulty** from the user.
- Uses an LLM-powered **RAG pipeline** to generate contextually relevant questions from uploaded documents.
- **Evaluates free-text answers** and returns structured feedback.
- Maintains a **Knowledge Profile** per user, tracking mastery over time.

The demo is wired end-to-end: authentication, document ingestion, retrieval,
Gemini question generation, answer evaluation, attempt history, and mastery
updates use the FastAPI backend. Course lessons and a small set of preference
surfaces intentionally use the bundled demo content until their backend
endpoints are added.

---

## Folder Structure

```
querymind/
├── backend/                # FastAPI application
│   ├── app/
│   │   ├── api/            # Route handlers (auth, questions, attempts, profile)
│   │   ├── db/             # SQLAlchemy engine & session
│   │   ├── models/         # ORM models (User, Question, Attempt, …)
│   │   ├── schemas/        # Pydantic request/response schemas
│   │   ├── services/       # Business logic layer (stubs for now)
│   │   └── main.py         # App factory & router registration
│   ├── alembic/            # Database migration scripts
│   ├── alembic.ini
│   └── requirements.txt
│
├── frontend/               # React + Vite + Tailwind
│   ├── src/
│   │   ├── api/            # Fetch wrapper / API client
│   │   ├── pages/          # Login, Setup, Question, Feedback, Dashboard
│   │   ├── components/     # Reusable UI components
│   │   └── main.jsx        # React entry point
│   ├── index.html
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── docs/                   # Architecture notes & design docs
│   └── architecture.md
│
├── demo_data/              # Sample course material for scripts/seed_demo.py
├── scripts/                # Dev/ops helpers (seed_demo.py, …)
│
├── docker-compose.yml      # Orchestrates backend + db + chroma
├── .env.example            # Template for environment variables
├── .gitignore
└── README.md
```

---

## Setup Instructions

### Option A — Docker Compose (recommended)

```bash
# 1. Clone the repo
git clone <repo-url> querymind && cd querymind

# 2. Copy and edit environment file
cp .env.example .env
# Edit .env with your own secrets if needed

# 3. Start all services
docker-compose up --build

# Services will be available at:
#   Backend API  → http://localhost:8000
#   API Docs     → http://localhost:8000/docs
#   Frontend     → http://localhost:5173  (run separately, see Option B)
#   ChromaDB     → http://localhost:8001

# 4. Seed demo documents (one command; needs the API up, run from the repo root)
python scripts/seed_demo.py
```

> **Demo data:** `scripts/seed_demo.py` registers a demo account and uploads every
> file in `demo_data/` through the API, so question generation has material to
> ground on immediately. Name new files `<Subject>__<Topic>.md`
> (e.g. `OS__Deadlocks.md`).

### Option B — Manual / Local Development

#### Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy env file to backend root
cp ../.env.example .env
# Set POSTGRES_HOST=localhost in .env for local DB

# Run database migrations — Alembic is the single source of truth for the schema
# (the app no longer auto-creates tables on startup), so run this before first start
alembic upgrade head

# Start the development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy env
cp ../.env.example .env.local

# Start dev server
npm run dev
# → http://localhost:5173
```

For a complete local demo, start the backend before opening the frontend and
make sure `GEMINI_API_KEY` is set in `backend/.env`. The frontend defaults to
the real API for implemented domains. Mocking can be enabled per domain with
`VITE_MOCK_<DOMAIN>=true` when working offline; see
[`frontend/.env.example`](frontend/.env.example).

---

## Demo day (two repos)

The hardened demo uses **two checkouts**, not the legacy `frontend/` folder in
this repository:

```text
backend  D:\querymind            branch hardening
frontend D:\querymind-frontend   branch frontend-redesign
```

Fresh machine:

```powershell
# 1. Backend repo
cd D:\querymind
git checkout hardening
cp .env.example .env          # fill GEMINI_API_KEY for the live demo
docker compose up -d --build db chroma backend

# 2. Frontend repo (separate clone)
cd D:\querymind-frontend
git checkout frontend-redesign
cd frontend
npm install

# 3. One command starts BOTH repos from D:\querymind
cd D:\querymind
.\start-demo.ps1              # live LLM
.\start-demo.ps1 -Offline     # docker backend with OFFLINE_DEMO_MODE=true
```

`start-demo.ps1` refuses to start if either repo is on the wrong branch or if
ports **8000** or **5174** are already taken. It recreates only the `backend`
container, waits for `/health` to report `healthy`, starts Vite with
`strictPort` on 5174, and prints:

```text
Frontend: http://localhost:5174 (also http://127.0.0.1:5174)
Backend:  http://localhost:8000
```

Open `http://localhost:5174`, register, go to **Practice**, type a topic (use
**Deadlocks** for the bank-backed demo), leave **Adaptive** selected, generate,
answer well, and submit. The next question moves up one rung and the reason is
shown under the rung. Answer badly and the next question moves back down.

For an LLM-free dry run, stop the demo (`Stop-Process` on the printed frontend
PID; `docker compose stop backend`) then run `.\start-demo.ps1 -Offline`. The
script sets `OFFLINE_DEMO_MODE=true` and an empty `GEMINI_API_KEY` on the
**dockerised backend**; generation comes from the seeded bank and scoring uses
the deterministic provisional evaluator. No frontend mocks are used.

---

## Environment flags

Copy `.env.example` to `.env`. Never commit `.env`, backups, or API keys.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV`, `DEBUG`, `SECRET_KEY` | `development`, `true`, shipped demo key | Startup fails if `SECRET_KEY` is still the default while `DEBUG=false`. |
| `POSTGRES_*`, `DATABASE_URL` | repo defaults | PostgreSQL connection. Container service name is `db`. |
| `BACKEND_HOST`, `BACKEND_PORT` | `0.0.0.0`, `8000` | Uvicorn bind address. |
| `ALLOWED_ORIGINS` | 5174/5173/3000 on localhost **and** 127.0.0.1 | Exact browser origins allowed by CORS. The demo frontend is pinned to 5174. |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Frontend → backend base URL. |
| `VITE_USE_MOCKS`, `VITE_MOCK_*` | see `frontend/.env.example` | `start-demo.ps1` forces `VITE_USE_MOCKS=false`, `VITE_MOCK_QUESTIONS=false`, `VITE_MOCK_ATTEMPTS=false`. |
| `CHROMA_HOST`, `CHROMA_PORT` | `chroma`, `8001` on host / `8000` in compose | Remote Chroma endpoint. |
| `CHROMA_ALLOW_LOCAL_FALLBACK` | `false` | Local persistent Chroma is an explicit opt-in, never silent. |
| `CHROMA_CONNECT_TIMEOUT_SECONDS` | `2` | Per-attempt connect timeout. |
| `CHROMA_RETRY_ATTEMPTS`, `CHROMA_RETRY_BACKOFF_SECONDS` | `2`, `0.25` | Remote retry policy; failures are logged and memoized collection state is re-resolved. |
| `ANONYMIZED_TELEMETRY` | `FALSE` | Chroma product telemetry disabled. |
| `DB_CONNECT_TIMEOUT_SECONDS` | `5` | libpq connect timeout (integer seconds). |
| `DB_STATEMENT_TIMEOUT_SECONDS` | `5` | Postgres statement timeout. |
| `DB_POOL_RECYCLE_SECONDS` | `1800` | SQLAlchemy pool recycle. |
| `SQL_ECHO` | `false` | Log SQL statements without coupling to `DEBUG`. |
| `HEALTH_DB_TIMEOUT_SECONDS` | `5` | Database probe timeout (capped at 2s for the health endpoint). |
| `OFFLINE_DEMO_MODE` | `false` | Skip all LLM calls; use bank generation + provisional scoring. |
| `GENERATION_DEADLINE_SECONDS` | `35` | Hard deadline for one `/questions/generate` request. |
| `GENERATION_CALL_TIMEOUT_SECONDS` | `15` | Timeout for a single model call. |
| `GENERATION_MAX_ATTEMPTS` | `2` | Live generation attempts before cache/bank fallback. |
| `GENERATION_MAX_FALLBACK_MODELS` | `1` | Extra Gemini models tried on quota errors. |
| `LLM_*`, `WARMUP_ON_STARTUP` | see below | Model selection, quota fallback, and startup warm-up. |

Health endpoints:

- `GET /health` — per-component status (`database`, `chroma`, `llm`, `security`),
  `llm_configured`, `offline_demo_mode`; returns **503** when the DB is down.
- `GET /health/live` — process liveness only; no DB, Chroma, or LLM calls.

---

## Demo-day break/fix table

| If this breaks | What you see | Do this |
| --- | --- | --- |
| LLM down / quota exhausted | `/health` shows `llm` unavailable; generate stalls or returns an LLM error | Run `stop-process` on the frontend PID, `docker compose stop backend`, then `.\start-demo.ps1 -Offline`. Generation uses the seeded bank; scoring is provisional. |
| DB down | `/health` returns 503 within ~2–6s with `database.status=unavailable`; `/mastery/me` fails fast with a `request_id` | `docker compose start db`. Wait until `docker ps` says healthy. The backend recovers without a restart; re-run `/health`. |
| Chroma down | `/health` shows `chroma.status=unavailable`, `source=remote`; no silent local fallback | `docker compose start chroma`. Only set `CHROMA_ALLOW_LOCAL_FALLBACK=true` if intentionally running without the Chroma container. |
| Slow network / first generation slow | Generate takes up to ~35s | Keep one browser tab only; watch the progress panel. If the deadline expires, the backend serves cache/bank automatically. Confirm `source` in the question payload. |
| Port 8000 or 5174 in use | `start-demo.ps1` fails loudly with the owning PID | Stop that PID, or choose a different machine. Do not edit CORS by hand: 5174 is pinned in `vite.config.js` and in `ALLOWED_ORIGINS`. |
| Wrong branch | `start-demo.ps1` prints `expected 'hardening' / 'frontend-redesign'` | `git checkout` the expected branch in that repo. The script never merges or switches branches for you. |
| 500 with no correlation | Response JSON contains `code=INTERNAL_ERROR` and a `request_id`; the same id appears in `docker compose logs backend` | Search the logs for that `request_id`. |

---

## LLM configuration & resilience

All LLM settings live in `.env` (see `.env.example` for the full annotated list):

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Google AI Studio key (required for generation) |
| `LLM_MODEL` | `gemini-flash-lite-latest` | Primary model for question generation (a *lite* model — most free-tier quota) |
| `LLM_EVAL_MODEL` | *(inherits `LLM_MODEL`)* | Model used by the answer-evaluation judge |
| `LLM_FALLBACK_MODELS` | `gemini-3.5-flash-lite,gemini-3.1-flash-lite-preview` | Comma-separated models to try, **in order**, when the primary is rate-limited |
| `LLM_THINKING_LEVEL` | `low` | Gemini 3 thinking level (`minimal`/`low`/`medium`/`high`; `off` disables) |
| `LLM_THINKING_BUDGET` | *(unset)* | Gemini 2.5 thinking budget (tokens) |
| `LLM_MAX_OUTPUT_TOKENS` | `2048` | Output cap; thinking tokens count toward it (`0` = uncapped) |
| `LLM_TIMEOUT_SECONDS` | `45` | Hard per-call timeout |
| `LLM_MAX_CONCURRENCY` | `3` | Max simultaneous Gemini calls per process |
| `WARMUP_ON_STARTUP` | `true` | Pre-load embeddings/Chroma/schemas at startup so the first request is fast |

### Model fallback on quota errors

Free-tier Gemini keys are quota-limited per model (e.g. 20 requests/day/model).
With `LLM_FALLBACK_MODELS` set, a request that would fail because the primary
model is rate-limited keeps working:

```bash
# Try the primary, then these two, in order
LLM_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-3.1-flash-lite-preview
```

Only quota/availability errors trigger the fallback — a `429` /
`RESOURCE_EXHAUSTED`, or a `503` that persists after the built-in retries. Any
other error (bad request, malformed output) fails immediately as before. Each
attempt is logged (`LLM request served by … model`) so you can see which model
answered. If **every** model fails the API returns a clean, classified JSON
error rather than a stack trace — `503 LLM_QUOTA_EXHAUSTED` when every failure
was a rate limit, `503 LLM_UNAVAILABLE` otherwise (raw provider text is logged
server-side only, never sent to the client). Leaving the
variable empty keeps the original single-model behaviour.

---

## Production deployment

The supported deployment shape is a static Vite frontend plus a persistent
FastAPI service:

```text
Vercel frontend -> Render/Railway FastAPI -> managed PostgreSQL
                                      -> persistent Chroma or Chroma Cloud
                                      -> Gemini API
```

### Deploy the frontend to Vercel

Create a Vercel project from this repository with:

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Framework preset | `Vite` |
| Build command | `npm run build` |
| Output directory | `dist` |

Set `VITE_API_BASE_URL` to the public backend URL. The SPA fallback is already
configured in [`frontend/vercel.json`](frontend/vercel.json), so browser routes
such as `/practice` continue to work after a refresh. Use
[`frontend/.env.production.example`](frontend/.env.production.example) as the
environment-variable template.

### Deploy the backend

The repository includes a Render blueprint in [`render.yaml`](render.yaml).
It creates the FastAPI Docker service and a managed PostgreSQL database. Set
these values in the Render dashboard:

- `GEMINI_API_KEY`
- `ALLOWED_ORIGINS` to the exact Vercel URL, for example
  `https://querymind.vercel.app`
- `CHROMA_HOST` and `CHROMA_PORT` for Chroma Cloud or another persistent Chroma
  deployment

The backend container runs Alembic migrations before starting Uvicorn and
exposes `/health` for the platform health check. Keep Chroma on persistent
storage; an ephemeral vector-store container loses uploaded-note embeddings on
restart.

After deployment, seed the demo documents against the public API:

```bash
python scripts/seed_demo.py --base-url https://your-api.example.com
```

Finally, test registration, login, note upload, note-based generation,
internet-backed generation, practice submission, and the results page from the
Vercel URL. Never commit `.env` files or provider API keys.


## License

This project is licensed under the **MIT License**. See `LICENSE` for details.
