"""Helpers para conciliación parcial de presupuesto del ciclo."""
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING, Iterable, Optional

import models

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


ZERO = Decimal("0")


def _to_decimal(value) -> Decimal:
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


@dataclass
class PresupuestoProgreso:
    reservado: Decimal
    ejecutado: Decimal
    pendiente: Decimal
    estado: str


def calcular_progreso_presupuesto(
    item: models.PresupuestoItem,
    *,
    exclude_movimiento_id: Optional[int] = None,
    extra_importe: Decimal | int | None = None,
    movimientos: Optional[Iterable[models.Movimiento]] = None,
) -> PresupuestoProgreso:
    """Deriva reservado/ejecutado/pendiente y estado desde los movimientos vinculados al presupuesto."""
    reservado = _to_decimal(item.monto_estimado)
    movimientos_fuente = item.movimientos if movimientos is None else movimientos
    ejecutado = sum(
        _to_decimal(movimiento.importe)
        for movimiento in movimientos_fuente
        if movimiento.tipo == "gasto" and movimiento.id != exclude_movimiento_id
    )

    if extra_importe is not None:
        ejecutado += _to_decimal(extra_importe)

    pendiente = max(ZERO, reservado - ejecutado)

    if ejecutado <= ZERO:
        estado = "pendiente"
    elif ejecutado < reservado:
        estado = "parcial"
    else:
        estado = "efectivizado"

    return PresupuestoProgreso(
        reservado=reservado,
        ejecutado=ejecutado,
        pendiente=pendiente,
        estado=estado,
    )



def aplicar_presupuesto_bulk(
    ciclo: models.Ciclo,
    items_data: list,
    db: "Session",
) -> None:
    """
    Aplica un conjunto de PresupuestoItemCreate al ciclo.
    Raises ValueError si un monto_estimado queda por debajo de lo ya ejecutado.
    """
    existentes = list(ciclo.presupuesto_items)
    usados_ids: set[int] = set()

    def _match_item(item) -> Optional[models.PresupuestoItem]:
        for existente in existentes:
            if existente.id in usados_ids:
                continue
            if item.categoria_id is not None and existente.categoria_id == item.categoria_id:
                return existente
            if item.user_category_id is not None and existente.user_category_id == item.user_category_id:
                return existente
            if (existente.descripcion or "").lower() == (item.descripcion or "").lower():
                return existente
        return None

    for item in items_data:
        existente = _match_item(item)
        if existente:
            progreso = calcular_progreso_presupuesto(existente)
            if item.monto_estimado < progreso.ejecutado:
                raise ValueError(
                    f"El monto estimado no puede ser menor a lo ya ejecutado ({progreso.ejecutado:.2f})"
                )
            existente.monto_estimado = item.monto_estimado
            existente.confirmado = True if progreso.ejecutado > 0 else item.confirmado
            existente.descripcion = item.descripcion
            existente.estado = calcular_progreso_presupuesto(existente).estado
            usados_ids.add(existente.id)
            continue

        db.add(models.PresupuestoItem(
            ciclo_id=ciclo.id,
            categoria_id=item.categoria_id,
            user_category_id=item.user_category_id,
            monto_estimado=item.monto_estimado,
            confirmado=item.confirmado,
            descripcion=item.descripcion,
            estado="pendiente",
        ))

    for existente in existentes:
        if existente.id in usados_ids:
            continue
        progreso = calcular_progreso_presupuesto(existente)
        if progreso.ejecutado > 0:
            existente.confirmado = True
            existente.estado = progreso.estado
            continue
        db.delete(existente)
