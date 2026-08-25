"""add_member_income_history

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-08-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'h8i9j0k1l2m3'
down_revision = 'g7h8i9j0k1l2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'member_income_history',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('household_member_id', UUID(as_uuid=True), sa.ForeignKey('household_members.id', ondelete='CASCADE'), nullable=False),
        sa.Column('household_id', UUID(as_uuid=True), sa.ForeignKey('households.id', ondelete='CASCADE'), nullable=False),
        sa.Column('income_amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('income_currency', sa.String(10), nullable=False),
        sa.Column('income_cadence', sa.String(20), nullable=False),
        sa.Column('effective_from', sa.Date(), nullable=False),
        sa.Column('change_type', sa.String(20), nullable=False, server_default='update'),
        sa.Column('change_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('ix_member_income_history_member', 'member_income_history', ['household_member_id', 'effective_from'])

    # Backfill existing members that already have income configured
    op.execute("""
        INSERT INTO member_income_history
            (id, household_member_id, household_id, income_amount, income_currency,
             income_cadence, effective_from, change_type, created_at)
        SELECT
            gen_random_uuid(),
            hm.id,
            hm.household_id,
            hm.income_amount,
            COALESCE(hm.income_currency, 'KES'),
            COALESCE(hm.income_cadence, 'monthly'),
            DATE_TRUNC('month', hm.created_at)::DATE,
            'initial',
            NOW()
        FROM household_members hm
        WHERE hm.contributes_income = TRUE
          AND hm.income_amount IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_index('ix_member_income_history_member', 'member_income_history')
    op.drop_table('member_income_history')
