"""add ad-hoc session items and notes

Revision ID: f5b6c7d8e9f0
Revises: e4a5b6c7d8e9
Create Date: 2026-06-22 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f5b6c7d8e9f0'
down_revision: Union[str, Sequence[str], None] = 'e4a5b6c7d8e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make expense_id nullable so session items can be ad-hoc (no expense reference)
    op.alter_column('budget_session_items', 'expense_id', nullable=True)

    # Ad-hoc item fields
    op.add_column('budget_session_items', sa.Column('ad_hoc_name', sa.String(255), nullable=True))
    op.add_column('budget_session_items', sa.Column('ad_hoc_amount', sa.Numeric(15, 2), nullable=True))

    # Every item must reference either a library expense OR have an ad-hoc name
    op.create_check_constraint(
        'session_item_source_check',
        'budget_session_items',
        '(expense_id IS NOT NULL) OR (ad_hoc_name IS NOT NULL)'
    )


def downgrade() -> None:
    op.drop_constraint('session_item_source_check', 'budget_session_items', type_='check')
    op.drop_column('budget_session_items', 'ad_hoc_amount')
    op.drop_column('budget_session_items', 'ad_hoc_name')
    op.alter_column('budget_session_items', 'expense_id', nullable=False)
