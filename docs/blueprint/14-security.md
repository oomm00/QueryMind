# 14 — Security

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

Passwords are hashed, sessions use signed JWT access/refresh tokens, protected
routes resolve the current user, and owner-only endpoints compare path IDs with
the token identity. Uploads and request schemas have validation limits. CORS is
configured from an environment variable.

## Controls

| Control | Implementation |
|---|---|
| Password hashing | `auth_service.py` |
| JWT signing/expiry | `auth_service.py` |
| Auth dependency | `api/deps.py` |
| Login/register rate limits | `api/auth.py` |
| Upload size/type checks | `api/documents.py`, ingestion service |
| Owner checks | attempts/profile routes |
| CORS | `main.py` and `Settings.cors_origins` |
| Error sanitization | `main.py` generic exception handler |
| Prompt injection handling | evaluation/generation service prompts |

Sources: [`backend/app/services/auth_service.py`](../../backend/app/services/auth_service.py),
[`backend/app/api/deps.py`](../../backend/app/api/deps.py),
[`backend/app/core/config.py`](../../backend/app/core/config.py).

## Gaps

The repository documents retrieval as shared while upload history is per-user;
this means uploaded content can influence another learner’s retrieval
([`backend/app/api/documents.py`](../../backend/app/api/documents.py)). Confirm
whether that is intended. Secrets in `.env` are not safe to expose; only
server-side environment variables should contain them. The frontend stores JWTs
in `localStorage`, which is convenient but increases the impact of an XSS
issue ([`frontend/src/api/client.js`](../../frontend/src/api/client.js)).

