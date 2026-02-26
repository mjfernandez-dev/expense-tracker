"""Change money fields from Float to Numeric(10,2)

Revision ID: b3f2a1c9d8e7
Revises: 4c1881da6a4d
Create Date: 2026-02-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f2a1c9d8e7'
down_revision: Union[str, Sequence[str], None] = '4c1881da6a4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch_alter_table funciona en SQLite (recrea la tabla) y PostgreSQL (ALTER normal)
    with op.batch_alter_table('movimientos') as batch_op:
        batch_op.alter_column('importe',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(10, 2),
                              existing_nullable=False)

    with op.batch_alter_table('split_expenses') as batch_op:
        batch_op.alter_column('importe',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(10, 2),
                              existing_nullable=False)

    with op.batch_alter_table('split_expense_participants') as batch_op:
        batch_op.alter_column('share_amount',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(10, 2),
                              existing_nullable=False)

    with op.batch_alter_table('payments') as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(10, 2),
                              existing_nullable=False)


def downgrade() -> None:
    with op.batch_alter_table('payments') as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Numeric(10, 2),
                              type_=sa.Float(),
                              existing_nullable=False)

    with op.batch_alter_table('split_expense_participants') as batch_op:
        batch_op.alter_column('share_amount',
                              existing_type=sa.Numeric(10, 2),
                              type_=sa.Float(),
                              existing_nullable=False)

    with op.batch_alter_table('split_expenses') as batch_op:
        batch_op.alter_column('importe',
                              existing_type=sa.Numeric(10, 2),
                              type_=sa.Float(),
                              existing_nullable=False)

    with op.batch_alter_table('movimientos') as batch_op:
        batch_op.alter_column('importe',
                              existing_type=sa.Numeric(10, 2),
                              type_=sa.Float(),
                              existing_nullable=False)
