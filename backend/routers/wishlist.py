"""Router de wishlist: /wishlist/ — CRUD con wish farm, prioridades, categorías y contribuciones."""
from typing import Optional, List

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
from services.goal_service import (
    contribute_to_goal,
    withdraw_from_goal,
    list_contributions_for_goal,
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


# ============== CONTRIBUCIONES A METAS ==============


@router.post("/{item_id}/contribute", response_model=schemas.WishlistItemRead)
def contribute(
    item_id: int,
    data: schemas.GoalContributeRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Aporta fondos a una meta desde una o más fuentes (disponible / presupuesto)."""
    item = contribute_to_goal(db, current_user.id, item_id, data)
    return schemas.WishlistItemRead.model_validate(item)


@router.post("/{item_id}/withdraw", response_model=schemas.WishlistItemRead)
def withdraw(
    item_id: int,
    data: schemas.GoalWithdrawRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Retira fondos de una meta (vuelven al disponible)."""
    item = withdraw_from_goal(db, current_user.id, item_id, data.amount)
    return schemas.WishlistItemRead.model_validate(item)


@router.get("/{item_id}/contributions", response_model=List[schemas.GoalContributionRead])
def list_contributions(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Lista todas las contribuciones/retiros de una meta."""
    contribs = list_contributions_for_goal(db, item_id, current_user.id)
    return [schemas.GoalContributionRead.model_validate(c) for c in contribs]
