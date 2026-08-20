"""Router de tareas internas para Cloud Scheduler: /cron/"""
import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from services import gasto_programado_service
from services.ciclo_time_service import ahora_buenos_aires

router = APIRouter(prefix="/cron", tags=["cron"])


def _requiere_cron_secret(x_cron_secret: str = Header(default="")) -> None:
    """Valida el header X-Cron-Secret contra CRON_SECRET (Cloud Scheduler)."""
    secret = os.getenv("CRON_SECRET")
    if not secret or not secrets.compare_digest(x_cron_secret, secret):
        raise HTTPException(status_code=403, detail="No autorizado")


@router.post("/notificar-gastos-programados")
def notificar_gastos_programados(
    _: None = Depends(_requiere_cron_secret),
    db: Session = Depends(get_db),
) -> dict:
    """Recordatorios push de gastos programados próximos a vencer.

    Sin current_user a propósito: es un job server-to-server de Cloud Scheduler
    autenticado por X-Cron-Secret, no un endpoint de usuario. Toda la lógica
    (ventana, entrega, idempotencia diaria) vive en el service.
    """
    return gasto_programado_service.notificar_gastos_programados(
        db, ahora_buenos_aires().date()
    )
