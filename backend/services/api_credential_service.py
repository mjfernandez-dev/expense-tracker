"""Servicio de credenciales de proveedores externos (ej. LlamaCloud).

Reglas de seguridad que este módulo garantiza:

- La clave se guarda cifrada (`EncryptedString`) y **nunca** se devuelve al
  cliente: la API expone solo un preview enmascarado.
- Cada usuario ve y modifica únicamente sus propias credenciales.
- Puede haber varias credenciales por proveedor, pero **una sola activa**:
  el usuario rota de una a otra cuando se queda sin créditos.
"""
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

import models
import schemas

PROVEEDOR_LLAMACLOUD = "llamacloud"
TIER_DEFAULT_LLAMACLOUD = "agentic_plus"


def enmascarar(clave: str) -> str:
    """Preview seguro: primeras 4 y últimas 4 cuando hay largo suficiente."""
    if len(clave) >= 12:
        return f"{clave[:4]}…{clave[-4:]}"
    return f"…{clave[-4:]}"


def _a_read(credencial: models.ApiCredential) -> schemas.ApiCredentialRead:
    return schemas.ApiCredentialRead(
        id=credencial.id,
        proveedor=credencial.proveedor,
        nombre=credencial.nombre,
        tier=credencial.tier,
        activa=credencial.activa,
        clave_preview=enmascarar(credencial.clave),
        created_at=credencial.created_at,
        updated_at=credencial.updated_at,
    )


def _obtener_credencial(credential_id: int, user_id: int, db: Session) -> models.ApiCredential:
    credencial = db.query(models.ApiCredential).filter(
        models.ApiCredential.id == credential_id,
        models.ApiCredential.user_id == user_id,
    ).first()
    if not credencial:
        raise HTTPException(status_code=404, detail="Credencial no encontrada")
    return credencial


def _verificar_nombre_unico(
    user_id: int,
    proveedor: str,
    nombre: str,
    db: Session,
    exclude_id: Optional[int] = None,
) -> None:
    query = db.query(models.ApiCredential).filter(
        models.ApiCredential.user_id == user_id,
        models.ApiCredential.proveedor == proveedor,
        models.ApiCredential.nombre == nombre,
    )
    if exclude_id is not None:
        query = query.filter(models.ApiCredential.id != exclude_id)
    if query.first():
        raise HTTPException(
            status_code=400,
            detail="Ya tenés una credencial con ese nombre para este proveedor",
        )


def _desactivar_otras(user_id: int, proveedor: str, db: Session, excepto_id: int) -> None:
    db.query(models.ApiCredential).filter(
        models.ApiCredential.user_id == user_id,
        models.ApiCredential.proveedor == proveedor,
        models.ApiCredential.id != excepto_id,
    ).update({models.ApiCredential.activa: False})


def listar_credenciales(
    user_id: int,
    db: Session,
    proveedor: Optional[str] = None,
) -> List[schemas.ApiCredentialRead]:
    query = db.query(models.ApiCredential).filter(models.ApiCredential.user_id == user_id)
    if proveedor:
        query = query.filter(models.ApiCredential.proveedor == proveedor)
    credenciales = query.order_by(
        models.ApiCredential.activa.desc(),
        models.ApiCredential.created_at.desc(),
    ).all()
    return [_a_read(c) for c in credenciales]


def crear_credencial(
    user_id: int,
    data: schemas.ApiCredentialCreate,
    db: Session,
) -> schemas.ApiCredentialRead:
    _verificar_nombre_unico(user_id, data.proveedor, data.nombre, db)

    ya_hay_activa = db.query(models.ApiCredential).filter(
        models.ApiCredential.user_id == user_id,
        models.ApiCredential.proveedor == data.proveedor,
        models.ApiCredential.activa == True,  # noqa: E712
    ).first()

    tier = data.tier
    if tier is None and data.proveedor == PROVEEDOR_LLAMACLOUD:
        tier = TIER_DEFAULT_LLAMACLOUD

    credencial = models.ApiCredential(
        user_id=user_id,
        proveedor=data.proveedor,
        nombre=data.nombre,
        clave=data.clave,
        tier=tier,
        # La primera credencial de un proveedor queda activa: el lector
        # funciona sin un paso extra de configuración.
        activa=ya_hay_activa is None,
    )
    db.add(credencial)
    db.commit()
    db.refresh(credencial)
    return _a_read(credencial)


def actualizar_credencial(
    credential_id: int,
    user_id: int,
    data: schemas.ApiCredentialUpdate,
    db: Session,
) -> schemas.ApiCredentialRead:
    credencial = _obtener_credencial(credential_id, user_id, db)

    if data.nombre is not None and data.nombre != credencial.nombre:
        _verificar_nombre_unico(
            user_id, credencial.proveedor, data.nombre, db, exclude_id=credencial.id
        )
        credencial.nombre = data.nombre
    if data.clave is not None:
        credencial.clave = data.clave
    if data.tier is not None:
        credencial.tier = data.tier

    db.commit()
    db.refresh(credencial)
    return _a_read(credencial)


def activar_credencial(credential_id: int, user_id: int, db: Session) -> schemas.ApiCredentialRead:
    credencial = _obtener_credencial(credential_id, user_id, db)
    _desactivar_otras(user_id, credencial.proveedor, db, excepto_id=credencial.id)
    credencial.activa = True
    db.commit()
    db.refresh(credencial)
    return _a_read(credencial)


def eliminar_credencial(credential_id: int, user_id: int, db: Session) -> dict:
    credencial = _obtener_credencial(credential_id, user_id, db)
    era_activa = credencial.activa
    proveedor = credencial.proveedor

    db.delete(credencial)
    db.flush()

    # Si borró la activa, promover la más reciente que quede: el lector no debe
    # quedar apuntando a una credencial inexistente.
    if era_activa:
        reemplazo = db.query(models.ApiCredential).filter(
            models.ApiCredential.user_id == user_id,
            models.ApiCredential.proveedor == proveedor,
        ).order_by(models.ApiCredential.created_at.desc()).first()
        if reemplazo:
            reemplazo.activa = True

    db.commit()
    return {"ok": True}


def obtener_clave_activa(
    user_id: int,
    db: Session,
    proveedor: str = PROVEEDOR_LLAMACLOUD,
) -> Optional[str]:
    """Clave desencriptada de la credencial activa, o None si no hay ninguna.

    Es el único punto que devuelve la clave en claro, y solo para uso interno
    del backend (llamadas salientes al proveedor).
    """
    credencial = db.query(models.ApiCredential).filter(
        models.ApiCredential.user_id == user_id,
        models.ApiCredential.proveedor == proveedor,
        models.ApiCredential.activa == True,  # noqa: E712
    ).first()
    return credencial.clave if credencial else None


def obtener_tier_activo(
    user_id: int,
    db: Session,
    proveedor: str = PROVEEDOR_LLAMACLOUD,
) -> Optional[str]:
    credencial = db.query(models.ApiCredential).filter(
        models.ApiCredential.user_id == user_id,
        models.ApiCredential.proveedor == proveedor,
        models.ApiCredential.activa == True,  # noqa: E712
    ).first()
    return credencial.tier if credencial else None
