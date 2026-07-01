"""Router de inversiones manuales: /inversiones/"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_active_user
from database import get_db
from services.inversion_service import calc_investment_summary
from services.ciclo_time_service import ahora_buenos_aires

router = APIRouter(prefix="/inversiones", tags=["inversiones"])


def _investment_to_dict(inv: models.Investment, db: Session) -> dict:
    """Convert an Investment model to a dict with calculated fields."""
    inv_dict = {c.name: getattr(inv, c.name) for c in inv.__table__.columns}
    inv_dict.update(calc_investment_summary(inv, db))
    return inv_dict


def _get_investment_or_404(
    inversion_id: int,
    current_user: models.User,
    db: Session,
) -> models.Investment:
    """Get investment by id, checking ownership. Raises 404 if not found/owned."""
    inv = db.query(models.Investment).filter(
        models.Investment.id == inversion_id,
        models.Investment.user_id == current_user.id,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inversión no encontrada")
    return inv


@router.get("/", response_model=List[schemas.InvestmentRead])
def list_inversiones(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """List all active investments for the current user."""
    inversiones = (
        db.query(models.Investment)
        .filter(
            models.Investment.user_id == current_user.id,
            models.Investment.activo == True,
        )
        .limit(limit)
        .offset(offset)
        .all()
    )
    return [_investment_to_dict(inv, db) for inv in inversiones]


@router.post("/", response_model=schemas.InvestmentRead, status_code=201)
def create_inversion(
    data: schemas.InvestmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Create a new investment tracking entry."""
    inv = models.Investment(**data.model_dump(), user_id=current_user.id)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _investment_to_dict(inv, db)


@router.get("/{inversion_id}", response_model=schemas.InvestmentDetailRead)
def get_inversion(
    inversion_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Get investment detail with all contributions and calculated fields."""
    inv = _get_investment_or_404(inversion_id, current_user, db)

    aportes = (
        db.query(models.AporteInversion)
        .filter(models.AporteInversion.inversion_id == inv.id)
        .order_by(models.AporteInversion.fecha.desc())
        .all()
    )

    inv_dict = _investment_to_dict(inv, db)
    inv_dict["aportes"] = aportes
    return inv_dict


@router.put("/{inversion_id}", response_model=schemas.InvestmentRead)
def update_inversion(
    inversion_id: int,
    data: schemas.InvestmentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Update an investment's fields."""
    inv = _get_investment_or_404(inversion_id, current_user, db)

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(inv, key, value)

    db.commit()
    db.refresh(inv)
    return _investment_to_dict(inv, db)


@router.delete("/{inversion_id}", status_code=204)
def delete_inversion(
    inversion_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Delete an investment and all its contributions (cascade)."""
    inv = _get_investment_or_404(inversion_id, current_user, db)
    db.delete(inv)
    db.commit()


@router.get("/{inversion_id}/aportes", response_model=List[schemas.ContributionRead])
def list_aportes(
    inversion_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """List all contributions for an investment, ordered by fecha DESC."""
    inv = _get_investment_or_404(inversion_id, current_user, db)

    aportes = (
        db.query(models.AporteInversion)
        .filter(models.AporteInversion.inversion_id == inv.id)
        .order_by(models.AporteInversion.fecha.desc())
        .all()
    )
    return aportes


@router.post("/{inversion_id}/aportes", response_model=schemas.ContributionRead, status_code=201)
def add_aporte(
    inversion_id: int,
    data: schemas.ContributionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Add a contribution to an investment."""
    inv = _get_investment_or_404(inversion_id, current_user, db)

    # Optional: prevent future dates
    if data.fecha > ahora_buenos_aires():
        raise HTTPException(
            status_code=400,
            detail="La fecha del aporte no puede ser futura",
        )

    aporte = models.AporteInversion(
        inversion_id=inv.id,
        **data.model_dump(),
    )
    db.add(aporte)
    db.commit()
    db.refresh(aporte)
    return aporte


@router.delete("/{inversion_id}/aportes/{aporte_id}", status_code=204)
def delete_aporte(
    inversion_id: int,
    aporte_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Delete a single contribution from an investment."""
    inv = _get_investment_or_404(inversion_id, current_user, db)

    aporte = (
        db.query(models.AporteInversion)
        .filter(
            models.AporteInversion.id == aporte_id,
            models.AporteInversion.inversion_id == inv.id,
        )
        .first()
    )
    if not aporte:
        raise HTTPException(status_code=404, detail="Aporte no encontrado")

    db.delete(aporte)
    db.commit()
