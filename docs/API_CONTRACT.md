# QueryMind API Contract — what the backend actually does today

Audit date: 2026-10-18.
Audited build: backend repo `D:\querymind` at commit `9516654`, running as the Docker
container `querymind_backend` (`0.1.0`) with `querymind_db` (postgres:15) and
`querymind_chroma` (chromadb 0.5.0).

Every statement below is taken from one of three places, and each section says which:

* **code** — the backend source at `9516654`.
* **real call** — an HTTP request actually made against the running stack on
  2026-10-18; the JSON shown is verbatim except that JWTs are replaced with
  `<redacted-jwt>`.
* **not measured** / **not implemented** — explicitly marked.

Nothing here is inferred from the frontend's mocks or guessed.

---

## 0. How the numbers were produced

Base URL: `http://localhost:8000` (the container maps `0.0.0.0:8000->8000`).
Chroma is at `http://localhost:8001` (container port 8000).

A throwaway audit user was registered (`audit-001@example.com`,
`user_id 4b7a94a8-02cc-4d9e-bacb-ccc2dc592cf4`) and used for every authenticated
call. Timing is `Stopwatch` wall time around `Invoke-WebRequest`, i.e. client
latency including network — not server-side timing. The backend also emits
per-stage timings internally, but those were not collected here.

Helper used for every call (temp dir, outside any repo):

```powershell
. 'C:\Users\omsat\AppData\Local\Temp\opencode\qm-api.ps1'
$ctx = Qm-Ctx            # { token, refresh, user_id, ... } from a prior login
Qm-Print 'label' (Qm-Request -Method Get -Path '/auth/me' -Token $ctx.token)
```

Direct probes that do not need auth:

```powershell
Invoke-WebRequest -Uri 'http://localhost:8000/openapi.json' -OutFile openapi.json
docker exec querymind_db psql -U querymind -d querymind_db -c "select table_name, column_name, data_type from information_schema.columns where table_schema='public' order by table_name, ordinal_position;"
docker exec querymind_chroma curl -s -X POST "http://localhost:8000/api/v1/collections/999b9a1f-0a6d-443a-bce4-c4c58abd58c1/get" -H "Content-Type: application/json" -d '{"limit":40,"include":["metadatas"]}'
```

The stack was not modified: `git status --short` in `D:\querymind` is unchanged
(only the pre-existing untracked `q.bat`).

---

## 1. Endpoint status at a glance

| Endpoint | Status | Auth |
|---|---|---|
| `POST /auth/register` | implemented | public |
| `POST /auth/login` | implemented | public |
| `POST /auth/token` | implemented (not used by the frontend) | public |
| `POST /auth/refresh` | implemented | public |
| `GET /auth/me` | implemented | bearer |
| `POST /questions/generate` | implemented (partial — see §3) | bearer |
| `POST /questions/{id}/submit-answer` | implemented | bearer |
| `POST /documents/upload` | implemented (partial — no way to list/read back) | bearer |
| `POST /attempts/submit` | implemented | bearer |
| `GET /attempts/history/{user_id}` | implemented | bearer + owner |
| `GET /profile/{user_id}` | implemented | bearer + owner |
| `POST /profile/goal` | **not implemented** (`405`) | — |
| `GET /profile/goal/{user_id}` | **not implemented** (`404`) | — |
| `GET /next-question-params/{user_id}` | **not implemented** (`404`) | — |
| `GET /mastery/me` | implemented (not used by the frontend) | bearer |
| `GET /health`, `GET /` | implemented | public |
| `GET /catalog`, `GET /courses/{id}`, `GET /lessons/{id}`, `GET /concepts/{id}/graph`, `POST /lessons/{id}/complete` | **not implemented** (called by the frontend's content hooks when their mock flag is off — see §8) | — |

The runtime `openapi.json` lists exactly the first 15 routes above (plus
`/auth/token`); there is no route that serves courses, lessons, concepts or a
catalogue, and no goal or next-params route.

---

## 2. Endpoints, with real request/response

### 2.1 `POST /auth/register` — implemented, public

Request (real):

```json
{ "email": "audit-001@example.com", "password": "audit-password-123", "full_name": "Audit One" }
```

Response `201` (real; `access_token`/`refresh_token` redacted):

```json
{
  "access_token": "<redacted-jwt>",
  "refresh_token": "<redacted-jwt>",
  "token_type": "bearer",
  "user_id": "4b7a94a8-02cc-4d9e-bacb-ccc2dc592cf4",
  "email": "audit-001@example.com"
}
```

Latency: 590 ms (dominated by bcrypt hashing), 224 ms on the duplicate path.

Errors (all real):

| Status | `code` | `detail` |
|---|---|---|
| 422 | `VALIDATION_ERROR` | `Request validation failed` + `errors[]` (e.g. `string_too_short` on `password`, `ctx.min_length = 8`) |
| 409 | `CONFLICT` | `User with email 'audit-001@example.com' already exists` |
| 429 | `RATE_LIMIT_EXCEEDED` | `Rate limit exceeded: maximum 5 requests per 60 seconds. Please wait before retrying.` (in-memory sliding window, keyed by client IP) |

### 2.2 `POST /auth/login` — implemented, public

Request/response are the same `TokenResponse` shape as register; status `200`.
Latency: 383 ms (valid), 384 ms (wrong password), 28 ms (unknown email).

Errors (real): `401 AUTHENTICATION_ERROR` / `Invalid email or password` (identical
for wrong password and unknown email); `422 VALIDATION_ERROR` for a malformed body;
`429 RATE_LIMIT_EXCEEDED` (10 requests/minute).

### 2.3 `POST /auth/token` — implemented, not used by the frontend

Form-encoded (`application/x-www-form-urlencoded`, fields `username`, `password`,
`grant_type`). Returns the same `TokenResponse`; real latency 589 ms. This is the
URL named by `OAuth2PasswordBearer(tokenUrl="/auth/token")`. The frontend uses the
JSON `/auth/login` instead.

### 2.4 `POST /auth/refresh` — implemented, public

Request `{ "refresh_token": "<jwt>" }` → `200` `TokenResponse` (25 ms real).

Errors (real): `401 AUTHENTICATION_ERROR` / `Invalid or expired token: Not enough
segments` (garbage) and `Invalid token type: expected 'refresh'` (an access token
passed in).

### 2.5 `GET /auth/me` — implemented, bearer

Response `200` (real):

```json
{ "user_id": "4b7a94a8-02cc-4d9e-bacb-ccc2dc592cf4", "email": "audit-001@example.com",
  "full_name": "Audit One", "is_active": true, "is_verified": false,
  "created_at": "2026-10-18T12:30:26.893155+00:00" }
```

Errors (real): `401 HTTP_401` / `Not authenticated` with no header (and with
`?token=` in the query — the token is read from the `Authorization` header only);
`401 AUTHENTICATION_ERROR` / `Invalid or expired token: …` for a malformed header.

### 2.6 `POST /questions/generate` — implemented, bearer (partial)

See §3 for the full behaviour. Request used (real):

```json
{ "topic": "Deadlocks", "subject": "OS", "bloom_level": "remember",
  "difficulty": "medium", "question_type": "open", "num_questions": 1 }
```

Response `200` (real, one whole body):

```json
{
  "question": "State the four Coffman conditions that must hold simultaneously for a deadlock to occur.",
  "question_text": "State the four Coffman conditions that must hold simultaneously for a deadlock to occur.",
  "question_id": "640f1e60-24a0-475b-b580-1d4875ef7e85",
  "options": null, "starter_code": null, "test_cases": null,
  "correct_answer": "Mutual exclusion, hold and wait, no preemption, and circular wait.",
  "explanation": "According to the source material, deadlocks can occur only when all four Coffman conditions hold simultaneously: mutual exclusion, hold and wait, no preemption, and circular wait.",
  "bloom_level": "remember", "difficulty": "medium", "topic": "Deadlocks",
  "source_chunks": ["os_deadlocks.docx", "OS__Deadlocks.md"],
  "source_chunk_ids": ["os_deadlocks.docx", "OS__Deadlocks.md"],
  "adaptive": false, "adaptive_reason": null, "context_warning": null
}
```

### 2.7 `POST /questions/{question_id}/submit-answer` — implemented, bearer

Request `{ "answer": "…" }` → `200`:

```json
{ "attempt_id": "28b925e4-a915-40e8-9d60-428781d1272f",
  "question_id": "640f1e60-24a0-475b-b580-1d4875ef7e85",
  "scores": { "conceptual_correctness": 10, "correctness": 10, "completeness": 10,
              "technical_depth": 10, "depth_of_reasoning": 10,
              "example_application": 10, "clarity": 10 },
  "overall_score": 100.0,
  "feedback": "The student correctly and concisely stated all four Coffman conditions required for a deadlock to occur.",
  "missing_points": [], "strengths": ["Accurately listed all four Coffman conditions with precise terminology."],
  "reference_answer": "Mutual exclusion, hold and wait, no preemption, and circular wait." }
```

Latency: 1638 ms and 1765 ms. Note the sub-scores here are **0–10 integers**,
whereas `/attempts/submit` normalizes the same rubric to **0–1** (§4).

Errors (real): `404 NOT_FOUND` / `Question 00000000-…-000000000009 not found`;
`422 VALIDATION_ERROR` on an invalid `question_id` path or over-long answer.

### 2.8 `POST /attempts/submit` — implemented, bearer

Request (real, exactly what the frontend adapter sends):

```json
{ "question_id": "640f1e60-24a0-475b-b580-1d4875ef7e85",
  "user_id": "4b7a94a8-02cc-4d9e-bacb-ccc2dc592cf4",
  "user_answer": "Mutual exclusion, hold and wait, no preemption and circular wait. All four must hold at once, otherwise no deadlock can form.",
  "time_taken_seconds": 30 }
```

Response `200` (real):

```json
{ "attempt_id": "d6cff3f6-e7f6-433a-b11e-1c7491ea71a6",
  "question_id": "640f1e60-24a0-475b-b580-1d4875ef7e85",
  "score": 1.0, "overall_score": 100.0,
  "criteria_scores": { "conceptual_correctness": 1.0, "completeness": 1.0,
                       "technical_depth": 1.0, "example_application": 1.0, "clarity": 1.0 },
  "feedback": "The student correctly and clearly stated all four Coffman conditions required for a deadlock to occur.",
  "missing_points": [],
  "strengths": ["Accurately listed all four Coffman conditions.", "Correctly noted that they must hold simultaneously."],
  "correct_answer": "Mutual exclusion, hold and wait, no preemption, and circular wait.",
  "stub": false }
```

Note: the schema also accepts `answer_text` as an alias for `user_answer`, and
`user_id` in the body is optional (the authenticated user is used).

Errors (real):

| Status | `code` | `detail` |
|---|---|---|
| 404 | `NOT_FOUND` | `Question with ID 00000000-…-000000000009 not found.` |
| 422 | `VALIDATION_ERROR` | `Answer text must not be empty.` (whitespace-only answer) |
| 422 | `VALIDATION_ERROR` | `Request validation failed` + `uuid_parsing` for a malformed `question_id` |
| 401 | `HTTP_401` | `Not authenticated` |

### 2.9 `GET /attempts/history/{user_id}` — implemented, bearer + owner

Response `200` (real, newest first — 5 rows from the audit):

```json
[ { "attempt_id": "c9bc39f2-…", "question_id": "640f1e60-…", "topic": "Deadlocks",
    "bloom_level": "remember", "difficulty": "medium", "score": 1.0,
    "submitted_at": "2026-10-18T12:35:53.591643Z" }, … ]
```

`score` is 0–1. Errors (real): `403 FORBIDDEN` /
`You can only view your own attempt history`; `422 VALIDATION_ERROR` for a
non-UUID path; `401 HTTP_401` with no token.

### 2.10 `GET /profile/{user_id}` — implemented, bearer + owner

Response `200` (real, after 5 attempts):

```json
{ "user_id": "4b7a94a8-02cc-4d9e-bacb-ccc2dc592cf4",
  "total_attempts": 5, "average_score": 0.731,
  "mastery_breakdown": [ { "topic": "Deadlocks", "bloom_level": "remember",
                           "mastery_score": 0.8175, "attempts": 5 } ],
  "stub": false }
```

Reads `mastery_records` (authoritative) plus `attempts` for the counts
(`profile_service.build_profile`). A user with no data gets zeros and an empty
breakdown — never a 404. Errors (real): `403 FORBIDDEN` /
`You can only view your own profile`; `422` for a non-UUID path.

### 2.11 `POST /profile/goal` — **not implemented**

Real call: `405` `HTTP_405` / `Method Not Allowed`. The path `/profile/goal`
matches the `GET /profile/{user_id}` route shape, so the request is rejected by the
method check rather than returning a clean 404. There is no goal storage anywhere
in the schema (§6).

### 2.12 `GET /profile/goal/{user_id}` — **not implemented**

Real call: `404` `HTTP_404` / `Not Found`.

### 2.13 `GET /next-question-params/{user_id}` — **not implemented**

Real call: `404` `HTTP_404` / `Not Found`. (The equivalent logic exists in code as
`mastery_service.recommend_next` / `explain_recommendation`, but it is only reachable
through `POST /questions/generate` with `adaptive: true` — no route exposes it.)

### 2.14 `POST /documents/upload` — implemented, bearer (partial)

Multipart form: `file` (required), `subject`, `topic`, `source_type`
(`college` | `public`), `course` (optional).

Real request: an 11-line markdown file, `subject=OS`, `topic=Deadlocks`,
`source_type=college`. Response `200`:

```json
{ "document": "audit-upload-deadlocks.md", "filename": "audit-upload-deadlocks.md",
  "chunks_ingested": 1, "chunks_count": 1, "subject": "OS", "topic": "Deadlocks",
  "source_type": "college", "course": null, "status": "ready",
  "document_id": "bc994f3a-948c-4d64-a978-5d58647eda11" }
```

`document`/`filename` and `chunks_ingested`/`chunks_count` are the same value under
two names (filled in by a `model_post_init`). Re-uploading identical bytes returns
the **same `document_id`** and `chunks_count` (deterministic chunk ids = sha256 of
`source_doc + chunk_index + content`, upserted).

Errors (all real):

| Status | `code` | `detail` |
|---|---|---|
| 422 | `VALIDATION_ERROR` | `Unsupported file type '.exe'. Supported types: .docx, .md, .pdf, .txt` |
| 413 | `FILE_TOO_LARGE` | `File exceeds the maximum upload size of 10 MB` |
| 422 | `VALIDATION_ERROR` | `Invalid source_type 'other'. Must be one of: college, public` |
| 422 | `VALIDATION_ERROR` | `Request validation failed` + `missing` on `file` |
| 401 | `HTTP_401` | `Not authenticated` |

There is no endpoint to list documents or read one back, and no search endpoint.

### 2.15 `GET /mastery/me` — implemented, bearer

Response `200` (real):

```json
[ { "subject": "OS", "topic": "Deadlocks", "mastery_score": 0.8174995,
    "attempts_count": 5, "bloom_breakdown": { "remember": 0.8174995 },
    "last_updated": "2026-10-18T12:35:55.228811Z" } ]
```

Optional `subject` / `topic` query filters. Not used by the frontend.

### 2.16 `GET /health`, `GET /` — implemented, public

`GET /health` → `{"status":"healthy","llm_configured":true}` (253 ms cold, 9 ms warm;
the first call pays the embedding-model warm-up).
`GET /` → `{"status":"ok","service":"QueryMind API","version":"0.1.0"}`.

---

## 3. Generation

### 3.1 Accepted request fields (code + real calls)

| Field | Type | Required | Notes |
|---|---|---|---|
| `topic` | string | yes | free text; matched **exactly** against ingested metadata (§7) |
| `subject` | string | yes | free text; if no exact `(subject, topic)` match, the route retries **topic-only** |
| `bloom_level` | string | required unless `adaptive` | must be one of the 6 levels, else `422 VALIDATION_ERROR` |
| `difficulty` | string | required unless `adaptive` | `easy` \| `medium` \| `hard` |
| `question_type` | string | no (default `open`) | `mcq` \| `open` |
| `document_id` | uuid | no | **accepted but never read** — no grep hit in `api/questions.py` |
| `num_questions` | int 1–10 | no (default 1) | **accepted but never read** — the route always generates and returns exactly one question (the response model is a single `GeneratedQuestion`, not a list) |
| `adaptive` | bool | no | when true, `bloom_level`/`difficulty` are ignored and the mastery profile picks them (`recommend_next`: no history → `remember`/`easy`; low < 0.4 → recall; mid → `apply`/`medium`; high > 0.7 → `analyze`/`hard`, with a one-rung step-down if the last `STRUGGLE_LOOKBACK=2` scores were below 0.3) |

Validation errors are custom: `missing_bloom_level` / `missing_difficulty`
(`422 VALIDATION_ERROR`, `errors[].type`), not the plain Pydantic `missing`.

### 3.2 Response shape

Single `GeneratedQuestion` (above). Relevant to the frontend:

* `source_chunks` / `source_chunk_ids` contain only the **source document names**
  (e.g. `os_deadlocks.docx`). Chunk text and similarity scores are **not** returned.
* **Tier labels (`college` / `public`) are not returned.** The retrieval service
  computes the tier (and falls back to public when the top college similarity is
  below `SIMILARITY_THRESHOLD = 0.45`) but nothing on the response says which tier
  was used. *Not returned.*
* `context_warning` is defined for Apply+ thin-context cases; it was `null` on every
  call in this audit. *Not observed firing.*
* `adaptive_reason` is only populated when `adaptive=true`; the one adaptive call
  made here was rejected as a duplicate before returning, so an adaptive response
  body is **not measured**.

### 3.3 Duplicate detection

* Implementation (code): embedding cosine similarity using the vector store's own
  model (`all-MiniLM-L6-v2`, 384-d), comparing the new question against questions
  already persisted for the same `subject` + `topic`.
* On a failed validation the route regenerates **once** with a corrective note, then
  re-validates.
* If it is still a duplicate: `422 DUPLICATE_QUESTION`. Real example (verbatim):

```json
{ "detail": "The generated question was too similar to one that already exists for this topic (similarity 0.9519). Try a different topic or Bloom level.",
  "code": "DUPLICATE_QUESTION" }
```

The similarity value lives inside the human-readable `detail` string; there is no
structured field for it. This fired after a **second** question at the same
`(OS, Deadlocks)` + `remember`, and again on the `adaptive` call.

### 3.4 Bloom alignment gate

An LLM judge classifies the generated question's actual Bloom level and compares it
to the requested one with a tolerance map
`BLOOM_ALIGNMENT_TOLERANCE = "remember=1,understand=1,default=0"`. On failure the
route regenerates once; if it still fails, `422 BLOOM_ALIGNMENT_MISMATCH`:

```json
{ "detail": "The generated question was classified as Bloom level 'analyze' instead of the requested 'apply' (distance 1 > tolerance 0). Try a different Bloom level.",
  "code": "BLOOM_ALIGNMENT_MISMATCH" }
```

This fired on the `mcq` + `apply` attempt (real, 10220 ms — it paid for a generation
and a regeneration plus judges) and on one `understand` + `open` attempt (7278 ms).

### 3.5 Timeout, concurrency, retries, cache (code, `app/core/config.py` + `llm_utils.py` + `retrieval.py`)

* Per LLM call hard timeout: `LLM_CALL_TIMEOUT_SECONDS = settings.llm_timeout_seconds = 45.0`.
* Process-wide concurrency cap: `LLM_MAX_CONCURRENCY = 3` (`threading.BoundedSemaphore(3)`).
* Retries: `LLM_MAX_RETRIES = 3` after the initial attempt, exponential backoff
  `1s, 2s, 4s`, on `TRANSIENT_STATUS_CODES = {408,409,425,429,500,502,503,504}`
  plus timeouts/connection errors.
* Malformed-JSON retry: one extra call with a strict instruction
  (`call_json_with_retry`).
* Model fallback: `llm_fallback_models` is `[]` in the running config (the key is
  absent from `backend/.env`, so the code default applies) → no cross-model fallback
  in this deployment, even though `MODEL_FALLBACK_STATUS_CODES = {429,503}` exists.
* Retrieval cache: in-process, `RETRIEVAL_CACHE_TTL_SECONDS = 300`,
  `RETRIEVAL_CACHE_MAX_ENTRIES = 256`, LRU, keyed `(subject, topic, query_text)`;
  invalidated per `(subject, topic)` on upload. Not shared across processes/containers.
* Models/thinking (config, not visible in responses): `llm_model =
  gemini-flash-lite-latest`; `llm_eval_model = ""` → the judge inherits the same
  model; generation temperature 0.3, judge temperature 0.0; generation thinking
  `remember=low,understand=low,default=medium`; judge thinking `low`;
  `llm_gen_max_output_tokens = 8192`, `llm_max_output_tokens = 2048`. Which model
  actually served a given response was **not measured** (not exposed).

### 3.6 Latency by Bloom level (real calls)

Topic `OS`/`Deadlocks`, with `remember`/`understand` topped up on `OS`/`Concurrency`
to get three samples each. 20 real calls total (16 succeeded; 2 duplicates, 2
alignment mismatches). Wall time, ms:

| Bloom level | n | calls (ms) | median | worst |
|---|---|---|---|---|
| remember | 3 | 4273, 3157, 3244 | **3244** | 4273 |
| understand | 3 | 4493, 3883, 3563 | **3883** | 4493 |
| apply | 3 | 7105, 7230, 6252 | **7105** | 7230 |
| analyze | 2 | 25090, 7679 | **16385** | 25090 |
| evaluate | 3 | 7350, 5958, 7340 | **7340** | 7350 |
| create | 2 | 6755, 7282 | **7019** | 7282 |
| all | 16 | — | **6504** | 25090 |

The two low-recall levels are consistently ~2× faster than Apply+ (consistent with
the committed `remember=low,understand=low,default=medium` thinking default). The
25090 ms `analyze` call is a single outlier and nearly half the 45 s timeout.

---

## 4. Grading

* A free-text answer is graded by an **LLM judge**, not by string matching
  (`evaluation_service.evaluate_answer`). The student's answer is wrapped in
  delimiters and the judge is told to ignore rubric demands inside it (prompt-injection
  hardening).
* **The rubric is not passed in** — it is fixed in code. Current rubric
  (`FIVE_CRITERIA_RUBRIC_WEIGHTS`): `conceptual_correctness` 35 %,
  `completeness` 25 %, `technical_depth` 20 %, `example_application` 10 %,
  `clarity` 10 %. A legacy 4-criterion rubric (`correctness`/`completeness`/
  `depth_of_reasoning`/`clarity`) is still accepted.
* The judge returns per-criterion scores 0–10 plus `feedback`, `missing_points`,
  `strengths`. The **overall score is computed in code** (weighted sum × 10 → 0–100);
  the model's own arithmetic is ignored.
* Two different presentations of the same rubric:
  * `POST /attempts/submit` → `criteria_scores` divided by 10 (**0–1**), `score` 0–1,
    `overall_score` 0–100. Stored in `attempts.criteria_scores` (JSONB) as the raw 0–10.
  * `POST /questions/{id}/submit-answer` → `scores` as **0–10 integers**.
* Latency (real, `OS/Deadlocks` + `remember` question):

| Call | n | calls (ms) | median | worst |
|---|---|---|---|---|
| `POST /attempts/submit` | 4 | 1933, 18520, 1950, 1742 | **1942** | 18520 |
| `POST /questions/{id}/submit-answer` | 2 | 1638, 1765 | **1702** | 1765 |

A correct answer scored `overall_score = 100`; a one-line partial answer scored 65.5;
`idk` scored 0. The 18520 ms call is an outlier against a ~1.8 s typical.

Grading writes to two stores on every submit (§5.4).

---

## 5. Platform

### 5.1 CORS (config + real preflight)

`ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000` (code default matches;
`settings.cors_origins` splits the string). Real preflight from
`http://localhost:5173` → `200` with `Access-Control-Allow-Origin: http://localhost:5173`,
`Access-Control-Allow-Credentials: true`, all methods, `Access-Control-Max-Age: 600`.
From a disallowed origin (`http://evil.example`) → `400` and **no**
`Access-Control-Allow-Origin` header.

### 5.2 URL prefix

The API is served at the **root** — routers are mounted at `/auth`, `/questions`,
`/documents`, `/attempts`, `/profile`, `/mastery` with no `/api` prefix.
The Vite dev proxy forwards `/api` and **strips it**
(`rewrite: (path) => path.replace(/^\/api/, '')`), so `/api/auth/login` reaches
`/auth/login`. The backend must **not** receive `/api`.

In practice the proxy is unused: `client.js` defaults `BASE_URL` to the absolute
`http://localhost:8000`, and `.env.example` sets `VITE_API_BASE_URL=http://localhost:8000`,
so the browser calls the backend directly and relies on CORS.

Fragility worth noting: `vite.config.js` uses `process.env.VITE_API_BASE_URL` as the
proxy **target**. `.env` values are not in `process.env` at config-eval time, so the
target stays `http://localhost:8000`; but if someone exports
`VITE_API_BASE_URL=/api` in the shell, the proxy target becomes the relative `/api`
and breaks.

### 5.3 Tokens and ids

* JWT, `HS256`, signed with `SECRET_KEY`. Claims: `sub` (the user UUID as a string),
  `type` (`access` | `refresh`), `exp`, `iat`.
* Access token lifetime `60` minutes; refresh token `7` days.
* Sent as `Authorization: Bearer <jwt>`. The token is **not** accepted as a query
  parameter (real call: `?token=…` → `401 HTTP_401`).
* User ids are UUID4 (`users.id uuid`, default `uuid.uuid4`).

### 5.4 What the knowledge profile stores

Two separate stores are written on every submit; only one is ever read back.

**`mastery_records`** — one row per `(user_id, subject, topic)`. Authoritative, and
what `GET /profile/{user_id}` and `GET /mastery/me` return.
Update formula (`mastery_service.update_mastery`), recency-weighted EMA:

```
weighted  = clamp(score * difficulty_weight)          # difficulty_weight: easy 0.8, medium 1.0, hard 1.2
new       = clamp(EMA_ALPHA * weighted + (1 - EMA_ALPHA) * old)   # EMA_ALPHA = 0.3
```

The **first** attempt seeds the value directly (no history to average). A per-Bloom
breakdown is kept as JSON text (`bloom_breakdown = {"remember": 0.82, …}`).
Verified against real data: scores `1.0, 0.655, 0.0, 1.0, 1.0` at `medium` give
`1.0 → 0.3·0.655+0.7·1.0 = 0.8965 → 0.62755 → 0.739285 → 0.8174995`, which is exactly
the `0.8174995` returned by `GET /mastery/me`.

**`knowledge_profiles`** — one row per `(user_id, topic, bloom_level)`, written by
`adaptive_service.update_mastery_profile`. Update formula is a plain running mean:

```
mastery_score = (prev_mastery * (n - 1) + score) / n
```

**This table is never read by any endpoint** (verified: `KnowledgeProfile` appears
only in the model, the relationship and `adaptive_service` writes). It is a write-only
duplicate of the same signal.

---

## 6. Database — tables and columns that exist now

From the live database (`information_schema.columns`, 63 columns across 7 tables).

**`users`** — `id` uuid PK, `email` varchar unique, `hashed_password` varchar,
`full_name` varchar, `is_active` bool, `is_verified` bool, `created_at` timestamptz,
`updated_at` timestamptz.

**`documents`** — `id` uuid PK, `user_id` uuid FK, `filename` varchar,
`storage_path` varchar, `chroma_collection` varchar, `status` varchar, `created_at`,
`chunk_count` int, `course` varchar, `subject` varchar, `topic` varchar,
`source_type` varchar NOT NULL.

**`questions`** — `id` uuid PK, `document_id` uuid nullable, `topic` varchar NOT NULL,
`bloom_level` varchar NOT NULL, `difficulty` varchar NOT NULL, `question_text` text
NOT NULL, `reference_answer` text, `created_at`, `subject` varchar, `question_type`
varchar, `options` jsonb, `starter_code` text, `test_cases` jsonb,
`source_chunk_ids` jsonb.

**`attempts`** — `id` uuid PK, `user_id` uuid FK, `question_id` uuid FK,
`user_answer` text NOT NULL, `score` double nullable, `feedback` text,
`time_taken_seconds` int, `created_at`, `evaluation_data` text (legacy),
`criteria_scores` jsonb.

**`mastery_records`** — `id` uuid PK, `user_id` uuid FK, `subject` varchar NOT NULL,
`topic` varchar NOT NULL, `mastery_score` double, `attempts_count` int,
`bloom_breakdown` text, `last_updated` timestamptz.

**`knowledge_profiles`** — `id` uuid PK, `user_id` uuid FK, `mastery_data` text,
`total_attempts` int, `average_score` double, `updated_at`, `topic` varchar,
`bloom_level` varchar, `mastery_score` double, `attempt_count` int.

**`alembic_version`** — `version_num` varchar. Migrations, in order:
`1012241bab96` (initial) → `c7a1f4e2b9d3` (subject on questions) →
`d1e5b7c3a2f4` (evaluation data on attempts) → `e2a6c8d4b3f5` (chunk_count, documents
alignment) → `e2f6a8b1c4d5` (jsonb + indexes) → `f3b7d9c1a2e4` (mastery_records) →
`b9c0d1e2f3a4` (attempt-history index).

### What is missing (list only — nothing proposed)

For **courses**: no table at all (no id/slug, title, summary, level, hours,
prerequisites, ordering, published status).

For **topics**: no table. `questions.topic` and `documents.topic` are free-text
varchar; there is no canonical topic id, so "Deadlock" and "Deadlocks" are different
topics to the system, and nothing links a topic to a course.

For **concepts**: no table. No canonical concept id, no `subject` field on a concept,
no concept→topic/course link, no prerequisite edges, no link from `questions` to a
concept.

For **resources / lessons**: no table. No lesson id, title, body/blocks, ordering,
objectives, or checkpoint question, and no link to a concept.

For a **question bank with answer keys and rubrics**: `questions` exists but has no
`course_id`, no `concept_id`, no canonical `topic_id`, no rubric (criteria + weights
per question), no structured answer key beyond the single `reference_answer` text
(no per-criterion expected content), no difficulty enum constraint, no source/derivation
provenance, and no status/draft flag. `options` exists for MCQ.

Also absent: any storage for a **user goal** (`goal`, `target_date`) — required by the
three unimplemented profile routes — and any persisted adaptive next-params.

---

## 7. What failed or looks fragile

Real failures and their exact reproduction.

**1. Exact-match topic filtering → spurious `NO_CONTEXT`.** Requesting
`topic="Deadlock"` for material ingested as `topic="Deadlocks"` returned
`404 NO_CONTEXT` in 13–17 ms while 16 chunks were present:

```powershell
Qm-Print 'no topic match' (Qm-Request -Method Post -Path '/questions/generate' -Token $ctx.token `
  -Body (@{ topic='Deadlock'; subject='OS'; bloom_level='remember'; difficulty='medium' } | ConvertTo-Json -Compress))
# -> 404 {"detail":"No context found for topic 'Deadlock'…","code":"NO_CONTEXT"}
```

Retrieval compares the topic string by exact equality on the Chroma metadata. The
frontend's content ids (`memory-management`, `Deadlock`) are not free-text topics and
will not match. There is also no case-folding.

**2. The Bloom alignment gate rejects otherwise-valid MCQs.** A `mcq` + `apply` request
paid for a generation and a regeneration and still failed after 10220 ms
(`BLOOM_ALIGNMENT_MISMATCH`, classified `analyze` for requested `apply`). With
`default=0` tolerance, any classifier drift on an Apply+ MCQ is a user-visible failure.

**3. Latency outliers sit close to the timeout.** A single `analyze` generation took
25090 ms and one grading call took 18520 ms, against a 45 s per-call cap. A retry
(1 s + 2 s + 4 s backoff, each up to 45 s) can therefore push one request past a
minute.

**4. The duplicate gate blocks legitimate questions.** A second `(OS, Deadlocks)` +
`remember` question was rejected at similarity `0.9519` — inside a single topic the
space runs out fast, and the error carries the similarity only inside a prose string.

**5. A missing endpoint returns `405`, not `404`.** `POST /profile/goal` is swallowed
by the `/profile/{user_id}` route shape and answers `405 Method Not Allowed`, which is
misleading for a route that does not exist.

**6. Fields that are accepted and ignored.** `num_questions` (1–10) and `document_id`
are validated by the schema and then never read; the response is always exactly one
question. A client asking for `num_questions: 5` silently gets one.

**7. Two stores per submit, one never read.** Every attempt writes both
`mastery_records` (EMA, read) and `knowledge_profiles` (plain mean, never read).

**8. No read-back for ingest.** After `POST /documents/upload` there is no endpoint to
list documents, inspect a chunk count, or verify what is retrievable — the only
feedback is the upload response itself.

**9. LLM error codes carry no structured fields.** `DUPLICATE_QUESTION` and
`BLOOM_ALIGNMENT_MISMATCH` put their numbers (`similarity`, `distance`, `tolerance`)
inside the `detail` sentence, so a client cannot act on them programmatically.

**10. Two different score scales for the same rubric.** `criteria_scores` are 0–1 on
`/attempts/submit` and `scores` are 0–10 on `/questions/{id}/submit-answer`.

Error codes defined in `app/core/exceptions.py` but **not triggered** during this audit
(so their exact bodies are unverified): `LLM_QUOTA_EXHAUSTED` (503),
`LLM_UNAVAILABLE` (503), `LLM_NOT_CONFIGURED` (503), `INTERNAL_ERROR` (500).

### Complete error-code inventory (code + observed)

| Status | `code` | Observed? |
|---|---|---|
| 401 | `AUTHENTICATION_ERROR` | yes |
| 401 | `HTTP_401` | yes (framework, missing/invalid auth header) |
| 403 | `FORBIDDEN` | yes |
| 404 | `NOT_FOUND` | yes |
| 404 | `NO_CONTEXT` | yes |
| 404 | `HTTP_404` | yes (framework) |
| 405 | `HTTP_405` | yes (framework) |
| 409 | `CONFLICT` | yes |
| 413 | `FILE_TOO_LARGE` | yes |
| 422 | `VALIDATION_ERROR` | yes |
| 422 | `DUPLICATE_QUESTION` | yes |
| 422 | `BLOOM_ALIGNMENT_MISMATCH` | yes |
| 429 | `RATE_LIMIT_EXCEEDED` | yes |
| 500 | `INTERNAL_ERROR` | not triggered |
| 503 | `LLM_QUOTA_EXHAUSTED` | not triggered |
| 503 | `LLM_UNAVAILABLE` | not triggered |
| 503 | `LLM_NOT_CONFIGURED` | not triggered |

---

## 8. Endpoints the frontend calls that do not exist

The frontend's own gap list is `docs/BACKEND_GAPS.md`. The three the audit targets,
with the smallest shape that fits the current adapter/mocks:

**`POST /profile/goal`** — the frontend sends `{ ...payload, user_id }` where payload
is `{ goal, target_date }`, and its mock returns `{ user_id, goal, target_date }`.

```
Request:  { "user_id": "<uuid>", "goal": "string", "target_date": "YYYY-MM-DD" | null }
Response: { "user_id": "<uuid>", "goal": "string", "target_date": "YYYY-MM-DD" | null }
```

**`GET /profile/goal/{user_id}`** — frontend mock returns the same three fields.

```
Response: { "user_id": "<uuid>", "goal": "string" | null, "target_date": "YYYY-MM-DD" | null }
```

**`GET /next-question-params/{user_id}`** — frontend mock returns
`{ topic, bloom_level }`. The backend already computes this in code
(`mastery_service.recommend_next`), so the route only needs to expose it.

```
Response: { "topic": "string", "bloom_level": "remember|understand|apply|analyze|evaluate|create" }
```

Also called by frontend hooks when their mock flags are off (`isMocked('catalog')` /
`isMocked('content')`), and listed in `BACKEND_GAPS.md`: `GET /catalog`,
`GET /courses/{id}`, `GET /lessons/{id}`, `GET /concepts/{id}/graph`,
`POST /lessons/{id}/complete`. None exist on the backend today (real `404` for
`GET /courses`).

---

## 9. One-screen summary

### The frontend can switch from mock to real today

Flip the per-endpoint mock flag (`src/api/mocks/config.js` / `.env`) for:

| Flag | Endpoint(s) | Works against the live stack |
|---|---|---|
| `VITE_MOCK_AUTH` (already `false`) | register / login / me / refresh | yes |
| `VITE_MOCK_QUESTIONS` | `POST /questions/generate` | yes — real bodies above |
| `VITE_MOCK_ATTEMPTS` | `POST /attempts/submit` | yes |
| `VITE_MOCK_HISTORY` | `GET /attempts/history/{user_id}` | yes |
| `VITE_MOCK_PROFILE` | `GET /profile/{user_id}` | yes |
| `VITE_MOCK_DOCUMENTS` | `POST /documents/upload` | yes |

Caveat for all of them: real `topic`/`subject` strings must match the ingested
metadata exactly, or generation returns `404 NO_CONTEXT`.

### What needs a backend change first

* `POST /profile/goal`, `GET /profile/goal/{user_id}`, `GET /next-question-params/{user_id}`
  — do not exist; keep `VITE_MOCK_PROFILE_GOAL` / `VITE_MOCK_NEXT_PARAMS` on.
* `GET /catalog`, `GET /courses/{id}`, `GET /lessons/{id}`, `GET /concepts/{id}/graph`
  — do not exist; keep `VITE_MOCK_CATALOG` / `VITE_MOCK_CONTENT` on.
* Any course/topic/concept canonical identity: today both are free-text strings, so a
  backend that wants stable ids needs new tables and a many-to-many course↔topic model.

### The three riskiest gaps

1. **Free-text topic/subject matching is the single point of failure.** Exact equality
   against ingested metadata means a typo, a plural or a content id yields
   `NO_CONTEXT` instead of a question, and nothing surfaces which topics are usable.
   No catalogue/list route exists to discover them.
2. **No canonical content model.** Courses, topics and concepts are not entities
   anywhere in the database; questions link to no course/concept and carry no rubric
   or structured answer key. Every content-driven feature (the frontend's whole
   course/topic/lesson UI) is mock-only until those tables and routes exist.
3. **The generation path is fragile under load and drift.** A 0-tolerance Bloom gate
   for Apply+, a strict duplicate gate, 25 s observed generations against a 45 s cap
   with retries, and a hard concurrency cap of 3 per process mean user-visible failures
   (`BLOOM_ALIGNMENT_MISMATCH`, `DUPLICATE_QUESTION`, timeouts) are common rather than
   exceptional — and their numbers are only in prose, not structured fields.
