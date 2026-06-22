"""add institution_type column and revert account_type to original values

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-06-22 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, Sequence[str], None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Revert account_type back to original values
    op.drop_constraint('account_type_check', 'accounts', type_='check')
    op.execute("UPDATE accounts SET account_type = 'checking' WHERE account_type = 'bank'")
    op.execute("UPDATE accounts SET account_type = 'investment' WHERE account_type IN ('stocks_shares', 'money_market', 'govt_securities', 'insurance')")
    op.create_check_constraint(
        'account_type_check',
        'accounts',
        "account_type IN ('checking', 'savings', 'cash', 'investment', 'credit')"
    )

    # Add new institution_type column
    op.add_column('accounts', sa.Column(
        'institution_type',
        sa.String(50),
        nullable=True
    ))
    op.create_check_constraint(
        'institution_type_check',
        'accounts',
        "institution_type IS NULL OR institution_type IN ('bank', 'money_market', 'insurance', 'govt_securities', 'stocks_shares')"
    )


def downgrade() -> None:
    op.drop_constraint('institution_type_check', 'accounts', type_='check')
    op.drop_column('accounts', 'institution_type')

    op.drop_constraint('account_type_check', 'accounts', type_='check')
    op.execute("UPDATE accounts SET account_type = 'bank' WHERE account_type IN ('checking', 'savings')")
    op.execute("UPDATE accounts SET account_type = 'stocks_shares' WHERE account_type = 'investment'")
    op.create_check_constraint(
        'account_type_check',
        'accounts',
        "account_type IN ('bank', 'money_market', 'insurance', 'govt_securities', 'stocks_shares', 'cash', 'credit')"
    )
