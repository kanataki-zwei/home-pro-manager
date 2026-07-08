"""add fx rates

Revision ID: a8b9c0d1e2f3
Revises: f6c7d8e9a0b1
Create Date: 2026-07-08

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a8b9c0d1e2f3'
down_revision = 'f6c7d8e9a0b1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'fx_rates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('household_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('households.id', ondelete='CASCADE'), nullable=False),
        sa.Column('currency', sa.String(10), nullable=False),
        sa.Column('rate_to_kes', sa.Numeric(15, 6), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.UniqueConstraint('household_id', 'currency', name='uq_fx_rate_household_currency'),
    )


def downgrade() -> None:
    op.drop_table('fx_rates')
