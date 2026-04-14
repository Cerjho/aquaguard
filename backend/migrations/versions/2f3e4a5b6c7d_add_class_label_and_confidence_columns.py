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


def upgrade():
    with op.batch_alter_table('detection_events', schema=None) as batch_op:
        # Add class_label column if it doesn't exist
        batch_op.add_column(sa.Column('class_label', sa.String(length=64), nullable=True))
        
        # Add YOLO and pose confidence columns if they don't exist
        batch_op.add_column(sa.Column('yolo_confidence', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('pose_confidence', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('final_confidence', sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table('detection_events', schema=None) as batch_op:
        batch_op.drop_column('final_confidence')
        batch_op.drop_column('pose_confidence')
        batch_op.drop_column('yolo_confidence')
        batch_op.drop_column('class_label')
