"""merge push_subscriptions and inversiones heads

Revision ID: 30e10559e9dc
Revises: 72c61f0bb3d4, a1b2c3d4e5f7
Create Date: 2026-06-08 15:45:12.522511

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '30e10559e9dc'
down_revision: Union[str, Sequence[str], None] = ('72c61f0bb3d4', 'a1b2c3d4e5f7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
