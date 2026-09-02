"""
QueryMind Backend — App Factory
================================
Creates and configures the FastAPI application instance.
All routers are registered here. CORS, lifespan events, and
global middleware are also defined in this file.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, questions, attempts, profile
from app.core.config import settings
from app.db.session import engine
from app.models import base  # noqa: F401  — triggers model registration


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    # On startup: nothing yet (Alembic handles migrations)
    yield
    # On shutdown: close connections, flush queues, etc.


def create_app() -> FastAPI:
    app = FastAPI(
        title="QueryMind API",
        description=(
            "AI-based adaptive question generation and answer "
            "evaluation platform — skeleton / stub version."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

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
    app.include_router(attempts.router,  prefix="/attempts",  tags=["Attempts"])
    app.include_router(profile.router,   prefix="/profile",   tags=["Profile"])

    @app.get("/", tags=["Health"])
    async def root():
        return {"status": "ok", "service": "QueryMind API", "version": "0.1.0"}

    @app.get("/health", tags=["Health"])
    async def health():
        return {"status": "healthy"}

    return app


app = create_app()
