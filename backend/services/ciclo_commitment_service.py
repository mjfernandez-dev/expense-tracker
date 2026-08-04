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


def actualizar_monto_presupuesto_item(
    ciclo: models.Ciclo,
    item_id: int,
    nuevo_monto,
    db: "Session",
) -> models.PresupuestoItem:
    """
    Actualiza el monto_estimado de un item de presupuesto del ciclo (PATCH granular).

    - item inexistente → ValueError("_not_found")  (router → 404 sin revelar recurso)
    - nuevo_monto negativo → ValueError("El monto estimado no puede ser negativo")
    - nuevo_monto menor a lo ya ejecutado → ValueError en español (router → 400)
    Recalcula estado y confirmado según la ejecución real y commitea.
    """
    item = next((i for i in ciclo.presupuesto_items if i.id == item_id), None)
    if item is None:
        raise ValueError("_not_found")

    nuevo_monto_decimal = _to_decimal(nuevo_monto)
    if nuevo_monto_decimal < ZERO:
        raise ValueError("El monto estimado no puede ser negativo")

    progreso = calcular_progreso_presupuesto(item)
    if nuevo_monto_decimal < progreso.ejecutado:
        raise ValueError(
            f"El monto estimado no puede ser menor a lo ya ejecutado ({progreso.ejecutado:.2f})"
        )

    item.monto_estimado = nuevo_monto_decimal
    item.confirmado = True if progreso.ejecutado > 0 else item.confirmado
    item.estado = calcular_progreso_presupuesto(item).estado
    db.commit()
    db.refresh(item)
    return item


def confirmar_gastos_fijos_bulk(
    ciclo: models.Ciclo,
    items_data: list,
    db: "Session",
) -> None:
    """
    Confirma (o reemplaza) la lista de gastos fijos comprometidos en un ciclo.

    Actualiza items existentes por gasto_fijo_id, crea los faltantes y elimina
    los que ya no fueron incluidos. Similar a aplicar_presupuesto_bulk pero
    especializado en gastos fijos del ciclo.
    """
    existentes_por_gf = {
        item.gasto_fijo_id: item
        for item in ciclo.presupuesto_items
        if item.gasto_fijo_id is not None
    }

    usados_ids: set[int] = set()

    for gf_item in items_data:
        existente = existentes_por_gf.get(gf_item.gasto_fijo_id) if gf_item.gasto_fijo_id else None

        if existente:
            existente.monto_estimado = gf_item.monto_confirmado
            existente.confirmado = gf_item.confirmado
            if gf_item.descripcion_override:
                existente.descripcion = gf_item.descripcion_override
            existente.estado = "pendiente"
            usados_ids.add(existente.id)
        else:
            new_item = models.PresupuestoItem(
                ciclo_id=ciclo.id,
                gasto_fijo_id=gf_item.gasto_fijo_id,
                monto_estimado=_to_decimal(gf_item.monto_confirmado),
                confirmado=gf_item.confirmado,
                descripcion=gf_item.descripcion_override or "Gasto fijo",
                estado="pendiente",
            )
            db.add(new_item)
            db.flush()
            usados_ids.add(new_item.id)

    # Eliminar items del ciclo que tienen gasto_fijo_id y NO fueron incluídos
    for item in list(ciclo.presupuesto_items):
        if item.gasto_fijo_id is not None and item.id not in usados_ids:
            db.delete(item)
