"""add ciclos and medio_pago

Revision ID: a8f3b2c1d9e0
Revises: 7bcdb08053e6
Create Date: 2026-03-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a8f3b2c1d9e0'
down_revision: Union[str, None] = '7bcdb08053e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # Crear tabla ciclos (solo si no existe — puede haber sido creada por create_all)
    if not bind.dialect.has_table(bind, 'ciclos'):
        op.create_table(
            'ciclos',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('movimiento_origen_id', sa.Integer(), nullable=True),
            sa.Column('fecha_inicio', sa.DateTime(), nullable=False),
            sa.Column('fecha_fin', sa.DateTime(), nullable=False),
            sa.Column('ahorro_objetivo', sa.Numeric(10, 2), nullable=False, server_default='0'),
            sa.Column('activo', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['movimiento_origen_id'], ['movimientos.id']),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_ciclos_id'), 'ciclos', ['id'], unique=False)
        op.create_index(op.f('ix_ciclos_user_id'), 'ciclos', ['user_id'], unique=False)

    # Crear tabla ciclo_gastos_fijos (solo si no existe)
    if not bind.dialect.has_table(bind, 'ciclo_gastos_fijos'):
        op.create_table(
            'ciclo_gastos_fijos',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('ciclo_id', sa.Integer(), nullable=False),
            sa.Column('gasto_fijo_id', sa.Integer(), nullable=True),
            sa.Column('monto_confirmado', sa.Numeric(10, 2), nullable=False),
            sa.Column('confirmado', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('descripcion_override', sa.String(), nullable=True),
            sa.ForeignKeyConstraint(['ciclo_id'], ['ciclos.id']),
            sa.ForeignKeyConstraint(['gasto_fijo_id'], ['gastos_fijos.id']),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_ciclo_gastos_fijos_id'), 'ciclo_gastos_fijos', ['id'], unique=False)
        op.create_index(op.f('ix_ciclo_gastos_fijos_ciclo_id'), 'ciclo_gastos_fijos', ['ciclo_id'], unique=False)

    # Agregar columnas a movimientos solo si no existen (compatible SQLite + PostgreSQL)
    from sqlalchemy import inspect as sa_inspect
    inspector = sa_inspect(bind)
    mov_cols = [c['name'] for c in inspector.get_columns('movimientos')]
    if 'es_inicio_ciclo' not in mov_cols:
        op.add_column('movimientos', sa.Column('es_inicio_ciclo', sa.Boolean(), nullable=False, server_default='0'))
    if 'medio_pago' not in mov_cols:
        op.add_column('movimientos', sa.Column('medio_pago', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('movimientos') as batch_op:
        batch_op.drop_column('medio_pago')
        batch_op.drop_column('es_inicio_ciclo')

    op.drop_index(op.f('ix_ciclo_gastos_fijos_ciclo_id'), table_name='ciclo_gastos_fijos')
    op.drop_index(op.f('ix_ciclo_gastos_fijos_id'), table_name='ciclo_gastos_fijos')
    op.drop_table('ciclo_gastos_fijos')

    op.drop_index(op.f('ix_ciclos_user_id'), table_name='ciclos')
    op.drop_index(op.f('ix_ciclos_id'), table_name='ciclos')
    op.drop_table('ciclos')
