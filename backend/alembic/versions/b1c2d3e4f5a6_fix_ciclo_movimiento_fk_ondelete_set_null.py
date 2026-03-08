"""fix ciclo movimiento_origen_id fk ondelete set null

Revision ID: b1c2d3e4f5a6
Revises: a8f3b2c1d9e0
Create Date: 2026-03-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'a8f3b2c1d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Recrear la FK con ON DELETE SET NULL para que al borrar un movimiento
    # el ciclo asociado no genere un error de constraint en PostgreSQL.
    with op.batch_alter_table("ciclos") as batch_op:
        batch_op.drop_constraint("ciclos_movimiento_origen_id_fkey", type_="foreignkey")
        batch_op.create_foreign_key(
            "ciclos_movimiento_origen_id_fkey",
            "movimientos",
            ["movimiento_origen_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("ciclos") as batch_op:
        batch_op.drop_constraint("ciclos_movimiento_origen_id_fkey", type_="foreignkey")
        batch_op.create_foreign_key(
            "ciclos_movimiento_origen_id_fkey",
            "movimientos",
            ["movimiento_origen_id"],
            ["id"],
        )
