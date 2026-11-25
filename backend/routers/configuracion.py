"""Router de configuración: credenciales de proveedores externos.

La clave es write-only: se envía al crear/actualizar y la API solo devuelve
un preview enmascarado. Ningún endpoint expone la clave en claro.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services import api_credential_service

router = APIRouter(prefix="/configuracion", tags=["configuracion"])


@router.get("/credenciales", response_model=List[schemas.ApiCredentialRead])
def listar_credenciales(
    proveedor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return api_credential_service.listar_credenciales(current_user.id, db, proveedor)


@router.post("/credenciales", response_model=schemas.ApiCredentialRead)
def crear_credencial(
    data: schemas.ApiCredentialCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return api_credential_service.crear_credencial(current_user.id, data, db)


@router.put("/credenciales/{credential_id}", response_model=schemas.ApiCredentialRead)
def actualizar_credencial(
    credential_id: int,
    data: schemas.ApiCredentialUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return api_credential_service.actualizar_credencial(credential_id, current_user.id, data, db)


@router.post("/credenciales/{credential_id}/activar", response_model=schemas.ApiCredentialRead)
def activar_credencial(
    credential_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return api_credential_service.activar_credencial(credential_id, current_user.id, db)


@router.delete("/credenciales/{credential_id}")
def eliminar_credencial(
    credential_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return api_credential_service.eliminar_credencial(credential_id, current_user.id, db)
