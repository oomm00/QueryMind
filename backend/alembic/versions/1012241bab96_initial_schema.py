"""initial_schema

Creates all QueryMind tables: users, documents, questions, attempts, knowledge_profiles.

Revision ID: 1012241bab96
Revises:
Create Date: 2026-09-02

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1012241bab96"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id",              postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email",           sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name",       sa.String(255), nullable=True),
        sa.Column("is_active",       sa.Boolean,     server_default=sa.text("true")),
        sa.Column("is_verified",     sa.Boolean,     server_default=sa.text("false")),
        sa.Column("created_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # ── documents ──────────────────────────────────────────────
    op.create_table(
        "documents",
        sa.Column("id",                 postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",            postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("filename",           sa.String(512), nullable=False),
        sa.Column("storage_path",       sa.String(1024), nullable=True),
        sa.Column("chroma_collection",  sa.String(255),  nullable=True),
        sa.Column("status",             sa.String(50),   server_default="pending"),
        sa.Column("created_at",         sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── questions ──────────────────────────────────────────────
    op.create_table(
        "questions",
        sa.Column("id",               postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("document_id",      postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("topic",            sa.String(512), nullable=False),
        sa.Column("bloom_level",      sa.String(50),  nullable=False),
        sa.Column("difficulty",       sa.String(50),  nullable=False),
        sa.Column("question_text",    sa.Text,        nullable=False),
        sa.Column("reference_answer", sa.Text,        nullable=True),
        sa.Column("created_at",       sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── attempts ───────────────────────────────────────────────
    op.create_table(
        "attempts",
        sa.Column("id",                  postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",             postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"),     nullable=False),
        sa.Column("question_id",         postgresql.UUID(as_uuid=True), sa.ForeignKey("questions.id"), nullable=False),
        sa.Column("user_answer",         sa.Text,    nullable=False),
        sa.Column("score",               sa.Float,   nullable=True),
        sa.Column("feedback",            sa.Text,    nullable=True),
        sa.Column("time_taken_seconds",  sa.Integer, nullable=True),
        sa.Column("created_at",          sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── knowledge_profiles ────────────────────────────────────
    op.create_table(
        "knowledge_profiles",
        sa.Column("id",             postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",        postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("mastery_data",   sa.Text,    nullable=True),
        sa.Column("total_attempts", sa.Integer, server_default="0"),
        sa.Column("average_score",  sa.Float,   server_default="0.0"),
        sa.Column("updated_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("knowledge_profiles")
    op.drop_table("attempts")
    op.drop_table("questions")
    op.drop_table("documents")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
