"""add financial_start_month and pay_day to households

Revision ID: g7h8i9j0k1l2
Revises: f6c7d8e9a0b1
Create Date: 2026-07-18 10:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, None] = 'f6c7d8e9a0b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('households', sa.Column('financial_start_month', sa.Date(), nullable=True))
    op.add_column('households', sa.Column('pay_day', sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column('households', 'pay_day')
    op.drop_column('households', 'financial_start_month')
