# QueryMind — Current Working State (Mentor Walkthrough)

> **Purpose of this document:** A plain-language description of what the system
> actually does right now, based directly on the code in this repository. It is
> written to be explained out loud to a mentor — not to sell the project.
>
> **Honest label:** This is Phase 1 — a fully wired, runnable skeleton. Every
> component of the intended pipeline exists as real code, but the AI-powered steps
> (embedding, ChromaDB retrieval, LLM generation, LLM evaluation) are replaced by
> stubs that return hardcoded placeholder values. No AI model is called anywhere in
> the current codebase.

---

## 1. What Is Currently Working

The system is a running full-stack web application. A user can open
`http://localhost:5173`, see a styled login page, click "Skip to Setup" (or enter
any credentials — the auth stub accepts anything), fill out a form choosing a topic,
a Bloom's taxonomy level, a difficulty level, and a number of questions, then press
"Start Study Session." The frontend immediately calls the backend API at
`POST /questions/generate`. The backend receives the request, validates the fields,
and returns a JSON response containing stub questions. The questions are displayed on
screen — one at a time, with a progress bar. The user can type an answer and press
"Submit Answer," which calls `POST /attempts/submit`. The backend responds
immediately with a hardcoded score of 0.75 (75%) and placeholder feedback text. The
feedback page shows the score as a coloured percentage bar, the user's own answer,
the hardcoded feedback string, and a hardcoded reference answer string. The user can
then navigate to the Dashboard, which calls `GET /profile/{user_id}` and displays a
fixed set of mastery bars also drawn from hardcoded data. Every step of the flow
works end-to-end — the HTTP calls succeed, the data travels correctly through the
stack, the UI renders — but the AI content in the middle is not yet real.

---

## 2. Step-by-Step: What Happens When You Ask for a Question

### Step 1 — The user fills out the Setup form (`SetupPage.jsx`)

The user enters:
- **Topic** — a free-text string (e.g. "Python decorators")
- **Bloom level** — one of six fixed options (see Section 4); defaults to `understand`
- **Difficulty** — `easy`, `medium`, or `hard`; defaults to `medium`
- **Number of questions** — integer 1–10; defaults to 3

When they press "Start Study Session," the form values are passed to the next page
via React Router's `location.state` — nothing is sent to the backend yet.

### Step 2 — The Question page fires the API call (`QuestionPage.jsx`)

On mount, `QuestionPage.jsx` calls `questionsApi.generate(...)` from
`src/api/client.js`. That function is:

```js
apiFetch('/questions/generate', { method: 'POST', body: JSON.stringify(payload) })
```

The payload body is:
```json
{
  "topic":         "<user's topic string>",
  "bloom_level":   "<selected level>",
  "difficulty":    "<selected difficulty>",
  "num_questions": <integer>
}
```

The `Authorization: Bearer <token>` header is attached if a token exists in
`localStorage` under the key `qm_token`. Because auth is a stub, this token is the
literal string `"stub.jwt.token.not.real"` — it is sent but the backend does not
validate it.

### Step 3 — FastAPI receives and validates the request (`backend/app/api/questions.py`)

The route `POST /questions/generate` is defined in `app/api/questions.py`. FastAPI
automatically parses the JSON body into a `GenerateQuestionRequest` Pydantic model
(`backend/app/schemas/schemas.py`). Pydantic validates:
- `topic` — non-empty string
- `bloom_level` — non-empty string (no enum constraint enforced by Pydantic; any
  string passes)
- `difficulty` — non-empty string (same — no enum enforcement at this layer)
- `document_id` — optional UUID, not sent by the frontend currently
- `num_questions` — integer, minimum 1, maximum 10

If validation fails, FastAPI returns a 422 automatically. If it passes, the route
calls `generate_questions_stub(...)`.

### Step 4 — The stub service returns hardcoded questions (`backend/app/services/question_service.py`)

`generate_questions_stub` in `question_service.py` does the following:

```python
sample_questions = [
    QuestionOut(
        id=uuid.uuid4(),
        topic=topic,
        bloom_level=bloom_level,
        difficulty=difficulty,
        question_text=(
            f"[STUB] Explain the concept of '{topic}' "
            f"at the '{bloom_level}' level with a '{difficulty}' difficulty example."
        ),
        reference_answer=(
            f"[STUB] A model answer for '{topic}' at Bloom's '{bloom_level}' level "
            "would be placed here by the LLM in the real implementation."
        ),
    )
    for _ in range(num_questions)
]
return GenerateQuestionResponse(questions=sample_questions, stub=True)
```

The question text is a Python f-string that simply echoes the topic, Bloom level,
and difficulty back into a template sentence. Every question in the list is
identical except for having a different `uuid.uuid4()` id. The `stub=True` flag on
the response exists so downstream code can detect that this is not a real generated
question.

**Nothing is looked up in a database. No embedding model is called. No ChromaDB
query is made. No LLM is called.**

### Step 5 — The frontend displays the question and the user types an answer (`QuestionPage.jsx`)

The response JSON `{ questions: [...], stub: true }` arrives. The page renders
`questions[0].question_text` — the stub f-string — in a card. The user types their
answer in a `<textarea>`. When they press "Submit Answer," the frontend navigates to
`/feedback` passing the `question.id`, the raw typed answer text, and time elapsed
(measured with `Date.now()`) via `location.state`. At this point no API call has
been made yet — the answer has not left the browser.

### Step 6 — The Feedback page sends the answer to the backend (`FeedbackPage.jsx`)

On mount, `FeedbackPage.jsx` calls `attemptsApi.submit(...)`:

```js
apiFetch('/attempts/submit', { method: 'POST', body: JSON.stringify({
  question_id:        state.questionId,    // UUID from the question response
  user_id:            userId,              // from localStorage, or the hardcoded fallback '00000000-0000-0000-0000-000000000001'
  user_answer:        state.userAnswer,    // the raw text the user typed
  time_taken_seconds: state.timeTaken,    // integer seconds
}) })
```

### Step 7 — The backend returns a hardcoded score and feedback (`backend/app/api/attempts.py` + `backend/app/services/attempt_service.py`)

The route `POST /attempts/submit` calls `submit_attempt_stub(...)` which returns:

```python
AttemptFeedback(
    attempt_id=uuid.uuid4(),
    score=0.75,          # hardcoded — always 75%
    feedback="[STUB] Your answer demonstrates a reasonable understanding of the topic. "
             "In the real implementation, the AI evaluator will provide specific, "
             "rubric-based feedback here.",
    correct_answer="[STUB] The reference answer will be retrieved from the question record "
                   "and shown here after submission.",
    stub=True,
)
```

The user's answer is received in the function signature but is not read, compared,
or stored. No database write happens. The score is always 0.75 regardless of what
the user typed.

### Step 8 — The Feedback page renders the result (`FeedbackPage.jsx`)

`scorePercent = Math.round(feedback.score * 100)` → always 75. The bar is coloured
yellow (the `>= 50` branch in `scorePercent >= 80 ? emerald : scorePercent >= 50 ?
yellow : red`). The stub feedback string and stub reference-answer string are
displayed verbatim.

### Step 9 — The Dashboard shows hardcoded mastery data (`DashboardPage.jsx` + `profile_service.py`)

`DashboardPage.jsx` calls `profileApi.get(userId)` → `GET /profile/{user_id}`.
`get_profile_stub(user_id)` returns the same fixed `STUB_MASTERY` list for any
`user_id`:

```python
STUB_MASTERY = [
    TopicMastery(topic="Python Basics",   bloom_level="remember",   mastery_score=0.90, attempts=12),
    TopicMastery(topic="Python Basics",   bloom_level="understand", mastery_score=0.78, attempts=8),
    TopicMastery(topic="Data Structures", bloom_level="apply",      mastery_score=0.55, attempts=5),
    TopicMastery(topic="Algorithms",      bloom_level="analyze",    mastery_score=0.40, attempts=3),
    TopicMastery(topic="System Design",   bloom_level="evaluate",   mastery_score=0.20, attempts=1),
]
```

Total attempts reported: 29. Average score reported: 57%. These numbers are
hardcoded strings — they do not reflect anything the user actually did in the
session.

---

## 3. Every Question Type Currently Supported

There is currently **one effective question type**: a free-text descriptive question
in the format:

> "Explain the concept of '{topic}' at the '{bloom_level}' level with a '{difficulty}' difficulty example."

The `GenerateQuestionRequest` schema includes an implicit type — there is no
`question_type` field in the schema or the service layer at this stage. MCQ
(multiple choice), true/false, short-answer, fill-in-the-blank — none of these are
wired. The `question_type` parameter does not exist anywhere in the current backend
API, data models, or schemas.

**Limitation:** Every request produces the same template sentence. The topic and
Bloom level are echoed back but do not affect the phrasing of the question in any
meaningful way.

---

## 4. Every Bloom's Level Currently Supported

All six Bloom's levels are listed in the `SetupPage.jsx` frontend and accepted as
valid string values by the API. They are echoed back into the stub question string
but do not change the question content. There is no verb-mapping table, no
level-specific prompt, and no LLM — because no LLM is called yet.

The six values the frontend sends (matching the `BLOOM_LEVELS` array in
`SetupPage.jsx`):

| Value       | Label in UI  | UI description             |
|-------------|--------------|----------------------------|
| `remember`  | Remember     | Recall facts               |
| `understand`| Understand   | Explain concepts           |
| `apply`     | Apply        | Use in new situations      |
| `analyze`   | Analyze      | Break down components      |
| `evaluate`  | Evaluate     | Make judgements            |
| `create`    | Create       | Produce new work           |

**What the code actually does with the Bloom level:** inserts it literally into the
f-string template. A verb-mapping table and level-specific prompt instructions are
planned for Phase 2 (when the LLM prompt is written) but do not exist in the current
code.

---

## 5. What Is NOT Implemented Yet (Phase 2 / Phase 3 scope)

The following items are listed in the code comments and architecture docs as planned
but contain zero implementation today:

### Document ingestion (no route exists yet)
- No `POST /documents/upload` endpoint exists.
- `pypdf` is listed in `requirements.txt` (installed) but is not imported or used
  anywhere in the application code.
- The `Document` ORM model (`documents` table) is defined and the table is created
  in the database, but no route or service writes to it.

### ChromaDB integration
- `chromadb==0.5.0` is listed in `requirements.txt` (installed) but is not imported
  or used anywhere in the application code.
- `CHROMA_HOST` and `CHROMA_PORT` are read from `.env` into `Settings` but are never
  referenced outside `config.py`.
- No collection is created. No vector is stored. No similarity search is performed.

### Embedding model
- `sentence-transformers==3.0.1` is listed in `requirements.txt` (installed) but is
  not imported or used anywhere in the application code.
- No model name has been chosen. No embedding is computed.

### LLM generation
- `openai==1.30.0` is listed in `requirements.txt` (installed) but is not imported
  or used anywhere in the application code.
- `OPENAI_API_KEY` is read from `.env` (currently set to the literal string
  `"sk-placeholder"`) but is never used.
- No prompt is written. No LLM API call is made.

### Answer evaluation / scoring
- `POST /attempts/submit` always returns `score=0.75` and a hardcoded feedback
  string. No evaluation logic, no rubric, no LLM evaluator.
- The `Attempt` ORM model and `attempts` table are defined but the stub service does
  not write any row to the database.

### Mastery profile computation
- `GET /profile/{user_id}` always returns the same five hardcoded mastery rows
  regardless of the user_id passed.
- The `KnowledgeProfile` and `knowledge_profiles` table are defined but nothing
  writes to them.

### Authentication (JWT / password hashing)
- `python-jose[cryptography]` and `passlib[bcrypt]` are installed but not used.
- `POST /auth/register` accepts any email/password, does not write a `User` row to
  the database, and returns a made-up UUID.
- `POST /auth/login` accepts any credentials, returns the hardcoded token string
  `"stub.jwt.token.not.real"`, and does not check a database.
- The `Authorization` header the frontend sends is not validated by any backend
  middleware.

### Adaptive next-question selection
- Not designed yet. There is no logic anywhere that chooses the next question based
  on performance history.

---

## 6. Known Limitations and Rough Edges

### The database exists but is mostly unused
The SQLite database file `backend/querymind.db` is created on server startup
(`Base.metadata.create_all` is called in `main.py`'s lifespan hook). All five tables
(`users`, `documents`, `questions`, `attempts`, `knowledge_profiles`) are created.
Nothing writes to any of them during normal usage. The database is structurally
correct but empty.

### SQLite instead of PostgreSQL
The project was built targeting PostgreSQL. During local setup today the PostgreSQL
service was not running, so `DATABASE_URL` in both `.env` files was changed to
`sqlite:///./querymind.db` and the `UUID` type in `models.py` was changed from
`sqlalchemy.dialects.postgresql.UUID` to the generic `sqlalchemy.Uuid` to avoid
dialect-specific errors. The Alembic migration file (`1012241bab96_initial_schema.py`)
still references `postgresql.UUID` directly — running `alembic upgrade head` against
a SQLite database will fail. The `create_all` approach used at startup is the
workaround being used instead.

### All stub responses include `stub: true`
`GenerateQuestionResponse`, `AttemptFeedback`, and `ProfileResponse` all have a
`stub: bool = True` field. The Dashboard UI shows a warning banner when this flag is
present. This is intentional scaffolding.

### No session management or auth guards
Any user can navigate directly to `/setup`, `/question`, `/feedback`, or `/dashboard`
without going through `/login`. The frontend router does not check for a token before
rendering any page. `localStorage.getItem('qm_user_id')` falls back to the hardcoded
UUID `"00000000-0000-0000-0000-000000000001"` if no login has happened.

### Duplicate question IDs across a multi-question session
When `num_questions=3` is requested, the stub generates three questions in a list
comprehension. Each gets a freshly generated `uuid.uuid4()`. The three questions
have different IDs but identical text. When the user cycles through questions
1 → 2 → 3, they see the same stub sentence three times.

### The `goal` field is collected but not used
The Setup form collects a "Learning Goal" text field (e.g. "Pass the AWS exam"). This
value is stored in the form state in `SetupPage.jsx` and passed through router state
to `QuestionPage.jsx`, but it is not sent in the `POST /questions/generate` body and
is not in the `GenerateQuestionRequest` schema. It will need to be added to the API
when real question generation is implemented.

### CORS is open to `localhost:5173` and `localhost:3000` only
`ALLOWED_ORIGINS` in `.env` is set to those two addresses. Requests from any other
origin will be blocked by the browser. This is fine for local development.

### The Alembic migration is out of sync with the current models
The migration file (`1012241bab96_initial_schema.py`) was written to create the
initial schema. Since then, the `Document` model gained `course`, `subject`, `topic`,
and `source_type` columns that are not in the migration. Running `alembic upgrade
head` on a fresh PostgreSQL database would create a schema missing those four columns.
This mismatch has no impact today because `alembic upgrade head` is not being run
(the SQLite workaround uses `create_all` instead), but it must be fixed before
PostgreSQL is used.
