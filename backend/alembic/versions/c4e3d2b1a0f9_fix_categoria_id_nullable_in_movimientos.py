"""Fix categoria_id nullable in movimientos

batch_alter_table previo recreó la tabla perdiendo nullable=True en categoria_id.
Esta migración lo restaura correctamente.

Revision ID: c4e3d2b1a0f9
Revises: b3f2a1c9d8e7
Create Date: 2026-02-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4e3d2b1a0f9'
down_revision: Union[str, Sequence[str], None] = 'b3f2a1c9d8e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('movimientos') as batch_op:
        batch_op.alter_column('categoria_id',
                              existing_type=sa.Integer(),
                              nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('movimientos') as batch_op:
        batch_op.alter_column('categoria_id',
                              existing_type=sa.Integer(),
                              nullable=False)
