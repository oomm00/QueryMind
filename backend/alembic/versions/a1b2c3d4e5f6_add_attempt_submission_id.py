"""add attempts.submission_id and its idempotency unique constraint

Additive only: existing rows keep submission_id NULL (Postgres/SQLite both allow
multiple NULLs in a UNIQUE constraint), so no data is modified or removed.

Revision ID: a1b2c3d4e5f6
Revises: b9c0d1e2f3a4
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "b9c0d1e2f3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # batch_alter_table keeps this additive migration usable on both Postgres
    # and the SQLite database used by the migration tests.
    with op.batch_alter_table("attempts") as batch_op:
        batch_op.add_column(sa.Column("submission_id", sa.String(length=128), nullable=True))
        batch_op.create_unique_constraint(
            "uq_attempt_user_question_submission",
            ["user_id", "question_id", "submission_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("attempts") as batch_op:
        batch_op.drop_constraint("uq_attempt_user_question_submission", type_="unique")
        batch_op.drop_column("submission_id")
