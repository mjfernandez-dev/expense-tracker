"""Add api_credentials table for external provider keys

Credenciales de proveedores externos (ej. LlamaCloud para el lector de tickets).
La clave se guarda cifrada a nivel de aplicación (EncryptedString -> String).

Revision ID: f3c8d1a7b2e4
Revises: 9c3e7b1d4a58
Create Date: 2026-11-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3c8d1a7b2e4'
down_revision: Union[str, Sequence[str], None] = '9c3e7b1d4a58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Crea la tabla de credenciales de proveedores."""
    op.create_table(
        "api_credentials",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("proveedor", sa.String(), nullable=False, index=True),
        sa.Column("nombre", sa.String(), nullable=False),
        sa.Column("clave", sa.String(), nullable=False),  # cifrada por la app
        sa.Column("tier", sa.String(), nullable=True),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "proveedor", "nombre", name="uq_api_credential_nombre"),
    )


def downgrade() -> None:
    """Elimina la tabla de credenciales de proveedores."""
    op.drop_table("api_credentials")
