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


def test_post_origin_mismo_host_ok(client, registered_user):
    """Same-origin en producción: el Origin coincide con el host del request.

    Caso real: Cloud Run sirve frontend y API en el mismo dominio
    (https://finanzaapp-....run.app), y el navegador envía Origin igual al host.
    No debe depender de ALLOWED_ORIGINS (que en prod puede no estar configurada).
    """
    r = client.post("/auth/login", json={
        "username": registered_user["username"],
        "password": registered_user["password"],
    }, headers={
        "Origin": "https://finanzaapp-1063341991969.us-east1.run.app",
        "Host": "finanzaapp-1063341991969.us-east1.run.app",
    })
    assert r.status_code == 200


def test_post_origin_mismo_host_con_puerto_ok(client, registered_user):
    """Same-origin con puerto: Origin http://localhost:5173 vs Host localhost:8000."""
    r = client.post("/auth/login", json={
        "username": registered_user["username"],
        "password": registered_user["password"],
    }, headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 200


def test_get_con_origin_malicioso_pasa(client):
    """Los métodos seguros (GET) no deben ser bloqueados por el Origin check."""
    r = client.get("/auth/me", headers={"Origin": "http://evil.com"})
    assert r.status_code == 401