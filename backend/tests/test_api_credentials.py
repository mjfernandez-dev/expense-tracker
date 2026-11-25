"""Tests de credenciales de proveedores externos (/configuracion/credenciales).

Cubren lo que puede romperse en silencio: que la clave no se filtre, que el
ownership multi-tenant se respete y que la rotación entre credenciales deje
siempre exactamente una activa.
"""
from sqlalchemy import text

CREDENCIAL_BASE = {
    "proveedor": "llamacloud",
    "nombre": "LlamaCloud principal",
    "clave": "llx-1234567890abcdef1234567890abcdef",
    "tier": "agentic_plus",
}


def _crear(client, **overrides):
    payload = {**CREDENCIAL_BASE, **overrides}
    return client.post("/api/configuracion/credenciales", json=payload)


def test_crear_primera_credencial_queda_activa(logged_in_client):
    r = _crear(logged_in_client)

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["activa"] is True
    assert data["proveedor"] == "llamacloud"
    assert data["tier"] == "agentic_plus"


def test_respuesta_nunca_incluye_la_clave_completa(logged_in_client):
    r = _crear(logged_in_client)

    assert r.status_code == 200, r.text
    assert CREDENCIAL_BASE["clave"] not in r.text
    assert r.json()["clave_preview"] == "llx-…cdef"


def test_clave_se_guarda_cifrada_en_la_base(logged_in_client, db_session):
    r = _crear(logged_in_client)
    assert r.status_code == 200, r.text

    crudo = db_session.execute(text("SELECT clave FROM api_credentials")).scalar()

    assert crudo is not None
    assert crudo != CREDENCIAL_BASE["clave"]
    assert "llx-" not in crudo


def test_segunda_credencial_no_queda_activa(logged_in_client):
    _crear(logged_in_client)
    r = _crear(logged_in_client, nombre="LlamaCloud respaldo")

    assert r.status_code == 200, r.text
    assert r.json()["activa"] is False


def test_activar_deja_una_sola_activa(logged_in_client):
    primera = _crear(logged_in_client).json()
    segunda = _crear(logged_in_client, nombre="LlamaCloud respaldo").json()

    r = logged_in_client.post(f"/api/configuracion/credenciales/{segunda['id']}/activar")
    assert r.status_code == 200, r.text
    assert r.json()["activa"] is True

    listado = logged_in_client.get("/api/configuracion/credenciales").json()
    activas = [c for c in listado if c["activa"]]
    assert len(activas) == 1
    assert activas[0]["id"] == segunda["id"]
    assert any(c["id"] == primera["id"] and not c["activa"] for c in listado)


def test_eliminar_la_activa_promueve_otra(logged_in_client):
    activa = _crear(logged_in_client).json()
    respaldo = _crear(logged_in_client, nombre="LlamaCloud respaldo").json()

    r = logged_in_client.delete(f"/api/configuracion/credenciales/{activa['id']}")
    assert r.status_code == 200, r.text

    listado = logged_in_client.get("/api/configuracion/credenciales").json()
    assert len(listado) == 1
    assert listado[0]["id"] == respaldo["id"]
    assert listado[0]["activa"] is True


def test_actualizar_clave_cambia_el_preview(logged_in_client):
    creada = _crear(logged_in_client).json()

    r = logged_in_client.put(
        f"/api/configuracion/credenciales/{creada['id']}",
        json={"clave": "llx-ffffffffffffffffffffffffffffffff"},
    )

    assert r.status_code == 200, r.text
    assert r.json()["clave_preview"] == "llx-…ffff"
    assert "ffffffffffffffffffffffffffffffff" not in r.text


def test_nombre_duplicado_devuelve_400(logged_in_client):
    _crear(logged_in_client)
    r = _crear(logged_in_client)

    assert r.status_code == 400, r.text
    assert "credencial" in r.json()["detail"].lower()


def test_tier_invalido_devuelve_422(logged_in_client):
    r = _crear(logged_in_client, tier="ultra")

    assert r.status_code == 422, r.text


def test_sin_autenticacion_devuelve_401(client):
    r = _crear(client)

    assert r.status_code == 401, r.text


def test_otro_usuario_no_puede_ver_ni_borrar(logged_in_client, second_logged_in_client):
    creada = _crear(logged_in_client).json()

    listado_ajeno = second_logged_in_client.get("/api/configuracion/credenciales").json()
    assert listado_ajeno == []

    r = second_logged_in_client.delete(f"/api/configuracion/credenciales/{creada['id']}")
    assert r.status_code == 404, r.text

    # Sigue existiendo para su dueño
    assert len(logged_in_client.get("/api/configuracion/credenciales").json()) == 1
