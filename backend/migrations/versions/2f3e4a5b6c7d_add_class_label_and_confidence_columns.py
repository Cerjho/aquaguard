"""add class_label and confidence columns to detection_events

Revision ID: 2f3e4a5b6c7d
Revises: 7a92f7dbdc11
Create Date: 2026-04-06 15:09:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2f3e4a5b6c7d'
down_revision = '7a92f7dbdc11'
branch_labels = None
depends_on = None


def _existing_columns(table_name):
    inspector = sa.inspect(op.get_bind())
    return {column['name'] for column in inspector.get_columns(table_name)}


def upgrade():
    existing_columns = _existing_columns('detection_events')
    with op.batch_alter_table('detection_events', schema=None) as batch_op:
        if 'class_label' not in existing_columns:
            batch_op.add_column(sa.Column('class_label', sa.String(length=64), nullable=True))

        if 'yolo_confidence' not in existing_columns:
            batch_op.add_column(sa.Column('yolo_confidence', sa.Float(), nullable=True))

        if 'pose_confidence' not in existing_columns:
            batch_op.add_column(sa.Column('pose_confidence', sa.Float(), nullable=True))

        if 'final_confidence' not in existing_columns:
            batch_op.add_column(sa.Column('final_confidence', sa.Float(), nullable=True))


def downgrade():
    existing_columns = _existing_columns('detection_events')
    with op.batch_alter_table('detection_events', schema=None) as batch_op:
        if 'final_confidence' in existing_columns:
            batch_op.drop_column('final_confidence')

        if 'pose_confidence' in existing_columns:
            batch_op.drop_column('pose_confidence')

        if 'yolo_confidence' in existing_columns:
            batch_op.drop_column('yolo_confidence')

        if 'class_label' in existing_columns:
            batch_op.drop_column('class_label')
