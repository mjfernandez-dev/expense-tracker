"""Lógica de negocio para gastos fijos recurrentes."""
from sqlalchemy import func
from sqlalchemy.orm import Session

import models


def gasto_fijo_to_dict(gf, db: Session) -> dict:
    """Construye el dict con stats para GastoFijoRead."""
    stats = db.query(
        func.max(models.Movimiento.importe).label("max_importe"),
        func.count(models.Movimiento.id).label("total_meses"),
    ).filter(models.Movimiento.gasto_fijo_id == gf.id).one()

    ultimo = (
        db.query(models.Movimiento.importe)
        .filter(models.Movimiento.gasto_fijo_id == gf.id)
        .order_by(models.Movimiento.fecha.desc())
        .first()
    )

    return {
        "id": gf.id,
        "user_id": gf.user_id,
        "descripcion": gf.descripcion,
        "categoria_id": gf.categoria_id,
        "user_category_id": gf.user_category_id,
        "activo": gf.activo,
        "created_at": gf.created_at,
        "categoria": gf.categoria,
        "user_category": gf.user_category,
        "max_importe": stats.max_importe,
        "ultimo_importe": ultimo[0] if ultimo else None,
        "total_meses": stats.total_meses,
        "dia_vencimiento": gf.dia_vencimiento,
        "dias_anticipacion": gf.dias_anticipacion,
    }
