"""Service layer for manual investment calculations."""
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

import models


def calc_investment_summary(investment: models.Investment, db: Session) -> dict:
    """Calculate investment summary fields at read time.

    Computes:
    - total_invertido_ars: sum of all contribution amounts in ARS
    - total_invertido_usd: sum of (monto_ars / cotizacion_usd) where cotizacion_usd is set
    - valor_actual_usd: valor_actual_ars / cotizacion_usd_actual if both set
    - ganancia_perdida_ars: valor_actual_ars - total_invertido_ars (if both set)
    - ganancia_perdida_usd: valor_actual_usd - total_invertido_usd (if both set)
    - rendimiento_pct: (valor_actual_ars / total_invertido_ars - 1) * 100

    Returns dict with all calculated fields (None for unavailable values).
    """
    result: dict = {
        "total_invertido_ars": Decimal("0"),
        "total_invertido_usd": None,
        "valor_actual_usd": None,
        "ganancia_perdida_ars": None,
        "ganancia_perdida_usd": None,
        "rendimiento_pct": None,
    }

    # 1. Total invertido en ARS
    total_ars = (
        db.query(func.sum(models.AporteInversion.monto_ars))
        .filter(models.AporteInversion.inversion_id == investment.id)
        .scalar()
    )
    total_ars = total_ars if total_ars is not None else Decimal("0")
    result["total_invertido_ars"] = total_ars

    # 2. Total invertido en USD (solo aportes con cotización)
    usd_value_expr = func.sum(
        models.AporteInversion.monto_ars / models.AporteInversion.cotizacion_usd
    )
    total_usd = (
        db.query(usd_value_expr)
        .filter(
            models.AporteInversion.inversion_id == investment.id,
            models.AporteInversion.cotizacion_usd.isnot(None),
            models.AporteInversion.cotizacion_usd != 0,
        )
        .scalar()
    )
    if total_usd is not None:
        result["total_invertido_usd"] = total_usd

    # 3. Valor actual en USD
    if (
        investment.valor_actual_ars is not None
        and investment.cotizacion_usd_actual is not None
        and investment.cotizacion_usd_actual > 0
    ):
        result["valor_actual_usd"] = (
            investment.valor_actual_ars / investment.cotizacion_usd_actual
        )

    # 4. Ganancia/pérdida en ARS
    if investment.valor_actual_ars is not None and total_ars > 0:
        result["ganancia_perdida_ars"] = investment.valor_actual_ars - total_ars

    # 5. Ganancia/pérdida en USD
    valor_usd = result["valor_actual_usd"]
    total_invertido_usd = result["total_invertido_usd"]
    if valor_usd is not None and total_invertido_usd is not None and total_invertido_usd > 0:
        result["ganancia_perdida_usd"] = valor_usd - total_invertido_usd

    # 6. Rendimiento porcentual
    if investment.valor_actual_ars is not None and total_ars > 0:
        rendimiento = (investment.valor_actual_ars / total_ars - Decimal("1")) * Decimal("100")
        result["rendimiento_pct"] = float(rendimiento)

    return result
