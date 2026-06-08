"""Router de inversiones: /inversiones/"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.ciclo_time_service import ahora_buenos_aires
from services.fci_scraper import scrape_valor_cuota
from services.inversion_service import calc_inversion_summary, get_latest_price

router = APIRouter(prefix="/inversiones", tags=["inversiones"])


def _inversion_to_dict(inv: models.Inversion, db: Session) -> dict:
    """Convert an Inversion model to a dict with calculated fields."""
    inv_dict = {c.name: getattr(inv, c.name) for c in inv.__table__.columns}
    inv_dict.update(calc_inversion_summary(inv, db))
    return inv_dict


@router.get("/", response_model=List[schemas.InversionRead])
def list_inversiones(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """List all active investments for the current user."""
    inversiones = (
        db.query(models.Inversion)
        .filter(
            models.Inversion.user_id == current_user.id,
            models.Inversion.activo == True,
        )
        .all()
    )
    return [_inversion_to_dict(inv, db) for inv in inversiones]


@router.post("/", response_model=schemas.InversionRead, status_code=201)
def create_inversion(
    data: schemas.InversionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Create a new investment tracking entry."""
    inv = models.Inversion(**data.model_dump(), user_id=current_user.id)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _inversion_to_dict(inv, db)


@router.get("/{inversion_id}", response_model=schemas.InversionDetailRead)
def get_inversion(
    inversion_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get investment detail with full price history."""
    inv = (
        db.query(models.Inversion)
        .filter(
            models.Inversion.id == inversion_id,
            models.Inversion.user_id == current_user.id,
        )
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Inversión no encontrada")

    historial = (
        db.query(models.HistorialInversion)
        .filter(models.HistorialInversion.inversion_id == inv.id)
        .order_by(models.HistorialInversion.fecha.desc())
        .all()
    )

    inv_dict = _inversion_to_dict(inv, db)
    inv_dict["historial"] = historial
    return inv_dict


@router.put("/{inversion_id}", response_model=schemas.InversionRead)
def update_inversion(
    inversion_id: int,
    data: schemas.InversionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Update an investment's configuration."""
    inv = (
        db.query(models.Inversion)
        .filter(
            models.Inversion.id == inversion_id,
            models.Inversion.user_id == current_user.id,
        )
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Inversión no encontrada")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(inv, key, value)

    db.commit()
    db.refresh(inv)
    return _inversion_to_dict(inv, db)


@router.delete("/{inversion_id}", status_code=204)
def delete_inversion(
    inversion_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Delete an investment and all its price history."""
    inv = (
        db.query(models.Inversion)
        .filter(
            models.Inversion.id == inversion_id,
            models.Inversion.user_id == current_user.id,
        )
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Inversión no encontrada")

    db.delete(inv)
    db.commit()


@router.post("/{inversion_id}/historial", response_model=schemas.HistorialRead, status_code=201)
def add_historial(
    inversion_id: int,
    data: schemas.HistorialCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Manually add a price history entry for an investment."""
    inv = (
        db.query(models.Inversion)
        .filter(
            models.Inversion.id == inversion_id,
            models.Inversion.user_id == current_user.id,
        )
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Inversión no encontrada")

    historial = models.HistorialInversion(
        inversion_id=inv.id,
        **data.model_dump(),
    )
    db.add(historial)
    db.commit()
    db.refresh(historial)
    return historial


@router.post("/{inversion_id}/actualizar")
def actualizar_precio(
    inversion_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Trigger the scraper to fetch the current valor cuota."""
    inv = (
        db.query(models.Inversion)
        .filter(
            models.Inversion.id == inversion_id,
            models.Inversion.user_id == current_user.id,
        )
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Inversión no encontrada")
    if not inv.ticker:
        raise HTTPException(
            status_code=400,
            detail="La inversión no tiene ticker configurado",
        )

    valor = scrape_valor_cuota(inv.ticker)
    if valor is None:
        return {
            "success": False,
            "message": "No se pudo obtener el valor cuota automáticamente. Probá cargarlo manualmente.",
            "inversion_id": inversion_id,
        }

    historial = models.HistorialInversion(
        inversion_id=inv.id,
        fecha=ahora_buenos_aires(),
        valor_cuota=valor,
        fuente="scraping",
    )
    db.add(historial)
    db.commit()

    return {
        "success": True,
        "message": f"Valor cuota actualizado: ${float(valor):,.2f}",
        "valor_cuota": float(valor),
        "inversion_id": inversion_id,
    }
