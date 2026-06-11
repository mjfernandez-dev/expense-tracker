"""Router de movimientos: /movimientos/"""
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.movimiento_service import (
    auto_detectar_presupuesto_item,
    apply_presupuesto_item_link,
    unlink_presupuesto_item_on_delete,
    resolve_clasificacion,
)

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

    datos = movimiento.model_dump(exclude={"presupuesto_item_id", "es_fijo"})
    datos["clasificacion"] = resolve_clasificacion(movimiento.tipo, movimiento.clasificacion)
    db_movimiento = models.Movimiento(**datos, user_id=current_user.id)
    db.add(db_movimiento)

    # Si es un gasto con es_fijo=True, crear template de GastoFijo y vincular
    gasto_fijo_id = None
    if getattr(movimiento, "es_fijo", False) and movimiento.tipo == "gasto":
        gf = models.GastoFijo(
            user_id=current_user.id,
            descripcion=movimiento.descripcion,
            user_category_id=movimiento.user_category_id,
            categoria_id=movimiento.categoria_id,
            activo=True,
        )
        db.add(gf)
        db.flush()
        db_movimiento.gasto_fijo_id = gf.id
        gasto_fijo_id = gf.id

    item_id = movimiento.presupuesto_item_id
    if item_id is None and movimiento.tipo == "gasto":
        item_id = auto_detectar_presupuesto_item(
            movimiento.categoria_id,
            movimiento.user_category_id,
            Decimal(str(movimiento.importe)),
            current_user.id,
            db,
        )

    apply_presupuesto_item_link(db_movimiento, item_id, current_user.id, db)

    db.commit()
    db_movimiento = db.query(models.Movimiento).options(
        joinedload(models.Movimiento.categoria),
        joinedload(models.Movimiento.user_category),
    ).filter(models.Movimiento.id == db_movimiento.id).first()
    return db_movimiento


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
    rows = (
        db.query(models.Movimiento.descripcion)
        .filter(models.Movimiento.user_id == current_user.id)
        .all()
    )
    q_lower = q.lower()
    desc_counts: dict[str, int] = {}
    for (desc,) in rows:
        if desc and q_lower in desc.lower():
            desc_counts[desc] = desc_counts.get(desc, 0) + 1

    sorted_descs = sorted(desc_counts.items(), key=lambda x: -x[1])[:limit]
    return [{"descripcion": d, "frecuencia": c} for d, c in sorted_descs]


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

    unlink_presupuesto_item_on_delete(movimiento, current_user.id, db)

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
    db_movimiento.clasificacion = resolve_clasificacion(movimiento_update.tipo, movimiento_update.clasificacion)

    item_id = movimiento_update.presupuesto_item_id
    if item_id is None and movimiento_update.tipo == "gasto":
        item_id = auto_detectar_presupuesto_item(
            movimiento_update.categoria_id,
            movimiento_update.user_category_id,
            Decimal(str(movimiento_update.importe)),
            current_user.id,
            db,
            exclude_movimiento_id=movimiento_id,
        )

    apply_presupuesto_item_link(db_movimiento, item_id, current_user.id, db)

    db.commit()
    db_movimiento = db.query(models.Movimiento).options(
        joinedload(models.Movimiento.categoria),
        joinedload(models.Movimiento.user_category),
    ).filter(models.Movimiento.id == movimiento_id).first()
    return db_movimiento


@router.get("/", response_model=List[schemas.MovimientoRead])
def list_movimientos(
    tipo: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    query = db.query(models.Movimiento).options(
        joinedload(models.Movimiento.categoria),
        joinedload(models.Movimiento.user_category),
    ).filter(models.Movimiento.user_id == current_user.id)
    if tipo:
        query = query.filter(models.Movimiento.tipo == tipo)
    return query.order_by(models.Movimiento.fecha.desc(), models.Movimiento.id.desc()).limit(limit).offset(offset).all()


@router.get("/{movimiento_id}", response_model=schemas.MovimientoRead)
def get_movimiento(
    movimiento_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    movimiento = db.query(models.Movimiento).options(
        joinedload(models.Movimiento.categoria),
        joinedload(models.Movimiento.user_category),
    ).filter(
        models.Movimiento.id == movimiento_id,
        models.Movimiento.user_id == current_user.id,
    ).first()

    if not movimiento:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    return movimiento