"""Router de pagos Mercado Pago: /payments/"""
import hmac
import hashlib
from datetime import datetime
from typing import List

import mercadopago
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

import config
import models
import schemas
from auth import get_current_active_user
from database import get_db

router = APIRouter(prefix="/payments", tags=["payments"])


def get_mp_sdk():
    if not config.MP_ACCESS_TOKEN:
        raise HTTPException(status_code=500, detail="Mercado Pago no está configurado. Falta MP_ACCESS_TOKEN.")
    return mercadopago.SDK(config.MP_ACCESS_TOKEN)


def _is_valid_mp_signature(request: Request, data_id: str) -> bool:
    if not config.MP_WEBHOOK_SECRET:
        return not config.IS_PRODUCTION

    x_signature = request.headers.get("x-signature", "")
    x_request_id = request.headers.get("x-request-id", "")
    if not x_signature or not x_request_id:
        return False

    signature_parts = {}
    for part in x_signature.split(","):
        if "=" in part:
            key, value = part.split("=", 1)
            signature_parts[key.strip()] = value.strip()

    ts = signature_parts.get("ts")
    v1 = signature_parts.get("v1")
    if not ts or not v1:
        return False

    manifest = f"id:{data_id};request-id:{x_request_id};ts:{ts};"
    expected = hmac.new(
        config.MP_WEBHOOK_SECRET.encode("utf-8"),
        msg=manifest.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, v1)


@router.post("/create-preference", response_model=schemas.PaymentPreferenceResponse)
def create_payment_preference(
    payment_data: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == payment_data.group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    from_member = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id == payment_data.from_member_id,
        models.SplitGroupMember.group_id == payment_data.group_id,
    ).first()
    to_member = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id == payment_data.to_member_id,
        models.SplitGroupMember.group_id == payment_data.group_id,
    ).first()

    if not from_member or not to_member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado en el grupo")

    db_payment = models.Payment(
        group_id=payment_data.group_id,
        from_member_id=payment_data.from_member_id,
        to_member_id=payment_data.to_member_id,
        amount=payment_data.amount,
        status="pending",
    )
    db.add(db_payment)
    db.commit()
    db.refresh(db_payment)

    sdk = get_mp_sdk()
    preference_data = {
        "items": [
            {
                "title": f"Pago de deuda - {group.nombre}",
                "description": f"{from_member.display_name} paga a {to_member.display_name}",
                "quantity": 1,
                "unit_price": float(payment_data.amount),
                "currency_id": "ARS",
            }
        ],
        "notification_url": f"{config.BACKEND_URL}/payments/webhook",
        "external_reference": f"payment_{db_payment.id}",
    }

    print(f"[MP] Creando preferencia para payment_id={db_payment.id}, monto={payment_data.amount}")
    try:
        preference_response = sdk.preference().create(preference_data)
        print(f"[MP] Respuesta status={preference_response['status']}")
    except Exception as e:
        print(f"[MP] ERROR al llamar a MP: {e}")
        db.delete(db_payment)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Error de conexión con Mercado Pago: {str(e)}")

    if preference_response["status"] != 201:
        print(f"[MP] Error response: {preference_response}")
        db.delete(db_payment)
        db.commit()
        raise HTTPException(
            status_code=500,
            detail=f"Error de Mercado Pago (status {preference_response['status']}): {preference_response.get('response', {})}"
        )

    preference = preference_response["response"]
    db_payment.mp_preference_id = preference["id"]
    db.commit()
    print(f"[MP] Preferencia creada OK: {preference['id']}")

    return schemas.PaymentPreferenceResponse(
        payment_id=db_payment.id,
        init_point=preference["init_point"],
    )


@router.post("/webhook")
async def mercadopago_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        body = await request.json()
    except Exception:
        return {"status": "ok"}

    if body.get("type") != "payment":
        return {"status": "ok"}

    mp_payment_id = body.get("data", {}).get("id")
    if not mp_payment_id:
        return {"status": "ok"}

    if not _is_valid_mp_signature(request, str(mp_payment_id)):
        raise HTTPException(status_code=401, detail="Firma de webhook inválida")

    sdk = get_mp_sdk()
    payment_response = sdk.payment().get(mp_payment_id)

    if payment_response["status"] != 200:
        return {"status": "error", "message": "No se pudo consultar el pago"}

    mp_payment = payment_response["response"]
    external_reference = mp_payment.get("external_reference", "")
    mp_status = mp_payment.get("status", "")

    if not external_reference.startswith("payment_"):
        return {"status": "ok"}

    try:
        local_payment_id = int(external_reference.split("_")[1])
    except (IndexError, ValueError):
        return {"status": "ok"}

    db_payment = db.query(models.Payment).filter(
        models.Payment.id == local_payment_id,
    ).first()

    if not db_payment:
        return {"status": "ok"}

    db_payment.mp_payment_id = str(mp_payment_id)
    db_payment.status = mp_status
    db_payment.updated_at = datetime.now()
    db.commit()

    return {"status": "ok"}


@router.get("/group/{group_id}", response_model=List[schemas.PaymentRead])
def get_group_payments(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    return db.query(models.Payment).filter(
        models.Payment.group_id == group_id,
    ).order_by(models.Payment.created_at.desc()).all()


@router.get("/{payment_id}/status", response_model=schemas.PaymentRead)
def get_payment_status(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_payment = db.query(models.Payment).filter(
        models.Payment.id == payment_id,
    ).first()

    if not db_payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == db_payment.group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    if db_payment.status == "pending" and db_payment.mp_preference_id:
        try:
            sdk = get_mp_sdk()
            search_result = sdk.payment().search({
                "external_reference": f"payment_{payment_id}"
            })
            if search_result["status"] == 200:
                results = search_result["response"].get("results", [])
                if results:
                    latest = results[0]
                    db_payment.mp_payment_id = str(latest["id"])
                    db_payment.status = latest["status"]
                    db_payment.updated_at = datetime.now()
                    db.commit()
        except Exception:
            pass

    return db_payment
