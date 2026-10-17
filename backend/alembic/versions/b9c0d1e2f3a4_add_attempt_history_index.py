"""add attempts(user_id, created_at) index for per-user history queries

The two hottest per-user read paths are:

* ``GET /attempts`` (``api/attempts.py``) —
  ``query(Attempt, Question).filter(Attempt.user_id == user_id)
    .order_by(Attempt.created_at.desc())``
* mastery recomputation (``services/mastery_service.py``) —
  ``query(Attempt.score).filter(Attempt.user_id == user_id, ...)
    .order_by(Attempt.created_at.desc(), Attempt.id.desc())``

Both filter by ``user_id`` and sort by ``created_at``, so a composite
``(user_id, created_at)`` index turns a full scan + sort into an index range
scan for every history/mastery read.

A ``mastery_records(user_id, subject, topic)`` index is intentionally NOT
created here: the table already carries
``UniqueConstraint("user_id", "subject", "topic",
name="uq_mastery_user_subject_topic")`` (see revision f3b7d9c1a2e4), and a
UNIQUE constraint is backed by a unique index on the exact same columns in both
SQLite and PostgreSQL. A second, non-unique index with identical columns would
be pure write/storage overhead with no query benefit, so it is omitted.

Revision ID: b9c0d1e2f3a4
Revises: f3b7d9c1a2e4
Create Date: 2026-10-17

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b9c0d1e2f3a4"
down_revision: str | None = "f3b7d9c1a2e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_attempts_user_created",
        "attempts",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_attempts_user_created", table_name="attempts")
