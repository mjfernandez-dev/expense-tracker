"""Servicio de scheduler y helpers para gastos fijos."""
import json
import logging
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session
from apscheduler.schedulers.asyncio import AsyncIOScheduler

import models
from database import get_db
from services.ciclo_time_service import ahora_buenos_aires

logger = logging.getLogger("finanzaapp")


def obtener_importe_referencia_gasto_fijo(gasto_fijo_id: int, db: Session):
    """Retorna el mejor importe de referencia conocido para un gasto fijo."""
    ultimo_importe = (
        db.query(models.Movimiento.importe)
        .filter(models.Movimiento.gasto_fijo_id == gasto_fijo_id)
        .order_by(models.Movimiento.fecha.desc())
        .scalar()
    )
    if ultimo_importe is not None:
        return ultimo_importe

    return db.query(func.max(models.Movimiento.importe)).filter(
        models.Movimiento.gasto_fijo_id == gasto_fijo_id
    ).scalar()


def sincronizar_gastos_fijos_en_ciclo(ciclo: models.Ciclo, db: Session) -> int:
    """
    Copia los gastos fijos activos del usuario como compromisos del ciclo.
    Es idempotente por gasto_fijo_id dentro del ciclo.
    """
    gastos_fijos = (
        db.query(models.GastoFijo)
        .filter(
            models.GastoFijo.user_id == ciclo.user_id,
            models.GastoFijo.activo == True,
            models.GastoFijo.tipo == "gasto",
        )
        .all()
    )

    existentes_ids = {
        cgf.gasto_fijo_id
        for cgf in ciclo.gastos_fijos_ciclo
        if cgf.gasto_fijo_id is not None
    }

    creados = 0
    for gf in gastos_fijos:
        if gf.id in existentes_ids:
            continue

        importe = obtener_importe_referencia_gasto_fijo(gf.id, db)
        if importe is None:
            continue

        db.add(models.CicloGastoFijo(
            ciclo_id=ciclo.id,
            gasto_fijo_id=gf.id,
            monto_confirmado=importe,
            confirmado=True,
            estado="comprometido",
        ))
        creados += 1

    return creados


def _job_cleanup_tokens():
    """Job diario: elimina refresh tokens expirados o revocados."""
    db = next(get_db())
    try:
        cutoff = ahora_buenos_aires()
        deleted = (
            db.query(models.RefreshToken)
            .filter(
                (models.RefreshToken.revoked == True) |
                (models.RefreshToken.expires_at < cutoff)
            )
            .delete(synchronize_session=False)
        )
        db.commit()
        if deleted:
            logger.info(json.dumps({"msg": "refresh_tokens_cleaned", "deleted": deleted}))
    except Exception as e:
        logger.error(json.dumps({"msg": "error_cleanup_tokens", "error": str(e)}))
    finally:
        db.close()


def create_scheduler() -> AsyncIOScheduler:
    """Crea y configura el scheduler (sin iniciarlo)."""
    scheduler = AsyncIOScheduler()
    scheduler.add_job(_job_cleanup_tokens, 'interval', hours=24)
    return scheduler
