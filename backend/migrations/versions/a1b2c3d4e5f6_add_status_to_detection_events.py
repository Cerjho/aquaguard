"""add status to detection events

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-05-10 22:20:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('detection_events') as batch_op:
        batch_op.add_column(sa.Column('status', sa.String(length=32), server_default='unacknowledged', nullable=True))

def downgrade():
    with op.batch_alter_table('detection_events') as batch_op:
        batch_op.drop_column('status')
