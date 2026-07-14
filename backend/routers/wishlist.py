"""Router de wishlist: /wishlist/ — CRUD con wish farm, prioridades y categorías."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.wishlist_service import (
    create_wishlist_item,
    list_wishlist_items,
    get_wishlist_item,
    update_wishlist_item,
    delete_wishlist_item,
)

router = APIRouter(prefix="/wishlist", tags=["wishlist"])


@router.get("/", response_model=dict)
def list_items(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Lista items del usuario autenticado, ordenados por prioridad y fecha."""
    items, total = list_wishlist_items(db, current_user.id, limit, offset)
    return {
        "items": [schemas.WishlistItemRead.model_validate(i) for i in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{item_id}", response_model=schemas.WishlistItemRead)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Obtiene un item específico del usuario."""
    return get_wishlist_item(db, item_id, current_user.id)


@router.post("/", response_model=schemas.WishlistItemRead, status_code=201)
def create_item(
    data: schemas.WishlistItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Crea un nuevo item en la wishlist. Soporta creación inline de categoría."""
    return create_wishlist_item(db, current_user.id, data)


@router.patch("/{item_id}", response_model=schemas.WishlistItemRead)
def update_item(
    item_id: int,
    data: schemas.WishlistItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Actualiza parcialmente un item. Valida transiciones de estado y wish farm."""
    item = get_wishlist_item(db, item_id, current_user.id)
    return update_wishlist_item(db, item, data)


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Elimina un item del usuario."""
    item = get_wishlist_item(db, item_id, current_user.id)
    delete_wishlist_item(db, item)
