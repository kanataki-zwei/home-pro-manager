"""add_liquid_cash_flag

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-09-16

"""
from alembic import op
import sqlalchemy as sa

revision = 'm3n4o5p6q7r8'
down_revision = 'l2m3n4o5p6q7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('accounts', sa.Column(
        'contributes_to_liquid_cash', sa.Boolean(),
        nullable=False, server_default='false'
    ))


def downgrade():
    op.drop_column('accounts', 'contributes_to_liquid_cash')
