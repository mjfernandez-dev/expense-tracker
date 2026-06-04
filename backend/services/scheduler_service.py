"""Servicio de scheduler y helpers para gastos fijos."""
import json
import logging
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session
from apscheduler.schedulers.asyncio import AsyncIOScheduler

import models
from database import get_db, SessionLocal
from services.ciclo_time_service import ahora_buenos_aires
from services.vencimiento_service import should_notify, effective_day
from services.push_service import send_push_notification

logger = logging.getLogger("finanzaapp")


def _job_check_vencimientos():
    """Envía push notifications para GastoFijo con fechas de vencimiento próximas."""
    db = SessionLocal()
    try:
        hoy = date.today()

        gastos = (
            db.query(models.GastoFijo)
            .filter(
                models.GastoFijo.dia_vencimiento.isnot(None),
                models.GastoFijo.activo == True,
            )
            .all()
        )

        for gf in gastos:
            antic = gf.dias_anticipacion if gf.dias_anticipacion is not None else 2
            if not should_notify(gf.dia_vencimiento, antic, hoy):
                continue

            subs = (
                db.query(models.PushSubscription)
                .filter(models.PushSubscription.user_id == gf.user_id)
                .all()
            )

            if not subs:
                continue

            eff_day = effective_day(gf.dia_vencimiento, hoy.year, hoy.month)
            # NOTE: gf.descripcion is EncryptedString — decrypts transparently here.
            # IMPORTANT: do NOT include gf.descripcion in log statements (only log IDs).
            payload = {
                "title": "Vence pronto",
                "body": f"{gf.descripcion} vence el {eff_day}/{hoy.month}",
                "url": "/presupuesto",
            }

            for sub in subs:
                try:
                    result = send_push_notification(sub, payload)
                    if not result:
                        db.delete(sub)
                        logger.info(
                            "Deleted expired push subscription id=%s", sub.id
                        )
                except Exception as e:
                    logger.error(
                        "Push send error sub_id=%s gasto_fijo_id=%s: %s",
                        sub.id,
                        gf.id,
                        str(e),
                    )

        db.commit()
    except Exception as e:
        logger.error("check_vencimientos job error: %s", str(e))
        db.rollback()
    finally:
        db.close()


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
    scheduler.add_job(
        _job_check_vencimientos,
        'cron',
        hour=8,
        minute=0,
        timezone='America/Argentina/Buenos_Aires',
        id='check_vencimientos',
    )
    return scheduler
