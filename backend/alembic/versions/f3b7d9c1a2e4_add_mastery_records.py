"""add mastery_records for adaptive mastery profiling

Creates ``mastery_records``: one row per ``(user_id, subject, topic)`` holding the
exponential-moving-average mastery score, an attempt counter, a JSON per-Bloom
breakdown, and a last-updated timestamp. Drives adaptive next-question selection
(pipeline Stage 10 & 11).

This is a NEW table; the pre-existing ``knowledge_profiles`` table (one row per
user, JSON blob) is left untouched.

Revision ID: f3b7d9c1a2e4
Revises: e2f6a8b1c4d5
Create Date: 2026-10-15

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3b7d9c1a2e4"
down_revision: str | None = "e2f6a8b1c4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mastery_records",
        sa.Column("id",              postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",         postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("subject",         sa.String(255), nullable=False),
        sa.Column("topic",           sa.String(512), nullable=False),
        sa.Column("mastery_score",   sa.Float,       server_default="0.0"),
        sa.Column("attempts_count",  sa.Integer,     server_default="0"),
        sa.Column("bloom_breakdown", sa.Text,        nullable=True),
        sa.Column("last_updated",    sa.DateTime(timezone=True), server_default=sa.func.now()),
        # One record per (user, subject, topic); also serves as the composite index.
        sa.UniqueConstraint("user_id", "subject", "topic", name="uq_mastery_user_subject_topic"),
    )
    op.create_index("ix_mastery_records_user_id", "mastery_records", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_mastery_records_user_id", table_name="mastery_records")
    op.drop_table("mastery_records")
