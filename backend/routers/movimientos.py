"""Router de movimientos: /movimientos/"""
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.ciclo_commitment_service import calcular_progreso_compromiso

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


def _load_ciclo_gasto_fijo(ciclo_gasto_fijo_id: int, current_user_id: int, db: Session) -> models.CicloGastoFijo:
    cgf = (
        db.query(models.CicloGastoFijo)
        .join(models.Ciclo, models.Ciclo.id == models.CicloGastoFijo.ciclo_id)
        .filter(
            models.CicloGastoFijo.id == ciclo_gasto_fijo_id,
            models.Ciclo.user_id == current_user_id,
        )
        .first()
    )
    if not cgf:
        raise HTTPException(status_code=404, detail="Gasto comprometido del ciclo no encontrado")
    return cgf


def _apply_ciclo_gasto_fijo_link(
    db_movimiento: models.Movimiento,
    ciclo_gasto_fijo_id: Optional[int],
    current_user_id: int,
    db: Session,
) -> None:
    previous_link_id = db_movimiento.ciclo_gasto_fijo_id
    previous_cgf = None

    if previous_link_id is not None and previous_link_id != ciclo_gasto_fijo_id:
        previous_cgf = _load_ciclo_gasto_fijo(previous_link_id, current_user_id, db)

    if ciclo_gasto_fijo_id is None:
        db_movimiento.ciclo_gasto_fijo_id = None
        if previous_link_id is not None:
            previous_cgf = previous_cgf or _load_ciclo_gasto_fijo(previous_link_id, current_user_id, db)
            previous_cgf.estado = calcular_progreso_compromiso(
                previous_cgf,
                exclude_movimiento_id=db_movimiento.id,
            ).estado
        return

    if db_movimiento.tipo != "gasto":
        raise HTTPException(status_code=400, detail="Solo los gastos pueden vincularse a compromisos del ciclo")

    cgf = _load_ciclo_gasto_fijo(ciclo_gasto_fijo_id, current_user_id, db)
    if not cgf.confirmado:
        raise HTTPException(status_code=400, detail="El gasto comprometido del ciclo no esta confirmado")

    importe_movimiento = Decimal(str(db_movimiento.importe))
    progreso_base = calcular_progreso_compromiso(
        cgf,
        exclude_movimiento_id=db_movimiento.id,
    )
    if importe_movimiento > progreso_base.pendiente:
        raise HTTPException(
            status_code=400,
            detail=(
                "El gasto supera el monto pendiente del compromiso. "
                f"Pendiente disponible: {float(progreso_base.pendiente):.2f}"
            ),
        )

    db_movimiento.ciclo_gasto_fijo_id = cgf.id
    cgf.estado = calcular_progreso_compromiso(
        cgf,
        exclude_movimiento_id=db_movimiento.id,
        extra_importe=importe_movimiento,
    ).estado

    if previous_cgf is not None:
        previous_cgf.estado = calcular_progreso_compromiso(
            previous_cgf,
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

    datos = movimiento.model_dump(exclude={"es_fijo", "ciclo_gasto_fijo_id"})
    db_movimiento = models.Movimiento(**datos, user_id=current_user.id)
    db.add(db_movimiento)

    _apply_ciclo_gasto_fijo_link(db_movimiento, movimiento.ciclo_gasto_fijo_id, current_user.id, db)

    db.flush()

    if movimiento.es_fijo:
        db_gasto_fijo = models.GastoFijo(
            user_id=current_user.id,
            descripcion=movimiento.descripcion,
            tipo=movimiento.tipo,
            categoria_id=movimiento.categoria_id,
            user_category_id=movimiento.user_category_id,
        )
        db.add(db_gasto_fijo)
        db.flush()
        db_movimiento.gasto_fijo_id = db_gasto_fijo.id

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

    if movimiento.ciclo_gasto_fijo_id is not None:
        cgf = _load_ciclo_gasto_fijo(movimiento.ciclo_gasto_fijo_id, current_user.id, db)
        cgf.estado = calcular_progreso_compromiso(
            cgf,
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

    _apply_ciclo_gasto_fijo_link(db_movimiento, movimiento_update.ciclo_gasto_fijo_id, current_user.id, db)

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
