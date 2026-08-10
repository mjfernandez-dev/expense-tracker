"""Lógica de negocio para gastos fijos recurrentes."""
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

import models
import schemas


def listar_gastos_fijos(
    db: Session,
    user_id: int,
    limit: int = 100,
    offset: int = 0,
) -> list[models.GastoFijo]:
    """Lista los gastos fijos del usuario con sus categorías eager-loaded."""
    return (
        db.query(models.GastoFijo)
        .filter(models.GastoFijo.user_id == user_id)
        .options(
            joinedload(models.GastoFijo.categoria),
            joinedload(models.GastoFijo.user_category),
        )
        .limit(limit)
        .offset(offset)
        .all()
    )


def actualizar_gasto_fijo(
    db: Session,
    gasto_fijo_id: int,
    user_id: int,
    update: schemas.GastoFijoUpdate,
) -> models.GastoFijo:
    """Actualiza los campos provistos de un gasto fijo del usuario.
    Raises ValueError("_not_found") si el gasto fijo no existe o no pertenece al usuario.
    """
    gf = (
        db.query(models.GastoFijo)
        .filter(
            models.GastoFijo.id == gasto_fijo_id,
            models.GastoFijo.user_id == user_id,
        )
        .first()
    )
    if not gf:
        raise ValueError("_not_found")

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(gf, field, value)
    db.commit()
    db.refresh(gf)
    return gf


def gastos_fijos_to_dicts(gastos_fijos, db: Session) -> list[dict]:
    """Construye los dicts con stats para GastoFijoRead en 2 queries totales (sin N+1).

    Una query agregada (GROUP BY) para max_importe/total_meses por gasto fijo y
    una query ordenada para el último importe por gasto fijo.
    """
    if not gastos_fijos:
        return []

    ids = [gf.id for gf in gastos_fijos]

    stats = (
        db.query(
            models.Movimiento.gasto_fijo_id,
            func.max(models.Movimiento.importe).label("max_importe"),
            func.count(models.Movimiento.id).label("total_meses"),
        )
        .filter(models.Movimiento.gasto_fijo_id.in_(ids))
        .group_by(models.Movimiento.gasto_fijo_id)
        .all()
    )
    stats_por_gasto_fijo = {
        gasto_fijo_id: (max_importe, total_meses)
        for gasto_fijo_id, max_importe, total_meses in stats
    }

    # Último importe por gasto fijo: una sola query ordenada. La primera fila de
    # cada gasto fijo es la más reciente (mismo criterio que order_by + first).
    ultimo_por_gasto_fijo: dict[int, Decimal] = {}
    filas = (
        db.query(models.Movimiento.gasto_fijo_id, models.Movimiento.importe)
        .filter(models.Movimiento.gasto_fijo_id.in_(ids))
        .order_by(models.Movimiento.fecha.desc(), models.Movimiento.id)
        .all()
    )
    for gasto_fijo_id, importe in filas:
        ultimo_por_gasto_fijo.setdefault(gasto_fijo_id, importe)

    return [
        {
            "id": gf.id,
            "user_id": gf.user_id,
            "descripcion": gf.descripcion,
            "categoria_id": gf.categoria_id,
            "user_category_id": gf.user_category_id,
            "activo": gf.activo,
            "created_at": gf.created_at,
            "categoria": gf.categoria,
            "user_category": gf.user_category,
            "max_importe": stats_por_gasto_fijo.get(gf.id, (None, 0))[0],
            "ultimo_importe": ultimo_por_gasto_fijo.get(gf.id),
            "total_meses": stats_por_gasto_fijo.get(gf.id, (None, 0))[1],
            "dia_vencimiento": gf.dia_vencimiento,
            "dias_anticipacion": gf.dias_anticipacion,
        }
        for gf in gastos_fijos
    ]


def gasto_fijo_to_dict(gf, db: Session) -> dict:
    """Construye el dict con stats para GastoFijoRead (un solo gasto fijo)."""
    return gastos_fijos_to_dicts([gf], db)[0]
