"""Replace GastoFijo/CicloGastoFijo with PresupuestoItem

Revision ID: e5d4c3b2a1f0
Revises: d6f7a8b9c0d1
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5d4c3b2a1f0'
down_revision: Union[str, None] = 'd6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Step 1: Rename table ──────────────────────────────────────────────────
    op.rename_table("ciclo_gastos_fijos", "presupuesto_items")

    # ── Step 2: Drop gasto_fijo_id + its FK (auto-named by PostgreSQL) ────────
    # CASCADE drops any dependent constraints automatically.
    op.execute("ALTER TABLE presupuesto_items DROP COLUMN IF EXISTS gasto_fijo_id CASCADE")

    # ── Step 3: Rename columns + add new ones in presupuesto_items ────────────
    with op.batch_alter_table("presupuesto_items") as batch_op:
        batch_op.alter_column("monto_confirmado", new_column_name="monto_estimado")
        batch_op.alter_column("descripcion_override", new_column_name="descripcion")
        batch_op.add_column(sa.Column("categoria_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("user_category_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_presupuesto_items_categoria_id",
            "categories",
            ["categoria_id"],
            ["id"],
        )
        batch_op.create_foreign_key(
            "fk_presupuesto_items_user_category_id",
            "user_categories",
            ["user_category_id"],
            ["id"],
        )

    # ── Step 4: Update movimientos — rename ciclo_gasto_fijo_id → presupuesto_item_id ──
    with op.batch_alter_table("movimientos") as batch_op:
        batch_op.drop_constraint("fk_movimientos_ciclo_gasto_fijo_id", type_="foreignkey")
        batch_op.drop_index("ix_movimientos_ciclo_gasto_fijo_id")
        batch_op.alter_column("ciclo_gasto_fijo_id", new_column_name="presupuesto_item_id")
        batch_op.create_index("ix_movimientos_presupuesto_item_id", ["presupuesto_item_id"])
        batch_op.create_foreign_key(
            "fk_movimientos_presupuesto_item_id",
            "presupuesto_items",
            ["presupuesto_item_id"],
            ["id"],
        )


def downgrade() -> None:
    # ── Step 4 reversed: movimientos ─────────────────────────────────────────
    with op.batch_alter_table("movimientos") as batch_op:
        batch_op.drop_constraint("fk_movimientos_presupuesto_item_id", type_="foreignkey")
        batch_op.drop_index("ix_movimientos_presupuesto_item_id")
        batch_op.alter_column("presupuesto_item_id", new_column_name="ciclo_gasto_fijo_id")
        batch_op.create_index("ix_movimientos_ciclo_gasto_fijo_id", ["ciclo_gasto_fijo_id"])
        batch_op.create_foreign_key(
            "fk_movimientos_ciclo_gasto_fijo_id",
            "ciclo_gastos_fijos",
            ["ciclo_gasto_fijo_id"],
            ["id"],
        )

    # ── Step 3 reversed: presupuesto_items ───────────────────────────────────
    with op.batch_alter_table("presupuesto_items") as batch_op:
        batch_op.drop_constraint("fk_presupuesto_items_user_category_id", type_="foreignkey")
        batch_op.drop_constraint("fk_presupuesto_items_categoria_id", type_="foreignkey")
        batch_op.drop_column("user_category_id")
        batch_op.drop_column("categoria_id")
        batch_op.alter_column("descripcion", new_column_name="descripcion_override")
        batch_op.alter_column("monto_estimado", new_column_name="monto_confirmado")

    # ── Step 2 reversed: restore gasto_fijo_id ───────────────────────────────
    with op.batch_alter_table("presupuesto_items") as batch_op:
        batch_op.add_column(sa.Column("gasto_fijo_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_presupuesto_items_gasto_fijo_id_restore",
            "gastos_fijos",
            ["gasto_fijo_id"],
            ["id"],
        )

    # ── Step 1 reversed: rename table back ───────────────────────────────────
    op.rename_table("presupuesto_items", "ciclo_gastos_fijos")
