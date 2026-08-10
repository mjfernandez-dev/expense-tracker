"""Router de movimientos: /movimientos/"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services import movimiento_service

router = APIRouter(prefix="/movimientos", tags=["movimientos"])


@router.post("/", response_model=schemas.MovimientoRead)
def crear_movimiento(
    movimiento: schemas.MovimientoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    return movimiento_service.crear_movimiento(movimiento, current_user.id, db)


@router.get("/descripciones/search")
def search_descripciones(
    q: str = Query(..., min_length=1, description="Texto de búsqueda"),
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Busca descripciones de movimientos existentes que contengan el texto dado.

    Nota: descripcion usa EncryptedString, por lo que NO se puede filtrar con
    ILIKE/LIKE a nivel DB (el LIKE opera contra el blob cifrado). Se traen todas
    las descripciones, se desencriptan automaticamente en Python, y se filtran
    en memoria.
    """
    return movimiento_service.buscar_descripciones(q, limit, current_user.id, db)


@router.delete("/{movimiento_id}")
def eliminar_movimiento(
    movimiento_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    return movimiento_service.eliminar_movimiento(movimiento_id, current_user.id, db)


@router.put("/{movimiento_id}", response_model=schemas.MovimientoRead)
def actualizar_movimiento(
    movimiento_id: int,
    movimiento_update: schemas.MovimientoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    return movimiento_service.actualizar_movimiento(movimiento_id, movimiento_update, current_user.id, db)


@router.get("/", response_model=List[schemas.MovimientoRead])
def list_movimientos(
    tipo: Optional[str] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    return movimiento_service.listar_movimientos(
        current_user.id,
        db,
        tipo,
        fecha_desde,
        fecha_hasta,
        skip=offset,
        limit=limit,
    )
