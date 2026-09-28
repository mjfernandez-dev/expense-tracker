"""remove_push_notifications

Removes the Web Push notification feature and every column that existed only
to compute its reminder window:

- table push_subscriptions
- gastos_fijos.dia_vencimiento
- gastos_fijos.dias_anticipacion
- gastos_programados.dias_anticipacion
- gastos_programados.last_notified_on

gastos_programados.vencimiento is preserved: it is core domain data shown in
the pending-gastos list, not part of the notification window.

Revision ID: 9c3e7b1d4a58
Revises: a50e8bfdc426
Create Date: 2026-09-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '9c3e7b1d4a58'
down_revision: Union[str, Sequence[str], None] = 'a50e8bfdc426'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Columnas a dropear: tabla -> columnas
_COLUMNAS_A_ELIMINAR = {
    'gastos_fijos': ('dia_vencimiento', 'dias_anticipacion'),
    'gastos_programados': ('dias_anticipacion', 'last_notified_on'),
}


def upgrade() -> None:
    """Drop the push_subscriptions table and the reminder-window columns."""
    inspector = inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if 'push_subscriptions' in tables:
        op.drop_table('push_subscriptions')

    for tabla, columnas in _COLUMNAS_A_ELIMINAR.items():
        if tabla not in tables:
            continue
        existentes = {col['name'] for col in inspector.get_columns(tabla)}
        for columna in columnas:
            if columna in existentes:
                op.drop_column(tabla, columna)


def downgrade() -> None:
    """Recreate the push_subscriptions table and the reminder-window columns."""
    inspector = inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    for tabla, columnas in _COLUMNAS_A_ELIMINAR.items():
        if tabla not in tables:
            continue
        existentes = {col['name'] for col in inspector.get_columns(tabla)}
        for columna in columnas:
            if columna not in existentes:
                tipo = sa.Date() if columna == 'last_notified_on' else sa.Integer()
                op.add_column(tabla, sa.Column(columna, tipo, nullable=True))

    if 'push_subscriptions' not in tables:
        op.create_table('push_subscriptions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('endpoint', sa.String(), nullable=False),
            sa.Column('p256dh', sa.String(), nullable=False),
            sa.Column('auth', sa.String(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('endpoint'),
        )
        op.create_index(op.f('ix_push_subscriptions_id'), 'push_subscriptions', ['id'], unique=False)
        op.create_index(op.f('ix_push_subscriptions_user_id'), 'push_subscriptions', ['user_id'], unique=False)
