"""add_playground_mode

Revision ID: s0t1u2v3w4x5
Revises: r8s9t0u1v2w3
Create Date: 2026-11-08

"""
from alembic import op
import sqlalchemy as sa

revision = 's0t1u2v3w4x5'
down_revision = 'r8s9t0u1v2w3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'users',
        sa.Column('playground_mode', sa.Boolean(), nullable=False, server_default='false')
    )


def downgrade():
    op.drop_column('users', 'playground_mode')
