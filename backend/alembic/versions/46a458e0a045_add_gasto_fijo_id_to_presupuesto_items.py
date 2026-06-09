"""add_gasto_fijo_id_to_presupuesto_items

Revision ID: 46a458e0a045
Revises: 30e10559e9dc
Create Date: 2026-06-09 15:15:29.814036

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '46a458e0a045'
down_revision: Union[str, Sequence[str], None] = '30e10559e9dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)

    # --- gasto_fijo_id column ---
    existing_cols = {col['name'] for col in inspector.get_columns('presupuesto_items')}
    col_exists = 'gasto_fijo_id' in existing_cols

    if not col_exists:
        with op.batch_alter_table('presupuesto_items') as batch_op:
            batch_op.add_column(sa.Column('gasto_fijo_id', sa.Integer(), nullable=True))

    # --- index ---
    existing_idxs = {idx['name'] for idx in inspector.get_indexes('presupuesto_items')}
    if 'ix_presupuesto_items_gasto_fijo_id' not in existing_idxs:
        with op.batch_alter_table('presupuesto_items') as batch_op:
            batch_op.create_index('ix_presupuesto_items_gasto_fijo_id', ['gasto_fijo_id'])

    # --- FK ---
    existing_fks = inspector.get_foreign_keys('presupuesto_items')
    has_fk = any(fk.get('constrained_columns') == ['gasto_fijo_id'] for fk in existing_fks)
    if not has_fk:
        with op.batch_alter_table('presupuesto_items') as batch_op:
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
