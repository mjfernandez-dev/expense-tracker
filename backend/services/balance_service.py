"""Servicio de cálculo de balances y deudas simplificadas (algoritmo greedy)."""
from decimal import Decimal
from typing import List

import schemas


def simplificar_deudas(
    balances: List[schemas.MemberBalance],
    member_map: dict,
    group_creator,
) -> List[schemas.DebtTransfer]:
    """
    Aplica el algoritmo greedy para minimizar las transferencias de deuda.
    Recibe la lista de balances y retorna las transferencias simplificadas.
    """
    creditors = []
    debtors = []

    for b in balances:
        if b.net_balance > Decimal('0.01'):
            creditors.append([b.member_id, b.net_balance])
        elif b.net_balance < Decimal('-0.01'):
            debtors.append([b.member_id, -b.net_balance])

    creditors.sort(key=lambda x: x[1], reverse=True)
    debtors.sort(key=lambda x: x[1], reverse=True)

    transfers = []
    i, j = 0, 0

    while i < len(creditors) and j < len(debtors):
        creditor_id, credit_amount = creditors[i]
        debtor_id, debt_amount = debtors[j]
        settle_amount = min(credit_amount, debt_amount)

        creditor_member = member_map[creditor_id]
        debtor_member = member_map[debtor_id]

        if creditor_member.contact:
            to_alias = creditor_member.contact.alias_bancario
            to_cvu = creditor_member.contact.cvu
        elif creditor_member.is_creator:
            to_alias = group_creator.alias_bancario
            to_cvu = group_creator.cvu
        else:
            to_alias = None
            to_cvu = None

        transfers.append(schemas.DebtTransfer(
            from_member_id=debtor_id,
            from_display_name=debtor_member.display_name,
            to_member_id=creditor_id,
            to_display_name=creditor_member.display_name,
            amount=settle_amount.quantize(Decimal('0.01')),
            to_alias_bancario=to_alias,
            to_cvu=to_cvu,
        ))

        creditors[i][1] -= settle_amount
        debtors[j][1] -= settle_amount

        if creditors[i][1] < Decimal('0.01'):
            i += 1
        if debtors[j][1] < Decimal('0.01'):
            j += 1

    return transfers
