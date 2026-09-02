# QueryMind 🧠

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

> ⚠️ This commit is the **skeleton / scaffold only**. All API routes return stub/placeholder data. Real AI logic (RAG, LLM calls, adaptive scoring) will be layered in subsequent milestones.

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
```

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

# Run database migrations
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

## Development Workflow

| Milestone | Description |
|-----------|-------------|
| M0 (this) | Skeleton scaffold — all stubs, stack wired end-to-end |
| M1        | Auth (JWT) + User management |
| M2        | Document ingestion + ChromaDB embeddings |
| M3        | LLM question generation (RAG pipeline) |
| M4        | Answer evaluation + scoring |
| M5        | Adaptive mastery tracking + Knowledge Profile |
| M6        | Polish, production hardening, CI/CD |

---

## Team

| Name | Role |
|------|------|
| _TBD_ | Project Lead |
| _TBD_ | Backend Engineer |
| _TBD_ | Frontend Engineer |
| _TBD_ | ML / AI Engineer |

---

## License

This project is licensed under the **MIT License**. See `LICENSE` for details.
