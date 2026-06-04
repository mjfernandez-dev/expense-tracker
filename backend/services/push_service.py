import json
import logging
import os

from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session

import models

logger = logging.getLogger("finanzaapp")

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_CLAIMS = {"sub": os.getenv("VAPID_MAILTO", "mailto:admin@finanzaapp")}


def send_push_notification(subscription, payload: dict) -> bool:
    """Send a push notification to a subscription.

    Returns True if delivered successfully.
    Returns False on 410/404 (subscription expired — caller should delete it).
    Raises WebPushException on other errors.
    """
    sub_info = {
        "endpoint": subscription.endpoint,
        "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
    }
    try:
        webpush(
            subscription_info=sub_info,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=dict(VAPID_CLAIMS),
        )
        return True
    except WebPushException as e:
        status = getattr(e.response, "status_code", None)
        if status in (404, 410):
            logger.info(
                "push_sub_expired endpoint=%s status=%s",
                subscription.id,
                status,
            )
            return False
        raise


def upsert_subscription(user_id: int, endpoint: str, p256dh: str, auth: str, db: Session) -> models.PushSubscription:
    existing = (
        db.query(models.PushSubscription)
        .filter(
            models.PushSubscription.endpoint == endpoint,
            models.PushSubscription.user_id == user_id,
        )
        .first()
    )
    if existing:
        existing.p256dh = p256dh
        existing.auth = auth
        db.commit()
        db.refresh(existing)
        return existing

    sub = models.PushSubscription(user_id=user_id, endpoint=endpoint, p256dh=p256dh, auth=auth)
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def delete_subscription(user_id: int, endpoint: str, db: Session) -> None:
    db.query(models.PushSubscription).filter(
        models.PushSubscription.endpoint == endpoint,
        models.PushSubscription.user_id == user_id,
    ).delete()
    db.commit()
