"""refactor sessions to standalone (no template required)

Revision ID: e4a5b6c7d8e9
Revises: d6e7f8a9b0c1
Create Date: 2026-06-21 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e4a5b6c7d8e9'
down_revision: Union[str, Sequence[str], None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make budget_template_id nullable and drop its FK
    op.alter_column('budget_sessions', 'budget_template_id', nullable=True)
    op.drop_constraint('budget_sessions_budget_template_id_fkey', 'budget_sessions', type_='foreignkey')

    # Migrate old status values before swapping the check constraint
    op.execute("UPDATE budget_session_items SET status = 'todo' WHERE status IN ('pending', 'partial')")
    op.execute("UPDATE budget_session_items SET status = 'na'   WHERE status = 'skipped'")

    # Swap the check constraint on budget_session_items.status
    op.drop_constraint('session_item_status_check', 'budget_session_items', type_='check')
    op.create_check_constraint(
        'session_item_status_check',
        'budget_session_items',
        "status IN ('todo', 'paid', 'reserved', 'na')"
    )


def downgrade() -> None:
    op.execute("UPDATE budget_session_items SET status = 'pending' WHERE status = 'todo'")
    op.execute("UPDATE budget_session_items SET status = 'skipped' WHERE status = 'na'")

    op.drop_constraint('session_item_status_check', 'budget_session_items', type_='check')
    op.create_check_constraint(
        'session_item_status_check',
        'budget_session_items',
        "status IN ('pending', 'partial', 'paid', 'reserved', 'skipped')"
    )

    op.create_foreign_key(
        'budget_sessions_budget_template_id_fkey',
        'budget_sessions', 'budget_templates',
        ['budget_template_id'], ['id'],
        ondelete='RESTRICT'
    )
    op.alter_column('budget_sessions', 'budget_template_id', nullable=False)
