"""
Smoke tests de movimientos (CRUD básico):
- Crear, listar, actualizar, eliminar
- Validaciones: sin categoría, sin auth
Tests de servicio para movimiento_service: es_fijo, validación de categoría, presupuesto auto-link.
"""
from datetime import datetime

import pytest
from fastapi import HTTPException


def _crear_user(db_session, username: str = "svc_mov") -> object:
    import models
    from auth import get_password_hash
    user = models.User(username=username, email=f"{username}@test.com", hashed_password=get_password_hash("Test123!"))
    db_session.add(user)
    db_session.flush()
    return user


def _gasto(user_category_id: int) -> dict:
    return {
        "importe": 500.0,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Cafe",
        "tipo": "gasto",
        "user_category_id": user_category_id,
    }

def _ingreso(user_category_id: int) -> dict:
    return {
        "importe": 10000.0,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Sueldo",
        "tipo": "ingreso",
        "user_category_id": user_category_id,
    }


def test_listar_movimientos_vacio(logged_in_client):
    r = logged_in_client.get("/movimientos/")
    assert r.status_code == 200
    assert r.json() == []


def test_crear_gasto(logged_in_client, user_category_id):
    r = logged_in_client.post("/movimientos/", json=_gasto(user_category_id))
    assert r.status_code == 200
    data = r.json()
    assert data["tipo"] == "gasto"
    assert data["importe"] == 500.0
    assert "id" in data


def test_crear_ingreso(logged_in_client, user_category_id):
    r = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id))
    assert r.status_code == 200
    assert r.json()["tipo"] == "ingreso"


def test_listar_despues_de_crear(logged_in_client, user_category_id):
    logged_in_client.post("/movimientos/", json=_gasto(user_category_id))
    logged_in_client.post("/movimientos/", json=_ingreso(user_category_id))
    r = logged_in_client.get("/movimientos/")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_filtro_fecha_hasta_incluye_mismo_dia(logged_in_client, user_category_id):
    """Un movimiento del día con hora != medianoche debe aparecer en fecha_hasta (día-inclusivo)."""
    payload = {
        **_gasto(user_category_id),
        "fecha": "2026-01-15T14:30:00",
    }
    r = logged_in_client.post("/movimientos/", json=payload)
    assert r.status_code == 200

    r = logged_in_client.get("/movimientos/", params={"fecha_hasta": "2026-01-15"})
    assert r.status_code == 200
    ids = [m["id"] for m in r.json()]
    assert r.json()[0]["id"] in ids

    # El día siguiente queda afuera: mismo movimiento excluido
    r = logged_in_client.get("/movimientos/", params={"fecha_hasta": "2026-01-14"})
    assert r.status_code == 200
    assert r.json() == []


def test_actualizar_movimiento(logged_in_client, user_category_id):
    r = logged_in_client.post("/movimientos/", json=_gasto(user_category_id))
    mov_id = r.json()["id"]
    update = {**_gasto(user_category_id), "importe": 999.0, "descripcion": "Actualizado"}
    r2 = logged_in_client.put(f"/movimientos/{mov_id}", json=update)
    assert r2.status_code == 200
    assert r2.json()["importe"] == 999.0


def test_fecha_de_hoy_usa_hora_de_creacion_y_editar_mismo_dia_la_preserva(
    logged_in_client, user_category_id, monkeypatch
):
    from services import movimiento_service

    reloj = {"ahora": datetime(2026, 8, 31, 10, 15, 30)}
    monkeypatch.setattr(
        movimiento_service,
        "ahora_buenos_aires",
        lambda: reloj["ahora"],
    )

    creado = logged_in_client.post("/movimientos/", json={
        **_gasto(user_category_id),
        "fecha": "2026-08-31T00:00:00",
    })
    assert creado.status_code == 200, creado.text
    assert datetime.fromisoformat(creado.json()["fecha"]) == reloj["ahora"]

    reloj["ahora"] = datetime(2026, 8, 31, 18, 45, 0)
    actualizado = logged_in_client.put(
        f"/movimientos/{creado.json()['id']}",
        json={
            **_gasto(user_category_id),
            "importe": 600.0,
            "fecha": "2026-08-31T00:00:00",
        },
    )
    assert actualizado.status_code == 200, actualizado.text
    assert datetime.fromisoformat(actualizado.json()["fecha"]) == datetime(
        2026, 8, 31, 10, 15, 30
    )


def test_eliminar_movimiento(logged_in_client, user_category_id):
    r = logged_in_client.post("/movimientos/", json=_gasto(user_category_id))
    mov_id = r.json()["id"]
    r2 = logged_in_client.delete(f"/movimientos/{mov_id}")
    assert r2.status_code == 200
    ids = [m["id"] for m in logged_in_client.get("/movimientos/").json()]
    assert mov_id not in ids


def test_movimiento_sin_auth(client):
    r = client.get("/movimientos/")
    assert r.status_code == 401


def test_sin_categoria_retorna_400(logged_in_client):
    """Movimiento sin categoría debe retornar 400, no 500."""
    payload = {
        "importe": 100.0,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Sin categoria",
        "tipo": "gasto",
    }
    r = logged_in_client.post("/movimientos/", json=payload)
    assert r.status_code == 400


# ============== búsqueda de descripciones ==============

def test_search_descripciones_agrupa_y_filtra(logged_in_client, user_category_id):
    """Agrupa por descripción exacta, ordena por frecuencia y excluye no-matches."""
    logged_in_client.post("/movimientos/", json=_gasto(user_category_id))
    logged_in_client.post("/movimientos/", json=_gasto(user_category_id))
    logged_in_client.post(
        "/movimientos/", json={**_gasto(user_category_id), "descripcion": "Cafe con leche"}
    )
    logged_in_client.post(
        "/movimientos/", json={**_gasto(user_category_id), "descripcion": "Telefono"}
    )

    r = logged_in_client.get("/movimientos/descripciones/search", params={"q": "cafe"})
    assert r.status_code == 200
    assert r.json() == [
        {"descripcion": "Cafe", "frecuencia": 2},
        {"descripcion": "Cafe con leche", "frecuencia": 1},
    ]


def test_search_descripciones_respeta_limit(logged_in_client, user_category_id):
    for desc in ["Cafe uno", "Cafe dos", "Cafe tres"]:
        logged_in_client.post(
            "/movimientos/", json={**_gasto(user_category_id), "descripcion": desc}
        )

    r = logged_in_client.get(
        "/movimientos/descripciones/search", params={"q": "cafe", "limit": 2}
    )
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_search_descripciones_aisla_por_usuario(
    logged_in_client, second_logged_in_client, user_category_id
):
    """Los movimientos de otro usuario no aparecen en las búsquedas propias."""
    r = second_logged_in_client.post("/api/user-categories/", json={
        "nombre": "Categoria Otro",
        "descripcion": "Para tests",
        "color": "#00FF00",
        "icon": "test",
    })
    assert r.status_code == 200, r.text
    cat_otro = r.json()["id"]
    r2 = second_logged_in_client.post(
        "/movimientos/",
        json={**_gasto(cat_otro), "descripcion": "Cafe de otro usuario"},
    )
    assert r2.status_code == 200, r2.text

    logged_in_client.post("/movimientos/", json=_gasto(user_category_id))

    r3 = logged_in_client.get("/movimientos/descripciones/search", params={"q": "cafe"})
    assert r3.status_code == 200
    assert r3.json() == [{"descripcion": "Cafe", "frecuencia": 1}]


# ============== movimiento_service — service-level tests ==============

def _crear_ciclo(db_session, user_id, ahorro_objetivo="0"):
    import models
    from services.ciclo_time_service import ahora_buenos_aires
    from decimal import Decimal
    from datetime import timedelta

    ahora = ahora_buenos_aires()
    ciclo = models.Ciclo(
        user_id=user_id,
        fecha_inicio=ahora - timedelta(days=10),
        fecha_fin=ahora + timedelta(days=20),
        ahorro_objetivo=Decimal(ahorro_objetivo),
        activo=True,
    )
    db_session.add(ciclo)
    db_session.flush()
    return ciclo


def _crear_item_presupuesto(db_session, ciclo_id, user_category_id, monto="1000"):
    import models
    from decimal import Decimal

    item = models.PresupuestoItem(
        ciclo_id=ciclo_id,
        user_category_id=user_category_id,
        monto_estimado=Decimal(monto),
        confirmado=True,
    )
    db_session.add(item)
    db_session.flush()
    return item


def test_service_crear_movimiento_es_fijo_crea_template(db_session):
    from services import movimiento_service, user_category_service
    from services.ciclo_time_service import ahora_buenos_aires
    from decimal import Decimal

    import models
    import schemas

    user = _crear_user(db_session, "u_fijo")
    cat = user_category_service.crear_user_category(
        user.id, schemas.UserCategoryCreate(nombre="Fijos"), db_session
    )
    mov = movimiento_service.crear_movimiento(
        schemas.MovimientoCreate(
            importe=Decimal("500"),
            fecha=ahora_buenos_aires(),
            descripcion="Alquiler",
            tipo="gasto",
            user_category_id=cat.id,
            es_fijo=True,
        ),
        user.id,
        db_session,
    )
    assert mov.gasto_fijo_id is not None
    gf = db_session.get(models.GastoFijo, mov.gasto_fijo_id)
    assert gf is not None
    assert gf.activo is True


def test_service_crear_movimiento_sin_categoria_400(db_session):
    from services import movimiento_service
    from services.ciclo_time_service import ahora_buenos_aires
    from decimal import Decimal

    import schemas

    user = _crear_user(db_session, "u_nocat")
    with pytest.raises(HTTPException) as exc:
        movimiento_service.crear_movimiento(
            schemas.MovimientoCreate(
                importe=Decimal("100"),
                fecha=ahora_buenos_aires(),
                descripcion="Sin cat",
                tipo="gasto",
            ),
            user.id,
            db_session,
        )
    assert exc.value.status_code == 400


def test_service_crear_movimiento_autovincula_presupuesto(db_session):
    from services import movimiento_service, user_category_service
    from services.ciclo_time_service import ahora_buenos_aires
    from decimal import Decimal

    import schemas

    user = _crear_user(db_session, "u_autocreate")
    cat = user_category_service.crear_user_category(
        user.id, schemas.UserCategoryCreate(nombre="Presupuestada"), db_session
    )
    ciclo = _crear_ciclo(db_session, user.id)
    item = _crear_item_presupuesto(db_session, ciclo.id, cat.id)

    mov = movimiento_service.crear_movimiento(
        schemas.MovimientoCreate(
            importe=Decimal("200"),
            fecha=ahora_buenos_aires(),
            descripcion="Compra",
            tipo="gasto",
            user_category_id=cat.id,
        ),
        user.id,
        db_session,
    )
    assert mov.presupuesto_item_id == item.id


def test_service_actualizar_movimiento_autovincula_presupuesto(db_session):
    from services import movimiento_service, user_category_service
    from services.ciclo_time_service import ahora_buenos_aires
    from decimal import Decimal

    import schemas

    user = _crear_user(db_session, "u_autoupdate")
    cat = user_category_service.crear_user_category(
        user.id, schemas.UserCategoryCreate(nombre="Presupuestada"), db_session
    )
    ciclo = _crear_ciclo(db_session, user.id)
    item = _crear_item_presupuesto(db_session, ciclo.id, cat.id)

    mov = movimiento_service.crear_movimiento(
        schemas.MovimientoCreate(
            importe=Decimal("200"),
            fecha=ahora_buenos_aires(),
            descripcion="Compra",
            tipo="gasto",
            user_category_id=cat.id,
            presupuesto_item_id=None,
        ),
        user.id,
        db_session,
    )
    assert mov.presupuesto_item_id == item.id

    mov_actualizado = movimiento_service.actualizar_movimiento(
        mov.id,
        schemas.MovimientoCreate(
            importe=Decimal("300"),
            fecha=ahora_buenos_aires(),
            descripcion="Compra actualizada",
            tipo="gasto",
            user_category_id=cat.id,
            presupuesto_item_id=None,
        ),
        user.id,
        db_session,
    )
    assert mov_actualizado.presupuesto_item_id == item.id


# ============== hardening temporal: fechas futuras y ventana del ciclo ==============

def test_crear_movimiento_fecha_futura_400(logged_in_client, user_category_id):
    """API: un movimiento con fecha futura debe retornar 400, no crearse."""
    from datetime import timedelta

    payload = {
        **_gasto(user_category_id),
        "fecha": (datetime.now() + timedelta(days=1)).isoformat(),
    }
    r = logged_in_client.post("/movimientos/", json=payload)
    assert r.status_code == 400
    assert "futura" in r.json()["detail"]


def test_actualizar_movimiento_fecha_futura_400(logged_in_client, user_category_id):
    """API: actualizar un movimiento con fecha futura debe retornar 400."""
    from datetime import timedelta

    r = logged_in_client.post("/movimientos/", json=_gasto(user_category_id))
    mov_id = r.json()["id"]

    update = {
        **_gasto(user_category_id),
        "fecha": (datetime.now() + timedelta(days=1)).isoformat(),
    }
    r2 = logged_in_client.put(f"/movimientos/{mov_id}", json=update)
    assert r2.status_code == 400
    assert "futura" in r2.json()["detail"]


def test_service_crear_movimiento_fecha_futura_400(db_session):
    from services import movimiento_service, user_category_service
    from services.ciclo_time_service import ahora_buenos_aires
    from datetime import timedelta
    from decimal import Decimal

    import schemas

    user = _crear_user(db_session, "u_futuro")
    cat = user_category_service.crear_user_category(
        user.id, schemas.UserCategoryCreate(nombre="Futuro"), db_session
    )
    with pytest.raises(HTTPException) as exc:
        movimiento_service.crear_movimiento(
            schemas.MovimientoCreate(
                importe=Decimal("100"),
                fecha=ahora_buenos_aires() + timedelta(days=1),
                descripcion="Futuro",
                tipo="gasto",
                user_category_id=cat.id,
            ),
            user.id,
            db_session,
        )
    assert exc.value.status_code == 400
    assert "futura" in exc.value.detail


def test_service_actualizar_movimiento_fecha_futura_400(db_session):
    from services import movimiento_service, user_category_service
    from services.ciclo_time_service import ahora_buenos_aires
    from datetime import timedelta
    from decimal import Decimal

    import schemas

    user = _crear_user(db_session, "u_futuro_update")
    cat = user_category_service.crear_user_category(
        user.id, schemas.UserCategoryCreate(nombre="Futuro Upd"), db_session
    )
    mov = movimiento_service.crear_movimiento(
        schemas.MovimientoCreate(
            importe=Decimal("100"),
            fecha=ahora_buenos_aires(),
            descripcion="Normal",
            tipo="gasto",
            user_category_id=cat.id,
        ),
        user.id,
        db_session,
    )
    with pytest.raises(HTTPException) as exc:
        movimiento_service.actualizar_movimiento(
            mov.id,
            schemas.MovimientoCreate(
                importe=Decimal("150"),
                fecha=ahora_buenos_aires() + timedelta(days=1),
                descripcion="Normal futura",
                tipo="gasto",
                user_category_id=cat.id,
            ),
            user.id,
            db_session,
        )
    assert exc.value.status_code == 400
    assert "futura" in exc.value.detail


def test_service_crear_movimiento_fuera_de_la_ventana_del_ciclo_no_autovincula(db_session):
    """Movimiento con fecha más allá del fin del ciclo (aunque no futura) no se auto-vincula."""
    from services import movimiento_service, user_category_service
    from services.ciclo_time_service import ahora_buenos_aires
    from decimal import Decimal
    from datetime import timedelta

    import models
    import schemas

    user = _crear_user(db_session, "u_fuera_ventana")
    cat = user_category_service.crear_user_category(
        user.id, schemas.UserCategoryCreate(nombre="Fuera Ventana"), db_session
    )
    ahora = ahora_buenos_aires()
    ciclo = models.Ciclo(
        user_id=user.id,
        fecha_inicio=ahora - timedelta(days=20),
        fecha_fin=ahora - timedelta(days=5),
        ahorro_objetivo=Decimal("0"),
        activo=True,
    )
    db_session.add(ciclo)
    db_session.flush()
    _crear_item_presupuesto(db_session, ciclo.id, cat.id)

    mov = movimiento_service.crear_movimiento(
        schemas.MovimientoCreate(
            importe=Decimal("200"),
            fecha=ahora,
            descripcion="Compra fuera del ciclo",
            tipo="gasto",
            user_category_id=cat.id,
        ),
        user.id,
        db_session,
    )
    assert mov.presupuesto_item_id is None
