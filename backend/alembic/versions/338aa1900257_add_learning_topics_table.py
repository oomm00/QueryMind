"""add_learning_topics_table

Revision ID: 338aa1900257
Revises: b2c3d4e5f6a7
Create Date: 2026-11-24 14:59:19.594508

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '338aa1900257'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('learning_topics',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('topic', sa.String(length=255), nullable=False),
        sa.Column('subject', sa.String(length=100), nullable=True),
        sa.Column('overview', sa.Text(), nullable=True),
        sa.Column('outline_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'topic', name='uq_learning_topics_user_topic')
    )
    op.create_index(op.f('ix_learning_topics_topic'), 'learning_topics', ['topic'], unique=False)
    op.create_index(op.f('ix_learning_topics_user_id'), 'learning_topics', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_learning_topics_user_id'), table_name='learning_topics')
    op.drop_index(op.f('ix_learning_topics_topic'), table_name='learning_topics')
    op.drop_table('learning_topics')
