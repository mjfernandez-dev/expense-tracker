"""Lógica de negocio para la wishlist: CRUD, wish farm, transiciones de estado."""
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session, joinedload

import models
import schemas


# ============== HELPERS PRIVADOS ==============

def _validate_transition(current: str, target: str) -> None:
    """Valida que la transición de estado sea permitida."""
    allowed = schemas.STATUS_TRANSITIONS.get(current)
    if allowed is None:
        raise HTTPException(status_code=400, detail=f"Estado '{current}' no es válido")
    if target not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede cambiar de '{current}' a '{target}'. "
                   f"Transiciones permitidas desde '{current}': {', '.join(allowed) if allowed else 'ninguna'}"
        )


def _check_wish_farm_limit(db: Session, user_id: int) -> None:
    """Verifica que el usuario no supere el límite de 3 items en 'en-progreso'."""
    en_progreso_count = (
        db.query(models.WishlistItem)
        .filter(
            models.WishlistItem.user_id == user_id,
            models.WishlistItem.status == "en-progreso",
        )
        .count()
    )
    if en_progreso_count >= 3:
        raise HTTPException(
            status_code=400,
            detail="Ya tienes 3 items en progreso. Completa o cancela uno antes de activar otro."
        )


def _get_or_create_category(db: Session, user_id: int, name: str) -> models.UserCategory:
    """Busca una categoría por nombre+user_id; si no existe, la crea."""
    existing = (
        db.query(models.UserCategory)
        .filter(
            models.UserCategory.user_id == user_id,
            models.UserCategory.nombre == name,
        )
        .first()
    )
    if existing:
        return existing
    if not name.strip():
        raise HTTPException(status_code=422, detail="El nombre de la categoría no puede estar vacío")
    new_cat = models.UserCategory(user_id=user_id, nombre=name.strip())
    db.add(new_cat)
    db.flush()
    return new_cat


def _load_wishlist_item(db: Session, item_id: int, user_id: int) -> models.WishlistItem:
    """Carga un item de wishlist verificando pertenencia al usuario."""
    item = (
        db.query(models.WishlistItem)
        .options(joinedload(models.WishlistItem.category))
        .filter(models.WishlistItem.id == item_id, models.WishlistItem.user_id == user_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item de wishlist no encontrado")
    return item


# ============== FUNCIONES PÚBLICAS CRUD ==============

def create_wishlist_item(
    db: Session, user_id: int, data: schemas.WishlistItemCreate
) -> models.WishlistItem:
    """Crea un nuevo item en la wishlist. Soporta creación inline de categoría."""
    # Validar wish farm si el status es en-progreso
    if data.status == "en-progreso":
        _check_wish_farm_limit(db, user_id)

    # Resolver categoría: por ID, por nombre inline, o None
    category_id = data.category_id
    if data.category_name:
        cat = _get_or_create_category(db, user_id, data.category_name)
        category_id = cat.id
    elif category_id is not None:
        # Verificar que la categoría existe y pertenece al usuario
        cat = (
            db.query(models.UserCategory)
            .filter(models.UserCategory.id == category_id, models.UserCategory.user_id == user_id)
            .first()
        )
        if not cat:
            raise HTTPException(status_code=404, detail="Categoría no encontrada")

    item = models.WishlistItem(
        user_id=user_id,
        name=data.name,
        estimated_cost=data.estimated_cost,
        monto_ahorrado=data.monto_ahorrado,
        priority=data.priority,
        status=data.status,
        category_id=category_id,
        notes=data.notes,
    )
    db.add(item)
    db.flush()
    # Recargar con joinedload para incluir category en la respuesta
    return _load_wishlist_item(db, item.id, user_id)


def list_wishlist_items(
    db: Session, user_id: int, limit: int = 50, offset: int = 0
) -> tuple[list[models.WishlistItem], int]:
    """Lista items del usuario ordenados por prioridad (alta→media→baja) y created_at DESC."""
    total = (
        db.query(models.WishlistItem)
        .filter(models.WishlistItem.user_id == user_id)
        .count()
    )
    items = (
        db.query(models.WishlistItem)
        .options(joinedload(models.WishlistItem.category))
        .filter(models.WishlistItem.user_id == user_id)
        .order_by(
            # CASE WHEN: alta=1, media=2, baja=3
            case(
                (models.WishlistItem.priority == "alta", 1),
                (models.WishlistItem.priority == "media", 2),
                else_=3,
            ),
            models.WishlistItem.created_at.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )
    return items, total


def get_wishlist_item(db: Session, item_id: int, user_id: int) -> models.WishlistItem:
    """Obtiene un item por ID, scoped al usuario."""
    return _load_wishlist_item(db, item_id, user_id)


def update_wishlist_item(
    db: Session, item: models.WishlistItem, data: schemas.WishlistItemUpdate
) -> models.WishlistItem:
    """Actualiza campos de un item. Valida transiciones de estado y wish farm."""
    update_data = data.model_dump(exclude_unset=True)

    # Validar transición de estado
    if "status" in update_data and update_data["status"] != item.status:
        _validate_transition(item.status, update_data["status"])
        if update_data["status"] == "en-progreso":
            _check_wish_farm_limit(db, item.user_id)

    # Resolver categoría inline si se envía category_name
    if "category_name" in update_data and update_data["category_name"]:
        cat = _get_or_create_category(db, item.user_id, update_data["category_name"])
        update_data["category_id"] = cat.id
    elif "category_id" in update_data and update_data["category_id"] is not None:
        cat = (
            db.query(models.UserCategory)
            .filter(
                models.UserCategory.id == update_data["category_id"],
                models.UserCategory.user_id == item.user_id,
            )
            .first()
        )
        if not cat:
            raise HTTPException(status_code=404, detail="Categoría no encontrada")

    # Remover category_name del dict antes de asignar al modelo
    update_data.pop("category_name", None)

    for field, value in update_data.items():
        setattr(item, field, value)

    db.flush()
    return _load_wishlist_item(db, item.id, item.user_id)


def delete_wishlist_item(db: Session, item: models.WishlistItem) -> None:
    """Elimina un item de la wishlist."""
    db.delete(item)
    db.flush()
