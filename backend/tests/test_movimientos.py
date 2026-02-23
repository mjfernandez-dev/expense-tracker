"""
Smoke tests de movimientos (CRUD básico):
- Crear, listar, actualizar, eliminar
- Validaciones: sin categoría, sin auth
"""
from datetime import datetime


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


def test_actualizar_movimiento(logged_in_client, user_category_id):
    r = logged_in_client.post("/movimientos/", json=_gasto(user_category_id))
    mov_id = r.json()["id"]
    update = {**_gasto(user_category_id), "importe": 999.0, "descripcion": "Actualizado"}
    r2 = logged_in_client.put(f"/movimientos/{mov_id}", json=update)
    assert r2.status_code == 200
    assert r2.json()["importe"] == 999.0


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
