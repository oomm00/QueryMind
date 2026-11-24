"""No repeated questions while a user/topic pool still has fresh rows (item 5)."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import create_app
from app.models.models import Question
from app.services.generation_fallback import (
    _bank_candidates,
    reset_served_for_tests,
    seed_bank,
    served_question_ids,
)


def test_thirty_requests_do_not_repeat_until_the_bank_pool_is_exhausted(monkeypatch):
    monkeypatch.setattr(settings, "offline_demo_mode", True)
    monkeypatch.setattr(settings, "warmup_on_startup", False)
    monkeypatch.setattr(settings, "chroma_retry_attempts", 1)
    monkeypatch.setattr(settings, "chroma_retry_backoff_seconds", 0.0)
    reset_served_for_tests()

    topic = "Deadlocks"
    with TestClient(create_app()) as client:
        reg = client.post(
            "/auth/register",
            json={"email": f"norepeat-{uuid.uuid4()}@example.com", "password": "norepeat-password"},
        )
        assert reg.status_code in (200, 201)
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
        user_id = client.get("/auth/me", headers=headers).json()["user_id"]

        ids: list[str] = []
        for _ in range(30):
            response = client.post(
                "/questions/generate",
                headers=headers,
                json={
                    "topic": topic,
                    "subject": "OS",
                    "bloom_level": "remember",
                    "difficulty": "easy",
                    "num_questions": 1,
                    "adaptive": False,
                },
            )
            assert response.status_code == 200, response.text
            question_id = response.json()["questions"][0]["question_id"]
            assert question_id
            ids.append(question_id)

    # A fresh topic has a large bank pool; 30 consecutive requests must all be
    # distinct and the registry must have tracked each served id.
    assert len(set(ids)) == 30
    assert len(served_question_ids(user_id, topic)) == 30


def test_adjacent_rung_is_borrowed_before_repeating():
    with SessionLocal() as db:
        seed_bank(db)
        topic_rows = (
            db.query(Question)
            .filter(Question.source == "bank", Question.topic == "Deadlocks")
            .all()
        )
        remember_ids = {row.id for row in topic_rows if row.bloom_level == "remember"}
        assert len(remember_ids) == 8

        after_target_exhausted = _bank_candidates(
            db,
            topic="Deadlocks",
            bloom_level="remember",
            excluded_texts=set(),
            served_ids=remember_ids,
        )
        assert after_target_exhausted
        assert after_target_exhausted[0].bloom_level == "understand"

        all_served = {row.id for row in topic_rows}
        exhausted = _bank_candidates(
            db,
            topic="Deadlocks",
            bloom_level="remember",
            excluded_texts=set(),
            served_ids=all_served,
        )
        assert exhausted  # allowed only after the whole topic pool is exhausted


def test_excluding_every_bank_text_still_returns_a_question():
    """A full batch must repeat rather than crash with an empty candidate list."""
    with SessionLocal() as db:
        seed_bank(db)
        topic_rows = (
            db.query(Question)
            .filter(Question.source == "bank", Question.topic == "Deadlocks")
            .all()
        )
        candidates = _bank_candidates(
            db,
            topic="Deadlocks",
            bloom_level="remember",
            excluded_texts={row.question_text for row in topic_rows},
            served_ids=set(),
        )
        assert candidates
