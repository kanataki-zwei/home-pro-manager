"""expand account types

Revision ID: b3c4d5e6f7a8
Revises: f5b6c7d8e9f0
Create Date: 2026-06-22 15:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, Sequence[str], None] = 'f5b6c7d8e9f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('account_type_check', 'accounts', type_='check')

    # Map old generic types to new specific categories
    op.execute("UPDATE accounts SET account_type = 'bank' WHERE account_type IN ('checking', 'savings')")
    op.execute("UPDATE accounts SET account_type = 'stocks_shares' WHERE account_type = 'investment'")

    op.create_check_constraint(
        'account_type_check',
        'accounts',
        "account_type IN ('bank', 'money_market', 'insurance', 'govt_securities', 'stocks_shares', 'cash', 'credit')"
    )


def downgrade() -> None:
    op.drop_constraint('account_type_check', 'accounts', type_='check')

    op.execute("UPDATE accounts SET account_type = 'checking' WHERE account_type = 'bank'")
    op.execute("UPDATE accounts SET account_type = 'investment' WHERE account_type IN ('stocks_shares', 'money_market', 'govt_securities', 'insurance')")

    op.create_check_constraint(
        'account_type_check',
        'accounts',
        "account_type IN ('checking', 'savings', 'cash', 'investment', 'credit')"
    )
