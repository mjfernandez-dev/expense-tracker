"""Replace GastoFijo/CicloGastoFijo with PresupuestoItem

Revision ID: xxxx
Revises: d6f7a8b9c0d1
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'xxxx'
down_revision: Union[str, None] = 'd6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename ciclo_gastos_fijos table to presupuesto_items
    op.rename_table("ciclo_gastos_fijos", "presupuesto_items")

    # Rename columns inside presupuesto_items
    with op.batch_alter_table("presupuesto_items") as batch_op:
        batch_op.alter_column("monto_confirmado", new_column_name="monto_estimado")
        batch_op.alter_column("descripcion_override", new_column_name="descripcion")


def downgrade() -> None:
    # Rename columns back
    with op.batch_alter_table("presupuesto_items") as batch_op:
        batch_op.alter_column("monto_estimado", new_column_name="monto_confirmado")
        batch_op.alter_column("descripcion", new_column_name="descripcion_override")

    op.rename_table("presupuesto_items", "ciclo_gastos_fijos")
