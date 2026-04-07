"""add ciclo commitment reconciliation

Revision ID: d6f7a8b9c0d1
Revises: b1c2d3e4f5a6
Create Date: 2026-04-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd6f7a8b9c0d1'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("ciclo_gastos_fijos") as batch_op:
        batch_op.add_column(sa.Column("estado", sa.String(), nullable=False, server_default="comprometido"))

    with op.batch_alter_table("movimientos") as batch_op:
        batch_op.add_column(sa.Column("ciclo_gasto_fijo_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_movimientos_ciclo_gasto_fijo_id", ["ciclo_gasto_fijo_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_movimientos_ciclo_gasto_fijo_id",
            "ciclo_gastos_fijos",
            ["ciclo_gasto_fijo_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("movimientos") as batch_op:
        batch_op.drop_constraint("fk_movimientos_ciclo_gasto_fijo_id", type_="foreignkey")
        batch_op.drop_index("ix_movimientos_ciclo_gasto_fijo_id")
        batch_op.drop_column("ciclo_gasto_fijo_id")

    with op.batch_alter_table("ciclo_gastos_fijos") as batch_op:
        batch_op.drop_column("estado")
