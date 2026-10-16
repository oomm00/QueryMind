# QueryMind — Handover Notes

_Last updated: 2026-10-16_

This document hands the project to the next contributor/AI. It covers the current
state, how to run things, what was recently fixed, and the known issues/next steps.

---

## 1. What the project is

QueryMind is an AI-powered, adaptive learning platform:

- **Backend** — `backend/` — FastAPI + SQLAlchemy 2.0 + Alembic, with a RAG
  pipeline (ChromaDB retrieval) and Google Gemini for question generation and
  rubric-based answer evaluation.
- **Frontend** — `frontend/` — React (Vite) SPA. `frontend/src/api/adapter.js`
  is the API layer; `profile` data is consumed by `DashboardPage.jsx`.
- **Data stores**
  - SQLite for local dev: `backend/querymind.db` (gitignored).
  - ChromaDB for document chunks. `settings.chroma_host/port` default to the
    Docker service `chroma:8001`, but `app/services/retrieval.py` falls back to a
    local persistent client, which is what runs in dev.

---

## 2. Running it locally

Always use the project virtualenv's interpreter — the system `python` on PATH
(WindowsApps 3.11) lacks dependencies and uses a cp1252 stdout that crashes on
some characters.

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest -q                 # tests
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`q.bat` (repo root) launches backend + frontend together.

Frontend:

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173
```

---

## 3. Database / migrations

- SQLite dev DB: `backend/querymind.db` (gitignored via `*.db`).
- **Recreate the dev DB from scratch (preferred):**

  ```powershell
  cd backend
  Remove-Item querymind.db            # stop the server first
  .\venv\Scripts\python.exe -m alembic upgrade head
  ```

  `alembic upgrade head` now runs clean on an empty SQLite DB and produces a
  schema that matches the ORM exactly.

- **Do NOT** use `Base.metadata.create_all` + `alembic stamp head` to bootstrap
  the schema. `create_all` cannot alter tables that partially-applied migrations
  left behind, which silently produces schema drift (missing columns and stale
  constraints) while the version table claims "head".
- Single Alembic head: `f3b7d9c1a2e4`.

### Migration bugs fixed recently

1. `alembic/versions/e2f6a8b1c4d5_finalize_schema_jsonb_and_indexes.py` used
   `postgresql.JSONB` unconditionally, which **cannot compile on SQLite**, so
   `alembic upgrade head` aborted halfway on the dev DB. It now uses a portable
   type: `sa.JSON().with_variant(postgresql.JSONB(), "postgresql")` (JSON on
   SQLite, JSONB on Postgres), mirroring the ORM columns
   (`JSONB().with_variant(JSON, "sqlite")`).
2. `alembic/versions/1012241bab96_initial_schema.py` created
   `knowledge_profiles.user_id` with `unique=True`. The ORM (and
   `adaptive_service.update_mastery_profile`) store **one row per
   `(user_id, topic, bloom_level)`**, so the unique constraint rejected a user's
   second topic/bloom and caused a 500 on the second `POST /attempts/submit`.
   The constraint was removed to match the ORM.

---

## 4. Recent changes (this work session)

### `GET /profile/{user_id}` is now real (was a hardcoded stub)

- `backend/app/services/profile_service.py` — `build_profile(user_id, db)`:
  - `mastery_records` is the **source of truth** for mastery scores. Per-Bloom
    rows come from `mastery_records.bloom_breakdown`.
  - `attempts` (joined to `questions`) supply totals and per-`(topic, bloom)`
    attempt counts.
  - Empty state for a new user: `total_attempts=0`, `average_score=0.0`,
    `mastery_breakdown=[]` (no 404, no fake data).
  - Falls back to averaging attempt scores for `(topic, bloom)` pairs that have
    no `mastery_records` row yet.
- `backend/app/api/profile.py` — auth required; owner-only (403 when
  `user_id != current_user.id`), matching `GET /attempts/history/{user_id}`.
- `backend/app/schemas/schemas.py` — `ProfileResponse.stub` is now `False`.
- `backend/tests/test_profile_api.py` — 6 tests: 401, 403, empty state, real
  aggregation vs `mastery_records`, response shape, fallback path.

**Note:** the frontend averages the `mastery_breakdown` rows per topic
(`selectPerTopicAverages`), which is intentionally different from
`mastery_records.mastery_score` (a difficulty-weighted EMA). Both are surfaced:
`/profile` for the per-Bloom breakdown, `/mastery/me` for the EMA record.

Verify side by side: `/profile/{user_id}.mastery_breakdown` per-Bloom scores
should equal `/mastery/me[].bloom_breakdown`, and `total_attempts` should equal
`attempts_count`.

---

## 5. Testing

- `cd backend && .\venv\Scripts\python.exe -m pytest -q` → all tests green.
- Tests build an in-memory SQLite DB from `Base.metadata` (`create_all`), so they
  exercise the **ORM** schema, not the migrated schema. This is why the
  `knowledge_profiles` unique-constraint bug was invisible to the suite — keep
  that gap in mind. A useful future addition is a test that runs
  `alembic upgrade head` and compares the migrated schema against
  `Base.metadata`.

---

## 6. Known issues / next steps

- **LLM reliability:** Gemini calls go through `google.genai`. In this
  environment the endpoint is flaky — `503`/`429`/hangs are common, and the
  client sets **no request timeout**, so a stuck call blocks the worker
  indefinitely (`app/services/llm_utils.py` retries 5xx/429 but cannot interrupt
  a hang). Consider adding an explicit client timeout.
  `POST /questions/generate` returns **404** when retrieval finds no source
  chunks (by design) — upload a document for the subject/topic first.
- **Frontend working-tree changes** existed before this session
  (`frontend/package-lock.json`, `frontend/src/constants/bloomTaxonomy.js`,
  `frontend/src/index.css`, untracked `frontend/src/tailwind.config.js`). They
  are **uncommitted and not part of the backend work** — review before committing.
- `KnowledgeProfile` (per user/topic/bloom rows) and `MasteryRecord` (per
  user/subject/topic EMA) are two overlapping mastery stores; be deliberate about
  which one a feature should read/write.
- `app/api/attempts.py` calls both `adaptive_service.update_mastery_profile`
  (KnowledgeProfile) and `mastery_service.update_mastery` (MasteryRecord) on
  submit.

---

## 7. Conventions

- Do **not** write source files with shell redirection (`Set-Content`,
  `Add-Content`, `echo >`). On this setup that produced empty/BOM-corrupted files.
  Use the editor/file tools.
- Windows shell is **pwsh**: no `head`/`tail`/`grep`. Use `Select-Object`,
  `Select-String`.
- Keep the `ProfileResponse`/`TopicMastery` shape stable; the frontend depends on
  it. Do not modify `frontend/` as part of backend fixes.
