"""
Per-Stage Performance Instrumentation — QueryMind
=================================================
Lightweight wall-clock timers for the RAG pipeline stages
(``retrieve``, ``generate``, ``validate``, ``evaluate``).

How it works
------------
The request-logging middleware calls :func:`begin` once per request, which stores
a fresh accumulator (a plain ``dict``) plus the request id in
:mod:`contextvars`. API handlers wrap each pipeline stage in the :func:`stage`
context manager; on exit, the stage's elapsed milliseconds are *added* to the
accumulator (so a stage that runs twice in one request — e.g. the regeneration
retry — is reported as its total).

The middleware then emits a single structured INFO line per request::

    {"event": "stage_timing", "request_id": "...", "path": "/questions/generate",
     "latency_ms": 5120.4, "stages": {"retrieve": 12.4, "generate": 4830.1,
                                       "validate": 210.7}}

The accumulator is mutated **in place and never rebound**, so the copy of the
context that Starlette hands to a sync (threadpool) endpoint shares the very same
dict object as the middleware that created it — mutations stay visible across the
thread hop.

When no request scope is active (unit tests, direct service calls) :func:`stage`
is a harmless no-op measurement: it still times the block but discards the
result, so importing/using it never requires middleware.
"""

from __future__ import annotations

import contextvars
import logging
import time
from contextlib import contextmanager
from typing import Iterator, Optional

logger = logging.getLogger("querymind.timing")

_request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "qm_request_id", default=None
)
_stages_var: contextvars.ContextVar[Optional[dict]] = contextvars.ContextVar(
    "qm_stages", default=None
)


def begin(request_id: Optional[str]) -> dict:
    """Open a fresh timing scope for a request and return its accumulator."""
    acc: dict[str, float] = {}
    _request_id_var.set(request_id)
    _stages_var.set(acc)
    return acc


def get_request_id() -> Optional[str]:
    """Return the request id bound to the current context, if any."""
    return _request_id_var.get()


def current_stages() -> Optional[dict]:
    """Return the live accumulator for the current request (or ``None``)."""
    return _stages_var.get()


def _add(name: str, elapsed_ms: float) -> None:
    """Add ``elapsed_ms`` to ``name`` in the current accumulator (no-op if none)."""
    acc = _stages_var.get()
    if acc is None:
        return
    acc[name] = round(acc.get(name, 0.0) + elapsed_ms, 2)


@contextmanager
def stage(name: str) -> Iterator[None]:
    """Time a pipeline stage and accumulate it under ``name`` for this request."""
    start = time.perf_counter()
    try:
        yield
    finally:
        _add(name, (time.perf_counter() - start) * 1000.0)
