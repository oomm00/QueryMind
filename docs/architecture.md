# QueryMind — Architecture Overview

> This document is a living reference. It describes the intended architecture at the scaffold stage. Update as modules are built out.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          User Browser                           │
│              React + Vite + Tailwind  (port 5173)               │
└─────────────────────────┬───────────────────────────────────────┘
                          │  HTTP / JSON
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend  (port 8000)                 │
│                                                                  │
│  /auth        → AuthService       (JWT, bcrypt)                  │
│  /questions   → QuestionService   (RAG → LLM)                    │
│  /attempts    → AttemptService    (LLM evaluator)                │
│  /profile     → ProfileService    (mastery aggregation)          │
└──────┬──────────────────┬─────────────────────────────────────── │
       │ SQLAlchemy ORM   │ ChromaDB HTTP client
       ▼                  ▼
┌────────────┐   ┌────────────────────┐
│ PostgreSQL │   │    ChromaDB         │
│   (port    │   │  (vector store,     │
│   5432)    │   │   port 8001)        │
└────────────┘   └────────────────────┘
```

---

## Component Breakdown

### Frontend (`/frontend`)

| Layer       | Technology              | Purpose                                |
|-------------|-------------------------|----------------------------------------|
| Framework   | React 18 + Vite         | SPA with fast HMR dev server           |
| Routing     | React Router v6         | Client-side page navigation            |
| Styling     | Tailwind CSS v3         | Utility-first responsive UI            |
| API Client  | `src/api/client.js`     | Fetch wrapper with auth + error handling|
| State       | React local state (M0)  | Context / Zustand to be added in M1    |

**Pages:**
- `/login` — Auth form (login / register)
- `/setup` — Preparation config (topic, Bloom level, difficulty)
- `/question` — Active question with timer
- `/feedback` — Score + AI feedback display
- `/dashboard` — Mastery bar charts, session history

---

### Backend (`/backend`)

```
app/
├── main.py          # App factory (create_app)
├── core/
│   └── config.py    # Pydantic-Settings — reads .env
├── api/
│   ├── auth.py      # POST /auth/register, POST /auth/login
│   ├── questions.py # POST /questions/generate
│   ├── attempts.py  # POST /attempts/submit
│   └── profile.py   # GET  /profile/{user_id}
├── models/
│   ├── base.py      # SQLAlchemy DeclarativeBase
│   └── models.py    # User, Document, Question, Attempt, KnowledgeProfile
├── schemas/
│   └── schemas.py   # Pydantic request/response schemas
├── services/
│   ├── auth_service.py
│   ├── question_service.py
│   ├── attempt_service.py
│   └── profile_service.py
└── db/
    └── session.py   # Engine + SessionLocal + get_db()
```

**Planned service internals (M2–M5):**

| Service            | Real Logic (post-stub)                                     |
|--------------------|-------------------------------------------------------------|
| `AuthService`      | bcrypt hash, JWT sign/verify, refresh tokens               |
| `QuestionService`  | Embed query → Chroma retrieval → LLM prompt → parse Q      |
| `AttemptService`   | Rubric prompt → LLM score → persist Attempt row            |
| `ProfileService`   | Aggregate Attempt rows → compute rolling mastery per topic  |

---

### Database Schema

```
users ─────────────── attempts ─────── questions
  │                      │
  └── knowledge_profiles │
                         └── documents (linked to questions via RAG)
```

All PKs are UUID v4. Created/updated timestamps use `server_default=func.now()`.

---

### Data Flow (End-to-End)

```
1. User submits Setup form
        │
        ▼
2. Frontend POST /questions/generate {topic, bloom_level, difficulty}
        │
        ▼
3. QuestionService:
   [STUB] return hardcoded question
   [REAL] retrieve relevant chunks from ChromaDB
        → build LLM prompt
        → call OpenAI / Gemini API
        → parse response → save Question row
        │
        ▼
4. Frontend renders question → user types answer → POST /attempts/submit
        │
        ▼
5. AttemptService:
   [STUB] return score=0.75, canned feedback
   [REAL] build evaluator prompt → call LLM → parse score → save Attempt
        │
        ▼
6. ProfileService updates KnowledgeProfile mastery_data (JSONB map)
        │
        ▼
7. Dashboard GET /profile/{user_id} → renders mastery bars
```

---

## Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend framework | FastAPI | Auto docs, async, Pydantic native |
| ORM | SQLAlchemy 2.x | Type-safe `mapped_column`, async support |
| Migrations | Alembic | First-class SQLAlchemy integration |
| Vector DB | ChromaDB | Easy local dev, HTTP client, open-source |
| Frontend build | Vite | Fast HMR, native ESM, minimal config |
| Auth | JWT (python-jose) | Stateless, standard, easy frontend integration |

---

## Open Questions / TODOs

- [ ] Choose LLM provider (OpenAI GPT-4o vs Gemini Flash vs local Ollama)
- [ ] Define Bloom level rubric scoring schema
- [ ] Decide on document ingestion format (PDF, DOCX, plain text)
- [ ] Authentication: sessions vs refresh-token rotation
- [ ] Mastery decay function — time-weighted rolling average?
- [ ] Rate limiting strategy for LLM calls
