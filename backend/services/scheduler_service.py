"""Servicio de scheduler y helpers para gastos fijos."""
import json
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

import models
from database import get_db
from services.ciclo_time_service import ahora_buenos_aires

logger = logging.getLogger("finanzaapp")


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
