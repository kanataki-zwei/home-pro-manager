"""add created_by to households

Revision ID: c3f9e2b1a7d4
Revises: a0857efd3031
Create Date: 2026-06-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c3f9e2b1a7d4'
down_revision = 'a0857efd3031'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('households', sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index('ix_households_created_by', 'households', ['created_by'])


def downgrade() -> None:
    op.drop_index('ix_households_created_by', 'households')
    op.drop_column('households', 'created_by')
