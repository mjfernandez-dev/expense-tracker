"""Router de ciclos financieros (Daily Solvency): /ciclos/"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services import ciclo_commitment_service, ciclo_service

router = APIRouter(prefix="/ciclos", tags=["ciclos"])


def _cargar_ciclo_o_404(ciclo_id: int, user_id: int, db: Session) -> models.Ciclo:
    """Carga un ciclo validando propiedad; mapea recursos inexistentes a 404."""
    try:
        return ciclo_service.cargar_ciclo(db, ciclo_id, user_id)
    except ValueError as exc:
        if str(exc) == "_not_found":
            raise HTTPException(status_code=404, detail="Ciclo no encontrado")
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/", response_model=list[schemas.CicloRead])
def listar_ciclos(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Lista todos los ciclos del usuario, sin resumen calculado."""
    ciclos = ciclo_service.listar_ciclos(db, current_user.id, limit=limit, offset=offset)
    return [
        ciclo_service.ciclo_a_read(c, db, current_user.id, con_resumen=False)
        for c in ciclos
    ]


@router.post("/", response_model=schemas.CicloRead, status_code=201)
def crear_ciclo(
    data: schemas.CicloCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Crea un nuevo ciclo financiero."""
    try:
        ciclo = ciclo_service.crear_nuevo_ciclo(
            db, current_user.id, data.fecha_fin, data.ahorro_objetivo, data.movimiento_origen_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ciclo = _cargar_ciclo_o_404(ciclo.id, current_user.id, db)
    return ciclo_service.ciclo_a_read(ciclo, db, current_user.id)


@router.get("/activo", response_model=Optional[schemas.CicloRead])
def get_ciclo_activo(
    response: Response,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Devuelve el ciclo activo del usuario con el resumen calculado en tiempo real.
    Retorna null (204) si no hay ciclo activo.
    """
    ciclo = ciclo_service.get_ciclo_activo(db, current_user.id)
    if not ciclo:
        response.status_code = 204
        return None

    return ciclo_service.ciclo_a_read(ciclo, db, current_user.id)


@router.get("/ultimo", response_model=Optional[schemas.CicloRead])
def get_ultimo_ciclo(
    response: Response,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Devuelve el ciclo cerrado más reciente con su resumen.
    Útil para obtener sugerencias de presupuesto del ciclo anterior.
    Retorna null (204) si no hay ciclos cerrados.
    """
    ciclo = ciclo_service.get_ultimo_ciclo(db, current_user.id)
    if not ciclo:
        response.status_code = 204
        return None

    return ciclo_service.ciclo_a_read(ciclo, db, current_user.id)


@router.get("/{ciclo_id}", response_model=schemas.CicloRead)
def get_ciclo(
    ciclo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Devuelve un ciclo específico con su resumen calculado en tiempo real."""
    ciclo = _cargar_ciclo_o_404(ciclo_id, current_user.id, db)
    return ciclo_service.ciclo_a_read(ciclo, db, current_user.id)


@router.patch("/{ciclo_id}", response_model=schemas.CicloRead)
def actualizar_ciclo(
    ciclo_id: int,
    data: schemas.CicloUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Actualiza fecha_fin y/o ahorro_objetivo del ciclo."""
    ciclo = _cargar_ciclo_o_404(ciclo_id, current_user.id, db)
    try:
        ciclo_service.actualizar_fechas_ciclo(ciclo, data.fecha_inicio, data.fecha_fin, data.ahorro_objetivo, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ciclo_service.ciclo_a_read(ciclo, db, current_user.id)


@router.post("/{ciclo_id}/presupuesto/", response_model=schemas.CicloRead)
def confirmar_presupuesto(
    ciclo_id: int,
    data: schemas.PresupuestoItemBulk,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Confirma (o reemplaza) el presupuesto para este ciclo."""
    ciclo = _cargar_ciclo_o_404(ciclo_id, current_user.id, db)
    try:
        ciclo_commitment_service.aplicar_presupuesto_bulk(
            ciclo, data.items, db, current_user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    ciclo = ciclo_service.cargar_ciclo(db, ciclo_id, current_user.id)
    return ciclo_service.ciclo_a_read(ciclo, db, current_user.id)


@router.patch("/{ciclo_id}/presupuesto/items/{item_id}", response_model=schemas.CicloRead)
def actualizar_monto_presupuesto_item(
    ciclo_id: int,
    item_id: int,
    data: schemas.PresupuestoItemPatch,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Actualiza el monto_estimado de un item de presupuesto (PATCH granular).
    Alternativa al bulk replace: no elimina items ad-hoc.
    """
    ciclo = _cargar_ciclo_o_404(ciclo_id, current_user.id, db)
    try:
        ciclo_commitment_service.actualizar_monto_presupuesto_item(
            ciclo, item_id, data.monto_estimado, db
        )
    except ValueError as exc:
        if str(exc) == "_not_found":
            raise HTTPException(status_code=404, detail="Item de presupuesto no encontrado")
        raise HTTPException(status_code=400, detail=str(exc))
    return ciclo_service.ciclo_a_read(ciclo, db, current_user.id)


@router.post("/{ciclo_id}/presupuesto/items/", response_model=schemas.CicloRead, status_code=201)
def crear_o_vincular_presupuesto_item(
    ciclo_id: int,
    data: schemas.PresupuestoItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Crea (o actualiza) un item de presupuesto para una categoría y vincula los
    gastos del ciclo sin comprometer que coinciden con esa categoría.
    Alternativa granular al bulk replace: no elimina items ad-hoc.
    """
    ciclo = _cargar_ciclo_o_404(ciclo_id, current_user.id, db)
    try:
        ciclo_commitment_service.crear_o_vincular_presupuesto_item(
            ciclo, data, db, current_user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    ciclo = ciclo_service.cargar_ciclo(db, ciclo_id, current_user.id)
    return ciclo_service.ciclo_a_read(ciclo, db, current_user.id)


@router.delete("/{ciclo_id}", status_code=200)
def cerrar_ciclo(
    ciclo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Cierra (desactiva) un ciclo financiero."""
    try:
        ciclo_service.cerrar_ciclo(ciclo_id, current_user.id, db)
    except ValueError as exc:
        if str(exc) == "_not_found":
            raise HTTPException(status_code=404, detail="Ciclo no encontrado")
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Ciclo cerrado correctamente"}


@router.patch("/{ciclo_id}/reabrir", response_model=schemas.CicloRead)
def reabrir_ciclo(
    ciclo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Reactiva un ciclo cerrado. Falla si ya hay otro ciclo activo."""
    try:
        ciclo_service.reabrir_ciclo(ciclo_id, current_user.id, db)
    except ValueError as exc:
        if str(exc) == "_not_found":
            raise HTTPException(status_code=404, detail="Ciclo no encontrado")
        raise HTTPException(status_code=400, detail=str(exc))
    ciclo = _cargar_ciclo_o_404(ciclo_id, current_user.id, db)
    return ciclo_service.ciclo_a_read(ciclo, db, current_user.id)
