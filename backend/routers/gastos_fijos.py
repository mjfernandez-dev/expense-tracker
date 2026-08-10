"""Router de gastos fijos recurrentes: /gastos-fijos/"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services import gastos_fijos_service

router = APIRouter(prefix="/gastos-fijos", tags=["gastos-fijos"])


@router.get("/", response_model=List[schemas.GastoFijoRead])
def listar_gastos_fijos(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    gastos_fijos = gastos_fijos_service.listar_gastos_fijos(
        db, current_user.id, limit=limit, offset=offset
    )
    return gastos_fijos_service.gastos_fijos_to_dicts(gastos_fijos, db)


@router.put("/{gasto_fijo_id}", response_model=schemas.GastoFijoRead)
def actualizar_gasto_fijo(
    gasto_fijo_id: int,
    update: schemas.GastoFijoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    try:
        gf = gastos_fijos_service.actualizar_gasto_fijo(
            db, gasto_fijo_id, current_user.id, update
        )
    except ValueError as exc:
        if str(exc) == "_not_found":
            raise HTTPException(status_code=404, detail="Gasto fijo no encontrado")
        raise HTTPException(status_code=400, detail=str(exc))

    return gastos_fijos_service.gasto_fijo_to_dict(gf, db)
