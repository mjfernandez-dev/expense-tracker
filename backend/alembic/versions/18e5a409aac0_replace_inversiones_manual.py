"""Replace old FCI Inversiones with manual Investment tables

Recreates inversiones with new schema and adds aportes_inversion table.

Revision ID: 18e5a409aac0
Revises: b311c01b4be1
Create Date: 2026-06-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


# revision identifiers, used by Alembic.
revision: str = '18e5a409aac0'
down_revision: Union[str, Sequence[str], None] = 'b311c01b4be1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop old inversiones tables, create new ones with manual investment schema."""
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

    # ── Drop old tables (order matters: child first) ──────────────────────
    if "inversiones_historial" in tables:
        op.drop_table("inversiones_historial")

    if "inversiones" in tables:
        # Drop FK constraints first to avoid PostgreSQL dependency issues
        op.execute("ALTER TABLE inversiones DROP CONSTRAINT IF EXISTS inversiones_user_id_fkey CASCADE")
        op.drop_table("inversiones")

    # ── Refresh inspector ────────────────────────────────────────────────
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

    # ── Create new inversiones table ──────────────────────────────────────
    if "inversiones" not in tables:
        op.create_table(
            "inversiones",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("nombre", sa.String(), nullable=False),
            sa.Column("valor_actual_ars", sa.Numeric(14, 2), nullable=True),
            sa.Column("cotizacion_usd_actual", sa.Numeric(10, 2), nullable=True),
            sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    # ── Create aportes_inversion table ────────────────────────────────────
    if "aportes_inversion" not in tables:
        op.create_table(
            "aportes_inversion",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("inversion_id", sa.Integer(), sa.ForeignKey("inversiones.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("fecha", sa.DateTime(), nullable=False),
            sa.Column("monto_ars", sa.Numeric(12, 2), nullable=False),
            sa.Column("cotizacion_usd", sa.Numeric(10, 2), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    """Drop new tables and recreate old FCI inversiones schema."""
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

    # ── Drop new tables (child first) ─────────────────────────────────────
    if "aportes_inversion" in tables:
        op.drop_table("aportes_inversion")

    if "inversiones" in tables:
        op.execute("ALTER TABLE inversiones DROP CONSTRAINT IF EXISTS inversiones_user_id_fkey CASCADE")
        op.drop_table("inversiones")

    # ── Refresh inspector ────────────────────────────────────────────────
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

    # ── Recreate old inversiones table ────────────────────────────────────
    if "inversiones" not in tables:
        op.create_table(
            "inversiones",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("nombre", sa.String(), nullable=False),
            sa.Column("ticker", sa.String(), nullable=True),
            sa.Column("cuotapartes", sa.Numeric(14, 4), nullable=True),
            sa.Column("monto_invertido", sa.Numeric(10, 2), nullable=True),
            sa.Column("fecha_inversion", sa.DateTime(), nullable=True),
            sa.Column("notas", sa.String(), nullable=True),
            sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    # ── Recreate old inversiones_historial table ──────────────────────────
    if "inversiones_historial" not in tables:
        op.create_table(
            "inversiones_historial",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("inversion_id", sa.Integer(), sa.ForeignKey("inversiones.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("fecha", sa.DateTime(), nullable=False),
            sa.Column("valor_cuota", sa.Numeric(14, 6), nullable=False),
            sa.Column("fuente", sa.String(), nullable=False, server_default=sa.text("'manual'")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("inversion_id", "fecha", name="uq_inversion_fecha"),
        )
