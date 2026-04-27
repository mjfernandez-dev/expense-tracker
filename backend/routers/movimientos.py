"""Router de movimientos: /movimientos/"""
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.ciclo_commitment_service import calcular_progreso_presupuesto

router = APIRouter(prefix="/movimientos", tags=["movimientos"])


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


def _load_presupuesto_item(item_id: int, current_user_id: int, db: Session) -> models.PresupuestoItem:
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


def _apply_presupuesto_item_link(
    db_movimiento: models.Movimiento,
    presupuesto_item_id: Optional[int],
    current_user_id: int,
    db: Session,
) -> None:
    previous_link_id = db_movimiento.presupuesto_item_id
    previous_item = None

    if previous_link_id is not None and previous_link_id != presupuesto_item_id:
        previous_item = _load_presupuesto_item(previous_link_id, current_user_id, db)

    if presupuesto_item_id is None:
        db_movimiento.presupuesto_item_id = None
        if previous_link_id is not None:
            previous_item = previous_item or _load_presupuesto_item(previous_link_id, current_user_id, db)
            previous_item.estado = calcular_progreso_presupuesto(
                previous_item,
                exclude_movimiento_id=db_movimiento.id,
            ).estado
        return

    if db_movimiento.tipo != "gasto":
        raise HTTPException(status_code=400, detail="Solo los gastos pueden vincularse a items del presupuesto")

    item = _load_presupuesto_item(presupuesto_item_id, current_user_id, db)
    if not item.confirmado:
        raise HTTPException(status_code=400, detail="El item de presupuesto no está confirmado")

    importe_movimiento = Decimal(str(db_movimiento.importe))
    progreso_base = calcular_progreso_presupuesto(
        item,
        exclude_movimiento_id=db_movimiento.id,
    )
    if importe_movimiento > progreso_base.pendiente:
        raise HTTPException(
            status_code=400,
            detail=(
                "El gasto supera el monto pendiente del item. "
                f"Pendiente disponible: {float(progreso_base.pendiente):.2f}"
            ),
        )

    db_movimiento.presupuesto_item_id = item.id
    item.estado = calcular_progreso_presupuesto(
        item,
        exclude_movimiento_id=db_movimiento.id,
        extra_importe=importe_movimiento,
    ).estado

    if previous_item is not None:
        previous_item.estado = calcular_progreso_presupuesto(
            previous_item,
            exclude_movimiento_id=db_movimiento.id,
        ).estado


@router.post("/", response_model=schemas.MovimientoRead)
def create_movimiento(
    movimiento: schemas.MovimientoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    _validate_categoria(
        movimiento.categoria_id,
        movimiento.user_category_id,
        current_user.id,
        db,
    )

    datos = movimiento.model_dump(exclude={"presupuesto_item_id"})
    db_movimiento = models.Movimiento(**datos, user_id=current_user.id)
    db.add(db_movimiento)

    _apply_presupuesto_item_link(db_movimiento, movimiento.presupuesto_item_id, current_user.id, db)

    db.commit()
    db.refresh(db_movimiento)
    return db_movimiento


@router.delete("/{movimiento_id}")
def delete_movimiento(
    movimiento_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    movimiento = db.query(models.Movimiento).filter(
        models.Movimiento.id == movimiento_id,
        models.Movimiento.user_id == current_user.id
    ).first()

    if not movimiento:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    if movimiento.presupuesto_item_id is not None:
        item = _load_presupuesto_item(movimiento.presupuesto_item_id, current_user.id, db)
        item.estado = calcular_progreso_presupuesto(
            item,
            exclude_movimiento_id=movimiento.id,
        ).estado

    db.delete(movimiento)
    db.commit()
    return {"message": "Movimiento eliminado correctamente"}


@router.put("/{movimiento_id}", response_model=schemas.MovimientoRead)
def update_movimiento(
    movimiento_id: int,
    movimiento_update: schemas.MovimientoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    db_movimiento = db.query(models.Movimiento).filter(
        models.Movimiento.id == movimiento_id,
        models.Movimiento.user_id == current_user.id
    ).first()

    if not db_movimiento:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    _validate_categoria(
        movimiento_update.categoria_id,
        movimiento_update.user_category_id,
        current_user.id,
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

    _apply_presupuesto_item_link(db_movimiento, movimiento_update.presupuesto_item_id, current_user.id, db)

    db.commit()
    db.refresh(db_movimiento)
    return db_movimiento


@router.get("/", response_model=List[schemas.MovimientoRead])
def list_movimientos(
    tipo: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    query = db.query(models.Movimiento).filter(
        models.Movimiento.user_id == current_user.id
    )
    if tipo:
        query = query.filter(models.Movimiento.tipo == tipo)
    return query.all()


@router.get("/{movimiento_id}", response_model=schemas.MovimientoRead)
def get_movimiento(
    movimiento_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    movimiento = db.query(models.Movimiento).filter(
        models.Movimiento.id == movimiento_id,
        models.Movimiento.user_id == current_user.id
    ).first()

    if not movimiento:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    return movimiento