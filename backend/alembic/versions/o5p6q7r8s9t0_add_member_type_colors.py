"""add_member_type_colors

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-11-07

"""
from alembic import op
import sqlalchemy as sa

revision = 'o5p6q7r8s9t0'
down_revision = 'n4o5p6q7r8s9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('member_types', sa.Column('bg_color', sa.String(20), nullable=True))
    op.add_column('member_types', sa.Column('text_color', sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column('member_types', 'text_color')
    op.drop_column('member_types', 'bg_color')
