"""
Tests del botón "Pagar mes" (POST /gastos-programados/pagar-mes).

Paga TODAS las cuotas pendientes cuyo vencimiento cae dentro del ciclo activo
(vencimiento <= fecha_fin), porque el pago del resumen de la tarjeta cubre el
mes completo de una vez. Las cuotas de ciclos futuros quedan pendientes.
"""
from datetime import datetime, timedelta

from services import ciclo_time_service


def _hoy() -> datetime:
    return ciclo_time_service.ahora_buenos_aires()


def _ingreso(user_category_id: int, importe: float = 2000.0) -> dict:
    return {
        "importe": importe,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Sueldo",
        "tipo": "ingreso",
        "user_category_id": user_category_id,
    }


def _crear_ciclo(logged_in_client, movimiento_origen_id: int, dias: int = 40) -> dict:
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
    producto: str = "Zapatillas",
    **overrides,
) -> dict:
    payload = {
        "importe": importe,
        "vencimiento": (vencimiento or (_hoy().date() + timedelta(days=5))).isoformat(),
        "descripcion": producto,
        "user_category_id": user_category_id,
    }
    payload.update(overrides)
    return payload


def _crear_gp(logged_in_client, user_category_id: int, **overrides) -> dict:
    r = logged_in_client.post("/gastos-programados/", json=_gp(user_category_id, **overrides))
    assert r.status_code == 201, r.text
    return r.json()


# ── 1. Paga todas las cuotas del ciclo activo, deja las futuras pendientes ───

def test_pagar_mes_marca_las_cuotas_del_ciclo(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id)).json()
    _crear_ciclo(logged_in_client, ingreso["id"])

    gp_a = _crear_gp(logged_in_client, user_category_id, importe=20000.0,
                     vencimiento=_hoy().date() + timedelta(days=2), producto="Zapatillas 2/6")
    gp_b = _crear_gp(logged_in_client, user_category_id, importe=15000.0,
                     vencimiento=_hoy().date() + timedelta(days=10), producto="Deco 3/10")
    gp_futuro = _crear_gp(logged_in_client, user_category_id, importe=5000.0,
                          vencimiento=_hoy().date() + timedelta(days=100), producto="Futura")

    r = logged_in_client.post("/gastos-programados/pagar-mes")
    assert r.status_code == 200, r.text
    body = r.json()
    pagados = body["pagados"]
    assert len(pagados) == 2
    ids_pagados = {p["programado"]["id"] for p in pagados}
    assert ids_pagados == {gp_a["id"], gp_b["id"]}
    # Cada pago creó su movimiento con la categoría del programado
    for p in pagados:
        assert p["movimiento"]["user_category_id"] == user_category_id
    assert body["total"] == 35000.0

    # Las cuotas fuera del ciclo quedan pendientes
    r = logged_in_client.get("/gastos-programados/", params={"estado": "pendiente"})
    pendientes = {g["id"] for g in r.json()}
    assert pendientes == {gp_futuro["id"]}

    # Los pagados ya no figuran como pendientes
    r = logged_in_client.get("/gastos-programados/", params={"estado": "pagado"})
    assert {g["id"] for g in r.json()} == ids_pagados


def test_pagar_mes_sin_cuotas_devuelve_lista_vacia(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id)).json()
    _crear_ciclo(logged_in_client, ingreso["id"])

    r = logged_in_client.post("/gastos-programados/pagar-mes")
    assert r.status_code == 200, r.text
    assert r.json()["pagados"] == []
    assert r.json()["total"] == 0


def test_pagar_mes_sin_ciclo_activo_da_error(logged_in_client, user_category_id):
    r = logged_in_client.post("/gastos-programados/pagar-mes")
    assert r.status_code == 400
    assert "ciclo" in r.text.lower()
