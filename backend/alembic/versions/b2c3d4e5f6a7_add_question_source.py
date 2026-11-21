"""add questions.source for demo-bank / cache / live provenance

Additive only: the new column is NOT NULL with a server default, so all existing
rows are backfilled as 'live' without rewriting application data.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("questions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "source",
                sa.String(length=20),
                nullable=False,
                server_default="live",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("questions") as batch_op:
        batch_op.drop_column("source")
