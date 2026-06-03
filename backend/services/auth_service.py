"""Servicio de autenticación: lógica de negocio de registro, password y reset."""
from datetime import timedelta
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from auth import _hash_token, get_password_hash, verify_password
from services.ciclo_time_service import ahora_buenos_aires


def registrar_usuario(user: schemas.UserCreate, db: Session) -> models.User:
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def cambiar_password(current_user: models.User, payload: schemas.PasswordChange, db: Session) -> None:
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es correcta",
        )
    current_user.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    db.refresh(current_user)


def actualizar_preferencias(current_user: models.User, payload: schemas.UserPreferencesUpdate, db: Session) -> models.User:
    data = payload.model_dump(exclude_unset=True)
    if "ahorro_objetivo_default" in data:
        current_user.ahorro_objetivo_default = data["ahorro_objetivo_default"]
    if "porcentaje_ahorro_default" in data:
        current_user.porcentaje_ahorro_default = data["porcentaje_ahorro_default"]
    db.commit()
    db.refresh(current_user)
    return current_user


def actualizar_info_pago(current_user: models.User, payload: schemas.PaymentInfoUpdate, db: Session) -> models.User:
    current_user.alias_bancario = payload.alias_bancario
    current_user.cvu = payload.cvu
    db.commit()
    db.refresh(current_user)
    return current_user


def crear_password_reset_token(user: models.User, db: Session) -> str:
    """Crea y persiste un token de reset de contraseña. Devuelve el token sin hashear."""
    raw_token = uuid4().hex
    token_hash = _hash_token(raw_token)
    expires_at = ahora_buenos_aires() + timedelta(hours=1)

    reset_token = models.PasswordResetToken(
        user_id=user.id,
        token=token_hash,
        expires_at=expires_at,
    )
    db.add(reset_token)
    db.commit()
    return raw_token


def resetear_password(token_hash: str, new_password: str, db: Session) -> bool:
    """Valida el token y actualiza la contraseña. Devuelve True si fue exitoso."""
    token = (
        db.query(models.PasswordResetToken)
        .filter(models.PasswordResetToken.token == token_hash)
        .first()
    )

    if not token or token.used or token.expires_at < ahora_buenos_aires():
        return False

    user = db.query(models.User).filter(models.User.id == token.user_id).first()
    if not user:
        return False

    user.hashed_password = get_password_hash(new_password)
    token.used = True
    db.commit()
    return True
