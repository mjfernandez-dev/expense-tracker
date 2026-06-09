"""add_gasto_fijo_id_to_presupuesto_items

Revision ID: 46a458e0a045
Revises: 30e10559e9dc
Create Date: 2026-06-09 15:15:29.814036

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '46a458e0a045'
down_revision: Union[str, Sequence[str], None] = '30e10559e9dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Agregar columna gasto_fijo_id + FK a presupuesto_items
    # SQLite requiere batch mode para ALTER TABLE con FK
    with op.batch_alter_table('presupuesto_items') as batch_op:
        batch_op.add_column(sa.Column('gasto_fijo_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_presupuesto_items_gasto_fijo_id', ['gasto_fijo_id'])
        batch_op.create_foreign_key(
            'fk_presupuesto_items_gasto_fijo',
            'gastos_fijos',
            ['gasto_fijo_id'],
            ['id'],
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('presupuesto_items') as batch_op:
        batch_op.drop_constraint('fk_presupuesto_items_gasto_fijo', type_='foreignkey')
        batch_op.drop_index('ix_presupuesto_items_gasto_fijo_id')
        batch_op.drop_column('gasto_fijo_id')
