"""Regression tests for the shared attempt core (item 2)."""

from __future__ import annotations

import math
import threading
import uuid
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.models import Attempt, MasteryRecord, Question, User
from app.services import attempt_service
from app.services.mastery_service import update_mastery
from app.services.score_utils import normalize_score

CANNED = {
    "scores": {"conceptual_correctness": 8, "completeness": 8, "technical_depth": 8},
    "overall_score": 80.0,
    "feedback": "ok",
    "missing_points": [],
    "strengths": [],
}


def _evaluator(*args, **kwargs):
    return dict(CANNED)


@pytest.fixture
def engine(tmp_path):
    url = f"sqlite:///{tmp_path / 'core.db'}"
    eng = create_engine(url, connect_args={"timeout": 10})

    @event.listens_for(eng, "connect")
    def _sqlite_pragmas(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA busy_timeout=10000")

    Base.metadata.create_all(bind=eng)
    return eng


@pytest.fixture
def session_factory(engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def seeded(session_factory):
    db = session_factory()
    user = User(id=uuid.uuid4(), email="c@example.com", hashed_password="x", is_active=True)
    question = Question(
        id=uuid.uuid4(),
        subject="OS",
        topic="Deadlocks",
        bloom_level="remember",
        difficulty="easy",
        question_text="What is a deadlock?",
        reference_answer="Circular wait.",
    )
    db.add_all([user, question])
    db.commit()
    uid, qid = user.id, question.id
    db.close()
    return uid, qid


def test_score_clamp_and_nan_rejection():
    assert normalize_score(-0.5) == 0.0
    assert normalize_score(1.5) == 1.0
    assert normalize_score("0.82") == pytest.approx(0.82)
    with pytest.raises(ValueError, match="finite"):
        normalize_score(float("nan"))
    with pytest.raises(ValueError, match="finite"):
        normalize_score(float("inf"))
    assert math.isnan(float("nan"))


def test_same_submission_id_counts_once(session_factory, seeded, monkeypatch):
    uid, qid = seeded
    monkeypatch.setattr(attempt_service, "evaluate_answer", _evaluator)
    db = session_factory()
    question = db.query(Question).filter(Question.id == qid).one()
    kwargs = dict(db=db, user_id=uid, question=question, answer_text="A deadlock is circular wait.",
                  submission_id="same-id")
    first = attempt_service.submit_attempt_core(**kwargs)
    second = attempt_service.submit_attempt_core(**kwargs)
    assert first["duplicate_submission"] is False
    assert second["duplicate_submission"] is True
    assert first["attempt_id"] == second["attempt_id"]
    db.expire_all()
    assert db.query(Attempt).count() == 1
    rec = db.query(MasteryRecord).one()
    assert rec.attempts_count == 1
    db.close()


def test_missing_submission_id_logs_warning(session_factory, seeded, monkeypatch, caplog):
    uid, qid = seeded
    monkeypatch.setattr(attempt_service, "evaluate_answer", _evaluator)
    db = session_factory()
    question = db.query(Question).filter(Question.id == qid).one()
    result = attempt_service.submit_attempt_core(
        db=db, user_id=uid, question=question, answer_text="Circular wait."
    )
    assert result["submission_id"].startswith("auto:")
    assert "submission_id missing" in caplog.text
    db.close()


def test_concurrent_first_time_mastery_insert_does_not_raise(session_factory, seeded):
    uid, _qid = seeded
    barrier = threading.Barrier(2)
    errors: list[str] = []

    def worker(i):
        db = session_factory()
        try:
            barrier.wait()
            update_mastery(uid, "OS", "Concurrency", 0.5 + 0.1 * i, "understand", "medium", db)
            db.commit()
        except Exception as exc:  # pragma: no cover - failure path
            db.rollback()
            errors.append(f"{type(exc).__name__}: {exc}")
        finally:
            db.close()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == []
    db = session_factory()
    rec = db.query(MasteryRecord).filter(MasteryRecord.topic == "Concurrency").one()
    assert rec.attempts_count == 2
    db.close()
