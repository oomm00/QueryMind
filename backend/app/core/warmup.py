"""
Startup Warm-Up — QueryMind
===========================
The first ``/questions/generate`` request would otherwise pay three one-time,
process-wide costs *on the user's clock*:

1. loading the sentence-transformer embedding model (ChromaDB's default
   ``all-MiniLM-L6-v2``) used by the validation stage, and
2. constructing the Chroma client and resolving the default collection
   (a network round-trip, or a blocking heartbeat timeout when Chroma is down),
3. building the ``google.genai`` structured-output schemas for generation and
   evaluation (the first build imports the SDK and walks a nested object graph).

:func:`warm_up` pays all three during FastAPI's lifespan startup instead, so the
first real request is as fast as any other. Every step is best-effort and
individually timed: a failure (e.g. Chroma unreachable) is logged and skipped so
it can never stop the application from starting, and the per-step timings are
logged at INFO for observability.
"""

from __future__ import annotations

import logging
import time
from typing import Callable

logger = logging.getLogger("querymind.warmup")


def _load_embedding_model() -> None:
    """Load (and run once) the validation stage's embedding model."""
    from app.services.validation_service import embed_texts

    embed_texts(["querymind warm-up"])


def _build_chroma_collection() -> None:
    """Construct the Chroma client, resolve the collection, and touch the index.

    Resolving the collection is not enough: the first real ``collection.query``
    also loads the HNSW index (hundreds of ms — see the cache-miss measurement),
    so we issue one throwaway query here to move that cost to startup as well.
    """
    from app.services.retrieval import get_default_collection

    collection = get_default_collection()
    try:
        collection.query(query_texts=["querymind warm-up"], n_results=1)
    except Exception as exc:  # noqa: BLE001 — touching the index is best-effort
        logger.debug("warm-up chroma query failed (non-fatal): %s", exc)


def _build_structured_schemas() -> None:
    """Build the memoized generation and evaluation structured-output schemas."""
    from app.services.evaluation_service import _evaluation_schema
    from app.services.generation_service import _generation_schema

    _generation_schema()
    _evaluation_schema()


#: Ordered warm-up steps. Embedding model first so the collecting/ingesting path
#: is ready before the (fallback-capable) Chroma step runs. Resolved at call time
#: (see :func:`_steps`) so tests can substitute individual steps.
def _steps() -> tuple[tuple[str, Callable[[], None]], ...]:
    return (
        ("embedding_model", _load_embedding_model),
        ("chroma_collection", _build_chroma_collection),
        ("structured_schemas", _build_structured_schemas),
    )


def warm_up() -> dict[str, float]:
    """Pre-load heavy per-process resources and return per-step timings (ms).

    Never raises: each step is individually guarded so a single failure does not
    abort startup.
    """
    timings: dict[str, float] = {}
    steps = _steps()
    for name, step in steps:
        start = time.perf_counter()
        try:
            step()
        except Exception as exc:  # noqa: BLE001 — startup must never be blocked
            logger.warning(
                "warm-up step %r failed after %.1f ms: %s",
                name, (time.perf_counter() - start) * 1000.0, exc,
            )
            continue
        timings[name] = round((time.perf_counter() - start) * 1000.0, 1)
        logger.info("warm-up step %r done in %.1f ms", name, timings[name])

    logger.info(
        "warm-up complete in %.1f ms across %d/%d steps (%s)",
        sum(timings.values()), len(timings), len(steps), timings,
    )
    return timings
