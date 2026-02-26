"""Router de grupos divididos: /split-groups/ (grupos + miembros)"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from auth import get_current_active_user
from database import get_db

router = APIRouter(prefix="/split-groups", tags=["split-groups"])


@router.post("/", response_model=schemas.SplitGroupRead)
def create_split_group(
    group: schemas.SplitGroupCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    if group.member_contact_ids:
        contacts = db.query(models.Contact).filter(
            models.Contact.id.in_(group.member_contact_ids),
            models.Contact.owner_id == current_user.id,
        ).all()
        if len(contacts) != len(group.member_contact_ids):
            raise HTTPException(status_code=400, detail="Uno o más contactos no son válidos")
    else:
        contacts = []

    db_group = models.SplitGroup(
        nombre=group.nombre,
        descripcion=group.descripcion,
        creator_id=current_user.id,
    )
    db.add(db_group)
    db.flush()

    creator_member = models.SplitGroupMember(
        group_id=db_group.id,
        contact_id=None,
        is_creator=True,
        display_name=current_user.username,
    )
    db.add(creator_member)

    for contact in contacts:
        member = models.SplitGroupMember(
            group_id=db_group.id,
            contact_id=contact.id,
            is_creator=False,
            display_name=contact.nombre,
        )
        db.add(member)

    db.commit()

    db_group = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.members).joinedload(models.SplitGroupMember.contact),
    ).filter(models.SplitGroup.id == db_group.id).first()

    return db_group


@router.get("/", response_model=List[schemas.SplitGroupRead])
def list_split_groups(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    groups = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.members).joinedload(models.SplitGroupMember.contact),
    ).filter(
        models.SplitGroup.creator_id == current_user.id,
    ).order_by(models.SplitGroup.is_active.desc(), models.SplitGroup.created_at.desc()).all()

    seen = set()
    unique_groups = []
    for g in groups:
        if g.id not in seen:
            seen.add(g.id)
            unique_groups.append(g)

    return unique_groups


@router.get("/{group_id}", response_model=schemas.SplitGroupRead)
def get_split_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    group = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.members).joinedload(models.SplitGroupMember.contact),
    ).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    return group


@router.put("/{group_id}", response_model=schemas.SplitGroupRead)
def update_split_group(
    group_id: int,
    group_update: schemas.SplitGroupBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    db_group.nombre = group_update.nombre
    db_group.descripcion = group_update.descripcion
    db.commit()

    db_group = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.members).joinedload(models.SplitGroupMember.contact),
    ).filter(models.SplitGroup.id == group_id).first()

    return db_group


@router.delete("/{group_id}")
def delete_split_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    db_group.is_active = False
    db.commit()
    return {"message": "Grupo eliminado correctamente"}


@router.put("/{group_id}/toggle-active", response_model=schemas.SplitGroupRead)
def toggle_group_active(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.members).joinedload(models.SplitGroupMember.contact),
    ).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    db_group.is_active = not db_group.is_active
    db.commit()
    db.refresh(db_group)
    return db_group


@router.post("/{group_id}/members", response_model=schemas.SplitGroupMemberRead)
def add_group_member(
    group_id: int,
    payload: schemas.AddMemberRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
        models.SplitGroup.is_active == True,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    contact = db.query(models.Contact).filter(
        models.Contact.id == payload.contact_id,
        models.Contact.owner_id == current_user.id,
    ).first()

    if not contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")

    existing = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.group_id == group_id,
        models.SplitGroupMember.contact_id == payload.contact_id,
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="El contacto ya es miembro del grupo")

    member = models.SplitGroupMember(
        group_id=group_id,
        contact_id=contact.id,
        is_creator=False,
        display_name=contact.nombre,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{group_id}/members/{member_id}")
def remove_group_member(
    group_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
        models.SplitGroup.is_active == True,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    member = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id == member_id,
        models.SplitGroupMember.group_id == group_id,
    ).first()

    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    if member.is_creator:
        raise HTTPException(status_code=400, detail="No se puede eliminar al creador del grupo")

    participation_count = db.query(models.SplitExpenseParticipant).filter(
        models.SplitExpenseParticipant.member_id == member_id,
    ).count()

    if participation_count > 0:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar. El miembro participó en gastos del grupo",
        )

    db.delete(member)
    db.commit()
    return {"message": "Miembro eliminado del grupo"}


@router.post("/{group_id}/members/quick", response_model=schemas.SplitGroupMemberRead)
def quick_add_group_member(
    group_id: int,
    payload: schemas.QuickAddMemberRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
        models.SplitGroup.is_active == True,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    db_contact = models.Contact(
        owner_id=current_user.id,
        nombre=payload.nombre,
        alias_bancario=payload.alias_bancario,
        cvu=payload.cvu,
    )
    db.add(db_contact)
    db.flush()

    existing = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.group_id == group_id,
        models.SplitGroupMember.contact_id == db_contact.id,
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="El contacto ya es miembro del grupo")

    member = models.SplitGroupMember(
        group_id=group_id,
        contact_id=db_contact.id,
        is_creator=False,
        display_name=payload.nombre,
    )
    db.add(member)
    db.commit()

    member = db.query(models.SplitGroupMember).options(
        joinedload(models.SplitGroupMember.contact),
    ).filter(models.SplitGroupMember.id == member.id).first()

    return member
