import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_active_user
from database import get_db
import models
import schemas
from services.push_service import upsert_subscription, delete_subscription

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key")
def get_vapid_public_key():
    key = os.getenv("VAPID_PUBLIC_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Notificaciones push no configuradas")
    return {"public_key": key}


@router.post("/subscribe", response_model=schemas.PushSubscribeResponse)
def subscribe(
    request: schemas.PushSubscribeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    sub = upsert_subscription(current_user.id, request.endpoint, request.p256dh, request.auth, db)
    return {"id": sub.id, "message": "Suscripción guardada"}


@router.delete("/subscribe")
def unsubscribe(
    request: schemas.PushSubscribeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    delete_subscription(current_user.id, request.endpoint, db)
    return {"message": "Suscripción eliminada"}
