"""Router de balances: /split-groups/{group_id}/balances"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.balance_service import simplificar_deudas

router = APIRouter(tags=["balances"])


@router.get("/split-groups/{group_id}/balances", response_model=schemas.GroupBalanceSummary)
def get_group_balances(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    group = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.creator),
    ).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    members = db.query(models.SplitGroupMember).options(
        joinedload(models.SplitGroupMember.contact),
    ).filter(
        models.SplitGroupMember.group_id == group_id,
    ).all()

    expenses = db.query(models.SplitExpense).options(
        joinedload(models.SplitExpense.participants),
    ).filter(
        models.SplitExpense.group_id == group_id,
    ).all()

    # Deduplicar (joinedload puede producir duplicados)
    seen_expenses = set()
    unique_expenses = []
    for e in expenses:
        if e.id not in seen_expenses:
            seen_expenses.add(e.id)
            unique_expenses.append(e)
    expenses = unique_expenses

    # Calcular balances individuales
    total_paid = {m.id: Decimal('0') for m in members}
    total_share = {m.id: Decimal('0') for m in members}

    for expense in expenses:
        total_paid[expense.paid_by_member_id] += expense.importe
        for p in expense.participants:
            total_share[p.member_id] += p.share_amount

    balances = []
    member_map = {m.id: m for m in members}

    for member in members:
        net = total_paid[member.id] - total_share[member.id]
        balances.append(schemas.MemberBalance(
            member_id=member.id,
            display_name=member.display_name,
            total_paid=total_paid[member.id].quantize(Decimal('0.01')),
            total_share=total_share[member.id].quantize(Decimal('0.01')),
            net_balance=net.quantize(Decimal('0.01')),
            contact=member.contact,
        ))

    # Simplificar deudas (algoritmo greedy en balance_service)
    transfers = simplificar_deudas(balances, member_map, group.creator)

    # Enriquecer transfers con info de pagos existentes
    payments = db.query(models.Payment).filter(
        models.Payment.group_id == group_id,
        models.Payment.status.in_(["pending", "approved"]),
    ).all()

    for transfer in transfers:
        for payment in payments:
            if (payment.from_member_id == transfer.from_member_id
                    and payment.to_member_id == transfer.to_member_id):
                if payment.status == "approved":
                    transfer.paid_amount = payment.amount
                    transfer.payment_status = "approved"
                    transfer.payment_id = payment.id
                    break
                elif payment.status == "pending" and not transfer.payment_status:
                    transfer.payment_status = "pending"
                    transfer.payment_id = payment.id

    total_expenses_amount = sum((e.importe for e in expenses), Decimal('0'))

    return schemas.GroupBalanceSummary(
        group_id=group_id,
        group_name=group.nombre,
        total_expenses=total_expenses_amount.quantize(Decimal('0.01')),
        balances=balances,
        simplified_debts=transfers,
    )
