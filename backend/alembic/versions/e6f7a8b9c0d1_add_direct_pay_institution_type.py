"""add direct_pay to institution_type constraint

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-06-22 17:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, Sequence[str], None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('institution_type_check', 'accounts', type_='check')
    op.create_check_constraint(
        'institution_type_check',
        'accounts',
        "institution_type IS NULL OR institution_type IN ('bank', 'money_market', 'mobile_money', 'direct_pay', 'insurance', 'govt_securities', 'stocks_shares')"
    )


def downgrade() -> None:
    op.drop_constraint('institution_type_check', 'accounts', type_='check')
    op.execute("UPDATE accounts SET institution_type = NULL WHERE institution_type = 'direct_pay'")
    op.create_check_constraint(
        'institution_type_check',
        'accounts',
        "institution_type IS NULL OR institution_type IN ('bank', 'money_market', 'mobile_money', 'insurance', 'govt_securities', 'stocks_shares')"
    )
