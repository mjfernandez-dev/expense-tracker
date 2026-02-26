"""Router de categorías: /categories/ y /user-categories/"""
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db

router = APIRouter(tags=["categorias"])


# ============== CATEGORÍAS DEL SISTEMA ==============

@router.get("/categories/", response_model=List[schemas.CategoryRead])
def list_system_categories(db: Session = Depends(get_db)):
    """Devuelve todas las categorías del sistema. No requiere autenticación."""
    return db.query(models.Category).filter(
        models.Category.es_predeterminada == True
    ).all()


# ============== CATEGORÍAS PERSONALIZADAS DEL USUARIO ==============

@router.post("/user-categories/", response_model=schemas.UserCategoryRead)
def create_user_category(
    category: schemas.UserCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    existing = db.query(models.UserCategory).filter(
        models.UserCategory.user_id == current_user.id,
        models.UserCategory.nombre == category.nombre,
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Ya tienes una categoría con este nombre")

    db_category = models.UserCategory(
        user_id=current_user.id,
        nombre=category.nombre,
        descripcion=category.descripcion,
        color=category.color,
        icon=category.icon,
    )
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category


@router.get("/user-categories/", response_model=List[schemas.UserCategoryRead])
def list_user_categories(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return db.query(models.UserCategory).filter(
        models.UserCategory.user_id == current_user.id
    ).order_by(models.UserCategory.created_at.desc()).all()


@router.get("/user-categories/{category_id}", response_model=schemas.UserCategoryRead)
def get_user_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    category = db.query(models.UserCategory).filter(
        models.UserCategory.id == category_id,
        models.UserCategory.user_id == current_user.id,
    ).first()

    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    return category


@router.put("/user-categories/{category_id}", response_model=schemas.UserCategoryRead)
def update_user_category(
    category_id: int,
    category_update: schemas.UserCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    category = db.query(models.UserCategory).filter(
        models.UserCategory.id == category_id,
        models.UserCategory.user_id == current_user.id,
    ).first()

    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    if category_update.nombre and category_update.nombre != category.nombre:
        existing = db.query(models.UserCategory).filter(
            models.UserCategory.user_id == current_user.id,
            models.UserCategory.nombre == category_update.nombre,
            models.UserCategory.id != category_id,
        ).first()

        if existing:
            raise HTTPException(status_code=400, detail="Ya tienes una categoría con este nombre")
        category.nombre = category_update.nombre

    if category_update.descripcion is not None:
        category.descripcion = category_update.descripcion
    if category_update.color is not None:
        category.color = category_update.color
    if category_update.icon is not None:
        category.icon = category_update.icon

    category.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(category)
    return category


@router.delete("/user-categories/{category_id}", status_code=204)
def delete_user_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    category = db.query(models.UserCategory).filter(
        models.UserCategory.id == category_id,
        models.UserCategory.user_id == current_user.id,
    ).first()

    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    movimientos_count = db.query(models.Movimiento).filter(
        models.Movimiento.user_category_id == category_id
    ).count()

    if movimientos_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar. Hay {movimientos_count} movimiento(s) usando esta categoría. "
                   "Asigna esos movimientos a otra categoría primero."
        )

    db.delete(category)
    db.commit()
    return None
