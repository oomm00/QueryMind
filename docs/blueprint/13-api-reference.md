# 13 — API reference

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

FastAPI exposes OpenAPI at its standard documentation routes. Auth routes issue
tokens; documents manage uploads; questions generate; attempts evaluate and
list history; profile and mastery expose learner data; root and health support
operations.

| Method | Path | Auth | Source |
|---|---|---|---|
| POST | `/auth/register` | no | [`backend/app/api/auth.py`](../../backend/app/api/auth.py) |
| POST | `/auth/login` | no | same |
| POST | `/auth/token` | no | same |
| POST | `/auth/refresh` | no | same |
| GET | `/auth/me` | bearer | same |
| POST | `/documents/upload` | bearer | [`backend/app/api/documents.py`](../../backend/app/api/documents.py) |
| GET | `/documents` | bearer | same |
| GET | `/documents/topics` | bearer | same |
| POST | `/questions/generate` | bearer | [`backend/app/api/questions.py`](../../backend/app/api/questions.py) |
| POST | `/attempts/submit` | bearer | [`backend/app/api/attempts.py`](../../backend/app/api/attempts.py) |
| GET | `/attempts/history/{user_id}` | bearer/owner | same |
| GET | `/profile/{user_id}` | bearer/owner | [`backend/app/api/profile.py`](../../backend/app/api/profile.py) |
| GET | `/mastery/me` | bearer | [`backend/app/api/mastery.py`](../../backend/app/api/mastery.py) |
| GET | `/` and `/health` | no | [`backend/app/main.py`](../../backend/app/main.py) |

## Errors

Pydantic validation produces 422. Authentication is 401; owner mismatch is
403; missing database entities are 404. Domain exceptions return JSON with
`detail` and `code`, via the handlers in `main.py`. Concrete codes include
`LLM_NOT_CONFIGURED`, quota/unavailable LLM codes, duplicate/Bloom validation
codes, and upload validation codes where raised by the checked-out services.

The schemas in [`backend/app/schemas/schemas.py`](../../backend/app/schemas/schemas.py)
are the response-shape authority; the generated OpenAPI document is the easiest
way to inspect the complete field set.

