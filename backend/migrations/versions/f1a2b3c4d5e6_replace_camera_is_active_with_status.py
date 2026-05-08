"""replace camera is_active boolean with status string

Replaces the tri-state boolean hack (True / False / NULL) on
camera_zones.is_active with an explicit status VARCHAR:

    'active'   — camera is enabled and being monitored
    'inactive' — camera is disabled by an admin
    'deleted'  — soft-deleted (excluded from all listings)

Revision ID: f1a2b3c4d5e6
Revises: d11561c95587
Create Date: 2026-05-08 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'f1a2b3c4d5e6'
down_revision = 'abcb4ad65250'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('camera_zones', schema=None) as batch_op:
        # Add the new column, nullable initially so we can backfill first
        batch_op.add_column(
            sa.Column('status', sa.String(20), nullable=True)
        )

    # Backfill from is_active tri-state
    op.execute(
        "UPDATE camera_zones SET status = 'deleted'  WHERE is_active IS NULL"
    )
    op.execute(
        "UPDATE camera_zones SET status = 'inactive' WHERE is_active = 0"
    )
    op.execute(
        "UPDATE camera_zones SET status = 'active'   WHERE is_active = 1"
    )
    # Any remaining NULLs (shouldn't exist) default to active
    op.execute(
        "UPDATE camera_zones SET status = 'active'   WHERE status IS NULL"
    )

    with op.batch_alter_table('camera_zones', schema=None) as batch_op:
        # Now make it non-nullable and add an index
        batch_op.alter_column('status', nullable=False)
        batch_op.create_index('ix_camera_zones_status', ['status'])
        # Drop the old column and its index
        try:
            batch_op.drop_index('ix_camera_zones_is_active')
        except Exception:
            pass  # index may not exist in all environments
        batch_op.drop_column('is_active')


def downgrade():
    with op.batch_alter_table('camera_zones', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_active', sa.Boolean(), nullable=True)
        )

    op.execute(
        "UPDATE camera_zones SET is_active = NULL  WHERE status = 'deleted'"
    )
    op.execute(
        "UPDATE camera_zones SET is_active = 0     WHERE status = 'inactive'"
    )
    op.execute(
        "UPDATE camera_zones SET is_active = 1     WHERE status = 'active'"
    )

    with op.batch_alter_table('camera_zones', schema=None) as batch_op:
        batch_op.drop_index('ix_camera_zones_status')
        batch_op.drop_column('status')
