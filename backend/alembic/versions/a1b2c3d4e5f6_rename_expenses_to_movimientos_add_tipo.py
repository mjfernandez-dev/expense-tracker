"""rename expenses to movimientos add tipo

Revision ID: a1b2c3d4e5f6
Revises: 93994adc28c3
Create Date: 2026-02-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '93994adc28c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Renombrar tabla expenses → movimientos
    op.rename_table('expenses', 'movimientos')

    # Agregar columna tipo con default 'gasto' para registros existentes
    with op.batch_alter_table('movimientos') as batch_op:
        batch_op.add_column(
            sa.Column('tipo', sa.String(), nullable=False, server_default='gasto')
        )


def downgrade() -> None:
    with op.batch_alter_table('movimientos') as batch_op:
        batch_op.drop_column('tipo')

    op.rename_table('movimientos', 'expenses')
