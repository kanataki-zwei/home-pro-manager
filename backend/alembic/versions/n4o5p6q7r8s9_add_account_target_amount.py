"""add_account_target_amount

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-09-16

"""
from alembic import op
import sqlalchemy as sa

revision = 'n4o5p6q7r8s9'
down_revision = 'm3n4o5p6q7r8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('accounts', sa.Column('target_amount', sa.Numeric(15, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('accounts', 'target_amount')
