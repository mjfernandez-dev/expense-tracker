"""
Tests del OriginCheckMiddleware (protección CSRF).

Los navegadores siempre envían el header Origin en requests de escritura
(POST/PUT/PATCH/DELETE); si ese Origin no está en ALLOWED_ORIGINS el middleware
debe rechazar la request con 403 antes de llegar al handler.
"""


def test_post_con_origin_malicioso_403(client, registered_user):
    r = client.post("/auth/login", json={
        "username": registered_user["username"],
        "password": registered_user["password"],
    }, headers={"Origin": "http://evil.com"})
    assert r.status_code == 403


def test_post_con_origin_permitido_ok(client, registered_user):
    r = client.post("/auth/login", json={
        "username": registered_user["username"],
        "password": registered_user["password"],
    }, headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 200


def test_post_sin_origin_ok(client, registered_user):
    r = client.post("/auth/login", json={
        "username": registered_user["username"],
        "password": registered_user["password"],
    })
    assert r.status_code == 200


def test_get_con_origin_malicioso_pasa(client):
    """Los métodos seguros (GET) no deben ser bloqueados por el Origin check."""
    r = client.get("/auth/me", headers={"Origin": "http://evil.com"})
    assert r.status_code == 401