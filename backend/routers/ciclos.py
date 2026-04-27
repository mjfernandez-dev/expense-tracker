"""Router de ciclos financieros (Daily Solvency): /ciclos/"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.ciclo_commitment_service import calcular_progreso_presupuesto
from services.ciclo_service import calcular_resumen
from services import ciclo_time_service

router = APIRouter(prefix="/ciclos", tags=["ciclos"])


def _load_ciclo(ciclo_id: int, user_id: int, db: Session) -> models.Ciclo:
    """Carga un ciclo por ID validando propiedad del usuario."""
    ciclo = (
        db.query(models.Ciclo)
        .options(
            joinedload(models.Ciclo.presupuesto_items).joinedload(
                models.PresupuestoItem.movimientos
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


def _sugerir_presupuesto_desde_ciclo_anterior(ciclo_anterior: models.Ciclo, db: Session) -> list[dict]:
    """Sugiere items de presupuesto desde el ciclo anterior."""
    items = []
    for item in ciclo_anterior.presupuesto_items:
        Ejecutado = sum(m.importe for m in item.movimientos if m.tipo == "gasto")
        monto_sugerido = max(float(item.monto_estimado), Ejecutado)
        items.append({
            "categoria_id": item.categoria_id,
            "user_category_id": item.user_category_id,
            "monto_estimado": monto_sugerido,
            "confirmado": item.confirmado,
            "descripcion": item.descripcion,
        })
    return items


@router.post("/", response_model=schemas.CicloRead, status_code=201)
def crear_ciclo(
    data: schemas.CicloCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Crea un nuevo ciclo financiero.
    Si ya existe uno activo, lo cierra automáticamente.
    Sugiere presupuesto basado en el ciclo anterior.
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
        # Recargar para obtener los items con movimientos
        ciclo_anterior = _load_ciclo(ciclo_anterior.id, current_user.id, db)

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

    # Si hay ciclo anterior, copiar presupuesto sugerido
    if ciclo_anterior:
        items_sugeridos = _sugerir_presupuesto_desde_ciclo_anterior(ciclo_anterior, db)
        for item_data in items_sugeridos:
            presupuesto_item = models.PresupuestoItem(
                ciclo_id=ciclo.id,
                categoria_id=item_data.get("categoria_id"),
                user_category_id=item_data.get("user_category_id"),
                monto_estimado=item_data.get("monto_estimado"),
                confirmado=item_data.get("confirmado", True),
                descripcion=item_data.get("descripcion"),
                estado="pendiente",
            )
            db.add(presupuesto_item)

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
    """
    ciclo = (
        db.query(models.Ciclo)
        .options(
            joinedload(models.Ciclo.presupuesto_items).joinedload(
                models.PresupuestoItem.movimientos
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

    ciclo = _load_ciclo(ciclo_id, current_user.id, db)
    return _ciclo_to_read(ciclo, db, current_user.id)


@router.post("/{ciclo_id}/presupuesto/", response_model=schemas.CicloRead)
def confirmar_presupuesto(
    ciclo_id: int,
    data: schemas.PresupuestoItemBulk,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Confirma (o reemplaza) el presupuesto para este ciclo.
    """
    ciclo = _load_ciclo(ciclo_id, current_user.id, db)

    existentes = list(ciclo.presupuesto_items)
    usados_ids = set()

    def _match_item(item: schemas.PresupuestoItemCreate) -> Optional[models.PresupuestoItem]:
        for existente in existentes:
            if existente.id in usados_ids:
                continue
            if item.categoria_id is not None and existente.categoria_id == item.categoria_id:
                return existente
            if item.user_category_id is not None and existente.user_category_id == item.user_category_id:
                return existente
            if (
                item.categoria_id is None and
                item.user_category_id is None and
                (existente.descripcion or "") == (item.descripcion or "")
            ):
                return existente
        return None

    for item in data.items:
        existente = _match_item(item)
        if existente:
            progreso_actual = calcular_progreso_presupuesto(existente)
            if item.monto_estimado < progreso_actual.ejecutado:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "El monto estimado no puede ser menor a lo ya ejecutado "
                        f"({float(progreso_actual.ejecutado):.2f})"
                    ),
                )
            existente.monto_estimado = item.monto_estimado
            existente.confirmado = True if progreso_actual.ejecutado > 0 else item.confirmado
            existente.descripcion = item.descripcion
            existente.estado = calcular_progreso_presupuesto(existente).estado
            usados_ids.add(existente.id)
            continue

        nuevo_item = models.PresupuestoItem(
            ciclo_id=ciclo_id,
            categoria_id=item.categoria_id,
            user_category_id=item.user_category_id,
            monto_estimado=item.monto_estimado,
            confirmado=item.confirmado,
            descripcion=item.descripcion,
            estado="pendiente",
        )
        db.add(nuevo_item)

    for existente in existentes:
        if existente.id in usados_ids:
            continue
        progreso_actual = calcular_progreso_presupuesto(existente)
        if progreso_actual.ejecutado > 0:
            existente.confirmado = True
            existente.estado = progreso_actual.estado
            continue
        db.delete(existente)

    db.commit()

    ciclo = _load_ciclo(ciclo_id, current_user.id, db)
    return _ciclo_to_read(ciclo, db, current_user.id)


# Legacy endpoint for backwards compatibility
@router.post("/{ciclo_id}/gastos-fijos/", response_model=schemas.CicloRead, deprecated=True)
def confirmar_gastos_fijos_legacy(
    ciclo_id: int,
    data: schemas.CicloGastoFijoBulk,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Legacy endpoint - usa /presupuesto/ en su lugar."""
    return confirmar_presupuesto(ciclo_id, schemas.PresupuestoBulk(items=data.items), db, current_user)


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
