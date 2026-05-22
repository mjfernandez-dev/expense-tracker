from datetime import datetime, timedelta

from services import ciclo_time_service


def _ingreso(user_category_id: int, importe: float = 1000.0) -> dict:
    return {
        "importe": importe,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Sueldo",
        "tipo": "ingreso",
        "user_category_id": user_category_id,
    }


def _gasto(user_category_id: int, importe: float = 200.0, presupuesto_item_id: int | None = None) -> dict:
    return {
        "importe": importe,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Pago",
        "tipo": "gasto",
        "user_category_id": user_category_id,
        "presupuesto_item_id": presupuesto_item_id,
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
    assert gasto.json()["presupuesto_item_id"] == compromiso["id"]

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


def test_compromiso_admite_ejecucion_parcial_y_multiples_gastos(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1500.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    confirmacion = logged_in_client.post(f"/ciclos/{ciclo['id']}/gastos-fijos/", json={
        "items": [
            {
                "gasto_fijo_id": None,
                "monto_confirmado": 300.0,
                "confirmado": True,
                "descripcion_override": "Viandas",
            }
        ]
    })
    assert confirmacion.status_code == 200, confirmacion.text
    compromiso_id = confirmacion.json()["resumen"]["gastos_fijos"][0]["id"]

    gasto_1 = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 100.0, compromiso_id))
    assert gasto_1.status_code == 200, gasto_1.text

    resumen_parcial = logged_in_client.get("/ciclos/activo").json()["resumen"]
    compromiso_parcial = resumen_parcial["gastos_fijos"][0]
    assert compromiso_parcial["estado"] == "parcial"
    assert compromiso_parcial["monto_ejecutado"] == 100.0
    assert compromiso_parcial["monto_pendiente"] == 200.0
    assert resumen_parcial["gastos_fijos_confirmados"] == 300.0
    assert resumen_parcial["gastos_fijos_pendientes"] == 200.0
    assert resumen_parcial["gastos_fijos_efectivizados"] == 100.0
    assert resumen_parcial["saldo_disponible_actual"] == 1200.0

    gasto_2 = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 200.0, compromiso_id))
    assert gasto_2.status_code == 200, gasto_2.text

    resumen_final = logged_in_client.get("/ciclos/activo").json()["resumen"]
    compromiso_final = resumen_final["gastos_fijos"][0]
    assert compromiso_final["estado"] == "efectivizado"
    assert compromiso_final["monto_ejecutado"] == 300.0
    assert compromiso_final["monto_pendiente"] == 0.0
    assert resumen_final["gastos_fijos_pendientes"] == 0.0
    assert resumen_final["gastos_fijos_efectivizados"] == 300.0
    assert resumen_final["total_gastos"] == 300.0
    assert resumen_final["gastos_no_planificados"] == 0.0
    assert resumen_final["saldo_disponible_actual"] == 1200.0


def test_no_permite_superar_monto_comprometido(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    confirmacion = logged_in_client.post(f"/ciclos/{ciclo['id']}/gastos-fijos/", json={
        "items": [
            {
                "gasto_fijo_id": None,
                "monto_confirmado": 150.0,
                "confirmado": True,
                "descripcion_override": "Nafta",
            }
        ]
    }).json()
    compromiso_id = confirmacion["resumen"]["gastos_fijos"][0]["id"]

    primer_gasto = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 100.0, compromiso_id))
    assert primer_gasto.status_code == 200, primer_gasto.text

    segundo_gasto = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 60.0, compromiso_id))
    assert segundo_gasto.status_code == 400, segundo_gasto.text
    assert "monto pendiente del compromiso" in segundo_gasto.json()["detail"]

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    compromiso = resumen["gastos_fijos"][0]
    assert compromiso["estado"] == "parcial"
    assert compromiso["monto_ejecutado"] == 100.0
    assert compromiso["monto_pendiente"] == 50.0


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


def test_crear_ciclo_sincroniza_gastos_fijos_activos(logged_in_client, user_category_id):
    template = logged_in_client.post('/movimientos/', json={
        **_gasto(user_category_id, 450.0),
        'descripcion': 'Internet',
        'es_fijo': True,
        'fecha': datetime.now().isoformat(),
    })
    assert template.status_code == 200, template.text
    gasto_fijo_id = template.json()['gasto_fijo_id']

    ingreso = logged_in_client.post('/movimientos/', json=_ingreso(user_category_id, 2000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso['id'])
    resumen = ciclo['resumen']

    assert len(resumen['gastos_fijos']) == 1
    assert resumen['gastos_fijos'][0]['gasto_fijo_id'] == gasto_fijo_id
    assert resumen['gastos_fijos'][0]['monto_confirmado'] == 450.0
    assert resumen['gastos_fijos'][0]['estado'] == 'comprometido'
    assert resumen['gastos_fijos_confirmados'] == 450.0
    assert resumen['saldo_disponible_actual'] == 1550.0


def test_listar_ciclos_incluye_activo(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    _crear_ciclo(logged_in_client, ingreso["id"])

    r = logged_in_client.get("/ciclos/")
    assert r.status_code == 200, r.text
    ciclos = r.json()
    assert isinstance(ciclos, list)
    assert len(ciclos) >= 1
    assert any(c["activo"] for c in ciclos)


def test_actualizar_ciclo_modifica_fecha_y_ahorro(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    nueva_fecha = (datetime.now() + timedelta(days=20)).isoformat()
    r = logged_in_client.patch(f"/ciclos/{ciclo['id']}", json={
        "fecha_fin": nueva_fecha,
        "ahorro_objetivo": 150.0,
    })
    assert r.status_code == 200, r.text
    assert r.json()["ahorro_objetivo"] == 150.0


def test_exportar_ciclo_devuelve_txt(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    r = logged_in_client.get(f"/ciclos/{ciclo['id']}/exportar")
    assert r.status_code == 200, r.text
    assert "text/plain" in r.headers["content-type"]
    assert "CICLO FINANCIERO" in r.text
    assert "MOVIMIENTOS" in r.text


def test_dias_restantes_usa_fecha_de_buenos_aires(logged_in_client, user_category_id, monkeypatch):
    ahora_fijo = datetime(2026, 4, 13, 23, 30, 0)
    monkeypatch.setattr(ciclo_time_service, "ahora_buenos_aires", lambda: ahora_fijo)

    ingreso = logged_in_client.post("/movimientos/", json={
        **_ingreso(user_category_id, 1000.0),
        "fecha": "2026-04-13T09:00:00",
    }).json()

    ciclo = logged_in_client.post("/ciclos/", json={
        "movimiento_origen_id": ingreso["id"],
        "fecha_fin": "2026-04-30T23:59:59",
        "ahorro_objetivo": 0,
    })
    assert ciclo.status_code == 201, ciclo.text

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    assert resumen["dias_restantes"] == 18
