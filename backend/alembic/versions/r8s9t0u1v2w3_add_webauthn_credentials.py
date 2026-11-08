"""add_webauthn_credentials

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-11-08
"""
from alembic import op
import sqlalchemy as sa

revision = 'r8s9t0u1v2w3'
down_revision = 'q7r8s9t0u1v2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'webauthn_credentials',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('credential_id', sa.Text, unique=True, nullable=False),
        sa.Column('public_key', sa.Text, nullable=False),
        sa.Column('sign_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('device_id', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
    )
    op.create_index('ix_webauthn_credentials_user_id', 'webauthn_credentials', ['user_id'])


def downgrade():
    op.drop_index('ix_webauthn_credentials_user_id', 'webauthn_credentials')
    op.drop_table('webauthn_credentials')
