"""Add inversiones (FCI tracking) tables

Revision ID: a1b2c3d4e5f7
Revises: f6a7b8c9d0e1
Create Date: 2026-06-08 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add inversiones and inversiones_historial tables."""
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

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
            sa.Column("notas", sa.String(), nullable=True),  # EncryptedString stores as String
            sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

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


def downgrade() -> None:
    """Drop inversiones tables."""
    op.drop_table("inversiones_historial")
    op.drop_table("inversiones")
