# 05 — Backend internals

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

The app factory wires routes and middleware. Services contain domain behaviour,
models describe storage, schemas describe HTTP data, and core modules provide
cross-cutting concerns.

## Module responsibilities

| Area | Important symbols |
|---|---|
| Factory | `create_app`, lifespan, exception handlers |
| Auth | `register_user`, `authenticate_user`, JWT encode/decode |
| Ingestion | `ingest_document`, extraction/chunking |
| Retrieval | Chroma client, metadata filters, cache |
| Generation | Gemini configuration, prompt and structured output |
| Evaluation | rubric judge and normalized result |
| Validation | duplicate, answerability, stem, cognitive alignment |
| Mastery | EMA records and adaptive recommendation |
| Core | `Settings`, typed exceptions, timing/logging, rate limiter |

Sources: [`backend/app/main.py`](../../backend/app/main.py),
[`backend/app/services`](../../backend/app/services),
[`backend/app/core`](../../backend/app/core).

## Deep dive

The route layer intentionally owns transaction sequencing where HTTP semantics
matter. For example, `attempts.py` commits the attempt before defensive mastery
updates. Broad defensive catches exist only around those post-commit mastery
updates; ordinary route errors pass through typed exception handlers
([`backend/app/api/attempts.py`](../../backend/app/api/attempts.py),
[`backend/app/core/exceptions.py`](../../backend/app/core/exceptions.py)).

