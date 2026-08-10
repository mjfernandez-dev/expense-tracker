"""Replace GastoFijo/CicloGastoFijo with PresupuestoItem

Revision ID: e5d4c3b2a1f0
Revises: d6f7a8b9c0d1
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


revision: str = 'e5d4c3b2a1f0'
down_revision: Union[str, None] = 'd6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = inspector.get_table_names()

    # ── Step 1: Rename table (solo si todavía existe la vieja) ───────────────
    if "ciclo_gastos_fijos" in existing_tables:
        op.rename_table("ciclo_gastos_fijos", "presupuesto_items")
        # Refrescar inspector tras el rename
        inspector = sa_inspect(bind)

        # Drop FK + columna gasto_fijo_id con CASCADE (maneja el constraint auto)
        op.execute("ALTER TABLE presupuesto_items DROP COLUMN IF EXISTS gasto_fijo_id CASCADE")

        presupuesto_cols = {c['name'] for c in inspector.get_columns("presupuesto_items")}

        with op.batch_alter_table("presupuesto_items") as batch_op:
            if "monto_confirmado" in presupuesto_cols:
                batch_op.alter_column("monto_confirmado", new_column_name="monto_estimado")
            if "descripcion_override" in presupuesto_cols:
                batch_op.alter_column("descripcion_override", new_column_name="descripcion")

    # ── Step 2: Agregar columnas faltantes en presupuesto_items ──────────────
    inspector = sa_inspect(bind)
    presupuesto_cols = {c['name'] for c in inspector.get_columns("presupuesto_items")}
    existing_constraints = {c['name'] for c in inspector.get_foreign_keys("presupuesto_items")}

    with op.batch_alter_table("presupuesto_items") as batch_op:
        if "categoria_id" not in presupuesto_cols:
            batch_op.add_column(sa.Column("categoria_id", sa.Integer(), nullable=True))
        if "user_category_id" not in presupuesto_cols:
            batch_op.add_column(sa.Column("user_category_id", sa.Integer(), nullable=True))

    # FKs por separado (batch_alter_table no relee columnas dentro del mismo bloque)
    inspector = sa_inspect(bind)
    existing_fk_names = {c['name'] for c in inspector.get_foreign_keys("presupuesto_items")}

    with op.batch_alter_table("presupuesto_items") as batch_op:
        if "fk_presupuesto_items_categoria_id" not in existing_fk_names:
            batch_op.create_foreign_key(
                "fk_presupuesto_items_categoria_id",
                "categories", ["categoria_id"], ["id"],
            )
        if "fk_presupuesto_items_user_category_id" not in existing_fk_names:
            batch_op.create_foreign_key(
                "fk_presupuesto_items_user_category_id",
                "user_categories", ["user_category_id"], ["id"],
            )

    # ── Step 3: movimientos — renombrar o agregar presupuesto_item_id ─────────
    inspector = sa_inspect(bind)
    mov_cols = {c['name'] for c in inspector.get_columns("movimientos")}

    if "presupuesto_item_id" in mov_cols:
        # Ya existe (ej: create_all lo creó), nada que hacer
        pass
    elif "ciclo_gasto_fijo_id" in mov_cols:
        # Columna vieja presente: renombrarla con su FK e índice
        with op.batch_alter_table("movimientos") as batch_op:
            batch_op.drop_constraint("fk_movimientos_ciclo_gasto_fijo_id", type_="foreignkey")
            batch_op.drop_index("ix_movimientos_ciclo_gasto_fijo_id")
            batch_op.alter_column("ciclo_gasto_fijo_id", new_column_name="presupuesto_item_id")
            batch_op.create_index("ix_movimientos_presupuesto_item_id", ["presupuesto_item_id"])
            batch_op.create_foreign_key(
                "fk_movimientos_presupuesto_item_id",
                "presupuesto_items", ["presupuesto_item_id"], ["id"],
            )
    else:
        # Columna no existe en absoluto: agregarla
        with op.batch_alter_table("movimientos") as batch_op:
            batch_op.add_column(sa.Column("presupuesto_item_id", sa.Integer(), nullable=True))
            batch_op.create_index("ix_movimientos_presupuesto_item_id", ["presupuesto_item_id"])
            batch_op.create_foreign_key(
                "fk_movimientos_presupuesto_item_id",
                "presupuesto_items", ["presupuesto_item_id"], ["id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    mov_cols = {c['name'] for c in inspector.get_columns("movimientos")}

    if "presupuesto_item_id" in mov_cols:
        with op.batch_alter_table("movimientos") as batch_op:
            batch_op.drop_constraint("fk_movimientos_presupuesto_item_id", type_="foreignkey")
            batch_op.drop_index("ix_movimientos_presupuesto_item_id")
            batch_op.drop_column("presupuesto_item_id")

    with op.batch_alter_table("presupuesto_items") as batch_op:
        batch_op.drop_constraint("fk_presupuesto_items_user_category_id", type_="foreignkey")
        batch_op.drop_constraint("fk_presupuesto_items_categoria_id", type_="foreignkey")
        batch_op.drop_column("user_category_id")
        batch_op.drop_column("categoria_id")
