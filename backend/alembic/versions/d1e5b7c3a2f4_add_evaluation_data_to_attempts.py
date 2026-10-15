"""add evaluation_data to attempts

Adds ``attempts.evaluation_data`` — a nullable TEXT column holding the full
rubric evaluation JSON (per-criterion sub-scores, missing_points, strengths)
produced by the answer-evaluation stage. ``score`` and ``feedback`` keep the
overall score (0-1) and the human-readable feedback.

Revision ID: d1e5b7c3a2f4
Revises: c7a1f4e2b9d3
Create Date: 2026-10-15

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d1e5b7c3a2f4"
down_revision: str | None = "c7a1f4e2b9d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("attempts", sa.Column("evaluation_data", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("attempts", "evaluation_data")
