"""Add cantidad, comercio and lote_id to movimientos

Un ticket pasa a generar un movimiento por renglon. Para que eso sirva:

- `cantidad`: unidades o kg del renglon. Sin esto no se puede calcular el
  precio por unidad y la comparacion de precios en el tiempo no existe.
- `comercio`: donde se compro, para comparar entre supermercados. Se guarda
  cifrado por la app (EncryptedString -> String), igual que `nota`.
- `lote_id`: agrupa los movimientos creados a partir del mismo ticket, para
  poder deshacerlo completo.

Revision ID: b7d2e5c9a1f4
Revises: f3c8d1a7b2e4
Create Date: 2026-11-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d2e5c9a1f4'
down_revision: Union[str, Sequence[str], None] = 'f3c8d1a7b2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Agrega las columnas del ticket como lote de movimientos."""
    with op.batch_alter_table("movimientos") as batch_op:
        batch_op.add_column(sa.Column("cantidad", sa.Numeric(10, 3), nullable=True))
        batch_op.add_column(sa.Column("comercio", sa.String(), nullable=True))  # cifrada por la app
        batch_op.add_column(sa.Column("lote_id", sa.String(length=36), nullable=True))
        batch_op.create_index("ix_movimientos_lote_id", ["lote_id"], unique=False)


def downgrade() -> None:
    """Quita las columnas del ticket como lote de movimientos."""
    with op.batch_alter_table("movimientos") as batch_op:
        batch_op.drop_index("ix_movimientos_lote_id")
        batch_op.drop_column("lote_id")
        batch_op.drop_column("comercio")
        batch_op.drop_column("cantidad")
