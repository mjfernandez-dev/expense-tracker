"""
Tests de integración para el presupuesto base template.
Cubre: monto_default y tiene_monto_fijo en categorías, ahorro_objetivo_default en usuario.
Tests de servicio para user_category_service: reglas de negocio, unicidad, delete guard.
"""
from fastapi import HTTPException
import pytest


def _nueva_categoria(nombre: str = "Alimentación", monto_default=None, tiene_monto_fijo: bool = False) -> dict:
    payload: dict = {"nombre": nombre}
    if monto_default is not None:
        payload["monto_default"] = monto_default
    payload["tiene_monto_fijo"] = tiene_monto_fijo
    return payload


# ============== monto_default / tiene_monto_fijo al crear ==============

def test_crear_categoria_con_monto_default(logged_in_client):
    r = logged_in_client.post("/user-categories/", json=_nueva_categoria(monto_default=50000))
    assert r.status_code == 200
    data = r.json()
    assert float(data["monto_default"]) == 50000
    assert data["tiene_monto_fijo"] is True


def test_crear_categoria_monto_cero_no_activa_fijo(logged_in_client):
    r = logged_in_client.post("/user-categories/", json=_nueva_categoria(monto_default=0))
    assert r.status_code == 200
    data = r.json()
    assert data["monto_default"] is None
    assert data["tiene_monto_fijo"] is False


def test_crear_categoria_sin_monto_default(logged_in_client):
    r = logged_in_client.post("/user-categories/", json=_nueva_categoria())
    assert r.status_code == 200
    data = r.json()
    assert data["monto_default"] is None
    assert data["tiene_monto_fijo"] is False


# ============== monto_default al actualizar ==============

def test_actualizar_monto_default(logged_in_client, user_category_id):
    r = logged_in_client.put(f"/user-categories/{user_category_id}", json={"monto_default": 30000})
    assert r.status_code == 200
    data = r.json()
    assert float(data["monto_default"]) == 30000
    assert data["tiene_monto_fijo"] is True


def test_actualizar_monto_default_a_cero_desactiva_fijo(logged_in_client, user_category_id):
    logged_in_client.put(f"/user-categories/{user_category_id}", json={"monto_default": 30000})
    r = logged_in_client.put(f"/user-categories/{user_category_id}", json={"monto_default": 0})
    assert r.status_code == 200
    data = r.json()
    assert data["monto_default"] is None
    assert data["tiene_monto_fijo"] is False


def test_toggle_tiene_monto_fijo(logged_in_client, user_category_id):
    r = logged_in_client.put(f"/user-categories/{user_category_id}", json={"tiene_monto_fijo": True})
    assert r.status_code == 200
    assert r.json()["tiene_monto_fijo"] is True


# ============== PATCH /auth/me/preferences ==============

def test_actualizar_ahorro_objetivo_default(logged_in_client):
    r = logged_in_client.patch("/auth/me/preferences", json={"ahorro_objetivo_default": 100000})
    assert r.status_code == 200
    data = r.json()
    assert float(data["ahorro_objetivo_default"]) == 100000


def test_actualizar_ahorro_objetivo_default_a_cero(logged_in_client):
    logged_in_client.patch("/auth/me/preferences", json={"ahorro_objetivo_default": 50000})
    r = logged_in_client.patch("/auth/me/preferences", json={"ahorro_objetivo_default": 0})
    assert r.status_code == 200
    assert float(r.json()["ahorro_objetivo_default"]) == 0


def test_actualizar_ahorro_objetivo_default_negativo_rechazado(logged_in_client):
    r = logged_in_client.patch("/auth/me/preferences", json={"ahorro_objetivo_default": -500})
    assert r.status_code == 422


def test_actualizar_preferencias_sin_autenticacion(client):
    r = client.patch("/auth/me/preferences", json={"ahorro_objetivo_default": 5000})
    assert r.status_code == 401


# ============== user_category_service — unit tests ==============

def _crear_user(db_session, username: str = "svc_user") -> object:
    import models
    from auth import get_password_hash
    user = models.User(username=username, email=f"{username}@test.com", hashed_password=get_password_hash("Test123!"))
    db_session.add(user)
    db_session.flush()
    return user


def test_service_verificar_nombre_unico_ok(db_session):
    from services import user_category_service
    import schemas
    user = _crear_user(db_session, "u1")
    user_category_service.crear_user_category(user.id, schemas.UserCategoryCreate(nombre="Unica"), db_session)
    # No debe lanzar excepción (nombre distinto)
    user_category_service.verificar_nombre_unico(user.id, "Diferente", db_session)


def test_service_verificar_nombre_unico_duplicado(db_session):
    from services import user_category_service
    import schemas
    user = _crear_user(db_session, "u2")
    user_category_service.crear_user_category(user.id, schemas.UserCategoryCreate(nombre="Duplicado"), db_session)
    with pytest.raises(HTTPException) as exc:
        user_category_service.verificar_nombre_unico(user.id, "Duplicado", db_session)
    assert exc.value.status_code == 400


def test_service_monto_positivo_activa_fijo(db_session):
    from services import user_category_service
    import schemas
    user = _crear_user(db_session, "u3")
    cat = user_category_service.crear_user_category(
        user.id,
        schemas.UserCategoryCreate(nombre="Con Monto", monto_default=50000),
        db_session,
    )
    assert cat.tiene_monto_fijo is True
    assert float(cat.monto_default) == 50000


def test_service_monto_cero_no_activa_fijo(db_session):
    from services import user_category_service
    import schemas
    user = _crear_user(db_session, "u4")
    cat = user_category_service.crear_user_category(
        user.id,
        schemas.UserCategoryCreate(nombre="Sin Monto", monto_default=0),
        db_session,
    )
    assert cat.tiene_monto_fijo is False
    assert cat.monto_default is None


def test_service_delete_guard_bloquea_si_hay_movimientos(db_session):
    from services import user_category_service
    import schemas
    import models
    from decimal import Decimal
    from datetime import datetime
    user = _crear_user(db_session, "u5")
    cat = user_category_service.crear_user_category(
        user.id,
        schemas.UserCategoryCreate(nombre="Con Mov"),
        db_session,
    )
    mov = models.Movimiento(
        user_id=user.id,
        importe=Decimal("100"),
        fecha=datetime.now(),
        descripcion="test",
        tipo="gasto",
        user_category_id=cat.id,
    )
    db_session.add(mov)
    db_session.flush()
    with pytest.raises(HTTPException) as exc:
        user_category_service.eliminar_user_category(cat, db_session)
    assert exc.value.status_code == 400
