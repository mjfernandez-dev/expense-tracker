"""Add clasificacion to movimientos

Revision ID: d7e6f5a4b3c2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd7e6f5a4b3c2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('movimientos', sa.Column('clasificacion', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('movimientos', 'clasificacion')
