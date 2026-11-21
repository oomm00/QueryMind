"""
QueryMind Backend — App Factory
================================
Creates and configures the FastAPI application instance.
All routers are registered here. CORS, lifespan events, and
global middleware are also defined in this file.
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
from app.core.health import startup_checks
from app.core.logging import RequestLoggingMiddleware, setup_logging
from app.core.warmup import warm_up
from app.db.session import SessionLocal, engine
from app.services.generation_fallback import seed_bank
from app.models import base  # noqa: F401  — triggers model registration

logger = logging.getLogger("querymind.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    startup_checks()
    if not settings.gemini_api_key.strip():
        logger.error(
            "GEMINI_API_KEY is not set — question generation and evaluation "
            "will return LLM_NOT_CONFIGURED."
        )
    if settings.warmup_on_startup:
        timings = warm_up()
        if timings:
            logger.info("Startup warm-up paid: %s", timings)
    try:
        base.Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"DB table creation warning: {e}")
    try:
        with SessionLocal() as db:
            added = seed_bank(db)
            if added:
                logger.info("Demo question bank seeded: %d rows", added)
    except Exception as e:
        logger.warning("Demo bank seeding skipped: %s", e)
    yield


def create_app() -> FastAPI:
    setup_logging(level="DEBUG" if settings.debug else "INFO")

    app = FastAPI(
        title="QueryMind API",
        description=(
            "AI-based adaptive question generation and answer "
            "evaluation platform — skeleton / stub version."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    @app.exception_handler(QueryMindError)
    async def querymind_error_handler(request: Request, exc: QueryMindError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code, "request_id": request_id},
            headers={"X-Request-ID": request_id} if request_id else None,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Request validation failed",
                "code": "VALIDATION_ERROR",
                "errors": exc.errors(),
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id} if request_id else None,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "code": f"HTTP_{exc.status_code}",
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id} if request_id else None,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        logger.exception(
            "Unhandled exception on %s %s (request_id=%s)",
            request.method, request.url.path, request_id,
        )
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "code": "INTERNAL_ERROR",
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id} if request_id else None,
        )

    app.add_middleware(RequestLoggingMiddleware)

    # ── CORS ──────────────────────────────────────────────
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

    @app.get("/health/live", tags=["Health"])
    async def health_live():
        """Process liveness only: no DB or Chroma dependency."""
        return {"status": "alive"}

    @app.get("/health", tags=["Health"])
    async def health():
        from app.core.health import snapshot

        body = snapshot()
        # A dead database is the one failure that makes the API unusable.
        return JSONResponse(
            status_code=503 if body["status"] == "unhealthy" else 200,
            content=body,
        )

    return app


app = create_app()
