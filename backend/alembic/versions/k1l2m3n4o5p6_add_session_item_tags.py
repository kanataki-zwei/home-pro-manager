"""add budget_session_item_tag_assignments table

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-08-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'k1l2m3n4o5p6'
down_revision = 'j0k1l2m3n4o5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'budget_session_item_tag_assignments',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('session_item_id', UUID(as_uuid=True),
                  sa.ForeignKey('budget_session_items.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tag_id', UUID(as_uuid=True),
                  sa.ForeignKey('expense_tags.id', ondelete='CASCADE'), nullable=False),
    )
    op.create_index(
        'ix_session_item_tag_assignments_session_item_id',
        'budget_session_item_tag_assignments',
        ['session_item_id'],
    )


def downgrade():
    op.drop_index('ix_session_item_tag_assignments_session_item_id', table_name='budget_session_item_tag_assignments')
    op.drop_table('budget_session_item_tag_assignments')
