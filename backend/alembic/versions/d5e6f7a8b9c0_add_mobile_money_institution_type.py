"""add mobile_money to institution_type constraint

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-06-22 17:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, Sequence[str], None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('institution_type_check', 'accounts', type_='check')
    op.create_check_constraint(
        'institution_type_check',
        'accounts',
        "institution_type IS NULL OR institution_type IN ('bank', 'money_market', 'mobile_money', 'insurance', 'govt_securities', 'stocks_shares')"
    )


def downgrade() -> None:
    op.drop_constraint('institution_type_check', 'accounts', type_='check')
    op.execute("UPDATE accounts SET institution_type = NULL WHERE institution_type = 'mobile_money'")
    op.create_check_constraint(
        'institution_type_check',
        'accounts',
        "institution_type IS NULL OR institution_type IN ('bank', 'money_market', 'insurance', 'govt_securities', 'stocks_shares')"
    )
