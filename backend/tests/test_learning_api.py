from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.auth import get_current_user
from app.db.session import get_db
from app.main import create_app
from app.models.base import Base
from app.models.models import LearningTopic, User


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
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
def authed_client(db_session):
    user = User(
        id=uuid.uuid4(),
        email=f"learn_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app), user


def test_start_or_get_learning_topic(authed_client, db_session):
    client, user = authed_client
    resp = client.post("/learning/topics", json={"topic": "Race Conditions"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["topic"] == "Race Conditions"
    assert data["subject"] == "OS"
    assert len(data["subparts"]) >= 5
    assert len(data["resources"]) >= 2
    assert "progress" in data
    topic_id = data["id"]

    # Calling again returns the existing topic
    resp2 = client.post("/learning/topics", json={"topic": "Race Conditions"})
    assert resp2.status_code == 201
    assert resp2.json()["id"] == topic_id


def test_list_learning_topics(authed_client, db_session):
    client, user = authed_client
    # Create two topics
    client.post("/learning/topics", json={"topic": "Deadlocks"})
    client.post("/learning/topics", json={"topic": "Semaphores"})

    resp = client.get("/learning/topics")
    assert resp.status_code == 200
    topics = resp.json()
    assert len(topics) >= 2
    topic_names = [t["topic"] for t in topics]
    assert "Deadlocks" in topic_names
    assert "Semaphores" in topic_names


def test_get_learning_topic_detail(authed_client, db_session):
    client, user = authed_client
    resp_create = client.post("/learning/topics", json={"topic": "Transactions"})
    topic_id = resp_create.json()["id"]

    resp = client.get(f"/learning/topics/{topic_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == topic_id
    assert data["topic"] == "Transactions"
    assert len(data["subparts"]) >= 5
    assert data["subparts"][0]["status"] in {"completed", "current", "upcoming"}
    assert "search_templates" in data
