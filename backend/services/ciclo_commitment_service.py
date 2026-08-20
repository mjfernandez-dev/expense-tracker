"""Helpers para conciliación parcial de presupuesto del ciclo."""
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING, Iterable, Optional

import models
from services import ciclo_time_service

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
    user_id: int,
) -> None:
    """
    Aplica un conjunto de PresupuestoItemCreate al ciclo.
    Registra en la plantilla solo items confirmados; la ejecución previa fuerza
    la confirmación efectiva aunque el payload indique confirmado=False.
    Raises ValueError si un monto_estimado queda por debajo de lo ya ejecutado.
    """
    if ciclo.user_id != user_id:
        raise ValueError("Categoría de usuario no válida")

    user_category_ids = {
        item.user_category_id
        for item in items_data
        if item.user_category_id is not None
    }
    categorias_usuario = {}
    if user_category_ids:
        categorias_usuario = {
            categoria.id: categoria
            for categoria in db.query(models.UserCategory).filter(
                models.UserCategory.id.in_(user_category_ids),
                models.UserCategory.user_id == user_id,
            ).all()
        }
    if len(categorias_usuario) != len(user_category_ids):
        raise ValueError("Categoría de usuario no válida")

    existentes = list(ciclo.presupuesto_items)
    usados_ids: set[int] = set()

    def _match_item(item) -> Optional[models.PresupuestoItem]:
        for existente in existentes:
            if existente.id in usados_ids:
                continue
            if item.categoria_id is not None and existente.categoria_id == item.categoria_id:
                return existente
            if item.categoria_id is not None:
                continue
            if item.user_category_id is not None and existente.user_category_id == item.user_category_id:
                return existente
            if item.user_category_id is not None:
                continue
            if (existente.descripcion or "").lower() == (item.descripcion or "").lower():
                return existente
        return None

    try:
        for item in items_data:
            existente = _match_item(item)
            if existente:
                progreso = calcular_progreso_presupuesto(existente)
                if _to_decimal(item.monto_estimado) < progreso.ejecutado:
                    raise ValueError(
                        f"El monto estimado no puede ser menor a lo ya ejecutado ({progreso.ejecutado:.2f})"
                    )
                existente.monto_estimado = item.monto_estimado
                existente.confirmado = True if progreso.ejecutado > 0 else item.confirmado
                existente.descripcion = item.descripcion
                existente.estado = calcular_progreso_presupuesto(existente).estado
                usados_ids.add(existente.id)
                confirmado = existente.confirmado
            else:
                db.add(models.PresupuestoItem(
                    ciclo_id=ciclo.id,
                    categoria_id=item.categoria_id,
                    user_category_id=item.user_category_id,
                    monto_estimado=item.monto_estimado,
                    confirmado=item.confirmado,
                    descripcion=item.descripcion,
                    estado="pendiente",
                ))
                confirmado = item.confirmado

            if item.user_category_id is not None and confirmado:
                categoria = categorias_usuario[item.user_category_id]
                monto_confirmado = _to_decimal(item.monto_estimado)
                categoria.tiene_monto_fijo = True
                if _to_decimal(categoria.monto_default) < monto_confirmado:
                    categoria.monto_default = monto_confirmado

        for existente in existentes:
            if existente.id in usados_ids:
                continue
            progreso = calcular_progreso_presupuesto(existente)
            if progreso.ejecutado > 0:
                existente.confirmado = True
                existente.estado = progreso.estado
                continue
            db.delete(existente)

        db.commit()
    except Exception:
        db.rollback()
        raise


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


def crear_o_vincular_presupuesto_item(
    ciclo: models.Ciclo,
    data,
    db: "Session",
    user_id: int,
) -> models.PresupuestoItem:
    """
    Crea (o actualiza) un item de presupuesto granular y le vincula los gastos
    del ciclo aún sin comprometer que coincidan con su categoría.

    - Match del item existente: user_category_id → categoria_id → descripcion lower.
    - Vincula los movimientos gasto del período que aún no tienen item y que
      coinciden con la categoría indicada (solo si viene categoría en el body).
    - Raises ValueError si monto_estimado queda por debajo de lo ya ejecutado
      (incluyendo los gastos sueltos que se van a vincular).
    Commitea y devuelve el item actualizado.
    """
    # 1. Match de item existente del ciclo (patrón _match_item, priorizando
    # la categoría más específica que venga en el body).
    existente = None
    if data.user_category_id is not None:
        existente = next(
            (i for i in ciclo.presupuesto_items if i.user_category_id == data.user_category_id),
            None,
        )
    if existente is None and data.categoria_id is not None:
        existente = next(
            (i for i in ciclo.presupuesto_items if i.categoria_id == data.categoria_id),
            None,
        )
    if existente is None:
        existente = next(
            (
                i
                for i in ciclo.presupuesto_items
                if (i.descripcion or "").lower() == (data.descripcion or "").lower()
            ),
            None,
        )

    # 2. Movimientos del usuario dentro del período del ciclo (misma query que
    # calcular_resumen: rango de fechas + movimiento origen fuera de rango).
    ahora = ciclo_time_service.ahora_buenos_aires()
    fecha_limite = min(ahora, ciclo.fecha_fin)
    movimientos = (
        db.query(models.Movimiento)
        .filter(
            models.Movimiento.user_id == user_id,
            models.Movimiento.fecha >= ciclo.fecha_inicio,
            models.Movimiento.fecha <= fecha_limite,
        )
        .all()
    )
    if ciclo.movimiento_origen_id:
        mov_origen = (
            db.query(models.Movimiento)
            .filter(
                models.Movimiento.id == ciclo.movimiento_origen_id,
                models.Movimiento.user_id == user_id,
            )
            .first()
        )
        if mov_origen and mov_origen not in movimientos:
            movimientos.append(mov_origen)

    # Solo se vinculan gastos sueltos si el item trae categoría en el body.
    # El caso "Sin categoría"/exceso (solo descripcion) no vincula movimientos.
    sueltos = [
        m
        for m in movimientos
        if m.tipo == "gasto"
        and m.presupuesto_item_id is None
        and (
            (data.user_category_id is not None and m.user_category_id == data.user_category_id)
            or (data.categoria_id is not None and m.categoria_id == data.categoria_id)
        )
    ]

    # 3. Suma de los gastos sueltos que se van a vincular.
    sumatoria_sueltos = sum((_to_decimal(m.importe) for m in sueltos), ZERO)

    # 4. Ejecución ya comprometida en el item existente.
    if existente is not None:
        ejecutado_base = calcular_progreso_presupuesto(existente).ejecutado
    else:
        ejecutado_base = ZERO

    # 5. Validación: el monto estimado no puede bajar del total ejecutado.
    ejecutado_total = ejecutado_base + sumatoria_sueltos
    if _to_decimal(data.monto_estimado) < ejecutado_total:
        raise ValueError(
            f"El monto estimado no puede ser menor a lo ya ejecutado ({ejecutado_total:.2f})"
        )

    # 6. Actualizar el item existente o crear uno nuevo.
    if existente is not None:
        item = existente
        item.monto_estimado = data.monto_estimado
        item.confirmado = True if ejecutado_total > 0 else data.confirmado
        item.descripcion = data.descripcion
    else:
        item = models.PresupuestoItem(
            ciclo_id=ciclo.id,
            categoria_id=data.categoria_id,
            user_category_id=data.user_category_id,
            monto_estimado=data.monto_estimado,
            confirmado=True,
            descripcion=data.descripcion,
            estado="pendiente",
        )
        db.add(item)
        db.flush()

    # 7. Vincular los gastos sueltos al item (así salen de gastos_sin_presupuesto).
    for m in sueltos:
        m.presupuesto_item = item

    # 8. Recalcular estado según la ejecución real y persistir.
    item.estado = calcular_progreso_presupuesto(item).estado
    db.commit()
    db.refresh(item)
    return item
