"""initial schema

Revision ID: b1c2d3e4f5a6
Revises:
Create Date: 2026-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )

    op.create_table('households',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('member_types',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('household_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('household_members',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('household_id', sa.UUID(), nullable=False),
        sa.Column('member_type_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('date_of_birth', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['member_type_id'], ['member_types.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('accounts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('household_id', sa.UUID(), nullable=False),
        sa.Column('household_member_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('account_type', sa.String(length=50), nullable=False),
        sa.Column('ownership', sa.String(length=20), nullable=False),
        sa.Column('current_balance', sa.Numeric(precision=15, scale=2), server_default='0.00'),
        sa.Column('currency', sa.String(length=10), server_default='KES'),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("account_type IN ('checking','savings','cash','investment','credit')", name='account_type_check'),
        sa.CheckConstraint("ownership IN ('joint','individual')", name='ownership_check'),
        sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['household_member_id'], ['household_members.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('accounts')
    op.drop_table('household_members')
    op.drop_table('member_types')
    op.drop_table('households')
    op.drop_table('users')
