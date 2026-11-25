"""Health, startup and infra regression tests (item 4 + small items)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core import health as health_module
from app.core.config import settings
from app.db.session import engine
from app.main import create_app


@pytest.fixture(autouse=True)
def _fast_startup(monkeypatch):
    monkeypatch.setattr(settings, "warmup_on_startup", False)
    monkeypatch.setattr(settings, "chroma_retry_attempts", 1)
    monkeypatch.setattr(settings, "chroma_retry_backoff_seconds", 0.0)


def test_engine_uses_short_connect_timeout_and_pre_ping():
    assert engine.pool._pre_ping is True
    assert engine.echo is settings.sql_echo
    assert engine.pool._recycle == settings.db_pool_recycle_seconds


def test_health_has_legacy_fields_and_components(monkeypatch):
    monkeypatch.setattr(
        health_module, "check_chroma",
        lambda: {"status": "healthy", "source": "remote", "detail": "ok"},
    )
    with TestClient(create_app()) as client:
        response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert "llm_configured" in body
    assert set(body["components"]) == {"database", "chroma", "llm", "security"}


def test_health_db_down_returns_503(monkeypatch):
    monkeypatch.setattr(
        health_module, "check_database",
        lambda: {"status": "unavailable", "detail": "OperationalError", "latency_ms": 12.0},
    )
    monkeypatch.setattr(
        health_module, "check_chroma",
        lambda: {"status": "healthy", "source": "remote", "detail": "ok"},
    )
    with TestClient(create_app()) as client:
        response = client.get("/health")
    assert response.status_code == 503
    assert response.json()["status"] == "unhealthy"
    assert response.json()["components"]["database"]["status"] == "unavailable"


def test_health_live_never_touches_db(monkeypatch):
    def _must_not_run():
        raise AssertionError("liveness must not check the DB")

    monkeypatch.setattr(health_module, "check_database", _must_not_run)
    # No lifespan here: startup diagnostics may legitimately check the DB.
    client = TestClient(create_app())
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_startup_fails_on_default_secret_when_debug_false(monkeypatch):
    monkeypatch.setattr(settings, "secret_key", "changeme-supersecret-key-in-production")
    monkeypatch.setattr(settings, "debug", False)
    with pytest.raises(RuntimeError, match="SECRET_KEY must be changed"):
        health_module.startup_checks()


def test_unhandled_500_has_request_id():
    app = create_app()

    @app.get("/__boom")
    def boom():
        raise RuntimeError("kaboom")

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/__boom")
    assert response.status_code == 500
    body = response.json()
    assert body["code"] == "INTERNAL_ERROR"
    assert body["request_id"]
    assert response.headers["X-Request-ID"] == body["request_id"]


def test_database_outage_is_503_with_stable_code():
    from sqlalchemy.exc import OperationalError

    app = create_app()

    @app.get("/__db_down")
    def db_down():
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/__db_down")
    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "DB_UNAVAILABLE"
    assert body["request_id"]
    assert response.headers["X-Request-ID"] == body["request_id"]


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:5174", "http://127.0.0.1:5174"],
)
def test_demo_frontend_origins_pass_preflight(monkeypatch, origin):
    monkeypatch.setattr(
        settings,
        "allowed_origins",
        [
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
    )
    client = TestClient(create_app())  # no lifespan: CORS middleware only
    response = client.options(
        "/auth/register",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_chroma_remote_failure_is_not_silently_local(monkeypatch):
    from app.services import retrieval

    monkeypatch.setattr(settings, "chroma_allow_local_fallback", False)
    monkeypatch.setattr(settings, "chroma_retry_attempts", 1)

    class _Broken:
        def __init__(self, *args, **kwargs):
            raise OSError("connection refused")

    monkeypatch.setattr(retrieval.chromadb, "HttpClient", _Broken)
    with pytest.raises(RuntimeError, match="unreachable"):
        retrieval.get_chroma_client()
    status = retrieval.chroma_status()
    assert status["status"] == "unavailable"
    assert status["source"] == "remote"
