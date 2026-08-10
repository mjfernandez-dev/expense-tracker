"""Routers de categorías: /categories/ y /user-categories/"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services import user_category_service

categories_router = APIRouter(prefix="/categories", tags=["categorias"])
router = APIRouter(prefix="/user-categories", tags=["categorias"])


# ============== CATEGORÍAS DEL SISTEMA ==============

@categories_router.get("/", response_model=List[schemas.CategoryRead])
def list_system_categories(db: Session = Depends(get_db)):
    """Devuelve todas las categorías del sistema. No requiere autenticación."""
    return user_category_service.listar_categorias_sistema(db)


# ============== CATEGORÍAS PERSONALIZADAS DEL USUARIO ==============

@router.post("/", response_model=schemas.UserCategoryRead)
def create_user_category(
    category: schemas.UserCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return user_category_service.crear_user_category(current_user.id, category, db)


@router.get("/", response_model=List[schemas.UserCategoryRead])
def list_user_categories(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return user_category_service.listar_categorias_usuario(current_user.id, db, limit, offset)


@router.get("/maximos-historicos")
def get_maximos_historicos(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Devuelve {user_category_id: monto_máximo_histórico} para cada categoría.

    Toma el valor más alto entre monto_estimado y monto_ejecutado
    de todos los presupuestos históricos del usuario.
    """
    return user_category_service.obtener_maximos_historicos(current_user.id, db)


@router.get("/{category_id}", response_model=schemas.UserCategoryRead)
def get_user_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return user_category_service.obtener_categoria_usuario(category_id, current_user.id, db)


@router.put("/{category_id}", response_model=schemas.UserCategoryRead)
def update_user_category(
    category_id: int,
    category_update: schemas.UserCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    category = user_category_service.obtener_categoria_usuario(category_id, current_user.id, db)
    return user_category_service.actualizar_user_category(category, category_update, db)


@router.delete("/{category_id}", status_code=204)
def delete_user_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    category = user_category_service.obtener_categoria_usuario(category_id, current_user.id, db)
    user_category_service.eliminar_user_category(category, db)
    return None


@router.get("/{category_id}/movimientos-afectados", response_model=List[schemas.MovimientoAfectado])
def get_movimientos_afectados(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Devuelve los movimientos que usan esta categoría (para previsualizar antes de eliminar)."""
    user_category_service.obtener_categoria_usuario(category_id, current_user.id, db)
    return user_category_service.obtener_movimientos_afectados(category_id, db)


@router.post("/{category_id}/reasignar", response_model=dict)
def reasignar_movimientos(
    category_id: int,
    body: schemas.ReasignarMovimientosBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Reasigna todos los movimientos de esta categoría a otra, luego elimina la original."""
    category = user_category_service.obtener_categoria_usuario(category_id, current_user.id, db)
    if category_id == body.nueva_categoria_id:
        raise HTTPException(status_code=400, detail="La categoría destino debe ser diferente a la actual")
    count = user_category_service.reasignar_movimientos_categoria(
        category_id, body.nueva_categoria_id, current_user.id, db
    )
    user_category_service.eliminar_user_category(category, db)
    return {"reasignados": count}
