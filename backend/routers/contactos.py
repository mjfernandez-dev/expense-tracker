"""Router de contactos: /contacts/"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db

router = APIRouter(prefix="/contacts", tags=["contactos"])


@router.post("/", response_model=schemas.ContactRead)
def create_contact(
    contact: schemas.ContactCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_contact = models.Contact(
        owner_id=current_user.id,
        nombre=contact.nombre,
        alias_bancario=contact.alias_bancario,
        cvu=contact.cvu,
        linked_user_id=contact.linked_user_id,
    )
    db.add(db_contact)
    db.commit()
    db.refresh(db_contact)
    return db_contact


@router.get("/", response_model=List[schemas.ContactRead])
def list_contacts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return db.query(models.Contact).filter(
        models.Contact.owner_id == current_user.id
    ).order_by(models.Contact.nombre).all()


@router.put("/{contact_id}", response_model=schemas.ContactRead)
def update_contact(
    contact_id: int,
    contact_update: schemas.ContactCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_contact = db.query(models.Contact).filter(
        models.Contact.id == contact_id,
        models.Contact.owner_id == current_user.id,
    ).first()

    if not db_contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")

    db_contact.nombre = contact_update.nombre
    db_contact.alias_bancario = contact_update.alias_bancario
    db_contact.cvu = contact_update.cvu
    db_contact.linked_user_id = contact_update.linked_user_id

    db.commit()
    db.refresh(db_contact)
    return db_contact


@router.delete("/{contact_id}")
def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_contact = db.query(models.Contact).filter(
        models.Contact.id == contact_id,
        models.Contact.owner_id == current_user.id,
    ).first()

    if not db_contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")

    member_count = db.query(models.SplitGroupMember).join(models.SplitGroup).filter(
        models.SplitGroupMember.contact_id == contact_id,
        models.SplitGroup.is_active == True,
    ).count()

    if member_count > 0:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar. El contacto es miembro de un grupo activo",
        )

    db.delete(db_contact)
    db.commit()
    return {"message": "Contacto eliminado correctamente"}
