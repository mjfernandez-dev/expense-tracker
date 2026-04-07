from datetime import datetime, timedelta


def _ingreso(user_category_id: int, importe: float = 1000.0) -> dict:
    return {
        "importe": importe,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Sueldo",
        "tipo": "ingreso",
        "user_category_id": user_category_id,
    }


def _gasto(user_category_id: int, importe: float = 200.0, ciclo_gasto_fijo_id: int | None = None) -> dict:
    return {
        "importe": importe,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Pago",
        "tipo": "gasto",
        "user_category_id": user_category_id,
        "ciclo_gasto_fijo_id": ciclo_gasto_fijo_id,
    }


def _crear_ciclo(logged_in_client, movimiento_origen_id: int) -> dict:
    r = logged_in_client.post("/ciclos/", json={
        "movimiento_origen_id": movimiento_origen_id,
        "fecha_fin": (datetime.now() + timedelta(days=15)).isoformat(),
        "ahorro_objetivo": 0,
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_gasto_vinculado_no_duplica_descuento_en_ciclo(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    r_confirm = logged_in_client.post(f"/ciclos/{ciclo['id']}/gastos-fijos/", json={
        "items": [
            {
                "gasto_fijo_id": None,
                "monto_confirmado": 200.0,
                "confirmado": True,
                "descripcion_override": "Alquiler",
            }
        ]
    })
    assert r_confirm.status_code == 200, r_confirm.text
    compromiso = r_confirm.json()["resumen"]["gastos_fijos"][0]
    assert compromiso["estado"] == "comprometido"
    assert r_confirm.json()["resumen"]["saldo_disponible_actual"] == 800.0

    gasto = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 200.0, compromiso["id"]))
    assert gasto.status_code == 200, gasto.text
    assert gasto.json()["ciclo_gasto_fijo_id"] == compromiso["id"]

    ciclo_actualizado = logged_in_client.get("/ciclos/activo").json()
    resumen = ciclo_actualizado["resumen"]
    gasto_ciclo = resumen["gastos_fijos"][0]

    assert gasto_ciclo["estado"] == "efectivizado"
    assert resumen["gastos_fijos_confirmados"] == 200.0
    assert resumen["gastos_fijos_pendientes"] == 0.0
    assert resumen["gastos_fijos_efectivizados"] == 200.0
    assert resumen["total_gastos"] == 200.0
    assert resumen["gastos_no_planificados"] == 0.0
    assert resumen["saldo_disponible_actual"] == 800.0


def test_eliminar_movimiento_vinculado_revierte_compromiso(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1200.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    confirmacion = logged_in_client.post(f"/ciclos/{ciclo['id']}/gastos-fijos/", json={
        "items": [
            {
                "gasto_fijo_id": None,
                "monto_confirmado": 300.0,
                "confirmado": True,
                "descripcion_override": "Seguro",
            }
        ]
    }).json()
    compromiso_id = confirmacion["resumen"]["gastos_fijos"][0]["id"]

    movimiento = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 300.0, compromiso_id)).json()
    r_delete = logged_in_client.delete(f"/movimientos/{movimiento['id']}")
    assert r_delete.status_code == 200, r_delete.text

    ciclo_actualizado = logged_in_client.get("/ciclos/activo").json()
    resumen = ciclo_actualizado["resumen"]
    gasto_ciclo = resumen["gastos_fijos"][0]

    assert gasto_ciclo["estado"] == "comprometido"
    assert resumen["gastos_fijos_pendientes"] == 300.0
    assert resumen["gastos_fijos_efectivizados"] == 0.0
    assert resumen["total_gastos"] == 0.0
    assert resumen["saldo_disponible_actual"] == 900.0


def test_gasto_no_planificado_sigue_bajando_disponible(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    logged_in_client.post(f"/ciclos/{ciclo['id']}/gastos-fijos/", json={
        "items": [
            {
                "gasto_fijo_id": None,
                "monto_confirmado": 250.0,
                "confirmado": True,
                "descripcion_override": "Luz",
            }
        ]
    })

    gasto = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 100.0))
    assert gasto.status_code == 200, gasto.text

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    assert resumen["gastos_fijos_confirmados"] == 250.0
    assert resumen["gastos_no_planificados"] == 100.0
    assert resumen["saldo_disponible_actual"] == 650.0
