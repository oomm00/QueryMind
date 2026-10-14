"""
Custom Exception Classes — QueryMind
======================================
Application-level exceptions that carry an HTTP status code and a
machine-readable error code. The global exception handler registered
in main.py catches these and returns structured JSON responses.

Usage in services / routes:
    from app.core.exceptions import NotFoundError
    raise NotFoundError("Question not found")
"""

from __future__ import annotations


class QueryMindError(Exception):
    """Base exception for all QueryMind application errors.

    Subclasses set *status_code* and *code* as class-level defaults so
    callers only need to supply the human-readable *detail* / *message*.
    """

    status_code: int = 500
    code: str = "INTERNAL_ERROR"

    def __init__(
        self,
        detail: str = "An unexpected error occurred",
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        self.detail = detail
        self.message = detail
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code
        super().__init__(detail)


class NotFoundError(QueryMindError):
    """Raised when a requested resource does not exist."""

    status_code = 404
    code = "NOT_FOUND"

    def __init__(self, detail: str = "Resource not found") -> None:
        super().__init__(detail)


class AuthenticationError(QueryMindError):
    """Raised on invalid credentials, expired tokens, or unauthorized access."""

    status_code = 401
    code = "AUTHENTICATION_ERROR"

    def __init__(self, detail: str = "Authentication failed") -> None:
        super().__init__(detail)


class ValidationError(QueryMindError):
    """Raised when business-rule validation fails (beyond Pydantic schema checks)."""

    status_code = 422
    code = "VALIDATION_ERROR"

    def __init__(self, detail: str = "Validation error") -> None:
        super().__init__(detail)


class ConflictError(QueryMindError):
    """Raised on uniqueness violations (e.g. duplicate email registration)."""

    status_code = 409
    code = "CONFLICT"

    def __init__(self, detail: str = "Resource already exists") -> None:
        super().__init__(detail)
