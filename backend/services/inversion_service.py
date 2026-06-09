"""Service layer for investment calculations."""
from decimal import Decimal

from sqlalchemy.orm import Session

import models


def calc_inversion_summary(inversion: models.Inversion, db: Session) -> dict:
    """Calculate investment summary fields: valor_actual, rendimiento, etc."""
    latest_price = (
        db.query(models.HistorialInversion)
        .filter(models.HistorialInversion.inversion_id == inversion.id)
        .order_by(models.HistorialInversion.fecha.desc())
        .first()
    )

    result: dict = {
        "valor_actual": None,
        "rendimiento_pct": None,
        "ganancia_perdida": None,
        "ultimo_valor_cuota": None,
        "ultima_actualizacion": None,
    }

    if latest_price and inversion.cuotapartes:
        valor_actual = inversion.cuotapartes * latest_price.valor_cuota
        result["ultimo_valor_cuota"] = latest_price.valor_cuota
        result["ultima_actualizacion"] = latest_price.fecha
        result["valor_actual"] = valor_actual

        if inversion.monto_invertido and inversion.monto_invertido > 0:
            ganancia = valor_actual - inversion.monto_invertido
            rendimiento = (ganancia / inversion.monto_invertido) * Decimal("100")
            result["ganancia_perdida"] = ganancia
            result["rendimiento_pct"] = float(rendimiento)

    return result
