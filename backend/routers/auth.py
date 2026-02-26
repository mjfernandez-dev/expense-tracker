"""Router de autenticación: /auth/*"""
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

import config
import models
import schemas
from auth import (
    get_password_hash,
    verify_password,
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
)
from database import get_db
from dependencies import limiter
from email_service import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserRead)
@limiter.limit("3/minute")
def register(request: Request, user: schemas.UserCreate, db: Session = Depends(get_db)):
    if get_user_by_username(db, user.username):
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está registrado")
    if get_user_by_email(db, user.email):
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/login")
@limiter.limit("5/minute")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = authenticate_user(db, form_data.username, form_data.password)
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

    response = JSONResponse(content={"message": "Login exitoso"})
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=config.IS_PRODUCTION,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=config.IS_PRODUCTION,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )
    return response


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    raw_refresh = request.cookies.get("refresh_token")
    if raw_refresh:
        revoke_refresh_token(db, raw_refresh)

    response = JSONResponse(content={"message": "Sesión cerrada"})
    response.delete_cookie(key="access_token", httponly=True, secure=config.IS_PRODUCTION, samesite="lax", path="/")
    response.delete_cookie(key="refresh_token", httponly=True, secure=config.IS_PRODUCTION, samesite="lax", path="/")
    return response


@router.post("/refresh")
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

    response = JSONResponse(content={"message": "Token renovado"})
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=config.IS_PRODUCTION,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=new_raw_refresh,
        httponly=True,
        secure=config.IS_PRODUCTION,
        samesite="lax",
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

    token_str = uuid4().hex
    expires_at = datetime.utcnow() + timedelta(hours=1)

    reset_token = models.PasswordResetToken(
        user_id=user.id,
        token=token_str,
        expires_at=expires_at,
    )
    db.add(reset_token)
    db.commit()

    try:
        await send_password_reset_email(
            email=user.email,
            username=user.username,
            reset_token=token_str,
            expires_in_hours=1,
        )
    except Exception as e:
        print(f"⚠️ Error enviando email a {user.email}: {str(e)}")

    return {"message": message}


@router.post("/reset-password")
def reset_password(
    payload: schemas.PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    token = (
        db.query(models.PasswordResetToken)
        .filter(models.PasswordResetToken.token == payload.token)
        .first()
    )

    if not token or token.used or token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token de restablecimiento no es válido o ha expirado",
        )

    user = db.query(models.User).filter(models.User.id == token.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token de restablecimiento no es válido o ha expirado",
        )

    user.hashed_password = get_password_hash(payload.new_password)
    token.used = True
    db.commit()

    return {"message": "Contraseña restablecida correctamente"}


@router.post("/change-password")
def change_password(
    payload: schemas.PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es correcta",
        )

    current_user.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    db.refresh(current_user)

    return {"message": "Contraseña actualizada correctamente"}


@router.put("/payment-info", response_model=schemas.UserRead)
def update_payment_info(
    payload: schemas.PaymentInfoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    current_user.alias_bancario = payload.alias_bancario
    current_user.cvu = payload.cvu
    db.commit()
    db.refresh(current_user)
    return current_user
