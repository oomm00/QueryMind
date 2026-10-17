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
import tempfile
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
INDEX_NAME = "ix_attempts_user_created"
#: The developer's real database — the one thing this suite must NEVER touch.
DEV_DB = (BACKEND_DIR / "querymind.db").resolve()


def _assert_safe_database_url(database_url: str) -> None:
    """Fail loudly unless ``database_url`` points at a fresh temp sqlite file.

    Guards against the whole class of accidents where an unset/incorrect
    ``DATABASE_URL`` sends ``alembic upgrade/downgrade`` at the real dev DB.
    """
    if not database_url.startswith("sqlite:///"):
        raise RuntimeError(
            f"refusing to run alembic against a non-temp sqlite URL: {database_url!r}"
        )
    db_path = Path(database_url[len("sqlite:///"):]).resolve()
    if db_path == DEV_DB:
        raise RuntimeError(f"refusing to run alembic against the dev DB: {DEV_DB}")
    tmp_root = Path(tempfile.gettempdir()).resolve()
    if db_path != tmp_root and tmp_root not in db_path.parents:
        raise RuntimeError(
            f"refusing to run alembic outside the temp dir ({tmp_root}): {db_path}"
        )


def _run_alembic(*args: str, database_url: str) -> subprocess.CompletedProcess:
    # Belt and braces: this both forces the temp URL and hard-fails on anything else.
    _assert_safe_database_url(database_url)
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


def test_dev_db_is_rejected_loudly():
    """A dev-DB URL must be refused, not silently accepted."""
    with pytest.raises(RuntimeError, match="dev DB"):
        _assert_safe_database_url("sqlite:///" + DEV_DB.as_posix())


def test_non_temp_db_is_rejected_loudly():
    """Any sqlite path outside the temp dir must be refused."""
    with pytest.raises(RuntimeError, match="outside the temp dir"):
        _assert_safe_database_url("sqlite:///" + BACKEND_DIR.as_posix() + "/not_the_dev.db")


def test_temp_db_is_accepted(tmp_path):
    """The throwaway URL the fixtures build must pass the guard."""
    _assert_safe_database_url(_sqlite_url(tmp_path / "ok.db"))
