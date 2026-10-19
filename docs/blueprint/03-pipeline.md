# 03 — Real request pipeline

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

There is not a single documented twelve-stage function. The implemented
question path is a sequence of smaller stages: authenticate, resolve adaptive
targets, retrieve, construct a prompt, call Gemini, parse, validate,
optionally regenerate, persist, and return. Answer submission adds evaluation
and mastery updates.

## Generation stages

| Stage | Input/output | Source |
|---|---|---|
| 1. Authentication | JWT -> `User` | [`backend/app/api/deps.py`](../../backend/app/api/deps.py) |
| 2. Request validation | JSON -> `GenerateQuestionRequest` | [`backend/app/schemas/schemas.py`](../../backend/app/schemas/schemas.py) |
| 3. Adaptive selection | user/topic -> Bloom/difficulty | [`backend/app/services/mastery_service.py`](../../backend/app/services/mastery_service.py) |
| 4. Retrieval | filters -> context chunks | [`backend/app/services/retrieval.py`](../../backend/app/services/retrieval.py) |
| 5. Prompt/generation | context + target -> structured JSON | [`backend/app/services/generation_service.py`](../../backend/app/services/generation_service.py) |
| 6. Parsing | provider result -> `GeneratedQuestion` | [`backend/app/services/generation_service.py`](../../backend/app/services/generation_service.py) |
| 7. Validation | question/context/existing rows -> validation result | [`backend/app/services/validation_service.py`](../../backend/app/services/validation_service.py) |
| 8. Correction | failed result -> one retry | [`backend/app/api/questions.py`](../../backend/app/api/questions.py) |
| 9. Persistence | validated question -> `questions` row | [`backend/app/api/questions.py:_persist_question`](../../backend/app/api/questions.py) |
| 10. Response | row + generated object -> JSON | [`backend/app/api/questions.py`](../../backend/app/api/questions.py) |

Answering then evaluates with the LLM, computes/stores the score, commits the
attempt, and updates `knowledge_profiles` and `mastery_records`
([`backend/app/api/attempts.py`](../../backend/app/api/attempts.py)).

## Deep dive

Each stage has a distinct failure class: missing auth, Pydantic 422,
`NO_CONTEXT`, LLM configuration/quota/unavailable errors, validation/Bloom
422, database failure, or evaluation failure. The exact limits are controlled
by `GenerateQuestionRequest.num_questions` (1–10), upload size in
`ingestion_service.MAX_FILE_SIZE_BYTES`, and settings in
[`backend/app/core/config.py`](../../backend/app/core/config.py).

