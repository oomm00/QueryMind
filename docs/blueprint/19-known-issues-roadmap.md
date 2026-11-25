# 19 — Known issues and roadmap

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

The system is functional but has operational dependencies that are easy to
miss: Render/Vercel settings live outside Git, vector persistence is not
defined by the Render blueprint, LLM calls are slow/quotable, and some
frontend analytics/content surfaces intentionally use bundled or mock data.

| Issue | Evidence | Likely consequence | Direction |
|---|---|---|---|
| No Chroma resource in Render blueprint | [`render.yaml`](../../render.yaml) | vectors may be lost/unavailable | hosted Chroma or pgvector |
| Synchronous upload | [`backend/app/api/documents.py`](../../backend/app/api/documents.py) | request timeouts on large files | async job/queue |
| Synchronous Gemini calls | generation/evaluation services | latency and quota failures | batch/streaming/provider policy |
| Two mastery stores | models and attempts route | projection drift | one source/projection repair |
| Browser token in localStorage | frontend client/context | XSS impact | hardened session strategy |
| Mock/default content switches | frontend env/config | UI can look healthier than API | explicit production flags |
| External deployment settings | Render/Vercel docs only | configuration drift | IaC plus deploy checks |

The supplied project brief also mentions non-existent-note citations,
intermittent uploads, dashboard gaps, and frequent failures. Those claims need
issue logs or reproducible traces; they are not asserted here as code facts.

## Roadmap

Prioritized improvements are durable vector storage, asynchronous ingestion,
question pooling/batched generation, hybrid retrieval/reranking, streaming
feedback, and repair/replay for derived mastery. Owners and severity require
team confirmation (“Needs input from Om”).

