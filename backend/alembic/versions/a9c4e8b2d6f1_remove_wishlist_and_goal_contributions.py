"""Remove wishlist_items and goal_contributions tables

Drops the wishlist_items and goal_contributions tables along with the
Wishlist (Metas) feature. goal_contributions is dropped first because it
has FKs pointing to wishlist_items.

Revision ID: a9c4e8b2d6f1
Revises: c2eec1d5af47
Create Date: 2026-08-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


# revision identifiers, used by Alembic.
revision: str = 'a9c4e8b2d6f1'
down_revision: Union[str, Sequence[str], None] = 'c2eec1d5af47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop goal_contributions and wishlist_items tables."""
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

    if "goal_contributions" in tables:
        op.drop_table("goal_contributions")

    if "wishlist_items" in tables:
        op.drop_table("wishlist_items")


def downgrade() -> None:
    """Recreate wishlist_items and goal_contributions tables."""
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

    if "wishlist_items" not in tables:
        op.create_table(
            "wishlist_items",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("estimated_cost", sa.Numeric(10, 2), nullable=False),
            sa.Column("monto_ahorrado", sa.Numeric(10, 2), nullable=False, server_default=sa.text("0")),
            sa.Column("priority", sa.String(), nullable=False, server_default=sa.text("'media'")),
            sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'draft'")),
            sa.Column("category_id", sa.Integer(), sa.ForeignKey("user_categories.id"), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

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
