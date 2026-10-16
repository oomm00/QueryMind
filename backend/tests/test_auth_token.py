"""
Tests — Form-based /auth/token (Swagger Authorize) & JSON /auth/login
====================================================================
Swagger's Authorize dialog (OAuth2PasswordBearer) POSTs
``application/x-www-form-urlencoded`` (``username``/``password``) to the scheme's
``tokenUrl``. These tests cover the form-based ``POST /auth/token`` endpoint and
confirm the existing JSON ``POST /auth/login`` contract is unchanged.

Unlike the other endpoint suites, ``get_current_user`` is intentionally **not**
overridden here, so the bearer token returned by ``/auth/token`` is validated
end-to-end against ``GET /auth/me``.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import get_db
from app.main import create_app
from app.models.base import Base
from app.models.models import User
from app.services.auth_service import get_password_hash

import app.models.models  # noqa: F401 — register models on Base.metadata


PASSWORD = "correct-horse-battery"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def user(db_session):
    u = User(
        id=uuid.uuid4(),
        email="swagger@example.com",
        hashed_password=get_password_hash(PASSWORD),
        full_name="Swagger User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def client(db_session):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    # NOTE: get_current_user is NOT overridden — the real bearer-token path runs.
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── POST /auth/token (form-encoded, OAuth2 password flow) ─────────────────────

def test_token_form_login_returns_working_access_token(client, user):
    resp = client.post(
        "/auth/token",
        data={"username": user.email, "password": PASSWORD},
    )
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["email"] == user.email
    assert body["access_token"]
    assert body["refresh_token"]

    # The token actually authenticates a protected endpoint.
    me = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200, me.text
    assert me.json()["email"] == user.email


def test_token_form_login_wrong_password_returns_401(client, user):
    resp = client.post(
        "/auth/token",
        data={"username": user.email, "password": "wrong-password"},
    )
    assert resp.status_code == 401


def test_token_form_login_unknown_user_returns_401(client):
    resp = client.post(
        "/auth/token",
        data={"username": "nobody@example.com", "password": PASSWORD},
    )
    assert resp.status_code == 401


# ── POST /auth/login (JSON) — unchanged contract ──────────────────────────────

def test_login_json_still_works(client, user):
    resp = client.post(
        "/auth/login",
        json={"email": user.email, "password": PASSWORD},
    )
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["access_token"]

    me = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == user.email


def test_login_json_wrong_password_returns_401(client, user):
    resp = client.post(
        "/auth/login",
        json={"email": user.email, "password": "wrong-password"},
    )
    assert resp.status_code == 401
