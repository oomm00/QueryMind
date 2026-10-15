"""finalize schema with JSONB rubric storage and indexes

Revision ID: e2f6a8b1c4d5
Revises: d1e5b7c3a2f4
Create Date: 2026-10-15

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2f6a8b1c4d5"
down_revision: str | None = "e2a6c8d4b3f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── attempts ───────────────────────────────────────────────
    op.add_column(
        "attempts",
        sa.Column("criteria_scores", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    # ── questions ──────────────────────────────────────────────
    op.add_column("questions", sa.Column("question_type", sa.String(50), server_default="descriptive", nullable=True))
    op.add_column("questions", sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("questions", sa.Column("starter_code", sa.Text(), nullable=True))
    op.add_column("questions", sa.Column("test_cases", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("questions", sa.Column("source_chunk_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    try:
        op.create_index(
            "ix_questions_topic_bloom_difficulty",
            "questions",
            ["topic", "bloom_level", "difficulty"],
        )
    except Exception:
        pass

    # ── knowledge_profiles ────────────────────────────────────
    op.add_column("knowledge_profiles", sa.Column("topic", sa.String(512), nullable=True))
    op.add_column("knowledge_profiles", sa.Column("bloom_level", sa.String(50), nullable=True))
    op.add_column("knowledge_profiles", sa.Column("mastery_score", sa.Float(), server_default="0.0", nullable=True))
    op.add_column("knowledge_profiles", sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=True))

    try:
        op.create_index(
            "ix_knowledge_profile_user_topic_bloom",
            "knowledge_profiles",
            ["user_id", "topic", "bloom_level"],
        )
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_index("ix_knowledge_profile_user_topic_bloom", table_name="knowledge_profiles")
    except Exception:
        pass

    op.drop_column("knowledge_profiles", "attempt_count")
    op.drop_column("knowledge_profiles", "mastery_score")
    op.drop_column("knowledge_profiles", "bloom_level")
    op.drop_column("knowledge_profiles", "topic")

    try:
        op.drop_index("ix_questions_topic_bloom_difficulty", table_name="questions")
    except Exception:
        pass

    op.drop_column("questions", "source_chunk_ids")
    op.drop_column("questions", "test_cases")
    op.drop_column("questions", "starter_code")
    op.drop_column("questions", "options")
    op.drop_column("questions", "question_type")

    op.drop_column("attempts", "criteria_scores")
