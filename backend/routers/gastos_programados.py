"""Router de gastos programados: /gastos-programados/"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services import gasto_programado_service

router = APIRouter(prefix="/gastos-programados", tags=["gastos-programados"])


@router.post("/", response_model=schemas.GastoProgramadoRead, status_code=201)
def crear_gasto_programado(
    data: schemas.GastoProgramadoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Crea un gasto programado; reserva presupuesto si vence dentro del ciclo activo."""
    try:
        return gasto_programado_service.crear_gasto_programado(data, current_user.id, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/", response_model=list[schemas.GastoProgramadoRead])
def listar_gastos_programados(
    estado: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Lista los gastos programados del usuario, ordenados por vencimiento."""
    return gasto_programado_service.listar_gastos_programados(
        current_user.id,
        db,
        estado=estado,
        skip=offset,
        limit=limit,
    )


@router.patch("/{gasto_programado_id}", response_model=schemas.GastoProgramadoRead)
def actualizar_gasto_programado(
    gasto_programado_id: int,
    data: schemas.GastoProgramadoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Actualiza un gasto programado y reconcilia su reserva en el ciclo activo."""
    try:
        return gasto_programado_service.actualizar_gasto_programado(
            gasto_programado_id, current_user.id, data, db
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{gasto_programado_id}/pagar")
def pagar_gasto_programado(
    gasto_programado_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Registra el pago: crea el Movimiento real y marca el gasto como pagado."""
    gp, movimiento = gasto_programado_service.pagar_gasto_programado(
        gasto_programado_id, current_user.id, db
    )
    return {
        "programado": schemas.GastoProgramadoRead.model_validate(gp),
        "movimiento": schemas.MovimientoRead.model_validate(movimiento),
    }


@router.post("/{gasto_programado_id}/cancelar", response_model=schemas.GastoProgramadoRead)
def cancelar_gasto_programado(
    gasto_programado_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Cancela un gasto programado pendiente y libera su reserva."""
    return gasto_programado_service.cancelar_gasto_programado(
        gasto_programado_id, current_user.id, db
    )


@router.delete("/{gasto_programado_id}", status_code=204)
def eliminar_gasto_programado(
    gasto_programado_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Elimina definitivamente un gasto programado pendiente."""
    gasto_programado_service.eliminar_gasto_programado(
        gasto_programado_id, current_user.id, db
    )
    return None
