# 12 — Operating-systems concept mapping

> Verified against commit `c85de7d` on 2026-10-19.

## In plain words

QueryMind is a network service, so several OS concepts are visible directly:
processes, threads/event loops, blocking I/O, resource limits, timeouts, files,
containers, and process lifecycle. Other concepts such as page replacement are
only analogies and must not be overstated.

| Concept | Classification | Evidence |
|---|---|---|
| Uvicorn workers | Direct process model | [`docker-compose.yml`](../../docker-compose.yml) |
| Async event loop | Direct runtime mechanism | FastAPI/Uvicorn stack |
| LLM semaphore | Direct bounded synchronization | [`backend/app/core/config.py`](../../backend/app/core/config.py), LLM services |
| Thread/process blocking work | Direct service concern | ingestion/retrieval services |
| TTL/size cache | Direct cache; page replacement analogy only | [`backend/app/services/retrieval.py`](../../backend/app/services/retrieval.py) |
| Docker volume | Direct persistence boundary | [`docker-compose.yml`](../../docker-compose.yml) |
| HTTP between services | Direct IPC/network communication | Compose and deployment files |
| Retry/backoff/timeout | Direct contention/failure control | LLM services |

The retrieval cache is not virtual memory: it stores application results, not
pages, and its eviction semantics must be read from the implementation.
Containers provide process/filesystem/network isolation through Docker; the
repository does not itself implement a scheduler, kernel primitive, or signal
handler.

## Deep dive

`backend/Dockerfile` preloads the embedding model to trade image-build time and
image size for lower first-request latency. Compose starts PostgreSQL and Chroma
with health checks before the backend. These are lifecycle and resource
ordering controls, not guarantees that every external dependency is durable.

