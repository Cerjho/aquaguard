"""add acknowledged_by to detection events

Revision ID: c1d2e3f4g5h6
Revises: a1b2c3d4e5f6
Create Date: 2026-05-10 22:33:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c1d2e3f4g5h6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('detection_events') as batch_op:
        batch_op.add_column(sa.Column('acknowledged_by', sa.String(length=80), nullable=True))

def downgrade():
    with op.batch_alter_table('detection_events') as batch_op:
        batch_op.drop_column('acknowledged_by')
