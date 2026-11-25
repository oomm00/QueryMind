# 20 — Testing and quality

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

Backend tests cover auth, configuration, ingestion, retrieval, generation,
evaluation, migrations, APIs, reliability, and mastery. Frontend tests cover
API endpoints, content registries, practice flows, and UI components.

## Inventory

Backend examples: [`test_auth_token.py`](../../backend/tests/test_auth_token.py),
[`test_documents_api.py`](../../backend/tests/test_documents_api.py),
[`test_generation_service.py`](../../backend/tests/test_generation_service.py),
[`test_evaluation_service.py`](../../backend/tests/test_evaluation_service.py),
[`test_retrieval_cache.py`](../../backend/tests/test_retrieval_cache.py),
[`test_migrations.py`](../../backend/tests/test_migrations.py), and
[`test_reliability.py`](../../backend/tests/test_reliability.py).

Frontend examples: [`frontend/src/api/endpoints/questions.test.jsx`](../../frontend/src/api/endpoints/questions.test.jsx),
[`frontend/src/pages/practiceFlow.test.jsx`](../../frontend/src/pages/practiceFlow.test.jsx),
and content registry tests under [`frontend/src/content`](../../frontend/src/content).

## Quality boundaries

Tests use fakes/mocks for provider-dependent paths where appropriate. A full
local pytest run can fail before collection if the active interpreter lacks
requirements such as `pypdf`; that is an environment failure, not a passing
baseline. Use the backend virtual environment and a throwaway database URL for
migration tests; never point migration tests at the working `querymind.db`.

Needs input from Om: a captured `pytest --collect-only -q` count and CI result
were not available from the checked-out repository state.

