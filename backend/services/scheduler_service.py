"""Servicio de scheduler para gastos fijos recurrentes."""
import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session
from apscheduler.schedulers.asyncio import AsyncIOScheduler

import models
from database import get_db

logger = logging.getLogger("finanzaapp")


def ejecutar_generacion_mensual(db: Session) -> int:
    """
    Genera los movimientos automáticos del mes actual para todos los gastos fijos activos.
    Es idempotente: no crea duplicados si ya existe un movimiento del gasto fijo para el mes.
    Retorna la cantidad de movimientos creados.
    """
    ahora = datetime.now()
    inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    fin_mes = (inicio_mes + timedelta(days=32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    gastos_fijos = db.query(models.GastoFijo).filter(models.GastoFijo.activo == True).all()

    creados = 0
    for gf in gastos_fijos:
        ya_existe = db.query(models.Movimiento).filter(
            models.Movimiento.gasto_fijo_id == gf.id,
            models.Movimiento.fecha >= inicio_mes,
            models.Movimiento.fecha < fin_mes
        ).first()
        if ya_existe:
            continue

        max_importe = db.query(func.max(models.Movimiento.importe)).filter(
            models.Movimiento.gasto_fijo_id == gf.id
        ).scalar()
        if max_importe is None:
            continue

        nuevo = models.Movimiento(
            importe=max_importe,
            fecha=inicio_mes,
            descripcion=gf.descripcion,
            nota="Generado automáticamente",
            tipo="gasto",
            categoria_id=gf.categoria_id,
            user_category_id=gf.user_category_id,
            user_id=gf.user_id,
            gasto_fijo_id=gf.id,
            is_auto_generated=True,
        )
        db.add(nuevo)
        creados += 1

    if creados:
        db.commit()
    return creados


def _job_generar_gastos_fijos():
    """Job del scheduler: se ejecuta el día 1 de cada mes."""
    db = next(get_db())
    try:
        creados = ejecutar_generacion_mensual(db)
        logger.info(json.dumps({"msg": "gastos_fijos_generados", "creados": creados}))
    except Exception as e:
        logger.error(json.dumps({"msg": "error_generando_gastos_fijos", "error": str(e)}))
    finally:
        db.close()


def create_scheduler() -> AsyncIOScheduler:
    """Crea y configura el scheduler (sin iniciarlo)."""
    scheduler = AsyncIOScheduler()
    scheduler.add_job(_job_generar_gastos_fijos, 'cron', day=1, hour=0, minute=1)
    return scheduler
