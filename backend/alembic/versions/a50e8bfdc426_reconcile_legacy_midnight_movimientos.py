"""Reconcile legacy midnight movimientos with their creation timestamp.

Revision ID: a50e8bfdc426
Revises: d4e5f6a7b8c9
Create Date: 2026-08-31 20:59:27.318063

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a50e8bfdc426'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


movimientos = sa.table(
    "movimientos",
    sa.column("id", sa.Integer()),
    sa.column("user_id", sa.Integer()),
    sa.column("tipo", sa.String()),
    sa.column("fecha", sa.DateTime()),
    sa.column("created_at", sa.DateTime()),
    sa.column("categoria_id", sa.Integer()),
    sa.column("user_category_id", sa.Integer()),
    sa.column("presupuesto_item_id", sa.Integer()),
)
ciclos = sa.table(
    "ciclos",
    sa.column("id", sa.Integer()),
    sa.column("user_id", sa.Integer()),
    sa.column("fecha_inicio", sa.DateTime()),
    sa.column("fecha_fin", sa.DateTime()),
)
presupuesto_items = sa.table(
    "presupuesto_items",
    sa.column("id", sa.Integer()),
    sa.column("ciclo_id", sa.Integer()),
    sa.column("categoria_id", sa.Integer()),
    sa.column("user_category_id", sa.Integer()),
    sa.column("confirmado", sa.Boolean()),
    sa.column("gasto_programado_id", sa.Integer()),
)


def _condicion_fecha_legacy(bind: sa.engine.Connection) -> sa.ColumnElement[bool]:
    """Restrict candidates to provable date-only rows on supported databases.

    An exact-midnight created_at is indistinguishable from intentional midnight
    input with the available columns, so those rows remain untouched.
    """
    if bind.dialect.name == "postgresql":
        fecha_a_medianoche = sa.func.date_trunc("day", movimientos.c.fecha)
        creacion_a_medianoche = sa.func.date_trunc("day", movimientos.c.created_at)
        return sa.and_(
            movimientos.c.fecha == fecha_a_medianoche,
            sa.cast(movimientos.c.fecha, sa.Date)
            == sa.cast(movimientos.c.created_at, sa.Date),
            movimientos.c.created_at != creacion_a_medianoche,
        )

    if bind.dialect.name == "sqlite":
        return sa.and_(
            sa.func.strftime("%H:%M:%S", movimientos.c.fecha) == "00:00:00",
            sa.func.date(movimientos.c.fecha) == sa.func.date(movimientos.c.created_at),
            sa.func.strftime("%H:%M:%S", movimientos.c.created_at) != "00:00:00",
        )

    return sa.and_(
        sa.extract("hour", movimientos.c.fecha) == 0,
        sa.extract("minute", movimientos.c.fecha) == 0,
        sa.extract("second", movimientos.c.fecha) == 0,
        sa.cast(movimientos.c.fecha, sa.Date)
        == sa.cast(movimientos.c.created_at, sa.Date),
        sa.or_(
            sa.extract("hour", movimientos.c.created_at) != 0,
            sa.extract("minute", movimientos.c.created_at) != 0,
            sa.extract("second", movimientos.c.created_at) != 0,
        ),
    )


def _ciclo_inequivoco(
    bind: sa.engine.Connection,
    user_id: int,
    created_at,
):
    """Resolve one effective half-open cycle without falling back to predecessors."""
    inicio_mas_reciente = bind.execute(
        sa.select(sa.func.max(ciclos.c.fecha_inicio)).where(
            ciclos.c.user_id == user_id,
            ciclos.c.fecha_inicio <= created_at,
        )
    ).scalar_one_or_none()
    if inicio_mas_reciente is None:
        return None

    candidatos = bind.execute(
        sa.select(ciclos.c.id, ciclos.c.fecha_inicio, ciclos.c.fecha_fin)
        .where(
            ciclos.c.user_id == user_id,
            ciclos.c.fecha_inicio == inicio_mas_reciente,
        )
        .order_by(ciclos.c.id.asc())
    ).mappings().all()
    if len(candidatos) != 1:
        return None

    ciclo = candidatos[0]
    inicio_sucesor = bind.execute(
        sa.select(sa.func.min(ciclos.c.fecha_inicio)).where(
            ciclos.c.user_id == user_id,
            ciclos.c.fecha_inicio > ciclo["fecha_inicio"],
        )
    ).scalar_one_or_none()
    fin_efectivo = ciclo["fecha_fin"]
    if inicio_sucesor is not None:
        fin_efectivo = min(fin_efectivo, inicio_sucesor)

    return ciclo if created_at < fin_efectivo else None


def _item_presupuesto_inequivoco(
    bind: sa.engine.Connection,
    ciclo_id: int,
    categoria_id,
    user_category_id,
):
    filtros_categoria = []
    if categoria_id is not None:
        filtros_categoria.append(presupuesto_items.c.categoria_id == categoria_id)
    elif user_category_id is not None:
        filtros_categoria.append(
            presupuesto_items.c.user_category_id == user_category_id
        )
    else:
        return None

    candidatos = bind.execute(
        sa.select(presupuesto_items.c.id).where(
            presupuesto_items.c.ciclo_id == ciclo_id,
            presupuesto_items.c.confirmado == sa.true(),
            presupuesto_items.c.gasto_programado_id.is_(None),
            *filtros_categoria,
        )
    ).scalars().all()
    return candidatos[0] if len(candidatos) == 1 else None


def _reconciliar_movimientos_legacy(bind: sa.engine.Connection) -> None:
    candidatos = bind.execute(
        sa.select(
            movimientos.c.id,
            movimientos.c.user_id,
            movimientos.c.tipo,
            movimientos.c.created_at,
            movimientos.c.categoria_id,
            movimientos.c.user_category_id,
            movimientos.c.presupuesto_item_id,
        ).where(_condicion_fecha_legacy(bind))
    ).mappings().all()

    for movimiento in candidatos:
        ciclo = _ciclo_inequivoco(
            bind,
            movimiento["user_id"],
            movimiento["created_at"],
        )
        if ciclo is None:
            continue

        valores = {"fecha": movimiento["created_at"]}
        if (
            movimiento["tipo"] == "gasto"
            and movimiento["presupuesto_item_id"] is None
        ):
            item_id = _item_presupuesto_inequivoco(
                bind,
                ciclo["id"],
                movimiento["categoria_id"],
                movimiento["user_category_id"],
            )
            if item_id is not None:
                valores["presupuesto_item_id"] = item_id

        bind.execute(
            sa.update(movimientos)
            .where(movimientos.c.id == movimiento["id"])
            .values(**valores)
        )


def upgrade() -> None:
    """Repair bounded legacy rows once during the normal deployment migration."""
    _reconciliar_movimientos_legacy(op.get_bind())


def downgrade() -> None:
    """The original date-only values cannot be reconstructed safely."""
