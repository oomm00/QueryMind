# 21 — Appendices

> Verified against commit `c85de7d` on 2026-10-19.

## Glossary

- **RAG**: retrieval-augmented generation; retrieved chunks ground an LLM prompt.
- **Bloom level**: requested cognitive demand from remember through create.
- **Attempt**: one submitted learner answer and its evaluation.
- **Mastery record**: derived user/subject/topic learning state.
- **Chroma**: vector database used for semantic chunk retrieval.

## Cheat sheet

The authoritative tunables are in [`backend/app/core/config.py`](../../backend/app/core/config.py)
and [`.env.example`](../../.env.example). Important checked values include
10 MB upload limit, 1–10 requested questions, 45 second LLM timeout, three
concurrent LLM calls, 2,048 evaluation output tokens, 300 second retrieval
cache TTL, and 256 cache entries
([`backend/app/api/documents.py`](../../backend/app/api/documents.py),
[`backend/app/schemas/schemas.py`](../../backend/app/schemas/schemas.py),
[`backend/app/core/config.py`](../../backend/app/core/config.py)).

## Viva questions

1. Why FastAPI? It supplies typed validation and OpenAPI around Python services.
2. Why PostgreSQL? Relational ownership, constraints, indexes, and transactions.
3. Why Chroma? Semantic retrieval over uploaded chunks.
4. Why Gemini? Generation and rubric judging are external provider calls.
5. What does JWT protect? Authenticated route identity.
6. Why refresh tokens? To issue new access tokens without credentials.
7. Why validate after Gemini? Provider output is not trusted application data.
8. Why one retry? Bound cost and latency while correcting specific failures.
9. Why persist questions? Duplicate detection and attempt foreign keys.
10. Why two mastery stores? Compatibility between adaptive and profile paths.
11. What happens if mastery fails? The committed attempt remains.
12. What is shared? Current retrieval/document topic scope is shared.
13. What is private? Document listing and owner profile/history checks.
14. Why JSONB? Variable structured options, scores, and source IDs.
15. Why Alembic? Repeatable schema evolution.
16. Why warm-up? Avoid first-use model/download cost.
17. Why CPU Torch? Smaller/predictable container without CUDA.
18. Why cache retrieval? Avoid repeated embedding/query work.
19. Why timeout LLM? Bound external latency.
20. Why fallback models? Improve quota/availability resilience.
21. What is not guaranteed? External provider or vector-store availability.
22. Where is frontend hosted? Vercel according to repository deployment docs.
23. Where is API hosted? Render according to the blueprint.
24. What must Vercel know? `VITE_API_BASE_URL`.
25. What must Render know? secrets, CORS origin, database, Chroma endpoint.
26. Why CORS? Browser origin isolation requires explicit API permission.
27. Why owner checks? Prevent path-ID data disclosure.
28. What is an LLM judge limitation? Scores are probabilistic.
29. What is the biggest deployment gap? Persistent Chroma is not declared.
30. What is the safest next improvement? Make ingestion asynchronous and durable.

## Needs input from Om

Production Chroma provider, dashboard environment values, CI status and test
counts, owner/severity assignments, actual latency benchmarks, product decision
on shared retrieval, and the requested push destination are not verifiable from
the repository and must be supplied before being documented as facts.

