"""add_device_nickname

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-11-08

"""
from alembic import op
import sqlalchemy as sa

revision = 'q7r8s9t0u1v2'
down_revision = 'p6q7r8s9t0u1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('trusted_devices', sa.Column('nickname', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('trusted_devices', 'nickname')
