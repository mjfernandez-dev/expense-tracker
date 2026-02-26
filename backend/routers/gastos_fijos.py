"""Router de gastos fijos recurrentes: /gastos-fijos/"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.scheduler_service import ejecutar_generacion_mensual

router = APIRouter(prefix="/gastos-fijos", tags=["gastos-fijos"])


def _gasto_fijo_to_dict(gf, db: Session) -> dict:
    """Construye el dict con stats para GastoFijoRead."""
    stats = db.query(
        func.max(models.Movimiento.importe).label("max_importe"),
        func.count(models.Movimiento.id).label("total_meses"),
    ).filter(models.Movimiento.gasto_fijo_id == gf.id).one()

    ultimo = (
        db.query(models.Movimiento.importe)
        .filter(models.Movimiento.gasto_fijo_id == gf.id)
        .order_by(models.Movimiento.fecha.desc())
        .first()
    )

    return {
        "id": gf.id,
        "user_id": gf.user_id,
        "descripcion": gf.descripcion,
        "categoria_id": gf.categoria_id,
        "user_category_id": gf.user_category_id,
        "activo": gf.activo,
        "created_at": gf.created_at,
        "categoria": gf.categoria,
        "user_category": gf.user_category,
        "max_importe": stats.max_importe,
        "ultimo_importe": ultimo[0] if ultimo else None,
        "total_meses": stats.total_meses,
    }


@router.get("/", response_model=List[schemas.GastoFijoRead])
def list_gastos_fijos(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    gastos_fijos = (
        db.query(models.GastoFijo)
        .filter(models.GastoFijo.user_id == current_user.id)
        .options(joinedload(models.GastoFijo.categoria), joinedload(models.GastoFijo.user_category))
        .all()
    )
    return [_gasto_fijo_to_dict(gf, db) for gf in gastos_fijos]


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

    gf.activo = update.activo
    db.commit()
    db.refresh(gf)

    return _gasto_fijo_to_dict(gf, db)


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

    db.query(models.Movimiento).filter(
        models.Movimiento.gasto_fijo_id == gasto_fijo_id
    ).update({"gasto_fijo_id": None, "is_auto_generated": False})

    db.delete(gf)
    db.commit()
    return {"message": "Gasto fijo eliminado correctamente"}


@router.post("/generar-mes")
def generar_mes(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    creados = ejecutar_generacion_mensual(db)
    return {"message": f"Generación completada. Movimientos creados: {creados}"}
