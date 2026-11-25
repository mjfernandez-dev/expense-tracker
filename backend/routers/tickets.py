"""Router del lector de tickets: /tickets/

El endpoint NO crea movimientos: devuelve los datos extraidos y el humano
confirma con `POST /movimientos`, que ya existe.
"""
from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from dependencies import limiter
from services import ticket_service

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.post("/leer", response_model=schemas.TicketLeido)
@limiter.limit("10/minute")
def leer_ticket(
    request: Request,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Se lee un byte de mas para poder distinguir "justo en el limite" de
    # "se paso", sin cargar en memoria un archivo arbitrariamente grande.
    contenido = archivo.file.read(ticket_service.MAX_BYTES + 1)
    return ticket_service.leer_ticket(
        contenido=contenido,
        tipo=archivo.content_type or "",
        user_id=current_user.id,
        db=db,
    )
