# QueryMind 

> **AI-based adaptive question generation and answer evaluation platform.**

QueryMind helps learners prepare for topics using AI-generated questions that adapt to their knowledge profile. It supports Bloom's taxonomy levels, custom difficulty settings, and provides instant feedback with mastery tracking across sessions.

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Folder Structure](#folder-structure)
3. [Setup Instructions](#setup-instructions)
4. [Development Workflow](#development-workflow)
5. [Team](#team)
6. [License](#license)

---

## Project Overview

QueryMind is a full-stack web application that:
- Accepts a **learning goal, topic, Bloom's level, and difficulty** from the user.
- Uses an LLM-powered **RAG pipeline** to generate contextually relevant questions from uploaded documents.
- **Evaluates free-text answers** and returns structured feedback.
- Maintains a **Knowledge Profile** per user, tracking mastery over time.

>  This commit is the **skeleton / scaffold only**. All API routes return stub/placeholder data. Real AI logic (RAG, LLM calls, adaptive scoring) will be layered in subsequent milestones.

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
answered. If **every** model is unavailable the API returns a clean
`502 LLM_MODELS_EXHAUSTED` JSON error rather than a stack trace. Leaving the
variable empty keeps the original single-model behaviour.

---


## License

This project is licensed under the **MIT License**. See `LICENSE` for details.
