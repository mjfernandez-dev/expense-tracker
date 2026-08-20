"""add_gastos_programados

Adds the gastos_programados table (scheduled expenses) and links
presupuesto_items to it via gasto_programado_id with a unique
(ciclo_id, gasto_programado_id) constraint so each scheduled expense
reserves money only once per cycle.

Revision ID: b8c5a7d3e9f1
Revises: a9c4e8b2d6f1
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'b8c5a7d3e9f1'
down_revision: Union[str, Sequence[str], None] = 'a9c4e8b2d6f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)

    # --- gastos_programados table ---
    if "gastos_programados" not in inspector.get_table_names():
        op.create_table(
            "gastos_programados",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("importe", sa.Numeric(10, 2), nullable=False),
            sa.Column("vencimiento", sa.Date(), nullable=False, index=True),
            sa.Column("descripcion", sa.String(), nullable=False),  # encrypted at app level
            sa.Column("nota", sa.String(), nullable=True),  # encrypted at app level
            sa.Column("categoria_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
            sa.Column("user_category_id", sa.Integer(), sa.ForeignKey("user_categories.id"), nullable=True),
            sa.Column("medio_pago", sa.String(), nullable=True),
            sa.Column("clasificacion", sa.String(), nullable=True),
            sa.Column("dias_anticipacion", sa.Integer(), nullable=True),
            sa.Column("estado", sa.String(), nullable=False, server_default=sa.text("'pendiente'")),
            sa.Column("cuota_actual", sa.Integer(), nullable=True),
            sa.Column("cuota_total", sa.Integer(), nullable=True),
            sa.Column("movimiento_id", sa.Integer(), sa.ForeignKey("movimientos.id"), nullable=True, index=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    # --- gasto_programado_id column, index, FK y unique constraint en presupuesto_items ---
    existing_cols = {col['name'] for col in inspector.get_columns('presupuesto_items')}
    col_exists = 'gasto_programado_id' in existing_cols

    existing_idxs = {idx['name'] for idx in inspector.get_indexes('presupuesto_items')}
    idx_exists = 'ix_presupuesto_items_gasto_programado_id' in existing_idxs

    existing_fks = inspector.get_foreign_keys('presupuesto_items')
    fk_exists = any(fk.get('constrained_columns') == ['gasto_programado_id'] for fk in existing_fks)

    existing_unique = {u['name'] for u in inspector.get_unique_constraints('presupuesto_items')}
    uq_exists = 'uq_ciclo_gasto_programado' in existing_unique

    if not (col_exists and idx_exists and fk_exists and uq_exists):
        with op.batch_alter_table('presupuesto_items') as batch_op:
            if not col_exists:
                batch_op.add_column(sa.Column('gasto_programado_id', sa.Integer(), nullable=True))
            if not idx_exists:
                batch_op.create_index('ix_presupuesto_items_gasto_programado_id', ['gasto_programado_id'])
            if not fk_exists:
                batch_op.create_foreign_key(
                    'fk_presupuesto_items_gasto_programado',
                    'gastos_programados',
                    ['gasto_programado_id'],
                    ['id'],
                )
            if not uq_exists:
                batch_op.create_unique_constraint(
                    'uq_ciclo_gasto_programado',
                    ['ciclo_id', 'gasto_programado_id'],
                )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('presupuesto_items') as batch_op:
        batch_op.drop_constraint('uq_ciclo_gasto_programado', type_='unique')
        batch_op.drop_constraint('fk_presupuesto_items_gasto_programado', type_='foreignkey')
        batch_op.drop_index('ix_presupuesto_items_gasto_programado_id')
        batch_op.drop_column('gasto_programado_id')

    op.drop_table('gastos_programados')
