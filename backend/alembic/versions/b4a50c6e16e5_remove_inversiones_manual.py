"""Remove inversiones_manual module (Investment & AporteInversion tables)

Drops inversiones and aportes_inversion tables if they exist.

Revision ID: b4a50c6e16e5
Revises: 18e5a409aac0
Create Date: 2026-07-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


# revision identifiers, used by Alembic.
revision: str = 'b4a50c6e16e5'
down_revision: Union[str, Sequence[str], None] = '18e5a409aac0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop inversiones and aportes_inversion tables if they exist."""
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

    # Drop child table first (aportes_inversion has FK to inversiones)
    if "aportes_inversion" in tables:
        op.drop_table("aportes_inversion")

    # Drop parent table — drop FK constraint defensively for safety
    if "inversiones" in tables:
        op.execute("ALTER TABLE inversiones DROP CONSTRAINT IF EXISTS inversiones_user_id_fkey CASCADE")
        op.drop_table("inversiones")


def downgrade() -> None:
    """Recreate inversiones and aportes_inversion tables (manual investment schema)."""
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

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
