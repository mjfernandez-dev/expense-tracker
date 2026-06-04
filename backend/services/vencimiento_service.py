"""Utilidades para el cálculo de fechas de vencimiento de gastos fijos."""
import calendar
from datetime import date, timedelta
from typing import Optional


def effective_day(dia_vencimiento: int, year: int, month: int) -> int:
    """
    Devuelve el día efectivo de vencimiento para el mes dado,
    ajustando a la cantidad real de días del mes.

    Ejemplos:
        effective_day(30, 2025, 2) → 28
        effective_day(30, 2024, 2) → 29  (año bisiesto)
        effective_day(31, 2025, 4) → 30  (abril tiene 30 días)
        effective_day(15, 2025, 6) → 15
    """
    last_day = calendar.monthrange(year, month)[1]
    return min(dia_vencimiento, last_day)


def should_notify(
    dia_vencimiento: Optional[int],
    dias_anticipacion: int,
    today: date,
) -> bool:
    """
    Devuelve True si hoy es el día en que se debe enviar el aviso de vencimiento.

    Reglas:
    - Si dia_vencimiento es None → False siempre.
    - Calcula el día efectivo del mes actual.
    - Si esa fecha ya pasó este mes, se proyecta al mes siguiente.
    - notify_on = due - timedelta(días de anticipación).
    - Retorna True solo si notify_on == today.
    """
    if dia_vencimiento is None:
        return False

    due_day = effective_day(dia_vencimiento, today.year, today.month)
    due = date(today.year, today.month, due_day)

    if due < today:
        # El vencimiento ya pasó este mes → proyectar al mes siguiente
        first_of_next = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
        due_day = effective_day(dia_vencimiento, first_of_next.year, first_of_next.month)
        due = date(first_of_next.year, first_of_next.month, due_day)

    notify_on = due - timedelta(days=dias_anticipacion)
    return notify_on == today
