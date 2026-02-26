import hashlib
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import InvalidTokenError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas

# Configuración JWT
# SECRET_KEY es REQUERIDA - debe estar definida en variables de entorno
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "❌ ERROR CRÍTICO: SECRET_KEY no está definida.\n"
        "Define la variable de entorno: export SECRET_KEY='tu-clave-segura-32-caracteres'\n"
        "Genera una clave segura: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Contexto para hashear passwords con bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 con Password Bearer (el token viene en el header Authorization)
# auto_error=False para no fallar si no hay header, y poder leer la cookie como fallback
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si la contraseña en texto plano coincide con el hash."""
    # bcrypt tiene límite de 72 bytes
    truncated = plain_password[:72]
    return pwd_context.verify(truncated, hashed_password)


def get_password_hash(password: str) -> str:
    """Genera el hash de una contraseña."""
    # bcrypt tiene límite de 72 bytes
    truncated = password[:72]
    return pwd_context.hash(truncated)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crea un token JWT con los datos proporcionados."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_user_by_username(db: Session, username: str) -> Optional[models.User]:
    """Busca un usuario por su username."""
    return db.query(models.User).filter(models.User.username == username).first()


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    """Busca un usuario por su email."""
    return db.query(models.User).filter(models.User.email == email).first()


def authenticate_user(db: Session, username: str, password: str) -> Optional[models.User]:
    """Autentica un usuario verificando username y password."""
    user = get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.User:
    """Dependencia que obtiene el usuario actual desde el token JWT.

    Busca el token en este orden:
    1. Header Authorization: Bearer <token> (OAuth2)
    2. Cookie httpOnly 'access_token'
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Fallback: leer de cookie si no vino en header
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = schemas.TokenData(username=username)
    except InvalidTokenError:
        raise credentials_exception

    user = get_user_by_username(db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: models.User = Depends(get_current_user)
) -> models.User:
    """Verifica que el usuario actual esté activo."""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Usuario inactivo")
    return current_user


# ============== REFRESH TOKEN ==============

def _hash_token(raw_token: str) -> str:
    """Hashea un token con SHA256 para almacenarlo en la DB."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


def create_refresh_token(db: Session, user_id: int) -> str:
    """Genera un refresh token, lo guarda hasheado en DB y retorna el valor raw."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    db_token = models.RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(db_token)
    db.commit()
    return raw_token


def validate_and_rotate_refresh_token(
    db: Session, raw_token: str
) -> tuple[models.User, str]:
    """Valida el refresh token, lo revoca y emite uno nuevo (rotación).

    Retorna (user, new_raw_token).
    Lanza 401 si el token es inválido, revocado o expirado.
    """
    token_hash = _hash_token(raw_token)
    db_token = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.token_hash == token_hash)
        .first()
    )

    if not db_token or db_token.revoked or db_token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido o expirado",
        )

    user = db.query(models.User).filter(models.User.id == db_token.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no válido",
        )

    # Revocar el token viejo (rotación)
    db_token.revoked = True
    db.commit()

    # Emitir nuevo refresh token
    new_raw_token = create_refresh_token(db, user.id)
    return user, new_raw_token


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    """Revoca un refresh token (para logout)."""
    token_hash = _hash_token(raw_token)
    db_token = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.token_hash == token_hash)
        .first()
    )
    if db_token:
        db_token.revoked = True
        db.commit()
