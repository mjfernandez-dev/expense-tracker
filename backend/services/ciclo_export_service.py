"""Generación de exportaciones textuales de ciclos financieros."""
from decimal import Decimal
from typing import TYPE_CHECKING

import models
from sqlalchemy.orm import joinedload

if TYPE_CHECKING:
    import schemas
    from sqlalchemy.orm import Session

ZERO = Decimal("0")


def _fmt(n) -> str:
    d = n if isinstance(n, Decimal) else Decimal(str(n))
    s = f"{round(d):,}".replace(",", ".")
    return f"$ {s}"


def obtener_movimientos_ciclo(
    ciclo: models.Ciclo,
    db: "Session",
    user_id: int,
) -> list[models.Movimiento]:
    """Carga los movimientos del ciclo con sus categorías para exportación."""
    return (
        db.query(models.Movimiento)
        .options(
            joinedload(models.Movimiento.categoria),
            joinedload(models.Movimiento.user_category),
        )
        .filter(
            models.Movimiento.user_id == user_id,
            models.Movimiento.fecha >= ciclo.fecha_inicio,
            models.Movimiento.fecha <= ciclo.fecha_fin,
        )
        .order_by(models.Movimiento.fecha.desc())
        .all()
    )


def generar_txt(
    ciclo: models.Ciclo,
    resumen: "schemas.CicloResumen",
    movimientos: list[models.Movimiento],
) -> str:
    """Genera el contenido TXT de un ciclo con su resumen y movimientos."""
    lines: list[str] = []

    fi = ciclo.fecha_inicio.strftime("%d/%m/%Y")
    ff = ciclo.fecha_fin.strftime("%d/%m/%Y")
    estado = "ACTIVO" if ciclo.activo else "CERRADO"

    lines.append("CICLO FINANCIERO")
    lines.append("=" * 50)
    lines.append(f"Período:         {fi} - {ff}  [{estado}]")
    lines.append(f"Ingresos:        {_fmt(resumen.total_ingresos)}")
    lines.append(f"Ahorro objetivo: {_fmt(resumen.ahorro_objetivo)}")
    lines.append(f"Total gastos:    {_fmt(resumen.total_gastos)}")
    lines.append(f"Disponible:      {_fmt(resumen.saldo_disponible_actual)}")
    lines.append("")

    items_confirmados = [i for i in resumen.presupuesto_items if i.confirmado]
    if items_confirmados:
        lines.append("PRESUPUESTO POR CATEGORÍA")
        lines.append("=" * 50)
        for item in items_confirmados:
            desc = (item.descripcion or "Sin descripción")[:20]
            pct = int((item.monto_ejecutado / item.monto_estimado * 100)) if item.monto_estimado else 0
            restante = max(item.monto_pendiente, ZERO)
            lines.append(
                f"{desc:<20}  {_fmt(item.monto_ejecutado):>14} / {_fmt(item.monto_estimado):<14}  ({pct:>3}%)  Restante: {_fmt(restante)}"
            )
        lines.append("")

    lines.append("MOVIMIENTOS")
    lines.append("=" * 50)
    for m in movimientos:
        fecha = m.fecha.strftime("%d/%m")
        desc = (m.descripcion or "")[:28]
        cat = (
            m.categoria.nombre if m.categoria
            else m.user_category.nombre if m.user_category
            else "Sin categoría"
        )[:18]
        signo = "-" if m.tipo == "gasto" else "+"
        importe = f"{signo}{_fmt(m.importe)}"
        lines.append(f"{fecha} | {desc:<28} | {cat:<18} | {importe:>16}")

    return "\n".join(lines) + "\n"
