"""add perf indexes for dashboard query paths

Revision ID: 9f4b2c7d1a0e
Revises: 7a92f7dbdc11
Create Date: 2026-04-06 12:58:00.000000
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "9f4b2c7d1a0e"
down_revision = "7a92f7dbdc11"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("alerts", schema=None) as batch_op:
        batch_op.create_index(
            "ix_alerts_triggered_at_desc_like",
            ["triggered_at"],
            unique=False,
        )
        batch_op.create_index(
            "ix_alerts_event_id",
            ["event_id"],
            unique=False,
        )

    with op.batch_alter_table("camera_zones", schema=None) as batch_op:
        batch_op.create_index(
            "ix_camera_zones_is_active",
            ["is_active"],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table("camera_zones", schema=None) as batch_op:
        batch_op.drop_index("ix_camera_zones_is_active")

    with op.batch_alter_table("alerts", schema=None) as batch_op:
        batch_op.drop_index("ix_alerts_event_id")
        batch_op.drop_index("ix_alerts_triggered_at_desc_like")
