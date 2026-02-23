"""
Smoke tests de autenticación:
- Registro, login, logout, /auth/me
- Casos de error: credenciales incorrectas, usuario duplicado
"""


def test_register_ok(client):
    r = client.post("/auth/register", json={
        "username": "nuevo", "email": "nuevo@example.com", "password": "Segura123!"
    })
    assert r.status_code == 200
    data = r.json()
    assert data["username"] == "nuevo"
    assert "hashed_password" not in data


def test_register_duplicate_username(client, registered_user):
    r = client.post("/auth/register", json={
        "username": registered_user["username"],
        "email": "otro@example.com",
        "password": "Segura123!",
    })
    assert r.status_code == 400


def test_register_duplicate_email(client, registered_user):
    r = client.post("/auth/register", json={
        "username": "otrousuario",
        "email": registered_user["email"],
        "password": "Segura123!",
    })
    assert r.status_code == 400


def test_login_ok(client, registered_user):
    r = client.post("/auth/login", data={
        "username": registered_user["username"],
        "password": registered_user["password"],
    })
    assert r.status_code == 200
    assert r.json()["message"] == "Login exitoso"
    # El token debe venir como cookie httponly
    assert "access_token" in r.cookies


def test_login_wrong_password(client, registered_user):
    r = client.post("/auth/login", data={
        "username": registered_user["username"],
        "password": "clave-incorrecta",
    })
    assert r.status_code == 401


def test_login_unknown_user(client):
    r = client.post("/auth/login", data={
        "username": "noexiste", "password": "cualquiera"
    })
    assert r.status_code == 401


def test_me_authenticated(logged_in_client, registered_user):
    r = logged_in_client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == registered_user["username"]


def test_me_unauthenticated(client):
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_logout(logged_in_client):
    r = logged_in_client.post("/auth/logout")
    assert r.status_code == 200
    # Después del logout /auth/me debe fallar
    r2 = logged_in_client.get("/auth/me")
    assert r2.status_code == 401
