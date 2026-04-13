"""Helpers para conciliación parcial de compromisos del ciclo."""
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Optional

import models


ZERO = Decimal("0")


def _to_decimal(value) -> Decimal:
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


@dataclass
class CompromisoProgreso:
    reservado: Decimal
    ejecutado: Decimal
    pendiente: Decimal
    estado: str


def calcular_progreso_compromiso(
    cgf: models.CicloGastoFijo,
    *,
    exclude_movimiento_id: Optional[int] = None,
    extra_importe: Decimal | float | int | None = None,
    movimientos: Optional[Iterable[models.Movimiento]] = None,
) -> CompromisoProgreso:
    """Deriva reservado/ejecutado/pendiente y estado desde los movimientos vinculados."""
    reservado = _to_decimal(cgf.monto_confirmado)
    movimientos_fuente = cgf.movimientos if movimientos is None else movimientos
    ejecutado = sum(
        _to_decimal(movimiento.importe)
        for movimiento in movimientos_fuente
        if movimiento.tipo == "gasto" and movimiento.id != exclude_movimiento_id
    )

    if extra_importe is not None:
        ejecutado += _to_decimal(extra_importe)

    pendiente = max(ZERO, reservado - ejecutado)

    if ejecutado <= ZERO:
        estado = "comprometido"
    elif ejecutado < reservado:
        estado = "parcial"
    else:
        estado = "efectivizado"

    return CompromisoProgreso(
        reservado=reservado,
        ejecutado=ejecutado,
        pendiente=pendiente,
        estado=estado,
    )
