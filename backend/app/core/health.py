"""Component health checks for /health and startup diagnostics."""

from __future__ import annotations

import logging
import time
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db import address
from app.db.session import engine

logger = logging.getLogger("querymind.health")


def check_database() -> dict[str, Any]:
    """Run SELECT 1 against a short-lived, tightly bounded connection."""
    started = time.perf_counter()
    url = make_url(settings.database_url)
    timeout = max(0.5, min(2.0, settings.health_db_timeout_seconds))
    if url.get_backend_name() == "sqlite":
        probe_url = url
        probe_kwargs: dict = {}
    else:
        ip = address.current_ip()
        probe_url = url.set(host=ip) if ip else url
        probe_kwargs = {
            "connect_args": {
                "connect_timeout": int(timeout),
                "options": f"-c statement_timeout={int(timeout * 1000)}",
            }
        }
    probe_engine = create_engine(probe_url, poolclass=NullPool, **probe_kwargs)
    try:
        with probe_engine.connect() as conn:
            conn.execute(text("SELECT 1")).scalar()
        return {
            "status": "healthy",
            "detail": "SELECT 1 ok",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    except Exception as exc:
        address.note_failure()
        return {
            "status": "unavailable",
            "detail": type(exc).__name__,
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    finally:
        probe_engine.dispose()


def check_chroma() -> dict[str, Any]:
    from app.services.retrieval import chroma_status

    return chroma_status()


def check_llm() -> dict[str, Any]:
    configured = bool(settings.gemini_api_key.strip())
    if settings.offline_demo_mode:
        return {"status": "offline", "configured": configured, "detail": "OFFLINE_DEMO_MODE=true"}
    return {
        "status": "healthy" if configured else "unavailable",
        "configured": configured,
        "detail": "API key configured" if configured else "GEMINI_API_KEY is empty",
    }


def check_security() -> dict[str, Any]:
    default_secret = settings.secret_key == "changeme-supersecret-key-in-production"
    if default_secret and not settings.debug:
        status = "misconfigured"
    elif default_secret:
        status = "degraded"
    else:
        status = "healthy"
    return {"status": status, "default_secret": default_secret, "debug": settings.debug}


def startup_checks() -> dict[str, Any]:
    """Log every external dependency once at boot. Fail only on bad security."""
    checks = snapshot()
    for name, component in checks["components"].items():
        logger.info("startup check %s: %s", name, component)
    if settings.debug and settings.secret_key == "changeme-supersecret-key-in-production":
        logger.warning("SECRET_KEY is still the shipped default (allowed only in DEBUG mode)")
    if not settings.debug and settings.secret_key == "changeme-supersecret-key-in-production":
        raise RuntimeError("SECRET_KEY must be changed before DEBUG=false")
    logger.info(
        "startup mode: offline_demo_mode=%s, sql_echo=%s, chroma_local_fallback=%s",
        settings.offline_demo_mode,
        settings.sql_echo,
        settings.chroma_allow_local_fallback,
    )
    return checks


def snapshot() -> dict[str, Any]:
    """Full component snapshot plus the legacy top-level fields."""
    db = check_database()
    chroma = check_chroma()
    llm = check_llm()
    security = check_security()
    components = {"database": db, "chroma": chroma, "llm": llm, "security": security}
    overall = "healthy" if db["status"] == "healthy" else "unhealthy"
    if db["status"] != "healthy" and all(
        component["status"] in {"healthy", "degraded", "offline"}
        for name, component in components.items()
        if name != "database"
    ):
        overall = "unhealthy"
    return {
        "status": overall,
        "llm_configured": llm["configured"],
        "offline_demo_mode": settings.offline_demo_mode,
        "components": components,
    }
