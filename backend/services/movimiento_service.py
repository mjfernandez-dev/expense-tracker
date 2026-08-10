"""Lógica de negocio para movimientos: auto-detección y vinculación de presupuesto."""
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

import models
import schemas
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


def eliminar_movimiento(movimiento_id: int, user_id: int, db: Session) -> dict[str, str]:
    """Elimina un movimiento del usuario, desvinculando su item de presupuesto."""
    movimiento = db.query(models.Movimiento).filter(
        models.Movimiento.id == movimiento_id,
        models.Movimiento.user_id == user_id
    ).first()

    if not movimiento:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    unlink_presupuesto_item_on_delete(movimiento, user_id, db)

    db.delete(movimiento)
    db.commit()
    return {"message": "Movimiento eliminado correctamente"}


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


def _validate_categoria(
    categoria_id: Optional[int],
    user_category_id: Optional[int],
    current_user_id: int,
    db: Session,
) -> None:
    if categoria_id is None and user_category_id is None:
        raise HTTPException(status_code=400, detail="Se requiere al menos una categoría (sistema o personalizada)")

    if categoria_id is not None:
        category_exists = db.query(models.Category).filter(
            models.Category.id == categoria_id
        ).first()
        if not category_exists:
            raise HTTPException(status_code=404, detail="Categoría no existe")
    elif user_category_id is not None:
        user_cat_exists = db.query(models.UserCategory).filter(
            models.UserCategory.id == user_category_id,
            models.UserCategory.user_id == current_user_id
        ).first()
        if not user_cat_exists:
            raise HTTPException(status_code=404, detail="Categoría personalizada no existe")


def _movimiento_con_categorias(movimiento_id: int, db: Session) -> models.Movimiento:
    """Re-query con eager loading de categorías para el response model."""
    return (
        db.query(models.Movimiento)
        .options(
            joinedload(models.Movimiento.categoria),
            joinedload(models.Movimiento.user_category),
        )
        .filter(models.Movimiento.id == movimiento_id)
        .first()
    )


def crear_movimiento(
    movimiento: schemas.MovimientoCreate,
    user_id: int,
    db: Session,
) -> models.Movimiento:
    _validate_categoria(
        movimiento.categoria_id,
        movimiento.user_category_id,
        user_id,
        db,
    )

    datos = movimiento.model_dump(exclude={"presupuesto_item_id", "es_fijo"})
    datos["clasificacion"] = resolve_clasificacion(movimiento.tipo, movimiento.clasificacion)
    db_movimiento = models.Movimiento(**datos, user_id=user_id)
    db.add(db_movimiento)

    # Si es un gasto con es_fijo=True, crear template de GastoFijo y vincular
    if getattr(movimiento, "es_fijo", False) and movimiento.tipo == "gasto":
        gf = models.GastoFijo(
            user_id=user_id,
            descripcion=movimiento.descripcion,
            user_category_id=movimiento.user_category_id,
            categoria_id=movimiento.categoria_id,
            activo=True,
        )
        db.add(gf)
        db.flush()
        db_movimiento.gasto_fijo_id = gf.id

    item_id = movimiento.presupuesto_item_id
    if item_id is None and movimiento.tipo == "gasto":
        item_id = auto_detectar_presupuesto_item(
            movimiento.categoria_id,
            movimiento.user_category_id,
            Decimal(str(movimiento.importe)),
            user_id,
            db,
        )

    apply_presupuesto_item_link(db_movimiento, item_id, user_id, db)

    db.commit()
    return _movimiento_con_categorias(db_movimiento.id, db)


def actualizar_movimiento(
    movimiento_id: int,
    movimiento_update: schemas.MovimientoCreate,
    user_id: int,
    db: Session,
) -> models.Movimiento:
    db_movimiento = db.query(models.Movimiento).filter(
        models.Movimiento.id == movimiento_id,
        models.Movimiento.user_id == user_id
    ).first()

    if not db_movimiento:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    _validate_categoria(
        movimiento_update.categoria_id,
        movimiento_update.user_category_id,
        user_id,
        db,
    )

    db_movimiento.importe = movimiento_update.importe
    db_movimiento.fecha = movimiento_update.fecha
    db_movimiento.descripcion = movimiento_update.descripcion
    db_movimiento.nota = movimiento_update.nota
    db_movimiento.tipo = movimiento_update.tipo
    db_movimiento.categoria_id = movimiento_update.categoria_id
    db_movimiento.user_category_id = movimiento_update.user_category_id
    db_movimiento.medio_pago = movimiento_update.medio_pago
    db_movimiento.es_inicio_ciclo = movimiento_update.es_inicio_ciclo
    db_movimiento.clasificacion = resolve_clasificacion(movimiento_update.tipo, movimiento_update.clasificacion)

    item_id = movimiento_update.presupuesto_item_id
    if item_id is None and movimiento_update.tipo == "gasto":
        item_id = auto_detectar_presupuesto_item(
            movimiento_update.categoria_id,
            movimiento_update.user_category_id,
            Decimal(str(movimiento_update.importe)),
            user_id,
            db,
            exclude_movimiento_id=movimiento_id,
        )

    apply_presupuesto_item_link(db_movimiento, item_id, user_id, db)

    db.commit()
    return _movimiento_con_categorias(movimiento_id, db)


def listar_movimientos(
    user_id: int,
    db: Session,
    tipo: Optional[str] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[models.Movimiento]:
    """Lista movimientos del usuario con filtro, orden y paginación."""
    query = db.query(models.Movimiento).options(
        joinedload(models.Movimiento.categoria),
        joinedload(models.Movimiento.user_category),
    ).filter(models.Movimiento.user_id == user_id)
    if tipo:
        query = query.filter(models.Movimiento.tipo == tipo)
    if fecha_desde:
        query = query.filter(models.Movimiento.fecha >= fecha_desde)
    if fecha_hasta:
        # fecha es DateTime: comparar contra el inicio del día siguiente hace el
        # filtro inclusivo para movimientos del mismo día con hora != medianoche.
        query = query.filter(models.Movimiento.fecha < fecha_hasta + timedelta(days=1))
    return query.order_by(
        models.Movimiento.fecha.desc(),
        models.Movimiento.id.desc(),
    ).limit(limit).offset(skip).all()


def buscar_descripciones(q: str, limit: int, user_id: int, db: Session) -> list[dict[str, object]]:
    """Busca descripciones existentes del usuario que contengan el texto dado.

    Nota: descripcion usa EncryptedString, por lo que NO se puede filtrar con
    ILIKE/LIKE a nivel DB (el LIKE opera contra el blob cifrado). Se traen todas
    las descripciones, se desencriptan automaticamente en Python, y se filtran
    en memoria.
    """
    rows = (
        db.query(models.Movimiento.descripcion)
        .filter(models.Movimiento.user_id == user_id)
        .all()
    )
    q_lower = q.lower()
    desc_counts: dict[str, int] = {}
    for (desc,) in rows:
        if desc and q_lower in desc.lower():
            desc_counts[desc] = desc_counts.get(desc, 0) + 1

    sorted_descs = sorted(desc_counts.items(), key=lambda x: -x[1])[:limit]
    return [{"descripcion": d, "frecuencia": c} for d, c in sorted_descs]
