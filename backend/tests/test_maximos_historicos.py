"""Tests para el endpoint /user-categories/maximos-historicos."""
from datetime import datetime, timedelta


def _ingreso(user_category_id: int, importe: float = 5000.0) -> dict:
    return {
        "importe": importe,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Sueldo",
        "tipo": "ingreso",
        "user_category_id": user_category_id,
    }


def _gasto(user_category_id: int, importe: float) -> dict:
    return {
        "importe": importe,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Gasto test",
        "tipo": "gasto",
        "user_category_id": user_category_id,
    }


def _crear_ciclo(logged_in_client, user_category_id: int, monto_ingreso: float = 5000) -> tuple[dict, int]:
    """Helper: crea un ingreso, un ciclo, y devuelve (ciclo_dict, user_category_id)."""
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, monto_ingreso)).json()
    r = logged_in_client.post("/ciclos/", json={
        "movimiento_origen_id": ingreso["id"],
        "fecha_fin": (datetime.now() + timedelta(days=15)).isoformat(),
        "ahorro_objetivo": 0,
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_maximos_historicos_sin_datos(logged_in_client, user_category_id):
    """Si no hay presupuestos, devuelve objeto vacío."""
    r = logged_in_client.get("/user-categories/maximos-historicos")
    assert r.status_code == 200, r.text
    assert r.json() == {}


def test_maximos_historicos_con_un_item(logged_in_client, user_category_id):
    """Un presupuesto confirmado con su movimiento debe reflejar el valor correcto."""
    ciclo = _crear_ciclo(logged_in_client, user_category_id)

    # Confirmar presupuesto: estimado $1500
    r = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/", json={
        "items": [{
            "categoria_id": None,
            "user_category_id": user_category_id,
            "monto_estimado": 1500,
            "confirmado": True,
            "descripcion": None,
        }]
    })
    assert r.status_code == 200, r.text
    item_id = r.json()["resumen"]["presupuesto_items"][0]["id"]

    # Registrar gasto de $1200 contra ese presupuesto
    gasto = _gasto(user_category_id, 1200)
    gasto["presupuesto_item_id"] = item_id
    r = logged_in_client.post("/movimientos/", json=gasto)
    assert r.status_code == 200, r.text

    # Verificar: max(1500 estimado, 1200 ejecutado) = 1500
    r = logged_in_client.get("/user-categories/maximos-historicos")
    assert r.status_code == 200, r.text
    data = r.json()
    assert str(user_category_id) in data, f"Falta categoría {user_category_id} en {data}"
    assert data[str(user_category_id)] == 1500.0, f"Esperaba 1500, obtuve {data[str(user_category_id)]}"


def test_maximos_historicos_toma_el_mayor_de_varios_ciclos(logged_in_client, user_category_id):
    """Si un mismo item aparece en múltiples ciclos, toma el mayor valor."""
    cat_id = user_category_id

    def _crear_ciclo_con_presupuesto(estimado: float, ejecutado: float):
        ciclo = _crear_ciclo(logged_in_client, cat_id)

        r = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/", json={
            "items": [{
                "categoria_id": None,
                "user_category_id": cat_id,
                "monto_estimado": estimado,
                "confirmado": True,
                "descripcion": None,
            }]
        })
        assert r.status_code == 200, r.text
        item_id = r.json()["resumen"]["presupuesto_items"][0]["id"]

        if ejecutado > 0:
            gasto = _gasto(cat_id, ejecutado)
            gasto["presupuesto_item_id"] = item_id
            r = logged_in_client.post("/movimientos/", json=gasto)
            assert r.status_code == 200, r.text

        # Cerrar ciclo para que no interfiera con el siguiente
        r = logged_in_client.delete(f"/ciclos/{ciclo['id']}")
        assert r.status_code == 200, r.text

    # Ciclo 1: estimado 3000, ejecutado 2500 → valor 3000
    _crear_ciclo_con_presupuesto(3000, 2500)
    # Ciclo 2: estimado 3500, ejecutado 4000 → valor 4000 (ejecutado supera)
    _crear_ciclo_con_presupuesto(3500, 4000)
    # Ciclo 3: estimado 2000, ejecutado 1800 → valor 2000 (menor, no afecta)

    r = logged_in_client.get("/user-categories/maximos-historicos")
    assert r.status_code == 200, r.text
    data = r.json()
    assert str(cat_id) in data, f"Falta categoría {cat_id} en {data}"
    assert data[str(cat_id)] == 4000.0, f"Esperaba 4000 (mayor histórico), obtuve {data[str(cat_id)]}"


def test_maximos_historicos_sin_movimientos_toma_estimado(logged_in_client, user_category_id):
    """Si hay presupuesto confirmado pero sin gastos, toma el monto_estimado."""
    ciclo = _crear_ciclo(logged_in_client, user_category_id)

    # Confirmar presupuesto sin gastos
    r = logged_in_client.post(f"/ciclos/{ciclo['id']}/presupuesto/", json={
        "items": [{
            "categoria_id": None,
            "user_category_id": user_category_id,
            "monto_estimado": 2500,
            "confirmado": True,
            "descripcion": None,
        }]
    })
    assert r.status_code == 200, r.text

    r = logged_in_client.get("/user-categories/maximos-historicos")
    assert r.status_code == 200, r.text
    data = r.json()
    assert str(user_category_id) in data
    assert data[str(user_category_id)] == 2500.0
