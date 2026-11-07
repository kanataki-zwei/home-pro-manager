"""add_trusted_devices

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-11-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'p6q7r8s9t0u1'
down_revision = 'o5p6q7r8s9t0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'trusted_devices',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('device_id', sa.String(64), nullable=False),
        sa.Column('label', sa.String(255), nullable=False, server_default='Unknown device'),
        sa.Column('user_agent', sa.Text, nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('requested_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewed_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint('user_id', 'device_id', name='uq_trusted_device'),
        sa.CheckConstraint("status IN ('pending', 'approved', 'rejected')", name='trusted_device_status_check'),
    )
    op.create_index('ix_trusted_devices_user_device', 'trusted_devices', ['user_id', 'device_id'])
    op.create_index('ix_trusted_devices_user_status', 'trusted_devices', ['user_id', 'status'])


def downgrade() -> None:
    op.drop_index('ix_trusted_devices_user_status', table_name='trusted_devices')
    op.drop_index('ix_trusted_devices_user_device', table_name='trusted_devices')
    op.drop_table('trusted_devices')
