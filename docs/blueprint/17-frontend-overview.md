# 17 — Frontend overview

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

The frontend is a React/Vite SPA with routes for login, setup, practice,
feedback, dashboard, notes, history, analytics, weak areas, courses, and
settings. The API client injects the JWT and maps errors. Mock switches allow
offline content/profile surfaces while real auth and core practice calls remain
available.

## Technical detail

`frontend/src/App.jsx` and `navigation.js` define application navigation.
`AuthContext.jsx` hydrates `qm_token` through `/auth/me`, clears it on 401, and
stores the returned user ID. Endpoint modules under `frontend/src/api/endpoints`
call the backend through `apiFetch`
([`frontend/src/context/AuthContext.jsx`](../../frontend/src/context/AuthContext.jsx),
[`frontend/src/api/client.js`](../../frontend/src/api/client.js)).

The Vite production build is configured in `frontend/package.json`; SPA
fallback rewrites are in [`frontend/vercel.json`](../../frontend/vercel.json).
`VITE_MOCK_*` and `VITE_USE_MOCKS` are compile-time environment switches
([`frontend/src/api/mocks/config.js`](../../frontend/src/api/mocks/config.js)).

## Contract risks

The client assumes the configured `VITE_API_BASE_URL` is public and reachable.
An expired local token produces an initial `/auth/me` 401 and is cleared by the
provider. Some bundled catalog/content/profile defaults are intentionally
mocked; this should be distinguished from backend failure
([`frontend/.env.example`](../../frontend/.env.example)).

