"""add subject to questions

Adds the ``questions.subject`` column used by pre-delivery duplicate detection
(Stage 5), which compares generated questions against existing questions for the
same subject + topic.

Revision ID: c7a1f4e2b9d3
Revises: 1012241bab96
Create Date: 2026-10-15

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7a1f4e2b9d3"
down_revision: str | None = "1012241bab96"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("questions", sa.Column("subject", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("questions", "subject")
