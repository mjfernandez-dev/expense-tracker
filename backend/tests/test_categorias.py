"""
Tests de integración para categorías personalizadas del usuario (user-categories).
Cubre: CRUD completo, unicidad por usuario, aislamiento entre usuarios,
y bloqueo de eliminación cuando hay movimientos asociados.
"""
from datetime import datetime


# ============== HELPERS ==============

def _nueva_categoria(nombre: str = "Alimentación") -> dict:
    return {"nombre": nombre, "color": "#FF5733", "icon": "🍕"}


def _registrar_y_logear(client, username: str, email: str) -> None:
    client.post("/auth/register", json={
        "username": username,
        "email": email,
        "password": "TestPass123!",
    })
    client.post("/auth/login", data={"username": username, "password": "TestPass123!"})


def _movimiento(user_category_id: int) -> dict:
    return {
        "importe": 500.0,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Test movimiento",
        "tipo": "gasto",
        "user_category_id": user_category_id,
    }


# ============== CREAR ==============

def test_crear_categoria_exitosa(logged_in_client):
    r = logged_in_client.post("/user-categories/", json=_nueva_categoria())
    assert r.status_code == 200
    data = r.json()
    assert data["nombre"] == "Alimentación"
    assert "id" in data
    assert "user_id" in data


def test_crear_categoria_nombre_duplicado(logged_in_client):
    logged_in_client.post("/user-categories/", json=_nueva_categoria("Transporte"))
    r = logged_in_client.post("/user-categories/", json=_nueva_categoria("Transporte"))
    assert r.status_code == 400
    assert "nombre" in r.json()["detail"].lower()


def test_crear_categoria_sin_autenticacion(client):
    r = client.post("/user-categories/", json=_nueva_categoria())
    assert r.status_code == 401


# ============== LISTAR ==============

def test_listar_categorias_vacio(logged_in_client):
    r = logged_in_client.get("/user-categories/")
    assert r.status_code == 200
    assert r.json() == []


def test_listar_categorias_muestra_solo_las_del_usuario(client):
    """Dos usuarios crean categorías: cada uno solo ve las suyas."""
    _registrar_y_logear(client, "usuarioA", "a@test.com")
    client.post("/user-categories/", json=_nueva_categoria("CatDeA"))

    # Login con segundo usuario
    client.post("/auth/register", json={
        "username": "usuarioB", "email": "b@test.com", "password": "TestPass123!"
    })
    client.post("/auth/login", data={"username": "usuarioB", "password": "TestPass123!"})
    client.post("/user-categories/", json=_nueva_categoria("CatDeB"))

    r = client.get("/user-categories/")
    assert r.status_code == 200
    nombres = [c["nombre"] for c in r.json()]
    assert "CatDeB" in nombres
    assert "CatDeA" not in nombres


def test_listar_categorias_sin_autenticacion(client):
    r = client.get("/user-categories/")
    assert r.status_code == 401


# ============== ACTUALIZAR ==============

def test_actualizar_categoria_exitosa(logged_in_client, user_category_id):
    r = logged_in_client.put(f"/user-categories/{user_category_id}", json={"nombre": "Nuevo Nombre"})
    assert r.status_code == 200
    assert r.json()["nombre"] == "Nuevo Nombre"


def test_actualizar_categoria_nombre_duplicado(logged_in_client):
    r1 = logged_in_client.post("/user-categories/", json=_nueva_categoria("CatUno"))
    r2 = logged_in_client.post("/user-categories/", json=_nueva_categoria("CatDos"))
    id1 = r1.json()["id"]
    r = logged_in_client.put(f"/user-categories/{id1}", json={"nombre": "CatDos"})
    assert r.status_code == 400


def test_actualizar_categoria_de_otro_usuario(client):
    """Usuario B no puede editar categoría de usuario A."""
    _registrar_y_logear(client, "propietario", "prop@test.com")
    r = client.post("/user-categories/", json=_nueva_categoria("CatPrivada"))
    cat_id = r.json()["id"]

    client.post("/auth/register", json={
        "username": "intruso", "email": "int@test.com", "password": "TestPass123!"
    })
    client.post("/auth/login", data={"username": "intruso", "password": "TestPass123!"})

    r = client.put(f"/user-categories/{cat_id}", json={"nombre": "Hackeada"})
    assert r.status_code == 404


# ============== ELIMINAR ==============

def test_eliminar_categoria_exitosa(logged_in_client, user_category_id):
    r = logged_in_client.delete(f"/user-categories/{user_category_id}")
    assert r.status_code == 204
    r2 = logged_in_client.get(f"/user-categories/{user_category_id}")
    assert r2.status_code == 404


def test_eliminar_categoria_con_movimientos_asociados(logged_in_client, user_category_id):
    """No debe permitir eliminar una categoría que tiene movimientos."""
    logged_in_client.post("/movimientos/", json=_movimiento(user_category_id))
    r = logged_in_client.delete(f"/user-categories/{user_category_id}")
    assert r.status_code == 400
    assert "movimiento" in r.json()["detail"].lower()


def test_eliminar_categoria_de_otro_usuario(client):
    """Usuario B no puede eliminar categoría de usuario A."""
    _registrar_y_logear(client, "duenio", "duenio@test.com")
    r = client.post("/user-categories/", json=_nueva_categoria("MiCat"))
    cat_id = r.json()["id"]

    client.post("/auth/register", json={
        "username": "atacante", "email": "atk@test.com", "password": "TestPass123!"
    })
    client.post("/auth/login", data={"username": "atacante", "password": "TestPass123!"})

    r = client.delete(f"/user-categories/{cat_id}")
    assert r.status_code == 404


def test_eliminar_categoria_inexistente(logged_in_client):
    r = logged_in_client.delete("/user-categories/99999")
    assert r.status_code == 404
