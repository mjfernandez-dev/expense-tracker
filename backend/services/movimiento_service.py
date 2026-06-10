"""Lógica de negocio para movimientos: auto-detección y vinculación de presupuesto."""
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

import models
from services.ciclo_commitment_service import calcular_progreso_presupuesto


def load_presupuesto_item(item_id: int, current_user_id: int, db: Session) -> models.PresupuestoItem:
    item = (
        db.query(models.PresupuestoItem)
        .join(models.Ciclo, models.Ciclo.id == models.PresupuestoItem.ciclo_id)
        .filter(
            models.PresupuestoItem.id == item_id,
            models.Ciclo.user_id == current_user_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item de presupuesto no encontrado")
    return item


def resolve_clasificacion(tipo: str, clasificacion: Optional[str]) -> Optional[str]:
    return clasificacion if tipo == "gasto" else None


def unlink_presupuesto_item_on_delete(
    db_movimiento: models.Movimiento,
    current_user_id: int,
    db: Session,
) -> None:
    if db_movimiento.presupuesto_item_id is None:
        return
    item = load_presupuesto_item(db_movimiento.presupuesto_item_id, current_user_id, db)
    item.estado = calcular_progreso_presupuesto(
        item,
        exclude_movimiento_id=db_movimiento.id,
    ).estado


def auto_detectar_presupuesto_item(
    categoria_id: Optional[int],
    user_category_id: Optional[int],
    importe: Decimal,
    user_id: int,
    db: Session,
    exclude_movimiento_id: Optional[int] = None,
) -> Optional[int]:
    ciclo_activo = db.query(models.Ciclo).filter(
        models.Ciclo.user_id == user_id,
        models.Ciclo.activo == True,
    ).first()

    if not ciclo_activo:
        return None

    query = db.query(models.PresupuestoItem).filter(
        models.PresupuestoItem.ciclo_id == ciclo_activo.id,
        models.PresupuestoItem.confirmado == True,
    )

    if categoria_id is not None:
        query = query.filter(models.PresupuestoItem.categoria_id == categoria_id)
    elif user_category_id is not None:
        query = query.filter(models.PresupuestoItem.user_category_id == user_category_id)
    else:
        return None

    item = query.first()
    if not item:
        return None

    return item.id


def apply_presupuesto_item_link(
    db_movimiento: models.Movimiento,
    presupuesto_item_id: Optional[int],
    current_user_id: int,
    db: Session,
) -> None:
    previous_link_id = db_movimiento.presupuesto_item_id
    previous_item = None

    if previous_link_id is not None and previous_link_id != presupuesto_item_id:
        previous_item = load_presupuesto_item(previous_link_id, current_user_id, db)

    if presupuesto_item_id is None:
        db_movimiento.presupuesto_item_id = None
        if previous_link_id is not None:
            previous_item = previous_item or load_presupuesto_item(previous_link_id, current_user_id, db)
            previous_item.estado = calcular_progreso_presupuesto(
                previous_item,
                exclude_movimiento_id=db_movimiento.id,
            ).estado
        return

    if db_movimiento.tipo != "gasto":
        raise HTTPException(status_code=400, detail="Solo los gastos pueden vincularse a items del presupuesto")

    item = load_presupuesto_item(presupuesto_item_id, current_user_id, db)
    if not item.confirmado:
        raise HTTPException(status_code=400, detail="El item de presupuesto no está confirmado")

    db_movimiento.presupuesto_item_id = item.id
    item.estado = calcular_progreso_presupuesto(
        item,
        exclude_movimiento_id=db_movimiento.id,
        extra_importe=Decimal(str(db_movimiento.importe)),
    ).estado

    if previous_item is not None:
        previous_item.estado = calcular_progreso_presupuesto(
            previous_item,
            exclude_movimiento_id=db_movimiento.id,
        ).estado
