"""Create wishlist_items table

Adds the wishlist_items table for the Wishlist feature (Lista de Deseos),
with multi-tenant user_id FK, EncryptedString fields, and category FK.

Revision ID: c9d8e7f6a5b4
Revises: b4a50c6e16e5
Create Date: 2026-07-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


# revision identifiers, used by Alembic.
revision: str = 'c9d8e7f6a5b4'
down_revision: Union[str, Sequence[str], None] = 'b4a50c6e16e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create wishlist_items table."""
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


def downgrade() -> None:
    """Drop wishlist_items table."""
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()

    if "wishlist_items" in tables:
        op.drop_table("wishlist_items")
