"""Router de gastos fijos recurrentes: /gastos-fijos/"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.gastos_fijos_service import gasto_fijo_to_dict, desligar_movimientos

router = APIRouter(prefix="/gastos-fijos", tags=["gastos-fijos"])


@router.get("/", response_model=List[schemas.GastoFijoRead])
def list_gastos_fijos(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    gastos_fijos = (
        db.query(models.GastoFijo)
        .filter(models.GastoFijo.user_id == current_user.id)
        .options(joinedload(models.GastoFijo.categoria), joinedload(models.GastoFijo.user_category))
        .limit(limit).offset(offset)
        .all()
    )
    return [gasto_fijo_to_dict(gf, db) for gf in gastos_fijos]


@router.put("/{gasto_fijo_id}", response_model=schemas.GastoFijoRead)
def update_gasto_fijo(
    gasto_fijo_id: int,
    update: schemas.GastoFijoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    gf = db.query(models.GastoFijo).filter(
        models.GastoFijo.id == gasto_fijo_id,
        models.GastoFijo.user_id == current_user.id
    ).first()
    if not gf:
        raise HTTPException(status_code=404, detail="Gasto fijo no encontrado")

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(gf, field, value)
    db.commit()
    db.refresh(gf)

    return gasto_fijo_to_dict(gf, db)


@router.delete("/{gasto_fijo_id}")
def delete_gasto_fijo(
    gasto_fijo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    gf = db.query(models.GastoFijo).filter(
        models.GastoFijo.id == gasto_fijo_id,
        models.GastoFijo.user_id == current_user.id
    ).first()
    if not gf:
        raise HTTPException(status_code=404, detail="Gasto fijo no encontrado")

    desligar_movimientos(gasto_fijo_id, db)
    db.delete(gf)
    db.commit()
    return {"message": "Gasto fijo eliminado correctamente"}
