"""
In-Memory Rate Limiter — QueryMind
===================================
A lightweight, thread-safe sliding-window rate limiter keyed by client IP.
Zero external dependencies, ideal for protecting authentication endpoints.
"""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock
from typing import Callable

from fastapi import Request

from app.core.exceptions import RateLimitExceededError


class InMemoryRateLimiter:
    """Sliding-window rate limiter per client IP."""

    def __init__(self, requests_limit: int, window_seconds: int) -> None:
        self.requests_limit = requests_limit
        self.window_seconds = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, request: Request) -> None:
        client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.time()
        window_start = now - self.window_seconds

        with self._lock:
            timestamps = [ts for ts in self._requests[client_ip] if ts > window_start]
            if len(timestamps) >= self.requests_limit:
                raise RateLimitExceededError(
                    f"Rate limit exceeded: maximum {self.requests_limit} requests "
                    f"per {self.window_seconds} seconds. Please wait before retrying."
                )
            timestamps.append(now)
            self._requests[client_ip] = timestamps


def create_rate_limiter(requests_limit: int, window_seconds: int) -> Callable[[Request], None]:
    """Factory creating a FastAPI dependency for rate limiting."""
    limiter = InMemoryRateLimiter(requests_limit, window_seconds)

    def dependency(request: Request) -> None:
        limiter.check(request)

    return dependency
