"""Router de autenticación: /auth/*"""
from datetime import timedelta
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import config
import models
import schemas
from auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    validate_and_rotate_refresh_token,
    revoke_refresh_token,
    get_current_active_user,
    get_user_by_username,
    get_user_by_email,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    _hash_token,
)
from database import get_db
from dependencies import limiter
from email_service import send_password_reset_email
from services import auth_service

logger = logging.getLogger("finanzaapp")
router = APIRouter(prefix="/auth", tags=["auth"])


def _cookie_security_options() -> tuple[bool, str]:
    """Cookie policy compatible with local dev and production cross-site."""
    if config.IS_PRODUCTION:
        return True, "none"
    return False, "lax"


@router.post("/register", response_model=schemas.UserRead)
@limiter.limit("3/minute")
def register(request: Request, user: schemas.UserCreate, db: Session = Depends(get_db)):
    if get_user_by_username(db, user.username):
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está registrado")
    if get_user_by_email(db, user.email):
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    return auth_service.registrar_usuario(user, db)


@router.post("/login")
@limiter.limit("5/minute")
def login(
    request: Request,
    payload: schemas.LoginRequest,
    db: Session = Depends(get_db)
):
    user = authenticate_user(db, payload.username, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(db, user.id)

    cookie_secure, cookie_samesite = _cookie_security_options()
    response = JSONResponse(content=jsonable_encoder({
        "message": "Login exitoso",
        "user": schemas.UserRead.model_validate(user).model_dump(),
    }))
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=cookie_secure,
        samesite=cookie_samesite,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=cookie_secure,
        samesite=cookie_samesite,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )
    return response


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    raw_refresh = request.cookies.get("refresh_token")
    if raw_refresh:
        revoke_refresh_token(db, raw_refresh)

    cookie_secure, cookie_samesite = _cookie_security_options()
    response = JSONResponse(content={"message": "Sesión cerrada"})
    response.delete_cookie(key="access_token", httponly=True, secure=cookie_secure, samesite=cookie_samesite, path="/")
    response.delete_cookie(key="refresh_token", httponly=True, secure=cookie_secure, samesite=cookie_samesite, path="/")
    return response


@router.post("/refresh")
@limiter.limit("10/minute")
def refresh_token(request: Request, db: Session = Depends(get_db)):
    """Renueva el access_token usando el refresh_token de la cookie.

    Implementa rotación: el refresh token viejo se revoca y se emite uno nuevo.
    """
    raw_refresh = request.cookies.get("refresh_token")
    if not raw_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token no encontrado",
        )

    user, new_raw_refresh = validate_and_rotate_refresh_token(db, raw_refresh)

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    new_access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    cookie_secure, cookie_samesite = _cookie_security_options()
    response = JSONResponse(content=jsonable_encoder({
        "message": "Token renovado",
        "user": schemas.UserRead.model_validate(user).model_dump(),
    }))
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=cookie_secure,
        samesite=cookie_samesite,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=new_raw_refresh,
        httponly=True,
        secure=cookie_secure,
        samesite=cookie_samesite,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )
    return response


@router.get("/me", response_model=schemas.UserRead)
def get_me(current_user: models.User = Depends(get_current_active_user)):
    return current_user


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    payload: schemas.PasswordResetRequest,
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, payload.email)
    message = "Si el email existe, se ha enviado un enlace para restablecer la contraseña"

    if not user:
        return {"message": message}

    raw_token = auth_service.crear_password_reset_token(user, db)

    try:
        await send_password_reset_email(
            email=user.email,
            username=user.username,
            reset_token=raw_token,
            expires_in_hours=1,
        )
    except Exception as exc:
        logger.error("Failed to send password reset email to %s: %s", user.email, exc)
        # No relanzar — no revelar si el email existe o no

    return {"message": message}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    payload: schemas.PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    ok = auth_service.resetear_password(_hash_token(payload.token), payload.new_password, db)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token de restablecimiento no es válido o ha expirado",
        )

    return {"message": "Contraseña restablecida correctamente"}


@router.post("/change-password")
@limiter.limit("3/minute")
def change_password(
    request: Request,
    payload: schemas.PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    auth_service.cambiar_password(current_user, payload, db)
    return {"message": "Contraseña actualizada correctamente"}


@router.patch("/me/preferences", response_model=schemas.UserRead)
def update_user_preferences(
    payload: schemas.UserPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return auth_service.actualizar_preferencias(current_user, payload, db)
