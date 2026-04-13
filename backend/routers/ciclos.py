"""Router de ciclos financieros (Daily Solvency): /ciclos/"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.ciclo_commitment_service import calcular_progreso_compromiso
from services.ciclo_service import calcular_resumen
from services import ciclo_time_service
from services.scheduler_service import sincronizar_gastos_fijos_en_ciclo

router = APIRouter(prefix="/ciclos", tags=["ciclos"])


def _load_ciclo(ciclo_id: int, user_id: int, db: Session) -> models.Ciclo:
    """Carga un ciclo por ID validando propiedad del usuario."""
    ciclo = (
        db.query(models.Ciclo)
        .options(
            joinedload(models.Ciclo.gastos_fijos_ciclo).joinedload(
                models.CicloGastoFijo.gasto_fijo
            ).joinedload(models.GastoFijo.categoria),
            joinedload(models.Ciclo.gastos_fijos_ciclo).joinedload(
                models.CicloGastoFijo.gasto_fijo
            ).joinedload(models.GastoFijo.user_category),
            joinedload(models.Ciclo.gastos_fijos_ciclo).joinedload(
                models.CicloGastoFijo.movimientos
            ),
        )
        .filter(models.Ciclo.id == ciclo_id, models.Ciclo.user_id == user_id)
        .first()
    )
    if not ciclo:
        raise HTTPException(status_code=404, detail="Ciclo no encontrado")
    return ciclo


def _ciclo_to_read(ciclo: models.Ciclo, db: Session, user_id: int) -> schemas.CicloRead:
    """Construye CicloRead con resumen calculado."""
    resumen = calcular_resumen(ciclo, db, user_id)
    return schemas.CicloRead(
        id=ciclo.id,
        user_id=ciclo.user_id,
        movimiento_origen_id=ciclo.movimiento_origen_id,
        fecha_inicio=ciclo.fecha_inicio,
        fecha_fin=ciclo.fecha_fin,
        ahorro_objetivo=ciclo.ahorro_objetivo,
        activo=ciclo.activo,
        created_at=ciclo.created_at,
        resumen=resumen,
    )


@router.post("/", response_model=schemas.CicloRead, status_code=201)
def crear_ciclo(
    data: schemas.CicloCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Crea un nuevo ciclo financiero.
    Si ya existe uno activo, lo cierra automáticamente.
    FR-001: Inicio de Ciclo. FR-002 + FR-003: fecha_fin + ahorro_objetivo.
    """
    if data.fecha_fin <= ciclo_time_service.ahora_buenos_aires():
        raise HTTPException(status_code=400, detail="La fecha de fin debe ser posterior a hoy")

    # Cerrar ciclo activo anterior si existe
    ciclo_anterior = (
        db.query(models.Ciclo)
        .filter(models.Ciclo.user_id == current_user.id, models.Ciclo.activo == True)
        .first()
    )
    if ciclo_anterior:
        ciclo_anterior.activo = False

    # fecha_inicio = fecha del movimiento de origen para incluirlo en el cálculo
    fecha_inicio = ciclo_time_service.ahora_buenos_aires()
    if data.movimiento_origen_id:
        mov_origen = (
            db.query(models.Movimiento)
            .filter(
                models.Movimiento.id == data.movimiento_origen_id,
                models.Movimiento.user_id == current_user.id,
            )
            .first()
        )
        if mov_origen:
            fecha_inicio = mov_origen.fecha

    ciclo = models.Ciclo(
        user_id=current_user.id,
        movimiento_origen_id=data.movimiento_origen_id,
        fecha_inicio=fecha_inicio,
        fecha_fin=data.fecha_fin,
        ahorro_objetivo=data.ahorro_objetivo,
        activo=True,
    )
    db.add(ciclo)
    db.flush()
    db.refresh(ciclo)

    sincronizar_gastos_fijos_en_ciclo(ciclo, db)

    db.commit()
    db.refresh(ciclo)

    ciclo = _load_ciclo(ciclo.id, current_user.id, db)
    return _ciclo_to_read(ciclo, db, current_user.id)


@router.get("/activo", response_model=Optional[schemas.CicloRead])
def get_ciclo_activo(
    response: Response,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Devuelve el ciclo activo del usuario con el resumen calculado en tiempo real.
    Retorna null (204) si no hay ciclo activo.
    FR-006: Daily Cap. FR-007: Recálculo dinámico.
    """
    ciclo = (
        db.query(models.Ciclo)
        .options(
            joinedload(models.Ciclo.gastos_fijos_ciclo).joinedload(
                models.CicloGastoFijo.gasto_fijo
            ).joinedload(models.GastoFijo.categoria),
            joinedload(models.Ciclo.gastos_fijos_ciclo).joinedload(
                models.CicloGastoFijo.gasto_fijo
            ).joinedload(models.GastoFijo.user_category),
            joinedload(models.Ciclo.gastos_fijos_ciclo).joinedload(
                models.CicloGastoFijo.movimientos
            ),
        )
        .filter(models.Ciclo.user_id == current_user.id, models.Ciclo.activo == True)
        .first()
    )
    if not ciclo:
        response.status_code = 204
        return None

    return _ciclo_to_read(ciclo, db, current_user.id)


@router.patch("/{ciclo_id}", response_model=schemas.CicloRead)
def actualizar_ciclo(
    ciclo_id: int,
    data: schemas.CicloUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Actualiza fecha_fin y/o ahorro_objetivo del ciclo.
    El Daily Cap se recalcula automáticamente al consultar el ciclo.
    Edge case: cambio de fecha de fin (FR-007).
    """
    ciclo = _load_ciclo(ciclo_id, current_user.id, db)

    if data.fecha_fin is not None:
        if data.fecha_fin <= ciclo_time_service.ahora_buenos_aires():
            raise HTTPException(status_code=400, detail="La fecha de fin debe ser posterior a hoy")
        ciclo.fecha_fin = data.fecha_fin

    if data.ahorro_objetivo is not None:
        ciclo.ahorro_objetivo = data.ahorro_objetivo

    db.commit()
    db.refresh(ciclo)

    # Recargar con eager loading para el resumen
    ciclo = _load_ciclo(ciclo_id, current_user.id, db)
    return _ciclo_to_read(ciclo, db, current_user.id)


@router.post("/{ciclo_id}/gastos-fijos/", response_model=schemas.CicloRead)
def confirmar_gastos_fijos(
    ciclo_id: int,
    data: schemas.CicloGastoFijoBulk,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Confirma (o reemplaza) la lista de gastos fijos para este ciclo.
    FR-004: Paso 3 del Wizard – confirmación de gastos fijos.
    """
    ciclo = _load_ciclo(ciclo_id, current_user.id, db)

    existentes = list(ciclo.gastos_fijos_ciclo)
    usados_ids = set()

    def _match_item(item: schemas.CicloGastoFijoItemCreate) -> Optional[models.CicloGastoFijo]:
        for existente in existentes:
            if existente.id in usados_ids:
                continue
            if item.gasto_fijo_id is not None and existente.gasto_fijo_id == item.gasto_fijo_id:
                return existente
            if (
                item.gasto_fijo_id is None and
                existente.gasto_fijo_id is None and
                (existente.descripcion_override or "") == (item.descripcion_override or "")
            ):
                return existente
        return None

    for item in data.items:
        existente = _match_item(item)
        if existente:
            progreso_actual = calcular_progreso_compromiso(existente)
            if item.monto_confirmado < progreso_actual.ejecutado:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "El monto reservado no puede ser menor a lo ya ejecutado "
                        f"({float(progreso_actual.ejecutado):.2f})"
                    ),
                )
            existente.monto_confirmado = item.monto_confirmado
            existente.confirmado = True if progreso_actual.ejecutado > 0 else item.confirmado
            existente.descripcion_override = item.descripcion_override
            existente.estado = calcular_progreso_compromiso(existente).estado
            usados_ids.add(existente.id)
            continue

        cgf = models.CicloGastoFijo(
            ciclo_id=ciclo_id,
            gasto_fijo_id=item.gasto_fijo_id,
            monto_confirmado=item.monto_confirmado,
            confirmado=item.confirmado,
            descripcion_override=item.descripcion_override,
            estado="comprometido",
        )
        db.add(cgf)

    for existente in existentes:
        if existente.id in usados_ids:
            continue
        progreso_actual = calcular_progreso_compromiso(existente)
        if progreso_actual.ejecutado > 0:
            existente.confirmado = True
            existente.estado = progreso_actual.estado
            continue
        db.delete(existente)

    db.commit()

    ciclo = _load_ciclo(ciclo_id, current_user.id, db)
    return _ciclo_to_read(ciclo, db, current_user.id)


@router.delete("/{ciclo_id}", status_code=200)
def cerrar_ciclo(
    ciclo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Cierra (desactiva) un ciclo financiero."""
    ciclo = (
        db.query(models.Ciclo)
        .filter(models.Ciclo.id == ciclo_id, models.Ciclo.user_id == current_user.id)
        .first()
    )
    if not ciclo:
        raise HTTPException(status_code=404, detail="Ciclo no encontrado")

    ciclo.activo = False
    db.commit()
    return {"message": "Ciclo cerrado correctamente"}
