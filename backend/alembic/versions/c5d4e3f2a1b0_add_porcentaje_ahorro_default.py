"""Add porcentaje_ahorro_default to users

Revision ID: c5d4e3f2a1b0
Revises: d7e6f5a4b3c2
Create Date: 2026-06-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c5d4e3f2a1b0'
down_revision: Union[str, None] = 'd7e6f5a4b3c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('porcentaje_ahorro_default', sa.Numeric(5, 2), nullable=False, server_default='10.0'),
    )


def downgrade() -> None:
    op.drop_column('users', 'porcentaje_ahorro_default')
