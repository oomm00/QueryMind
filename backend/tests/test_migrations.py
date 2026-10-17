"""
Tests — Alembic migrations & index coverage
===========================================
The application runs ``alembic upgrade head`` (and test stubs do the same), so the
migration chain — not ``Base.metadata.create_all`` — is what production SQLite /
PostgreSQL actually gets. These tests run the real chain against a throwaway
database and assert the performance indexes are present.

1. ``alembic upgrade head`` applies cleanly to a fresh SQLite database.
2. ``attempts`` gains the composite ``(user_id, created_at)`` index.
3. The index is dropped again by ``alembic downgrade -1`` (reversible).
4. The ORM declares the same index, so ``create_all`` and the migration agree.
"""

from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
INDEX_NAME = "ix_attempts_user_created"


def _run_alembic(*args: str, database_url: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "DATABASE_URL": database_url}
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )


def _attempt_indexes(db_path: Path) -> set[str]:
    con = sqlite3.connect(db_path)
    try:
        return {
            row[0]
            for row in con.execute(
                "select name from sqlite_master where type='index' and tbl_name='attempts'"
            )
        }
    finally:
        con.close()


def _sqlite_url(db_path: Path) -> str:
    return f"sqlite:///{db_path.as_posix()}"


@pytest.fixture
def migrated_db(tmp_path):
    """A fresh database upgraded to head; yields its path."""
    db_path = tmp_path / "mig.db"
    result = _run_alembic("upgrade", "head", database_url=_sqlite_url(db_path))
    assert result.returncode == 0, result.stderr
    return db_path


def test_upgrade_head_creates_attempt_history_index(migrated_db):
    assert INDEX_NAME in _attempt_indexes(migrated_db)


def test_downgrade_is_reversible(migrated_db):
    result = _run_alembic("downgrade", "-1", database_url=_sqlite_url(migrated_db))
    assert result.returncode == 0, result.stderr
    assert INDEX_NAME not in _attempt_indexes(migrated_db)


def test_orm_declares_the_same_attempt_index():
    """create_all (tests) and the migration must expose identical index coverage."""
    from app.models.models import Attempt

    index = next(
        (ix for ix in Attempt.__table__.indexes if ix.name == INDEX_NAME), None
    )
    assert index is not None, f"{INDEX_NAME} missing from the ORM metadata"
    assert [col.name for col in index.columns] == ["user_id", "created_at"]
