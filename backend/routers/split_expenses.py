"""Router de gastos divididos: /split-groups/{group_id}/expenses"""
from datetime import datetime
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.split_service import calcular_shares

router = APIRouter(tags=["split-expenses"])


@router.post("/split-groups/{group_id}/expenses", response_model=schemas.SplitExpenseRead)
def create_split_expense(
    group_id: int,
    expense: schemas.SplitExpenseCreate,
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

    payer = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id == expense.paid_by_member_id,
        models.SplitGroupMember.group_id == group_id,
    ).first()

    if not payer:
        raise HTTPException(status_code=400, detail="El pagador no es miembro del grupo")

    if not expense.participant_member_ids:
        raise HTTPException(status_code=400, detail="Debe haber al menos un participante")

    participants = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id.in_(expense.participant_member_ids),
        models.SplitGroupMember.group_id == group_id,
    ).all()

    if len(participants) != len(expense.participant_member_ids):
        raise HTTPException(status_code=400, detail="Uno o más participantes no son válidos")

    shares = calcular_shares(expense.importe, len(participants))

    db_expense = models.SplitExpense(
        group_id=group_id,
        descripcion=expense.descripcion,
        importe=expense.importe,
        paid_by_member_id=expense.paid_by_member_id,
        fecha=expense.fecha or datetime.now(),
    )
    db.add(db_expense)
    db.flush()

    for participant, amount in zip(participants, shares):
        db_participant = models.SplitExpenseParticipant(
            expense_id=db_expense.id,
            member_id=participant.id,
            share_amount=amount,
        )
        db.add(db_participant)

    db.commit()

    db_expense = db.query(models.SplitExpense).options(
        joinedload(models.SplitExpense.paid_by).joinedload(models.SplitGroupMember.contact),
        joinedload(models.SplitExpense.participants).joinedload(models.SplitExpenseParticipant.member).joinedload(models.SplitGroupMember.contact),
    ).filter(models.SplitExpense.id == db_expense.id).first()

    return db_expense


@router.get("/split-groups/{group_id}/expenses", response_model=List[schemas.SplitExpenseRead])
def list_split_expenses(
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

    expenses = db.query(models.SplitExpense).options(
        joinedload(models.SplitExpense.paid_by).joinedload(models.SplitGroupMember.contact),
        joinedload(models.SplitExpense.participants).joinedload(models.SplitExpenseParticipant.member),
    ).filter(
        models.SplitExpense.group_id == group_id,
    ).order_by(models.SplitExpense.fecha.desc()).all()

    seen = set()
    unique = []
    for e in expenses:
        if e.id not in seen:
            seen.add(e.id)
            unique.append(e)

    return unique


@router.put("/split-groups/{group_id}/expenses/{expense_id}", response_model=schemas.SplitExpenseRead)
def update_split_expense(
    group_id: int,
    expense_id: int,
    expense_update: schemas.SplitExpenseCreate,
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

    db_expense = db.query(models.SplitExpense).filter(
        models.SplitExpense.id == expense_id,
        models.SplitExpense.group_id == group_id,
    ).first()

    if not db_expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    payer = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id == expense_update.paid_by_member_id,
        models.SplitGroupMember.group_id == group_id,
    ).first()

    if not payer:
        raise HTTPException(status_code=400, detail="El pagador no es miembro del grupo")

    if not expense_update.participant_member_ids:
        raise HTTPException(status_code=400, detail="Debe haber al menos un participante")

    participants = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id.in_(expense_update.participant_member_ids),
        models.SplitGroupMember.group_id == group_id,
    ).all()

    if len(participants) != len(expense_update.participant_member_ids):
        raise HTTPException(status_code=400, detail="Uno o más participantes no son válidos")

    shares = calcular_shares(expense_update.importe, len(participants))

    db_expense.descripcion = expense_update.descripcion
    db_expense.importe = expense_update.importe
    db_expense.paid_by_member_id = expense_update.paid_by_member_id
    db_expense.fecha = expense_update.fecha or db_expense.fecha

    db.query(models.SplitExpenseParticipant).filter(
        models.SplitExpenseParticipant.expense_id == expense_id,
    ).delete()

    for participant, amount in zip(participants, shares):
        db_participant = models.SplitExpenseParticipant(
            expense_id=expense_id,
            member_id=participant.id,
            share_amount=amount,
        )
        db.add(db_participant)

    db.commit()

    db_expense = db.query(models.SplitExpense).options(
        joinedload(models.SplitExpense.paid_by).joinedload(models.SplitGroupMember.contact),
        joinedload(models.SplitExpense.participants).joinedload(models.SplitExpenseParticipant.member).joinedload(models.SplitGroupMember.contact),
    ).filter(models.SplitExpense.id == expense_id).first()

    return db_expense


@router.delete("/split-groups/{group_id}/expenses/{expense_id}")
def delete_split_expense(
    group_id: int,
    expense_id: int,
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

    db_expense = db.query(models.SplitExpense).filter(
        models.SplitExpense.id == expense_id,
        models.SplitExpense.group_id == group_id,
    ).first()

    if not db_expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    db.delete(db_expense)
    db.commit()
    return {"message": "Gasto eliminado correctamente"}
