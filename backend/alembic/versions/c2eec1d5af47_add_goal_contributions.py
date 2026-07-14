"""Add goal_contributions table

Adds the goal_contributions table to track per-source contributions
to wishlist goals with FKs to WishlistItem, Ciclo, and PresupuestoItem.

Revision ID: c2eec1d5af47
Revises: c9d8e7f6a5b4
Create Date: 2026-07-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


# revision identifiers, used by Alembic.
revision: str = 'c2eec1d5af47'
down_revision: Union[str, Sequence[str], None] = 'c9d8e7f6a5b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create goal_contributions table."""
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

    if "goal_contributions" not in tables:
        op.create_table(
            "goal_contributions",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("goal_id", sa.Integer(), sa.ForeignKey("wishlist_items.id"), nullable=False, index=True),
            sa.Column("ciclo_id", sa.Integer(), sa.ForeignKey("ciclos.id"), nullable=False, index=True),
            sa.Column("amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("source_type", sa.String(), nullable=False),
            sa.Column("presupuesto_item_id", sa.Integer(), sa.ForeignKey("presupuesto_items.id"), nullable=True, index=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    """Drop goal_contributions table."""
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

    if "goal_contributions" in tables:
        op.drop_table("goal_contributions")
