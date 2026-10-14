"""
Logging Configuration & Request-Logging Middleware — QueryMind
================================================================
- Configures Python stdlib logging with a structured JSON formatter.
- Provides ``RequestLoggingMiddleware`` that logs every request with:
  method, path, status_code, latency_ms, request_id.
- The generated ``request_id`` (UUID4) is attached to ``request.state.request_id``
  and echoed in the ``X-Request-ID`` response header.
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


# ── JSON Formatter ────────────────────────────────────────────────────────────

class JSONFormatter(logging.Formatter):
    """Emits each log record as a single-line JSON string.

    Fields: timestamp (ISO 8601 UTC), level, logger, message,
    plus correlation extras (request_id, method, path, status_code, latency_ms).
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include structured extras when attached to the LogRecord
        for key in ("request_id", "method", "path", "status_code", "latency_ms"):
            val = getattr(record, key, None)
            if val is not None:
                log_entry[key] = val

        # Format exception traceback if present
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


# ── Setup Helper ──────────────────────────────────────────────────────────────

def setup_logging(*, level: str = "INFO") -> None:
    """Configure the root logger with the JSON formatter on stdout."""
    root = logging.getLogger()
    root.setLevel(level)

    # Clear existing handlers to prevent duplicates
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(JSONFormatter())
    root.addHandler(console)

    # Reduce log noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


# ── Request-Logging Middleware ────────────────────────────────────────────────

logger = logging.getLogger("querymind.request")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """ASGI middleware to log HTTP request/response metrics and correlate via request_id."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.perf_counter()
        try:
            response: Response = await call_next(request)
        except Exception:
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.exception(
                "%s %s -> 500 (%.2fms)",
                request.method,
                request.url.path,
                latency_ms,
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": 500,
                    "latency_ms": latency_ms,
                },
            )
            raise

        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(
            "%s %s -> %s (%.2fms)",
            request.method,
            request.url.path,
            response.status_code,
            latency_ms,
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "latency_ms": latency_ms,
            },
        )

        response.headers["X-Request-ID"] = request_id
        return response
