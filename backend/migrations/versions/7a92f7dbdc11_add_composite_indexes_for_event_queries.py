"""add composite indexes for event and alert queries

Revision ID: 7a92f7dbdc11
Revises: 1d101530efdb
Create Date: 2026-03-22 11:45:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '7a92f7dbdc11'
down_revision = '1d101530efdb'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('detection_events', schema=None) as batch_op:
        batch_op.create_index(
            'ix_detection_events_zone_detected_at',
            ['zone_id', 'detected_at'],
            unique=False,
        )
        batch_op.create_index(
            'ix_detection_events_zone_alert_detected_at',
            ['zone_id', 'alert_triggered', 'detected_at'],
            unique=False,
        )

    with op.batch_alter_table('alerts', schema=None) as batch_op:
        batch_op.create_index(
            'ix_alerts_zone_status_triggered_at',
            ['zone_id', 'status', 'triggered_at'],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table('alerts', schema=None) as batch_op:
        batch_op.drop_index('ix_alerts_zone_status_triggered_at')

    with op.batch_alter_table('detection_events', schema=None) as batch_op:
        batch_op.drop_index('ix_detection_events_zone_alert_detected_at')
        batch_op.drop_index('ix_detection_events_zone_detected_at')
