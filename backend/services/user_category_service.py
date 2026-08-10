"""Servicio de categorías personalizadas del usuario."""
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from services.ciclo_time_service import ahora_buenos_aires


def listar_categorias_sistema(db: Session) -> List[models.Category]:
    return db.query(models.Category).filter(models.Category.es_predeterminada == True).all()


def listar_categorias_usuario(user_id: int, db: Session, limit: int = 100, offset: int = 0) -> List[models.UserCategory]:
    return (
        db.query(models.UserCategory)
        .filter(models.UserCategory.user_id == user_id)
        .order_by(models.UserCategory.created_at.desc())
        .limit(limit).offset(offset)
        .all()
    )


def obtener_categoria_usuario(category_id: int, user_id: int, db: Session) -> models.UserCategory:
    category = db.query(models.UserCategory).filter(
        models.UserCategory.id == category_id,
        models.UserCategory.user_id == user_id,
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return category


def verificar_nombre_unico(user_id: int, nombre: str, db: Session, exclude_id: Optional[int] = None) -> None:
    query = db.query(models.UserCategory).filter(
        models.UserCategory.user_id == user_id,
        models.UserCategory.nombre == nombre,
    )
    if exclude_id is not None:
        query = query.filter(models.UserCategory.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=400, detail="Ya tienes una categoría con este nombre")


def crear_user_category(user_id: int, category: schemas.UserCategoryCreate, db: Session) -> models.UserCategory:
    verificar_nombre_unico(user_id, category.nombre, db)
    db_category = models.UserCategory(
        user_id=user_id,
        nombre=category.nombre,
        descripcion=category.descripcion,
        color=category.color,
        icon=category.icon,
    )
    db.add(db_category)
    db.flush()
    return actualizar_user_category(
        db_category,
        schemas.UserCategoryUpdate(
            monto_default=category.monto_default,
            tiene_monto_fijo=category.tiene_monto_fijo,
        ),
        db,
    )


def obtener_movimientos_afectados(category_id: int, db: Session) -> List[models.Movimiento]:
    return (
        db.query(models.Movimiento)
        .filter(models.Movimiento.user_category_id == category_id)
        .order_by(models.Movimiento.fecha.desc())
        .all()
    )


def reasignar_movimientos_categoria(
    category_id: int,
    nueva_categoria_id: int,
    user_id: int,
    db: Session,
) -> int:
    """
    Reasigna todos los movimientos de category_id a nueva_categoria_id.
    Valida que la nueva categoría pertenezca al usuario.
    Retorna la cantidad de movimientos actualizados.
    """
    nueva = db.query(models.UserCategory).filter(
        models.UserCategory.id == nueva_categoria_id,
        models.UserCategory.user_id == user_id,
    ).first()
    if not nueva:
        raise HTTPException(status_code=404, detail="Categoría destino no encontrada")

    count = (
        db.query(models.Movimiento)
        .filter(models.Movimiento.user_category_id == category_id)
        .update({"user_category_id": nueva_categoria_id}, synchronize_session=False)
    )
    db.commit()
    return count


def eliminar_user_category(category: models.UserCategory, db: Session) -> None:
    movimientos_count = db.query(models.Movimiento).filter(
        models.Movimiento.user_category_id == category.id
    ).count()
    if movimientos_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar. Hay {movimientos_count} movimiento(s) usando esta categoría. "
                   "Asigna esos movimientos a otra categoría primero."
        )
    presupuesto_ids = [
        row.id for row in db.query(models.PresupuestoItem.id).filter(
            models.PresupuestoItem.user_category_id == category.id
        ).all()
    ]
    if presupuesto_ids:
        db.query(models.Movimiento).filter(
            models.Movimiento.presupuesto_item_id.in_(presupuesto_ids)
        ).update({"presupuesto_item_id": None}, synchronize_session=False)
        db.query(models.PresupuestoItem).filter(
            models.PresupuestoItem.id.in_(presupuesto_ids)
        ).delete(synchronize_session=False)
    db.delete(category)
    db.commit()


def actualizar_user_category(
    category: models.UserCategory,
    update: schemas.UserCategoryUpdate,
    db: Session,
) -> models.UserCategory:
    """Aplica los cambios de UserCategoryUpdate a la categoría, con server rules para monto_default."""
    update_data = update.model_dump(exclude_unset=True)

    if update.nombre is not None and update.nombre != category.nombre:
        verificar_nombre_unico(category.user_id, update.nombre, db, exclude_id=category.id)
        category.nombre = update.nombre

    if "descripcion" in update_data:
        category.descripcion = update_data["descripcion"]
    if "color" in update_data:
        category.color = update_data["color"]
    if "icon" in update_data:
        category.icon = update_data["icon"]

    if "monto_default" in update_data:
        monto: Optional[Decimal] = update_data["monto_default"]
        if monto is not None and monto > 0:
            category.monto_default = monto
            category.tiene_monto_fijo = True
        else:
            category.monto_default = None
            category.tiene_monto_fijo = False
    elif "tiene_monto_fijo" in update_data:
        category.tiene_monto_fijo = update_data["tiene_monto_fijo"]

    category.updated_at = ahora_buenos_aires()
    db.commit()
    db.refresh(category)
    return category


def obtener_maximos_historicos(user_id: int, db: Session) -> Dict[int, float]:
    """Calcula el máximo histórico por user_category_id.

    Por cada PresupuestoItem confirmado del usuario, toma
    max(monto_estimado, suma de movimientos vinculados).
    Luego agrupa por user_category_id y devuelve el mayor valor.
    """
    items = (
        db.query(
            models.PresupuestoItem.user_category_id,
            models.PresupuestoItem.monto_estimado,
            func.coalesce(func.sum(models.Movimiento.importe), 0),
        )
        .join(models.Ciclo, models.PresupuestoItem.ciclo_id == models.Ciclo.id)
        .outerjoin(
            models.Movimiento,
            models.Movimiento.presupuesto_item_id == models.PresupuestoItem.id,
        )
        .filter(
            models.Ciclo.user_id == user_id,
            models.PresupuestoItem.user_category_id.isnot(None),
            models.PresupuestoItem.confirmado == True,
        )
        .group_by(
            models.PresupuestoItem.id,
            models.PresupuestoItem.user_category_id,
            models.PresupuestoItem.monto_estimado,
        )
        .all()
    )

    per_category: Dict[int, float] = {}
    for user_category_id, estimado, ejecutado in items:
        valor = max(float(estimado), float(ejecutado))
        if user_category_id not in per_category or valor > per_category[user_category_id]:
            per_category[user_category_id] = valor

    return per_category
