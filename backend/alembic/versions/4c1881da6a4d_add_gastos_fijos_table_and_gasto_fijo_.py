"""Add gastos_fijos table and gasto_fijo fields to movimientos

Revision ID: 4c1881da6a4d
Revises: a1b2c3d4e5f6
Create Date: 2026-02-25 15:50:37.721373

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c1881da6a4d'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Crear tabla gastos_fijos
    op.create_table(
        'gastos_fijos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=False),
        sa.Column('categoria_id', sa.Integer(), nullable=True),
        sa.Column('user_category_id', sa.Integer(), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['categoria_id'], ['categories.id']),
        sa.ForeignKeyConstraint(['user_category_id'], ['user_categories.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_gastos_fijos_id'), 'gastos_fijos', ['id'], unique=False)
    op.create_index(op.f('ix_gastos_fijos_user_id'), 'gastos_fijos', ['user_id'], unique=False)

    # 2. Agregar columnas nuevas a movimientos (batch para SQLite)
    with op.batch_alter_table('movimientos') as batch_op:
        batch_op.add_column(sa.Column('gasto_fijo_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column(
            'is_auto_generated', sa.Boolean(), nullable=False, server_default=sa.false()
        ))
        batch_op.create_index('ix_movimientos_gasto_fijo_id', ['gasto_fijo_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_movimientos_gasto_fijo_id', 'gastos_fijos', ['gasto_fijo_id'], ['id']
        )


def downgrade() -> None:
    # Revertir columnas de movimientos
    with op.batch_alter_table('movimientos') as batch_op:
        batch_op.drop_constraint('fk_movimientos_gasto_fijo_id', type_='foreignkey')
        batch_op.drop_index('ix_movimientos_gasto_fijo_id')
        batch_op.drop_column('is_auto_generated')
        batch_op.drop_column('gasto_fijo_id')

    # Eliminar tabla gastos_fijos
    op.drop_index(op.f('ix_gastos_fijos_user_id'), table_name='gastos_fijos')
    op.drop_index(op.f('ix_gastos_fijos_id'), table_name='gastos_fijos')
    op.drop_table('gastos_fijos')
