"""add_last_notified_on_to_gastos_programados

Adds the last_notified_on column to gastos_programados so the cron
push-reminder endpoint (POST /api/cron/notificar-gastos-programados)
can stay idempotent per day.

Revision ID: d4e5f6a7b8c9
Revises: b8c5a7d3e9f1
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'b8c5a7d3e9f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col['name'] for col in inspector.get_columns('gastos_programados')}
    if 'last_notified_on' not in columns:
        op.add_column(
            'gastos_programados',
            sa.Column('last_notified_on', sa.Date(), nullable=True),
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('gastos_programados', 'last_notified_on')
