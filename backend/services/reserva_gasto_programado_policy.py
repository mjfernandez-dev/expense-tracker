"""Ownership policy for scheduled-expense budget reservations."""
from collections.abc import Iterable

from fastapi import HTTPException

import models


def es_reserva_gasto_programado(item: models.PresupuestoItem) -> bool:
    """Return whether the item belongs exclusively to a scheduled expense."""
    return item.gasto_programado_id is not None


def asegurar_item_ordinario(item: models.PresupuestoItem) -> None:
    """Reject generic mutation after the caller has validated tenant ownership."""
    if es_reserva_gasto_programado(item):
        raise HTTPException(
            status_code=409,
            detail="La reserva de un gasto programado no puede modificarse desde esta operación",
        )


def items_ordinarios(
    items: Iterable[models.PresupuestoItem],
) -> list[models.PresupuestoItem]:
    """Return only items available to generic budget workflows."""
    return [item for item in items if not es_reserva_gasto_programado(item)]
