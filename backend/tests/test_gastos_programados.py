"""
Tests para gastos programados (obligaciones futuras con reserva de presupuesto).

Cubre: creación/listado, reserva dentro del ciclo activo, importación al crear
ciclo, pago (sin doble descuento), cancelación/eliminación, multi-tenancy y
casos sin ciclo activo.
"""
from datetime import datetime, timedelta

from services import ciclo_time_service


def _hoy() -> datetime:
    return ciclo_time_service.ahora_buenos_aires()


def _ingreso(user_category_id: int, importe: float = 1000.0) -> dict:
    return {
        "importe": importe,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Sueldo",
        "tipo": "ingreso",
        "user_category_id": user_category_id,
    }


def _crear_ciclo(logged_in_client, movimiento_origen_id: int, dias: int = 15) -> dict:
    r = logged_in_client.post("/ciclos/", json={
        "movimiento_origen_id": movimiento_origen_id,
        "fecha_fin": (_hoy() + timedelta(days=dias)).isoformat(),
        "ahorro_objetivo": 0,
    })
    assert r.status_code == 201, r.text
    return r.json()


def _gp(
    user_category_id: int,
    importe: float = 300.0,
    vencimiento=None,
    **overrides,
) -> dict:
    payload = {
        "importe": importe,
        "vencimiento": (vencimiento or (_hoy().date() + timedelta(days=5))).isoformat(),
        "descripcion": "Expensa",
        "user_category_id": user_category_id,
    }
    payload.update(overrides)
    return payload


def _crear_gp(logged_in_client, user_category_id: int, **overrides) -> dict:
    r = logged_in_client.post("/gastos-programados/", json=_gp(user_category_id, **overrides))
    assert r.status_code == 201, r.text
    return r.json()


# ── 1. Crear + listar; validaciones de schema ────────────────────────────────

def test_crear_y_listar_gastos_programados(logged_in_client, user_category_id):
    gp = _crear_gp(logged_in_client, user_category_id, importe=500.0)
    assert gp["estado"] == "pendiente"
    assert gp["importe"] == 500.0
    assert gp["vencimiento"] == (_hoy().date() + timedelta(days=5)).isoformat()
    assert gp["dias_anticipacion"] == 2
    assert gp["user_category"] is not None

    r = logged_in_client.get("/gastos-programados/")
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == gp["id"]

    r = logged_in_client.get("/gastos-programados/", params={"estado": "pagado"})
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_schema_rechaza_vencimiento_pasado(logged_in_client, user_category_id):
    r = logged_in_client.post("/gastos-programados/", json=_gp(
        user_category_id, vencimiento=_hoy().date() - timedelta(days=1)
    ))
    assert r.status_code >= 400
    assert "vencimiento" in r.text.lower()


def test_schema_rechaza_falta_de_categoria(logged_in_client):
    payload = _gp(user_category_id=None)
    payload.pop("user_category_id")
    r = logged_in_client.post("/gastos-programados/", json=payload)
    assert r.status_code >= 400
    assert "categor" in r.text.lower()


# ── 2. Reserva cuando el vencimiento cae dentro del ciclo activo ─────────────

def test_reserva_dentro_del_ciclo_descuenta_saldo(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    _crear_ciclo(logged_in_client, ingreso["id"])

    gp = _crear_gp(logged_in_client, user_category_id, importe=300.0)

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    assert resumen["saldo_disponible_total"] == 700.0

    item = next(i for i in resumen["presupuesto_items"] if i["gasto_programado_id"] == gp["id"])
    assert item["monto_estimado"] == 300.0
    assert item["confirmado"] is True

    compromiso = next(g for g in resumen["gastos_fijos"] if g["id"] == item["id"])
    assert compromiso["estado"] == "comprometido"
    assert compromiso["monto_confirmado"] == 300.0


# ── 3. Sin reserva cuando el vencimiento supera el fin del ciclo ─────────────

def test_sin_reserva_cuando_vencimiento_fuera_del_ciclo(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    _crear_ciclo(logged_in_client, ingreso["id"])

    _crear_gp(logged_in_client, user_category_id, vencimiento=_hoy().date() + timedelta(days=30))

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    assert resumen["presupuesto_items"] == []
    assert resumen["saldo_disponible_total"] == 1000.0


# ── 4. Importación al crear un nuevo ciclo ───────────────────────────────────

def test_importacion_al_crear_nuevo_ciclo(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    ciclo_a = _crear_ciclo(logged_in_client, ingreso["id"], dias=15)
    gp = _crear_gp(logged_in_client, user_category_id, vencimiento=_hoy().date() + timedelta(days=10))

    r = logged_in_client.delete(f"/ciclos/{ciclo_a['id']}")
    assert r.status_code == 200, r.text

    ciclo_b = _crear_ciclo(logged_in_client, ingreso["id"], dias=20)
    resumen = ciclo_b["resumen"]
    assert resumen["saldo_disponible_total"] == 700.0
    item = next(i for i in resumen["presupuesto_items"] if i["gasto_programado_id"] == gp["id"])
    assert item["monto_estimado"] == 300.0


# ── 5. Vencido pendiente se arrastra al nuevo ciclo ──────────────────────────

def test_vencido_pendiente_se_importa_al_ciclo_nuevo(logged_in_client, user_category_id, monkeypatch):
    import schemas

    ahora_fijo = datetime(2026, 4, 20, 12, 0, 0)
    monkeypatch.setattr(ciclo_time_service, "ahora_buenos_aires", lambda: ahora_fijo)
    monkeypatch.setattr(schemas, "ahora_buenos_aires", lambda: ahora_fijo)

    ingreso = logged_in_client.post("/movimientos/", json={
        **_ingreso(user_category_id, 1000.0),
        "fecha": ahora_fijo.isoformat(),
    }).json()
    gp = _crear_gp(logged_in_client, user_category_id, vencimiento=datetime(2026, 4, 25).date())

    # El vencimiento (25/04) queda en el pasado respecto del nuevo ciclo (inicio 30/04)
    ahora_fijo = datetime(2026, 4, 30, 12, 0, 0)
    monkeypatch.setattr(ciclo_time_service, "ahora_buenos_aires", lambda: ahora_fijo)
    monkeypatch.setattr(schemas, "ahora_buenos_aires", lambda: ahora_fijo)

    ciclo = logged_in_client.post("/ciclos/", json={
        "movimiento_origen_id": ingreso["id"],
        "fecha_fin": datetime(2026, 5, 10, 23, 59, 59).isoformat(),
        "ahorro_objetivo": 0,
    })
    assert ciclo.status_code == 201, ciclo.text

    resumen = ciclo.json()["resumen"]
    item = next(i for i in resumen["presupuesto_items"] if i["gasto_programado_id"] == gp["id"])
    assert item["monto_estimado"] == 300.0
    assert resumen["saldo_disponible_total"] == 700.0


# ── 6. Pago: movimiento real sin doble descuento ─────────────────────────────

def test_pagar_crea_movimiento_sin_doble_descuento(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    _crear_ciclo(logged_in_client, ingreso["id"])
    gp = _crear_gp(logged_in_client, user_category_id, importe=300.0)

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    item_id = next(i for i in resumen["presupuesto_items"] if i["gasto_programado_id"] == gp["id"])["id"]

    r = logged_in_client.post(f"/gastos-programados/{gp['id']}/pagar")
    assert r.status_code == 200, r.text
    data = r.json()

    assert data["programado"]["estado"] == "pagado"
    assert data["programado"]["movimiento_id"] == data["movimiento"]["id"]
    assert data["movimiento"]["tipo"] == "gasto"
    assert data["movimiento"]["importe"] == 300.0
    assert data["movimiento"]["presupuesto_item_id"] == item_id

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    assert resumen["gastos_fijos_confirmados"] == 300.0
    assert resumen["gastos_no_planificados"] == 0.0
    assert resumen["saldo_disponible_actual"] == 700.0
    item = next(i for i in resumen["presupuesto_items"] if i["id"] == item_id)
    assert item["estado"] == "efectivizado"

    movimientos = logged_in_client.get("/movimientos/", params={"tipo": "gasto"}).json()
    assert len(movimientos) == 1
    assert movimientos[0]["importe"] == 300.0
    assert movimientos[0]["user_id"] == ingreso["user_id"]


# ── 7. Pagar dos veces → 409 y un único movimiento ───────────────────────────

def test_pagar_dos_veces_devuelve_409_y_un_solo_movimiento(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    _crear_ciclo(logged_in_client, ingreso["id"])
    gp = _crear_gp(logged_in_client, user_category_id)

    r1 = logged_in_client.post(f"/gastos-programados/{gp['id']}/pagar")
    assert r1.status_code == 200, r1.text

    r2 = logged_in_client.post(f"/gastos-programados/{gp['id']}/pagar")
    assert r2.status_code == 409, r2.text
    assert "ya fue pagado" in r2.json()["detail"]

    movimientos = logged_in_client.get("/movimientos/", params={"tipo": "gasto"}).json()
    assert len(movimientos) == 1


# ── 8. Cancelar: libera la reserva y recupera el saldo ───────────────────────

def test_cancelar_libera_reserva_y_recupera_saldo(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    _crear_ciclo(logged_in_client, ingreso["id"])
    gp = _crear_gp(logged_in_client, user_category_id, importe=300.0)

    r = logged_in_client.post(f"/gastos-programados/{gp['id']}/cancelar")
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "cancelado"

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    assert resumen["presupuesto_items"] == []
    assert resumen["saldo_disponible_total"] == 1000.0


# ── 9. Editar importe: reserva actualizada; por debajo de lo ejecutado → 400 ─

def test_editar_importe_arriba_actualiza_reserva(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    _crear_ciclo(logged_in_client, ingreso["id"])
    gp = _crear_gp(logged_in_client, user_category_id, importe=300.0)

    r = logged_in_client.patch(f"/gastos-programados/{gp['id']}", json={"importe": 500.0})
    assert r.status_code == 200, r.text
    assert r.json()["importe"] == 500.0

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    item = next(i for i in resumen["presupuesto_items"] if i["gasto_programado_id"] == gp["id"])
    assert item["monto_estimado"] == 500.0
    assert resumen["saldo_disponible_total"] == 500.0


def test_editar_importe_por_debajo_de_lo_ejecutado_devuelve_400(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    _crear_ciclo(logged_in_client, ingreso["id"])
    gp = _crear_gp(logged_in_client, user_category_id, importe=300.0)

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    item_id = next(i for i in resumen["presupuesto_items"] if i["gasto_programado_id"] == gp["id"])["id"]

    # Ejecutar 200 contra la reserva sin pagar el gasto programado
    gasto = logged_in_client.post("/movimientos/", json={
        "importe": 200.0,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Pago parcial",
        "tipo": "gasto",
        "user_category_id": user_category_id,
        "presupuesto_item_id": item_id,
    })
    assert gasto.status_code == 200, gasto.text

    r = logged_in_client.patch(f"/gastos-programados/{gp['id']}", json={"importe": 100.0})
    assert r.status_code == 400, r.text
    assert "monto estimado" in r.json()["detail"].lower()


# ── 10. Multi-tenancy: recursos ajenos → 404 ─────────────────────────────────

def test_multi_tenant_operaciones_ajenas_devuelven_404(
    logged_in_client, second_logged_in_client, user_category_id
):
    gp = _crear_gp(logged_in_client, user_category_id)

    r = second_logged_in_client.patch(f"/gastos-programados/{gp['id']}", json={"importe": 500.0})
    assert r.status_code == 404, r.text

    r = second_logged_in_client.post(f"/gastos-programados/{gp['id']}/pagar")
    assert r.status_code == 404, r.text

    r = second_logged_in_client.post(f"/gastos-programados/{gp['id']}/cancelar")
    assert r.status_code == 404, r.text

    r = second_logged_in_client.delete(f"/gastos-programados/{gp['id']}")
    assert r.status_code == 404, r.text


# ── 11. Pago sin ciclo activo: movimiento sin presupuesto_item_id ────────────

def test_pagar_sin_ciclo_activo_crea_movimiento_sin_item(logged_in_client, user_category_id):
    gp = _crear_gp(logged_in_client, user_category_id, importe=300.0)

    r = logged_in_client.post(f"/gastos-programados/{gp['id']}/pagar")
    assert r.status_code == 200, r.text
    data = r.json()

    assert data["programado"]["estado"] == "pagado"
    assert data["movimiento"]["presupuesto_item_id"] is None
    assert data["movimiento"]["importe"] == 300.0


# ── 12. Eliminar: pendiente libera reserva; pagado → 400 ─────────────────────

def test_eliminar_pendiente_libera_reserva(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    _crear_ciclo(logged_in_client, ingreso["id"])
    gp = _crear_gp(logged_in_client, user_category_id, importe=300.0)

    r = logged_in_client.delete(f"/gastos-programados/{gp['id']}")
    assert r.status_code == 204, r.text

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    assert resumen["presupuesto_items"] == []
    assert resumen["saldo_disponible_total"] == 1000.0

    r = logged_in_client.get("/gastos-programados/")
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_eliminar_pagado_devuelve_400(logged_in_client, user_category_id):
    gp = _crear_gp(logged_in_client, user_category_id)
    r = logged_in_client.post(f"/gastos-programados/{gp['id']}/pagar")
    assert r.status_code == 200, r.text

    r = logged_in_client.delete(f"/gastos-programados/{gp['id']}")
    assert r.status_code == 400, r.text
    assert "pendiente" in r.json()["detail"]


# ── Autenticación ────────────────────────────────────────────────────────────

def test_gastos_programados_sin_auth_retorna_401(client):
    assert client.get("/gastos-programados/").status_code == 401
    assert client.post("/gastos-programados/", json={}).status_code == 401
