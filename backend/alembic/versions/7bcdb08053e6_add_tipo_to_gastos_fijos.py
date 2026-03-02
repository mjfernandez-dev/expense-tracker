"""add tipo to gastos_fijos

Revision ID: 7bcdb08053e6
Revises: c4e3d2b1a0f9
Create Date: 2026-02-27 16:53:03.726038

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7bcdb08053e6'
down_revision: Union[str, Sequence[str], None] = 'c4e3d2b1a0f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('gastos_fijos', sa.Column('tipo', sa.String(), nullable=False, server_default='gasto'))


def downgrade() -> None:
    op.drop_column('gastos_fijos', 'tipo')
