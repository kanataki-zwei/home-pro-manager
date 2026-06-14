"""add income fields to household_members

Revision ID: d6e7f8a9b0c1
Revises: c3f9e2b1a7d4
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa

revision = 'd6e7f8a9b0c1'
down_revision = 'c3f9e2b1a7d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('household_members', sa.Column('contributes_income', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('household_members', sa.Column('income_amount', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('household_members', sa.Column('income_currency', sa.String(length=10), nullable=True))
    op.add_column('household_members', sa.Column('income_cadence', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('household_members', 'income_cadence')
    op.drop_column('household_members', 'income_currency')
    op.drop_column('household_members', 'income_amount')
    op.drop_column('household_members', 'contributes_income')
