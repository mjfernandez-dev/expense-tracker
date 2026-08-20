from datetime import datetime, timedelta
from decimal import Decimal

import pytest

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

    r_confirm = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/", json={
        "items": [
            {
                "monto_estimado": 200.0,
                "confirmado": True,
                "descripcion": "Alquiler",
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

    confirmacion = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/", json={
        "items": [
            {
                "monto_estimado": 300.0,
                "confirmado": True,
                "descripcion": "Seguro",
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

    confirmacion = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/", json={
        "items": [
            {
                "monto_estimado": 300.0,
                "confirmado": True,
                "descripcion": "Viandas",
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


def test_gasto_vinculado_puede_superar_monto_comprometido(logged_in_client, user_category_id):
    """Regla de negocio: el usuario puede registrar gastos reales que superen
    lo comprometido; el compromiso pasa a efectivizado y el sobre-gasto queda
    registrado (el máximo histórico lo captura para sugerir presupuestos)."""
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    confirmacion = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/", json={
        "items": [
            {
                "monto_estimado": 150.0,
                "confirmado": True,
                "descripcion": "Nafta",
            }
        ]
    }).json()
    compromiso_id = confirmacion["resumen"]["gastos_fijos"][0]["id"]

    primer_gasto = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 100.0, compromiso_id))
    assert primer_gasto.status_code == 200, primer_gasto.text

    segundo_gasto = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 60.0, compromiso_id))
    assert segundo_gasto.status_code == 200, segundo_gasto.text

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    compromiso = resumen["gastos_fijos"][0]
    assert compromiso["estado"] == "efectivizado"
    assert compromiso["monto_ejecutado"] == 160.0
    assert compromiso["monto_pendiente"] == 0.0


def test_gasto_no_planificado_sigue_bajando_disponible(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/", json={
        "items": [
            {
                "monto_estimado": 250.0,
                "confirmado": True,
                "descripcion": "Luz",
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


# ── PATCH granular de monto estimado (presupuesto/items/{item_id}) ──

def _crear_ciclo_con_item(logged_in_client, user_category_id, monto=200.0):
    """Crea un ciclo y confirma un item de presupuesto, devolviendo (ciclo, item_id)."""
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 1200.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])
    confirm = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/", json={
        "items": [
            {
                "monto_estimado": monto,
                "confirmado": True,
                "descripcion": "Alquiler",
            }
        ]
    })
    assert confirm.status_code == 200, confirm.text
    item_id = confirm.json()["resumen"]["presupuesto_items"][0]["id"]
    return ciclo, item_id


def test_patch_item_valido_recalcula_estado(logged_in_client, user_category_id):
    ciclo, item_id = _crear_ciclo_con_item(logged_in_client, user_category_id, monto=200.0)

    # Ejecutar 100 → estado "parcial"
    gasto = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 100.0, item_id))
    assert gasto.status_code == 200, gasto.text

    # Bajar el estimado al ejecutado (100) → estado "efectivizado"
    r = logged_in_client.patch(f"/ciclos/{ciclo['id']}/presupuesto/items/{item_id}", json={
        "monto_estimado": 100.0,
    })
    assert r.status_code == 200, r.text
    resumen = r.json()["resumen"]
    item = next(i for i in resumen["presupuesto_items"] if i["id"] == item_id)
    assert item["monto_estimado"] == 100.0
    assert item["estado"] == "efectivizado"


def test_patch_item_monto_menor_al_ejecutado_devuelve_400(logged_in_client, user_category_id):
    ciclo, item_id = _crear_ciclo_con_item(logged_in_client, user_category_id, monto=200.0)
    gasto = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 120.0, item_id))
    assert gasto.status_code == 200, gasto.text

    r = logged_in_client.patch(f"/ciclos/{ciclo['id']}/presupuesto/items/{item_id}", json={
        "monto_estimado": 50.0,
    })
    assert r.status_code == 400, r.text
    assert "monto estimado" in r.json()["detail"].lower()


def test_patch_item_monto_negativo_no_se_acepta(logged_in_client, user_category_id):
    ciclo, item_id = _crear_ciclo_con_item(logged_in_client, user_category_id, monto=200.0)
    r = logged_in_client.patch(f"/ciclos/{ciclo['id']}/presupuesto/items/{item_id}", json={
        "monto_estimado": -10.0,
    })
    assert r.status_code == 422, r.text


def test_patch_item_inexistente_devuelve_404(logged_in_client, user_category_id):
    ciclo, _ = _crear_ciclo_con_item(logged_in_client, user_category_id, monto=200.0)
    r = logged_in_client.patch(f"/ciclos/{ciclo['id']}/presupuesto/items/9999", json={
        "monto_estimado": 150.0,
    })
    assert r.status_code == 404, r.text


def test_patch_item_ajeno_devuelve_404(logged_in_client, second_logged_in_client, user_category_id):
    # Primer usuario crea el ciclo + item
    ciclo, item_id = _crear_ciclo_con_item(logged_in_client, user_category_id, monto=200.0)

    # Segundo usuario intenta PATCHear ese item → 404 sin revelar recurso
    r = second_logged_in_client.patch(f"/ciclos/{ciclo['id']}/presupuesto/items/{item_id}", json={
        "monto_estimado": 300.0,
    })
    assert r.status_code == 404, r.text


def test_patch_item_en_ciclo_ajeno_devuelve_404(logged_in_client, second_logged_in_client, user_category_id):
    ciclo, _ = _crear_ciclo_con_item(logged_in_client, user_category_id, monto=200.0)
    # El segundo usuario no puede PATCHear ni el ciclo ni sus items → 404
    r = second_logged_in_client.patch(f"/ciclos/{ciclo['id']}/presupuesto/items/1", json={
        "monto_estimado": 300.0,
    })
    assert r.status_code == 404, r.text


def test_resumen_enriquecido_gastos_sin_presupuesto_y_clasificacion(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 2000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    # Item comprometido 500
    confirm = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/", json={
        "items": [{
            "monto_estimado": 500.0,
            "confirmado": True,
            "descripcion": "Alquiler",
        }]
    })
    assert confirm.status_code == 200, confirm.text
    item_id = confirm.json()["resumen"]["presupuesto_items"][0]["id"]

    # Gasto SIN presupuesto (necesidad) 400
    sin_presupuesto = logged_in_client.post("/movimientos/", json={
        **_gasto(user_category_id, 400.0),
        "clasificacion": "necesidad",
    })
    assert sin_presupuesto.status_code == 200, sin_presupuesto.text

    # Gasto SIN presupuesto (deseo) 100
    deseo = logged_in_client.post("/movimientos/", json={
        **_gasto(user_category_id, 100.0),
        "clasificacion": "deseo",
    })
    assert deseo.status_code == 200, deseo.text

    # Gasto vinculado al item (necesidad) 300
    vinculado = logged_in_client.post("/movimientos/", json={
        **_gasto(user_category_id, 300.0, item_id),
        "clasificacion": "necesidad",
    })
    assert vinculado.status_code == 200, vinculado.text

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]

    # Σ de gastos_sin_presupuesto == gastos_no_planificados (400 + 100)
    total_sin = sum(g["importe"] for g in resumen["gastos_sin_presupuesto"])
    assert total_sin == resumen["gastos_no_planificados"] == 500.0
    # Orden desc por importe
    importes = [g["importe"] for g in resumen["gastos_sin_presupuesto"]]
    assert importes == sorted(importes, reverse=True)

    # Clasificación: necesidad 400+300=700, deseo 100, total gastos 800
    clas = resumen["clasificacion_importes"]
    assert clas["necesidad"] == 700.0
    assert clas["deseo"] == 100.0
    assert clas["sin_clasificar"] == 0.0


# ── POST granular: crear/vincular item de presupuesto (presupuesto/items/) ──

def _crear_item_presupuesto(**overrides) -> dict:
    payload = {
        "categoria_id": None,
        "user_category_id": None,
        "monto_estimado": 500.0,
        "confirmado": True,
        "descripcion": "Test Categoria",
    }
    payload.update(overrides)
    return payload


def test_crear_item_presupuesto_vincular_gastos_sueltos(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 2000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    # Gasto sin comprometer en la categoría → figura en gastos_sin_presupuesto
    gasto = logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 300.0))
    assert gasto.status_code == 200, gasto.text
    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    assert resumen["gastos_sin_presupuesto"] == [{"categoria": "Test Categoria", "importe": 300.0}]

    # Presupuestar esa categoría con monto >= ejecutado
    r = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/items/", json={
        **_crear_item_presupuesto(user_category_id=user_category_id),
    })
    assert r.status_code == 201, r.text

    resumen = r.json()["resumen"]
    # El gasto deja de aparecer como sin comprometer
    assert resumen["gastos_sin_presupuesto"] == []
    assert resumen["gastos_no_planificados"] == 0.0
    # El item queda vinculado con la ejecución del gasto
    item = next(i for i in resumen["presupuesto_items"] if i["user_category_id"] == user_category_id)
    assert item["monto_estimado"] == 500.0
    assert item["monto_ejecutado"] == 300.0
    assert item["estado"] == "parcial"


def test_crear_item_presupuesto_actualiza_item_existente_sin_duplicar(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 2000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    # Item existente del ciclo para la misma user_category (bulk)
    confirm = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/", json={
        "items": [{
            "categoria_id": None,
            "user_category_id": user_category_id,
            "monto_estimado": 200.0,
            "confirmado": True,
            "descripcion": "Test Categoria",
        }]
    })
    assert confirm.status_code == 200, confirm.text
    item_id = confirm.json()["resumen"]["presupuesto_items"][0]["id"]

    r = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/items/", json={
        **_crear_item_presupuesto(user_category_id=user_category_id, monto_estimado=400.0),
    })
    assert r.status_code == 201, r.text

    items = r.json()["resumen"]["presupuesto_items"]
    matching = [i for i in items if i["user_category_id"] == user_category_id]
    assert len(matching) == 1
    assert matching[0]["id"] == item_id
    assert matching[0]["monto_estimado"] == 400.0


def test_crear_item_presupuesto_monto_menor_a_ejecutado_devuelve_400(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 2000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    logged_in_client.post("/movimientos/", json=_gasto(user_category_id, 300.0))

    r = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/items/", json={
        **_crear_item_presupuesto(user_category_id=user_category_id, monto_estimado=100.0),
    })
    assert r.status_code == 400, r.text
    assert "monto estimado" in r.json()["detail"].lower()


def test_crear_item_presupuesto_en_ciclo_ajeno_devuelve_404(logged_in_client, second_logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 2000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    r = second_logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/items/", json={
        **_crear_item_presupuesto(),
    })
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == "Ciclo no encontrado"


def test_crear_item_presupuesto_solo_descripcion_no_falla(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 2000.0)).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    r = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/items/", json={
        **_crear_item_presupuesto(descripcion="Sin categoría"),
    })
    assert r.status_code == 201, r.text

    resumen = r.json()["resumen"]
    item = next(i for i in resumen["presupuesto_items"] if i["descripcion"] == "Sin categoría")
    assert item["monto_estimado"] == 500.0
    assert item["monto_ejecutado"] == 0.0
    assert item["estado"] == "pendiente"


# ── Plantilla de presupuesto como fuente de verdad ──

def _obtener_categoria(client, user_category_id: int) -> dict:
    response = client.get("/user-categories/")
    assert response.status_code == 200, response.text
    return next(cat for cat in response.json() if cat["id"] == user_category_id)


@pytest.mark.parametrize(
    ("monto_inicial", "monto_confirmado", "monto_esperado"),
    [
        (None, 200.0, 200.0),
        (100.0, 200.0, 200.0),
        (200.0, 200.0, 200.0),
        (300.0, 200.0, 300.0),
    ],
)
def test_bulk_registra_maximo_confirmado_en_plantilla(
    logged_in_client,
    user_category_id,
    monto_inicial,
    monto_confirmado,
    monto_esperado,
):
    if monto_inicial is not None:
        response = logged_in_client.put(
            f"/user-categories/{user_category_id}",
            json={"monto_default": monto_inicial},
        )
        assert response.status_code == 200, response.text

    ingreso = logged_in_client.post(
        "/movimientos/", json=_ingreso(user_category_id, 1000.0)
    ).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])
    response = logged_in_client.post(
        f"/ciclos/{ciclo['id']}/presupuesto/",
        json={
            "items": [{
                "user_category_id": user_category_id,
                "monto_estimado": monto_confirmado,
                "confirmado": True,
            }]
        },
    )

    assert response.status_code == 200, response.text
    categoria = _obtener_categoria(logged_in_client, user_category_id)
    assert categoria["tiene_monto_fijo"] is True
    assert categoria["monto_default"] == monto_esperado


def test_bulk_no_registra_item_no_confirmado_en_plantilla(
    logged_in_client, user_category_id
):
    ingreso = logged_in_client.post(
        "/movimientos/", json=_ingreso(user_category_id, 1000.0)
    ).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])
    response = logged_in_client.post(
        f"/ciclos/{ciclo['id']}/presupuesto/",
        json={
            "items": [{
                "user_category_id": user_category_id,
                "monto_estimado": 200.0,
                "confirmado": False,
            }]
        },
    )

    assert response.status_code == 200, response.text
    categoria = _obtener_categoria(logged_in_client, user_category_id)
    assert categoria["tiene_monto_fijo"] is False
    assert categoria["monto_default"] is None


def test_bulk_registra_item_no_confirmado_si_ya_tiene_ejecucion(
    logged_in_client, user_category_id
):
    ingreso = logged_in_client.post(
        "/movimientos/", json=_ingreso(user_category_id, 1000.0)
    ).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])
    primera_respuesta = logged_in_client.post(
        f"/ciclos/{ciclo['id']}/presupuesto/",
        json={
            "items": [{
                "user_category_id": user_category_id,
                "monto_estimado": 200.0,
                "confirmado": True,
            }]
        },
    )
    item_id = primera_respuesta.json()["resumen"]["presupuesto_items"][0]["id"]
    gasto = logged_in_client.post(
        "/movimientos/", json=_gasto(user_category_id, 100.0, item_id)
    )
    assert gasto.status_code == 200, gasto.text
    reinicio_plantilla = logged_in_client.put(
        f"/user-categories/{user_category_id}", json={"monto_default": 0}
    )
    assert reinicio_plantilla.status_code == 200, reinicio_plantilla.text

    response = logged_in_client.post(
        f"/ciclos/{ciclo['id']}/presupuesto/",
        json={
            "items": [{
                "user_category_id": user_category_id,
                "monto_estimado": 250.0,
                "confirmado": False,
            }]
        },
    )

    assert response.status_code == 200, response.text
    categoria = _obtener_categoria(logged_in_client, user_category_id)
    assert categoria["tiene_monto_fijo"] is True
    assert categoria["monto_default"] == 250.0


def test_bulk_items_sin_user_category_no_modifican_plantillas(
    logged_in_client, user_category_id, db_session
):
    import models

    categoria_sistema = models.Category(nombre="Sistema bulk", es_predeterminada=True)
    db_session.add(categoria_sistema)
    db_session.flush()
    ingreso = logged_in_client.post(
        "/movimientos/", json=_ingreso(user_category_id, 1000.0)
    ).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    response = logged_in_client.post(
        f"/ciclos/{ciclo['id']}/presupuesto/",
        json={
            "items": [
                {
                    "categoria_id": categoria_sistema.id,
                    "monto_estimado": 100.0,
                    "confirmado": True,
                },
                {
                    "descripcion": "Ad hoc",
                    "monto_estimado": 150.0,
                    "confirmado": True,
                },
            ]
        },
    )

    assert response.status_code == 200, response.text
    categoria = _obtener_categoria(logged_in_client, user_category_id)
    assert categoria["tiene_monto_fijo"] is False
    assert categoria["monto_default"] is None


def test_bulk_rechaza_user_category_ajena_sin_mutarla(
    logged_in_client, second_logged_in_client, user_category_id
):
    categoria_ajena = second_logged_in_client.post(
        "/user-categories/", json={"nombre": "Categoría ajena"}
    )
    assert categoria_ajena.status_code == 200, categoria_ajena.text
    categoria_ajena_id = categoria_ajena.json()["id"]
    ingreso = logged_in_client.post(
        "/movimientos/", json=_ingreso(user_category_id, 1000.0)
    ).json()
    ciclo = _crear_ciclo(logged_in_client, ingreso["id"])

    response = logged_in_client.post(
        f"/ciclos/{ciclo['id']}/presupuesto/",
        json={
            "items": [{
                "user_category_id": categoria_ajena_id,
                "monto_estimado": 500.0,
                "confirmado": True,
            }]
        },
    )

    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "Categoría de usuario no válida"
    categoria = _obtener_categoria(second_logged_in_client, categoria_ajena_id)
    assert categoria["tiene_monto_fijo"] is False
    assert categoria["monto_default"] is None
    ciclo_actual = logged_in_client.get(f"/ciclos/{ciclo['id']}").json()
    assert ciclo_actual["resumen"]["presupuesto_items"] == []


def test_bulk_revierte_plantilla_y_presupuesto_si_falla_commit(tmp_path, monkeypatch):
    import models
    import schemas
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from services import ciclo_commitment_service

    engine = create_engine(f"sqlite:///{tmp_path / 'bulk_rollback.db'}")
    models.Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    user = models.User(
        username="rollback_user",
        email="rollback@test.com",
        hashed_password="test",
    )
    session.add(user)
    session.flush()
    categoria = models.UserCategory(user_id=user.id, nombre="Rollback")
    ciclo = models.Ciclo(
        user_id=user.id,
        fecha_inicio=datetime.now(),
        fecha_fin=datetime.now() + timedelta(days=10),
        ahorro_objetivo=Decimal("0"),
    )
    session.add_all([categoria, ciclo])
    session.commit()
    categoria_id = categoria.id
    ciclo_id = ciclo.id

    def fallar_commit():
        raise RuntimeError("fallo de persistencia")

    monkeypatch.setattr(session, "commit", fallar_commit)
    with pytest.raises(RuntimeError, match="fallo de persistencia"):
        ciclo_commitment_service.aplicar_presupuesto_bulk(
            ciclo,
            [schemas.PresupuestoItemCreate(
                user_category_id=categoria_id,
                monto_estimado=Decimal("350"),
                confirmado=True,
            )],
            session,
            user.id,
        )
    session.close()

    verificacion = Session()
    categoria_persistida = verificacion.get(models.UserCategory, categoria_id)
    assert categoria_persistida.tiene_monto_fijo is False
    assert categoria_persistida.monto_default is None
    assert verificacion.query(models.PresupuestoItem).filter_by(ciclo_id=ciclo_id).count() == 0
    verificacion.close()
    engine.dispose()
