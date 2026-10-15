"""
QueryMind Backend — App Factory
================================
Creates and configures the FastAPI application instance.
All routers are registered here. CORS, lifespan events, structured error handling,
and request logging middleware are defined in this file.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import auth, questions, attempts, profile, documents, mastery
from app.core.config import settings
from app.core.exceptions import QueryMindError
from app.core.logging import RequestLoggingMiddleware, setup_logging
from app.db.session import engine
from app.models import base  # noqa: F401  — triggers model registration

logger = logging.getLogger("querymind.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    # On startup: ensure DB tables are created
    try:
        base.Base.metadata.create_all(bind=engine)
    except Exception as e:
        logger.warning("DB table creation warning: %s", e)
    yield
    # On shutdown: close connections, flush queues, etc.


def create_app() -> FastAPI:
    # ── Logging ──────────────────────────────────────────
    setup_logging(level="DEBUG" if settings.debug else "INFO")

    app = FastAPI(
        title="QueryMind API",
        description=(
            "AI-based adaptive question generation and answer "
            "evaluation platform."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    # ── Exception Handlers ───────────────────────────────

    @app.exception_handler(QueryMindError)
    async def querymind_error_handler(request: Request, exc: QueryMindError) -> JSONResponse:
        """Handle all custom QueryMind exceptions → structured JSON."""
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        """Handle Pydantic request-validation failures → structured JSON."""
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Request validation failed",
                "code": "VALIDATION_ERROR",
                "errors": exc.errors(),
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        """Handle standard HTTP exceptions (404, 405, etc.) → structured JSON."""
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": f"HTTP_{exc.status_code}"},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Catch-all for unexpected errors — log full traceback, return safe 500."""
        request_id = getattr(request.state, "request_id", None)
        logger.exception(
            "Unhandled exception on %s %s (request_id=%s)",
            request.method,
            request.url.path,
            request_id,
            extra={"request_id": request_id} if request_id else None,
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "code": "INTERNAL_ERROR"},
        )

    # ── Middleware (order matters: first added = outermost) ──

    app.add_middleware(RequestLoggingMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────
    app.include_router(auth.router,      prefix="/auth",      tags=["Auth"])
    app.include_router(questions.router, prefix="/questions", tags=["Questions"])
    app.include_router(documents.router, prefix="/documents", tags=["Documents"])
    app.include_router(attempts.router,  prefix="/attempts",  tags=["Attempts"])
    app.include_router(profile.router,   prefix="/profile",   tags=["Profile"])
    app.include_router(mastery.router,   prefix="/mastery",   tags=["Mastery"])

    @app.get("/", tags=["Health"])
    async def root():
        return {"status": "ok", "service": "QueryMind API", "version": "0.1.0"}

    @app.get("/health", tags=["Health"])
    async def health():
        return {"status": "healthy"}

    return app


app = create_app()
