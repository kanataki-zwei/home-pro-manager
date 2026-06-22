"""add account_transactions and contributes_to_net_worth

Revision ID: f6c7d8e9a0b1
Revises: e6f7a8b9c0d1
Create Date: 2026-06-22 20:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = 'f6c7d8e9a0b1'
down_revision: Union[str, Sequence[str], None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('accounts', sa.Column(
        'contributes_to_net_worth', sa.Boolean(), nullable=False, server_default='true'
    ))

    op.create_table(
        'account_transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('household_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('households.id', ondelete='CASCADE'), nullable=False),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('narration', sa.String(500), nullable=False),
        sa.Column('transaction_type', sa.String(10), nullable=False),
        sa.Column('session_item_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("transaction_type IN ('credit', 'debit')", name='transaction_type_check'),
    )

    op.create_index('ix_account_transactions_account_id', 'account_transactions', ['account_id'])
    op.create_index('ix_account_transactions_session_item_id', 'account_transactions', ['session_item_id'])


def downgrade() -> None:
    op.drop_index('ix_account_transactions_session_item_id', 'account_transactions')
    op.drop_index('ix_account_transactions_account_id', 'account_transactions')
    op.drop_table('account_transactions')
    op.drop_column('accounts', 'contributes_to_net_worth')
