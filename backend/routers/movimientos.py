"""Router de movimientos: /movimientos/"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db

router = APIRouter(prefix="/movimientos", tags=["movimientos"])


@router.post("/", response_model=schemas.MovimientoRead)
def create_movimiento(
    movimiento: schemas.MovimientoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    if movimiento.categoria_id is None and movimiento.user_category_id is None:
        raise HTTPException(status_code=400, detail="Se requiere al menos una categoría (sistema o personalizada)")

    if movimiento.categoria_id is not None:
        category_exists = db.query(models.Category).filter(
            models.Category.id == movimiento.categoria_id
        ).first()
        if not category_exists:
            raise HTTPException(status_code=404, detail="Categoría no existe")
    elif movimiento.user_category_id is not None:
        user_cat_exists = db.query(models.UserCategory).filter(
            models.UserCategory.id == movimiento.user_category_id,
            models.UserCategory.user_id == current_user.id
        ).first()
        if not user_cat_exists:
            raise HTTPException(status_code=404, detail="Categoría personalizada no existe")

    datos = movimiento.model_dump(exclude={"es_fijo"})
    db_movimiento = models.Movimiento(**datos, user_id=current_user.id)
    db.add(db_movimiento)
    db.flush()

    if movimiento.es_fijo:
        db_gasto_fijo = models.GastoFijo(
            user_id=current_user.id,
            descripcion=movimiento.descripcion,
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

    if movimiento_update.categoria_id is not None:
        category_exists = db.query(models.Category).filter(
            models.Category.id == movimiento_update.categoria_id
        ).first()
        if not category_exists:
            raise HTTPException(status_code=404, detail="Categoría no existe")
    elif movimiento_update.user_category_id is not None:
        user_cat_exists = db.query(models.UserCategory).filter(
            models.UserCategory.id == movimiento_update.user_category_id,
            models.UserCategory.user_id == current_user.id
        ).first()
        if not user_cat_exists:
            raise HTTPException(status_code=404, detail="Categoría personalizada no existe")

    db_movimiento.importe = movimiento_update.importe
    db_movimiento.fecha = movimiento_update.fecha
    db_movimiento.descripcion = movimiento_update.descripcion
    db_movimiento.nota = movimiento_update.nota
    db_movimiento.tipo = movimiento_update.tipo
    db_movimiento.categoria_id = movimiento_update.categoria_id
    db_movimiento.user_category_id = movimiento_update.user_category_id

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
