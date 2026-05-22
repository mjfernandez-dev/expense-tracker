"""Routers de categorías: /categories/ y /user-categories/"""
from typing import List

from fastapi import APIRouter, Depends
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
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return user_category_service.listar_categorias_usuario(current_user.id, db)


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

    if category_update.nombre and category_update.nombre != category.nombre:
        user_category_service.verificar_nombre_unico(current_user.id, category_update.nombre, db, exclude_id=category_id)

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
