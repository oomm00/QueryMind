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
from app.core.logging import RequestLoggingMiddleware, setup_logging
from app.core.warmup import warm_up
from app.db.session import engine
from app.models import base  # noqa: F401  — triggers model registration

logger = logging.getLogger("querymind.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
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
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": "Request validation failed", "code": "VALIDATION_ERROR", "errors": exc.errors()},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": f"HTTP_{exc.status_code}"},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "code": "INTERNAL_ERROR"},
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

    @app.get("/health", tags=["Health"])
    async def health():
        return {
            "status": "healthy",
            "llm_configured": bool(settings.gemini_api_key.strip()),
        }

    return app


app = create_app()
