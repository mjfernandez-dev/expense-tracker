"""Add presupuesto base template

Revision ID: f6a7b8c9d0e1
Revises: e5d4c3b2a1f0
Create Date: 2026-05-22
"""
from typing import Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5d4c3b2a1f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa_inspect(bind)

    user_cols = {c["name"] for c in inspector.get_columns("users")}
    if "ahorro_objetivo_default" not in user_cols:
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("ahorro_objetivo_default", sa.Numeric(10, 2), nullable=True))

    inspector = sa_inspect(bind)
    cat_cols = {c["name"] for c in inspector.get_columns("user_categories")}
    with op.batch_alter_table("user_categories") as batch_op:
        if "monto_default" not in cat_cols:
            batch_op.add_column(sa.Column("monto_default", sa.Numeric(10, 2), nullable=True))
        if "tiene_monto_fijo" not in cat_cols:
            batch_op.add_column(sa.Column("tiene_monto_fijo", sa.Boolean(), nullable=False, server_default=sa.false()))

    with op.batch_alter_table("user_categories") as batch_op:
        batch_op.alter_column("tiene_monto_fijo", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("user_categories") as batch_op:
        batch_op.drop_column("tiene_monto_fijo")
        batch_op.drop_column("monto_default")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("ahorro_objetivo_default")
