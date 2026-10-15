"""add chunk_count and align documents columns with the ORM

Adds ``documents.chunk_count`` (number of chunks embedded into ChromaDB for an
upload — used by the ingestion pipeline).

Also back-fills four ``documents`` columns that the ORM has always declared but
that the initial migration never created (``course``, ``subject``, ``topic``,
``source_type``). Without them, ``alembic upgrade head`` produces a schema the
ingestion insert cannot write to, so they are added here to keep migrations in
sync with ``app.models.models.Document``.

Revision ID: e2a6c8d4b3f5
Revises: d1e5b7c3a2f4
Create Date: 2026-10-15

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2a6c8d4b3f5"
down_revision: str | None = "d1e5b7c3a2f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # New column used by the ingestion pipeline.
    op.add_column("documents", sa.Column("chunk_count", sa.Integer(), nullable=True))

    # Columns declared by the ORM but missing from the initial schema migration.
    op.add_column("documents", sa.Column("course", sa.String(255), nullable=True))
    op.add_column("documents", sa.Column("subject", sa.String(255), nullable=True))
    op.add_column("documents", sa.Column("topic", sa.String(255), nullable=True))
    op.add_column(
        "documents",
        sa.Column("source_type", sa.String(50), nullable=False, server_default="college"),
    )


def downgrade() -> None:
    op.drop_column("documents", "source_type")
    op.drop_column("documents", "topic")
    op.drop_column("documents", "subject")
    op.drop_column("documents", "course")
    op.drop_column("documents", "chunk_count")
