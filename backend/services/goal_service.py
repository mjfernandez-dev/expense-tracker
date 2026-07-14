"""Servicio de contribuciones a metas (wishlist goals).

Valida disponibilidad de fondos por fuente (disponible / presupuesto),
crea registros de GoalContribution y actualiza monto_ahorrado.
"""
from decimal import Decimal
from typing import List

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

import models
import schemas
from services.ciclo_service import calcular_resumen
from services.ciclo_time_service import ahora_buenos_aires


def _get_active_ciclo(db: Session, user_id: int) -> models.Ciclo:
    """Obtiene el ciclo activo del usuario o lanza 400."""
    ciclo = (
        db.query(models.Ciclo)
        .filter(models.Ciclo.user_id == user_id, models.Ciclo.activo == True)
        .first()
    )
    if not ciclo:
        raise HTTPException(
            status_code=400,
            detail="No hay un ciclo activo. Creá uno antes de aportar a una meta."
        )
    return ciclo


def _get_goal_or_404(db: Session, goal_id: int, user_id: int) -> models.WishlistItem:
    """Obtiene un wishlist item validando pertenencia al usuario."""
    item = (
        db.query(models.WishlistItem)
        .filter(models.WishlistItem.id == goal_id, models.WishlistItem.user_id == user_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Meta no encontrada")
    return item


def _get_presupuesto_item_or_404(
    db: Session, item_id: int, user_id: int, ciclo_id: int
) -> models.PresupuestoItem:
    """Obtiene un presupuesto item validando que pertenece al ciclo del usuario."""
    item = (
        db.query(models.PresupuestoItem)
        .join(models.Ciclo)
        .filter(
            models.PresupuestoItem.id == item_id,
            models.PresupuestoItem.ciclo_id == ciclo_id,
            models.Ciclo.user_id == user_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item de presupuesto no encontrado")
    return item


def _get_already_contributed_for_item(
    db: Session, presupuesto_item_id: int, ciclo_id: int
) -> Decimal:
    """Suma de contribuciones previas desde un item de presupuesto a cualquier goal."""
    result = (
        db.query(func.coalesce(func.sum(models.GoalContribution.amount), 0))
        .filter(
            models.GoalContribution.presupuesto_item_id == presupuesto_item_id,
            models.GoalContribution.ciclo_id == ciclo_id,
        )
        .scalar()
    )
    return Decimal(str(result))


def _validate_presupuesto_source(
    db: Session,
    presupuesto_item_id: int,
    amount: Decimal,
    user_id: int,
    ciclo_id: int,
) -> None:
    """Valida que el monto no exceda el remanente del item de presupuesto."""
    item = _get_presupuesto_item_or_404(db, presupuesto_item_id, user_id, ciclo_id)

    # Ejecutado = suma de movimientos tipo gasto vinculados a este item
    ejecutado = (
        db.query(func.coalesce(func.sum(models.Movimiento.importe), 0))
        .filter(
            models.Movimiento.presupuesto_item_id == presupuesto_item_id,
            models.Movimiento.tipo == "gasto",
        )
        .scalar()
    )
    ejecutado = Decimal(str(ejecutado))

    already_contributed = _get_already_contributed_for_item(db, presupuesto_item_id, ciclo_id)
    remaining = item.monto_estimado - ejecutado - already_contributed

    if amount > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"El presupuesto restante para este item es ${remaining:.2f}. "
                   f"No se pueden aportar ${amount:.2f}."
        )


def _validate_disponible_source(
    db: Session,
    amount: Decimal,
    ciclo: models.Ciclo,
    user_id: int,
    pending_disponible: Decimal,
) -> Decimal:
    """Valida que el monto no exceda el saldo disponible actual.

    Returns the updated pending_disponible amount.
    """
    resumen = calcular_resumen(ciclo, db, user_id)
    saldo_disponible_actual = resumen.saldo_disponible_total - resumen.gastos_no_planificados

    if amount > saldo_disponible_actual:
        raise HTTPException(
            status_code=400,
            detail=f"El saldo disponible actual es ${saldo_disponible_actual:.2f}. "
                   f"No se pueden aportar ${amount:.2f}."
        )
    return pending_disponible - amount


def contribute_to_goal(
    db: Session,
    user_id: int,
    goal_id: int,
    data: schemas.GoalContributeRequest,
) -> models.WishlistItem:
    """Valida y ejecuta una contribución con split sources.

    Todas las validaciones y escrituras ocurren dentro de la misma transacción.
    """
    item = _get_goal_or_404(db, goal_id, user_id)
    ciclo = _get_active_ciclo(db, user_id)

    if not data.sources:
        raise HTTPException(status_code=400, detail="Debe especificar al menos una fuente")

    # Validar cada fuente antes de escribir
    total_amount = Decimal("0")
    for source in data.sources:
        amount = Decimal(str(source.amount))
        if amount <= 0:
            raise HTTPException(
                status_code=400, detail="El monto debe ser positivo"
            )

        if source.source_type == "presupuesto":
            if not source.presupuesto_item_id:
                raise HTTPException(
                    status_code=400,
                    detail="Debe especificar presupuesto_item_id para fuente 'presupuesto'"
                )
            _validate_presupuesto_source(
                db, source.presupuesto_item_id, amount, user_id, ciclo.id
            )
        elif source.source_type == "disponible":
            _validate_disponible_source(db, amount, ciclo, user_id, Decimal("0"))
        else:
            raise HTTPException(
                status_code=400,
                detail=f"source_type inválido: {source.source_type}"
            )

        total_amount += amount

    # Crear los registros de contribución
    for source in data.sources:
        amount = Decimal(str(source.amount))
        contrib = models.GoalContribution(
            goal_id=goal_id,
            ciclo_id=ciclo.id,
            amount=amount,
            source_type=source.source_type,
            presupuesto_item_id=source.presupuesto_item_id or None,
            created_at=ahora_buenos_aires(),
        )
        db.add(contrib)

    # Actualizar monto_ahorrado
    item.monto_ahorrado = (item.monto_ahorrado or Decimal("0")) + total_amount
    db.flush()
    db.refresh(item)
    return item


def withdraw_from_goal(
    db: Session,
    user_id: int,
    goal_id: int,
    amount: Decimal,
) -> models.WishlistItem:
    """Retira fondos de una meta y los devuelve al disponible."""
    item = _get_goal_or_404(db, goal_id, user_id)
    ciclo = _get_active_ciclo(db, user_id)

    monto_ahorrado = item.monto_ahorrado or Decimal("0")
    if amount > monto_ahorrado:
        raise HTTPException(
            status_code=400,
            detail=f"La meta tiene ahorrado ${monto_ahorrado:.2f}. "
                   f"No se pueden retirar ${amount:.2f}."
        )

    if amount <= 0:
        raise HTTPException(
            status_code=400, detail="El monto a retirar debe ser positivo"
        )

    # Crear registro con amount negativo
    contrib = models.GoalContribution(
        goal_id=goal_id,
        ciclo_id=ciclo.id,
        amount=-amount,
        source_type="disponible",
        created_at=ahora_buenos_aires(),
    )
    db.add(contrib)

    # Actualizar monto_ahorrado
    item.monto_ahorrado = monto_ahorrado - amount
    db.flush()
    db.refresh(item)
    return item


def list_contributions_for_goal(
    db: Session,
    goal_id: int,
    user_id: int,
) -> List[models.GoalContribution]:
    """Lista todas las contribuciones de una meta, validando pertenencia."""
    item = _get_goal_or_404(db, goal_id, user_id)
    contribs = (
        db.query(models.GoalContribution)
        .filter(models.GoalContribution.goal_id == item.id)
        .order_by(models.GoalContribution.created_at.desc())
        .all()
    )
    return contribs
