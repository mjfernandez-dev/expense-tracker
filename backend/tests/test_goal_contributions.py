"""
Tests para contribuciones a metas (Goal Contributions).

Cubre:
- Unit: goal_service.contribute_to_goal() — validación y casos de error
- Unit: goal_service.withdraw_from_goal() — retiros y fondos insuficientes
- Unit: calcular_resumen() — fórmula actualizada con goal contributions
- Integration: POST /wishlist/{id}/contribute — éxito y errores
- Integration: POST /wishlist/{id}/withdraw — éxito y errores
- Multi-tenant isolation
"""

from decimal import Decimal
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from services.goal_service import contribute_to_goal, withdraw_from_goal, list_contributions_for_goal
from services.ciclo_service import calcular_resumen
from services.ciclo_time_service import ahora_buenos_aires


# ============== HELPERS ==============

def _create_user(db: Session) -> models.User:
    user = models.User(
        username=f"testuser_{datetime.now().timestamp()}",
        email=f"test_{datetime.now().timestamp()}@example.com",
        hashed_password="dummy",
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _create_user_category(db: Session, user_id: int) -> models.UserCategory:
    cat = models.UserCategory(
        user_id=user_id,
        nombre="Test Cat",
        color="#ff0000",
    )
    db.add(cat)
    db.flush()
    return cat


def _create_system_category(db: Session) -> models.Category:
    """Create a system category if none exists."""
    cat = db.query(models.Category).first()
    if cat:
        return cat
    cat = models.Category(nombre="General", descripcion="Default category")
    db.add(cat)
    db.flush()
    return cat


def _create_ciclo(db: Session, user_id: int, days: int = 30) -> models.Ciclo:
    ahora = ahora_buenos_aires()
    ciclo = models.Ciclo(
        user_id=user_id,
        fecha_inicio=ahora,
        fecha_fin=ahora + timedelta(days=days),
        ahorro_objetivo=Decimal("500"),
        activo=True,
    )
    db.add(ciclo)
    db.flush()
    return ciclo


def _create_presupuesto_item(db: Session, ciclo_id: int, monto: Decimal = Decimal("1000")) -> models.PresupuestoItem:
    item = models.PresupuestoItem(
        ciclo_id=ciclo_id,
        monto_estimado=monto,
        confirmado=True,
        descripcion="Test Presupuesto",
        estado="pendiente",
    )
    db.add(item)
    db.flush()
    return item


def _create_ingreso(db: Session, user_id: int, importe: Decimal, categoria_id: int, fecha=None) -> models.Movimiento:
    if fecha is None:
        fecha = ahora_buenos_aires()
    mov = models.Movimiento(
        importe=importe,
        fecha=fecha,
        descripcion="Ingreso test",
        tipo="ingreso",
        user_id=user_id,
        categoria_id=categoria_id,
        es_inicio_ciclo=False,
    )
    db.add(mov)
    db.flush()
    return mov


def _create_gasto(db: Session, user_id: int, importe: Decimal, categoria_id: int, presupuesto_item_id: int = None, fecha=None) -> models.Movimiento:
    if fecha is None:
        fecha = ahora_buenos_aires()
    mov = models.Movimiento(
        importe=importe,
        fecha=fecha,
        descripcion="Gasto test",
        tipo="gasto",
        user_id=user_id,
        categoria_id=categoria_id,
        presupuesto_item_id=presupuesto_item_id,
    )
    db.add(mov)
    db.flush()
    return mov


def _create_goal(db: Session, user_id: int, monto_ahorrado: Decimal = Decimal("0")) -> models.WishlistItem:
    item = models.WishlistItem(
        user_id=user_id,
        name="Test Goal",
        estimated_cost=Decimal("5000"),
        monto_ahorrado=monto_ahorrado,
        priority="media",
        status="en-progreso",
    )
    db.add(item)
    db.flush()
    return item


# ==================== UNIT TESTS: contribute_to_goal ====================


class TestContributeToGoal:

    def test_contribute_from_disponible(self, db_session: Session):
        """Happy path: contribute from disponible."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("10000"), cat.id)
        item = _create_goal(db_session, user.id)

        data = schemas.GoalContributeRequest(
            sources=[schemas.GoalContributionSource(source_type="disponible", amount=Decimal("500"))]
        )
        result = contribute_to_goal(db_session, user.id, item.id, data)
        assert result.monto_ahorrado == Decimal("500")

        # Verify contribution record
        contribs = list_contributions_for_goal(db_session, item.id, user.id)
        assert len(contribs) == 1
        assert contribs[0].amount == Decimal("500")
        assert contribs[0].source_type == "disponible"

    def test_contribute_from_presupuesto(self, db_session: Session):
        """Happy path: contribute from a presupuesto item."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("10000"), cat.id)
        item = _create_goal(db_session, user.id)
        pi = _create_presupuesto_item(db_session, ciclo.id, Decimal("1000"))

        data = schemas.GoalContributeRequest(
            sources=[schemas.GoalContributionSource(
                source_type="presupuesto",
                presupuesto_item_id=pi.id,
                amount=Decimal("300"),
            )]
        )
        result = contribute_to_goal(db_session, user.id, item.id, data)
        assert result.monto_ahorrado == Decimal("300")

    def test_contribute_split_sources(self, db_session: Session):
        """Happy path: split across multiple sources."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("10000"), cat.id)
        item = _create_goal(db_session, user.id)
        pi1 = _create_presupuesto_item(db_session, ciclo.id, Decimal("1000"))
        pi2 = _create_presupuesto_item(db_session, ciclo.id, Decimal("2000"))

        data = schemas.GoalContributeRequest(
            sources=[
                schemas.GoalContributionSource(source_type="disponible", amount=Decimal("400")),
                schemas.GoalContributionSource(
                    source_type="presupuesto", presupuesto_item_id=pi1.id, amount=Decimal("200"),
                ),
                schemas.GoalContributionSource(
                    source_type="presupuesto", presupuesto_item_id=pi2.id, amount=Decimal("300"),
                ),
            ]
        )
        result = contribute_to_goal(db_session, user.id, item.id, data)
        assert result.monto_ahorrado == Decimal("900")

        # Verify 3 contribution records
        contribs = list_contributions_for_goal(db_session, item.id, user.id)
        assert len(contribs) == 3

    def test_contribute_exceeds_disponible(self, db_session: Session):
        """Error: contribute more than disponible."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("2000"), cat.id)
        item = _create_goal(db_session, user.id, Decimal("0"))

        data = schemas.GoalContributeRequest(
            sources=[schemas.GoalContributionSource(source_type="disponible", amount=Decimal("99999"))]
        )
        with pytest.raises(HTTPException) as exc:
            contribute_to_goal(db_session, user.id, item.id, data)
        assert exc.value.status_code == 400

    def test_contribute_exceeds_presupuesto_remaining(self, db_session: Session):
        """Error: contribute more than presupuesto item remaining."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("10000"), cat.id)
        item = _create_goal(db_session, user.id)
        pi = _create_presupuesto_item(db_session, ciclo.id, Decimal("200"))
        _create_gasto(db_session, user.id, Decimal("150"), cat.id, presupuesto_item_id=pi.id)

        data = schemas.GoalContributeRequest(
            sources=[schemas.GoalContributionSource(
                source_type="presupuesto",
                presupuesto_item_id=pi.id,
                amount=Decimal("100"),
            )]
        )
        with pytest.raises(HTTPException) as exc:
            contribute_to_goal(db_session, user.id, item.id, data)
        assert exc.value.status_code == 400

    def test_contribute_goal_not_owned(self, db_session: Session):
        """Error: goal doesn't belong to user."""
        user = _create_user(db_session)
        other_user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("10000"), cat.id)
        item = _create_goal(db_session, other_user.id)  # other user's goal

        data = schemas.GoalContributeRequest(
            sources=[schemas.GoalContributionSource(source_type="disponible", amount=Decimal("100"))]
        )
        with pytest.raises(HTTPException) as exc:
            contribute_to_goal(db_session, user.id, item.id, data)
        assert exc.value.status_code == 404

    def test_contribute_no_active_ciclo(self, db_session: Session):
        """Error: no active ciclo."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        item = _create_goal(db_session, user.id)

        data = schemas.GoalContributeRequest(
            sources=[schemas.GoalContributionSource(source_type="disponible", amount=Decimal("100"))]
        )
        with pytest.raises(HTTPException) as exc:
            contribute_to_goal(db_session, user.id, item.id, data)
        assert exc.value.status_code == 400


# ==================== UNIT TESTS: withdraw_from_goal ====================


class TestWithdrawFromGoal:

    def test_withdraw_success(self, db_session: Session):
        """Happy path: withdraw from a goal."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("10000"), cat.id)
        item = _create_goal(db_session, user.id, monto_ahorrado=Decimal("1000"))

        result = withdraw_from_goal(db_session, user.id, item.id, Decimal("300"))
        assert result.monto_ahorrado == Decimal("700")

        contribs = list_contributions_for_goal(db_session, item.id, user.id)
        assert len(contribs) == 1
        assert contribs[0].amount == Decimal("-300")

    def test_withdraw_exceeds_saved(self, db_session: Session):
        """Error: withdraw more than monto_ahorrado."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("10000"), cat.id)
        item = _create_goal(db_session, user.id, monto_ahorrado=Decimal("200"))

        with pytest.raises(HTTPException) as exc:
            withdraw_from_goal(db_session, user.id, item.id, Decimal("300"))
        assert exc.value.status_code == 400

    def test_withdraw_zero_amount(self, db_session: Session):
        """Error: withdraw with zero/negative amount."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("10000"), cat.id)
        item = _create_goal(db_session, user.id, monto_ahorrado=Decimal("500"))

        with pytest.raises(HTTPException) as exc:
            withdraw_from_goal(db_session, user.id, item.id, Decimal("0"))
        assert exc.value.status_code == 400


# ==================== UNIT TESTS: calcular_resumen formula ====================


class TestCalcularResumenWithGoals:

    def test_disponible_decreases_with_goal_contributions(self, db_session: Session):
        """Available balance decreases when goal contributions from disponible exist."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("5000"), cat.id)
        item = _create_goal(db_session, user.id)

        # Contribute 500 from disponible
        data = schemas.GoalContributeRequest(
            sources=[schemas.GoalContributionSource(source_type="disponible", amount=Decimal("500"))]
        )
        contribute_to_goal(db_session, user.id, item.id, data)

        resumen = calcular_resumen(ciclo, db_session, user.id)
        # saldo = 5000 - 500(ahorro) - 0(presupuesto) - 500(goal_savings) - 0(presupuesto_efectivo)
        # 5000 - 500 - 500 = 4000
        assert resumen.saldo_disponible_total == Decimal("4000")

    def test_category_budget_contributions_reduce_effective_presupuesto(self, db_session: Session):
        """Category budget contributions reduce effective presupuesto_confirmado."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("5000"), cat.id)
        pi = _create_presupuesto_item(db_session, ciclo.id, Decimal("1000"))
        item = _create_goal(db_session, user.id)

        # Contribute 300 from presupuesto
        data = schemas.GoalContributeRequest(
            sources=[schemas.GoalContributionSource(
                source_type="presupuesto", presupuesto_item_id=pi.id, amount=Decimal("300"),
            )]
        )
        contribute_to_goal(db_session, user.id, item.id, data)

        resumen = calcular_resumen(ciclo, db_session, user.id)
        # goal_savings = 300
        # presupuesto_efectivo = 1000 - 300 = 700
        # saldo = 5000 - 500 - 300(goal_savings) - 700(presupuesto_efectivo) = 3500
        # Simplified: 5000 - 500 - 1000(presupuesto_confirmado) = 3500
        assert resumen.saldo_disponible_total == Decimal("3500")

    def test_mixed_presupuesto_and_disponible(self, db_session: Session):
        """Mix of presupuesto + disponible contributions."""
        user = _create_user(db_session)
        cat = _create_system_category(db_session)
        ciclo = _create_ciclo(db_session, user.id)
        _create_ingreso(db_session, user.id, Decimal("10000"), cat.id)
        pi = _create_presupuesto_item(db_session, ciclo.id, Decimal("2000"))
        item = _create_goal(db_session, user.id)

        data = schemas.GoalContributeRequest(
            sources=[
                schemas.GoalContributionSource(source_type="disponible", amount=Decimal("400")),
                schemas.GoalContributionSource(
                    source_type="presupuesto", presupuesto_item_id=pi.id, amount=Decimal("600"),
                ),
            ]
        )
        contribute_to_goal(db_session, user.id, item.id, data)

        resumen = calcular_resumen(ciclo, db_session, user.id)
        # goal_savings = 400 + 600 = 1000
        # presupuesto_efectivo = 2000 - 600 = 1400
        # saldo = 10000 - 500 - 1000 - 1400 = 7100
        # Simplified: 10000 - 500 - 2000(presupuesto) - 400(disponible) = 7100
        assert resumen.saldo_disponible_total == Decimal("7100")


# ==================== INTEGRATION TESTS: CONTRIBUTE ENDPOINT ====================


def _create_ciclo_via_api(logged_in_client, ingreso_importe: float = 5000.0):
    """Helper: create a category, movimiento, ciclo via API, return (ingreso_id, ciclo_id)."""
    # Create user category first
    r = logged_in_client.post("/api/user-categories/", json={
        "nombre": "Ingresos", "color": "#00ff00",
    })
    assert r.status_code == 200, r.text
    cat_id = r.json()["id"]

    # Create ingreso with the category
    r = logged_in_client.post("/api/movimientos/", json={
        "importe": ingreso_importe,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Sueldo test",
        "tipo": "ingreso",
        "user_category_id": cat_id,
    })
    assert r.status_code == 200, r.text
    ingreso_id = r.json()["id"]

    # Create ciclo
    fecha_fin = (datetime.now() + timedelta(days=30)).isoformat()
    r = logged_in_client.post("/api/ciclos/", json={
        "movimiento_origen_id": ingreso_id,
        "fecha_fin": fecha_fin,
        "ahorro_objetivo": 500,
    })
    assert r.status_code in (200, 201), r.text
    ciclo_id = r.json()["id"]

    # Create wishlist item
    r = logged_in_client.post("/api/wishlist/", json={
        "name": "Meta test",
        "estimated_cost": 5000,
        "priority": "alta",
    })
    assert r.status_code == 201, r.text
    item_id = r.json()["id"]

    return item_id, ciclo_id, cat_id


class TestContributeEndpoint:

    def test_contribute_success(self, logged_in_client):
        """POST /api/wishlist/{id}/contribute → 200"""
        item_id, _, _ = _create_ciclo_via_api(logged_in_client)

        r = logged_in_client.post(f"/api/wishlist/{item_id}/contribute", json={
            "sources": [{"source_type": "disponible", "amount": 500}]
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["monto_ahorrado"] == 500.0

    def test_contribute_exceeds_budget(self, logged_in_client):
        """POST /api/wishlist/{id}/contribute → 400 (exceed budget)"""
        item_id, _, _ = _create_ciclo_via_api(logged_in_client)

        r = logged_in_client.post(f"/api/wishlist/{item_id}/contribute", json={
            "sources": [{"source_type": "disponible", "amount": 999999}]
        })
        assert r.status_code == 400, r.text

    def test_contribute_unauthenticated(self, client):
        """POST /api/wishlist/{id}/contribute → 401"""
        r = client.post("/api/wishlist/1/contribute", json={
            "sources": [{"source_type": "disponible", "amount": 100}]
        })
        assert r.status_code == 401

    def test_contribute_nonexistent_goal(self, logged_in_client):
        """POST /api/wishlist/{id}/contribute → 404"""
        r = logged_in_client.post("/api/wishlist/99999/contribute", json={
            "sources": [{"source_type": "disponible", "amount": 100}]
        })
        assert r.status_code == 404


class TestWithdrawEndpoint:

    def test_withdraw_success(self, logged_in_client):
        """POST /api/wishlist/{id}/withdraw → 200"""
        item_id, _, _ = _create_ciclo_via_api(logged_in_client)

        # First contribute
        logged_in_client.post(f"/api/wishlist/{item_id}/contribute", json={
            "sources": [{"source_type": "disponible", "amount": 1000}]
        })

        r = logged_in_client.post(f"/api/wishlist/{item_id}/withdraw", json={
            "amount": 300
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["monto_ahorrado"] == 700.0

    def test_withdraw_exceeds_savings(self, logged_in_client):
        """POST /api/wishlist/{id}/withdraw → 400 (exceed savings)"""
        item_id, _, _ = _create_ciclo_via_api(logged_in_client)

        r = logged_in_client.post(f"/api/wishlist/{item_id}/withdraw", json={
            "amount": 999999
        })
        assert r.status_code == 400, r.text


# ==================== INTEGRATION TESTS: MULTI-TENANT ISOLATION ====================


def test_multi_tenant_contribute_isolation(client):
    """User B cannot contribute to User A's goal."""
    # Register & login user A
    client.post("/api/auth/register", json={
        "username": "userA_gc", "email": "a_gc@test.com", "password": "TestPass123!",
    })
    client.post("/api/auth/login", json={"username": "userA_gc", "password": "TestPass123!"})

    # Setup for user A
    item_id, _, _ = _create_ciclo_via_api(client)

    # Login as user B
    client.post("/api/auth/register", json={
        "username": "userB_gc", "email": "b_gc@test.com", "password": "TestPass123!",
    })
    client.post("/api/auth/login", json={"username": "userB_gc", "password": "TestPass123!"})

    # Try to contribute to A's item
    r = client.post(f"/api/wishlist/{item_id}/contribute", json={
        "sources": [{"source_type": "disponible", "amount": 100}]
    })
    assert r.status_code == 404


def test_multi_tenant_withdraw_isolation(client):
    """User B cannot withdraw from User A's goal."""
    # Register & login user A
    client.post("/api/auth/register", json={
        "username": "userA_gw", "email": "a_gw@test.com", "password": "TestPass123!",
    })
    client.post("/api/auth/login", json={"username": "userA_gw", "password": "TestPass123!"})

    # Setup for user A
    item_id, _, _ = _create_ciclo_via_api(client)

    # Contribute as A
    client.post(f"/api/wishlist/{item_id}/contribute", json={
        "sources": [{"source_type": "disponible", "amount": 500}]
    })

    # Login as user B
    client.post("/api/auth/register", json={
        "username": "userB_gw", "email": "b_gw@test.com", "password": "TestPass123!",
    })
    client.post("/api/auth/login", json={"username": "userB_gw", "password": "TestPass123!"})

    # Try to withdraw from A's item
    r = client.post(f"/api/wishlist/{item_id}/withdraw", json={"amount": 100})
    assert r.status_code == 404


# ==================== INTEGRATION: LIST CONTRIBUTIONS ====================


def test_list_contributions_endpoint(logged_in_client):
    """GET /api/wishlist/{id}/contributions returns list."""
    item_id, _, _ = _create_ciclo_via_api(logged_in_client)

    # Contribute twice
    logged_in_client.post(f"/api/wishlist/{item_id}/contribute", json={
        "sources": [{"source_type": "disponible", "amount": 300}]
    })
    logged_in_client.post(f"/api/wishlist/{item_id}/contribute", json={
        "sources": [{"source_type": "disponible", "amount": 200}]
    })

    r = logged_in_client.get(f"/api/wishlist/{item_id}/contributions")
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data) == 2
    assert data[0]["amount"] == 200.0  # most recent first
    assert data[1]["amount"] == 300.0
