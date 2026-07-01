"""
Tests para el módulo de Inversiones Manuales (Investment + AporteInversion).
Cubre CRUD de inversiones, contribuciones y campos calculados.
"""
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient


# ── Helpers ────────────────────────────────────────────────────────────────────


API = "/api"


def _register_and_login_as(client: TestClient, suffix: str) -> None:
    """Register + login a different user on the same client (replaces cookies)."""
    r = client.post(f"{API}/auth/register", json={
        "username": f"otheruser_{suffix}",
        "email": f"other_{suffix}@example.com",
        "password": "OtherPass123!",
    })
    assert r.status_code == 200, r.text

    r = client.post(f"{API}/auth/login", json={
        "username": f"otheruser_{suffix}",
        "password": "OtherPass123!",
    })
    assert r.status_code == 200, r.text


def _crear_inversion(client, nombre="Mi inversión") -> dict:
    r = client.post(f"{API}/inversiones/", json={"nombre": nombre})
    assert r.status_code == 201, r.text
    return r.json()


def _crear_aporte(client, inv_id, monto_ars=500, cotizacion_usd=None, fecha="2026-06-15T00:00:00"):
    payload = {"fecha": fecha, "monto_ars": monto_ars}
    if cotizacion_usd is not None:
        payload["cotizacion_usd"] = cotizacion_usd
    r = client.post(f"{API}/inversiones/{inv_id}/aportes", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


# ═══════════════════════════════════════════════════════════════════════════════
# ── Investment CRUD (tests 1-4) ──────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════


def test_create_investment(logged_in_client):
    """Crear una inversión básica → 201 con campos esperados."""
    data = _crear_inversion(logged_in_client, nombre="Mi inversión")

    assert data["nombre"] == "Mi inversión"
    assert data["activo"] is True
    assert "id" in data
    assert data["user_id"] > 0
    # Campos calculados por defecto
    assert data["total_invertido_ars"] == 0.0
    assert data["total_invertido_usd"] is None
    assert data["valor_actual_usd"] is None
    assert data["ganancia_perdida_ars"] is None
    assert data["rendimiento_pct"] is None


def test_list_investments(logged_in_client):
    """Listar inversiones activas."""
    _crear_inversion(logged_in_client, "Inversión A")
    _crear_inversion(logged_in_client, "Inversión B")

    r = logged_in_client.get(f"{API}/inversiones/")
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data) == 2
    nombres = {d["nombre"] for d in data}
    assert nombres == {"Inversión A", "Inversión B"}


def test_get_investment(logged_in_client):
    """Obtener detalle de inversión individual."""
    created = _crear_inversion(logged_in_client, "Mi inversión")
    inv_id = created["id"]

    r = logged_in_client.get(f"{API}/inversiones/{inv_id}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["nombre"] == "Mi inversión"
    assert data["aportes"] == []
    assert "total_invertido_ars" in data


def test_delete_investment(logged_in_client):
    """Eliminar inversión → 204, luego GET → 404."""
    created = _crear_inversion(logged_in_client)
    inv_id = created["id"]

    r = logged_in_client.delete(f"{API}/inversiones/{inv_id}")
    assert r.status_code == 204, r.text

    r = logged_in_client.get(f"{API}/inversiones/{inv_id}")
    assert r.status_code == 404, r.text


# ═══════════════════════════════════════════════════════════════════════════════
# ── Investment Update (tests 5-7) ────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════


def test_update_investment(logged_in_client):
    """Actualizar nombre de inversión."""
    created = _crear_inversion(logged_in_client, "Nombre Original")
    inv_id = created["id"]

    r = logged_in_client.put(f"{API}/inversiones/{inv_id}", json={"nombre": "Nombre Actualizado"})
    assert r.status_code == 200, r.text
    assert r.json()["nombre"] == "Nombre Actualizado"


def test_update_valor_actual(logged_in_client):
    """Actualizar valor_actual_ars y cotizacion_usd_actual → campos calculados se reflejan."""
    created = _crear_inversion(logged_in_client)
    inv_id = created["id"]

    # Agregar un aporte para que total_invertido_ars > 0
    _crear_aporte(logged_in_client, inv_id, monto_ars=500, fecha="2026-01-15T00:00:00")

    # Actualizar valor actual
    r = logged_in_client.put(f"{API}/inversiones/{inv_id}", json={
        "valor_actual_ars": 1000.0,
        "cotizacion_usd_actual": 1000.0,
    })
    assert r.status_code == 200, r.text
    data = r.json()

    assert data["valor_actual_ars"] == 1000.0
    assert data["cotizacion_usd_actual"] == 1000.0
    assert data["valor_actual_usd"] == pytest.approx(1.0)  # 1000 / 1000
    assert data["ganancia_perdida_ars"] == 500.0  # 1000 - 500
    assert data["rendimiento_pct"] == pytest.approx(100.0)  # (1000/500 - 1) * 100


def test_update_activo(logged_in_client):
    """Desactivar inversión → ya no aparece en listado."""
    created = _crear_inversion(logged_in_client)
    inv_id = created["id"]

    r = logged_in_client.put(f"{API}/inversiones/{inv_id}", json={"activo": False})
    assert r.status_code == 200, r.text
    assert r.json()["activo"] is False

    r = logged_in_client.get(f"{API}/inversiones/")
    assert r.status_code == 200, r.text
    assert len(r.json()) == 0  # No aparece en listado activo


# ═══════════════════════════════════════════════════════════════════════════════
# ── Investment Error Cases (tests 8-11) ──────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════


def test_get_investment_not_found(logged_in_client):
    """GET de inversión inexistente → 404."""
    r = logged_in_client.get(f"{API}/inversiones/999999")
    assert r.status_code == 404, r.text
    assert "no encontrada" in r.text.lower()


def test_get_investment_other_user(logged_in_client):
    """Inversión de otro usuario → 404."""
    created = _crear_inversion(logged_in_client, "Inversión ajena")
    inv_id = created["id"]

    _register_and_login_as(logged_in_client, "other_get")

    r = logged_in_client.get(f"{API}/inversiones/{inv_id}")
    assert r.status_code == 404, r.text


def test_delete_investment_other_user(logged_in_client):
    """Eliminar inversión de otro usuario → 404."""
    created = _crear_inversion(logged_in_client, "Inversión ajena")
    inv_id = created["id"]

    _register_and_login_as(logged_in_client, "other_del")

    r = logged_in_client.delete(f"{API}/inversiones/{inv_id}")
    assert r.status_code == 404, r.text


def test_create_investment_empty_name(logged_in_client):
    """Crear inversión con nombre vacío → 422."""
    r = logged_in_client.post(f"{API}/inversiones/", json={"nombre": ""})
    assert r.status_code == 422, r.text

    r = logged_in_client.post(f"{API}/inversiones/", json={"nombre": "   "})
    assert r.status_code == 422, r.text


# ═══════════════════════════════════════════════════════════════════════════════
# ── Contribution CRUD (tests 12-15) ──────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════


def test_add_contribution(logged_in_client):
    """Agregar aporte a inversión → 201."""
    inv = _crear_inversion(logged_in_client)
    inv_id = inv["id"]

    aporte = _crear_aporte(logged_in_client, inv_id, monto_ars=500, fecha="2026-06-15T00:00:00")
    assert aporte["inversion_id"] == inv_id
    assert aporte["monto_ars"] == 500.0
    assert aporte["cotizacion_usd"] is None
    assert "id" in aporte


def test_add_contribution_with_usd(logged_in_client):
    """Agregar aporte con cotización USD → 201."""
    inv = _crear_inversion(logged_in_client)
    inv_id = inv["id"]

    aporte = _crear_aporte(logged_in_client, inv_id, monto_ars=1000, cotizacion_usd=1200.0, fecha="2026-05-01T00:00:00")
    assert aporte["monto_ars"] == 1000.0
    assert aporte["cotizacion_usd"] == 1200.0


def test_list_contributions(logged_in_client):
    """Listar aportes ordenados por fecha DESC."""
    inv = _crear_inversion(logged_in_client)
    inv_id = inv["id"]

    _crear_aporte(logged_in_client, inv_id, monto_ars=100, fecha="2026-01-15T00:00:00")
    _crear_aporte(logged_in_client, inv_id, monto_ars=200, fecha="2026-06-15T00:00:00")

    r = logged_in_client.get(f"{API}/inversiones/{inv_id}/aportes")
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data) == 2
    # Ordered by fecha DESC: June first, then January
    assert data[0]["monto_ars"] == 200.0
    assert data[1]["monto_ars"] == 100.0


def test_delete_contribution(logged_in_client):
    """Eliminar aporte → 204."""
    inv = _crear_inversion(logged_in_client)
    inv_id = inv["id"]
    aporte = _crear_aporte(logged_in_client, inv_id)

    r = logged_in_client.delete(f"{API}/inversiones/{inv_id}/aportes/{aporte['id']}")
    assert r.status_code == 204, r.text

    # Verify it's gone
    r = logged_in_client.get(f"{API}/inversiones/{inv_id}/aportes")
    assert r.json() == []


# ═══════════════════════════════════════════════════════════════════════════════
# ── Contribution Error Cases (tests 16-18) ───────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════


def test_add_contribution_investment_not_found(logged_in_client):
    """Agregar aporte a inversión inexistente → 404."""
    r = logged_in_client.post(f"{API}/inversiones/999999/aportes", json={
        "fecha": "2026-06-15T00:00:00",
        "monto_ars": 500,
    })
    assert r.status_code == 404, r.text


def test_delete_contribution_not_found(logged_in_client):
    """Eliminar aporte inexistente → 404."""
    inv = _crear_inversion(logged_in_client)
    inv_id = inv["id"]

    r = logged_in_client.delete(f"{API}/inversiones/{inv_id}/aportes/999999")
    assert r.status_code == 404, r.text
    assert "no encontrado" in r.text.lower()


def test_other_user_contribution(logged_in_client):
    """Acceder a aportes de inversión de otro usuario → 404."""
    inv = _crear_inversion(logged_in_client, "Inversión ajena")
    inv_id = inv["id"]
    aporte = _crear_aporte(logged_in_client, inv_id)

    _register_and_login_as(logged_in_client, "other_contrib")

    # GET aportes
    r = logged_in_client.get(f"{API}/inversiones/{inv_id}/aportes")
    assert r.status_code == 404, r.text

    # POST aporte
    r = logged_in_client.post(f"{API}/inversiones/{inv_id}/aportes", json={
        "fecha": "2026-06-15T00:00:00",
        "monto_ars": 500,
    })
    assert r.status_code == 404, r.text

    # DELETE aporte
    r = logged_in_client.delete(f"{API}/inversiones/{inv_id}/aportes/{aporte['id']}")
    assert r.status_code == 404, r.text


# ═══════════════════════════════════════════════════════════════════════════════
# ── Calculated Fields (tests 19-21) ──────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════


def test_calculated_fields_empty(logged_in_client):
    """Inversión sin aportes ni valor actual → total_invertido_ars=0, resto None."""
    inv = _crear_inversion(logged_in_client, "Vacía")
    inv_id = inv["id"]

    r = logged_in_client.get(f"{API}/inversiones/{inv_id}")
    assert r.status_code == 200, r.text
    data = r.json()

    assert data["total_invertido_ars"] == 0.0
    assert data["total_invertido_usd"] is None
    assert data["valor_actual_usd"] is None
    assert data["ganancia_perdida_ars"] is None
    assert data["ganancia_perdida_usd"] is None
    assert data["rendimiento_pct"] is None


def test_calculated_fields_with_contributions(logged_in_client):
    """Inversión con aportes y valor actual → campos calculados correctos."""
    inv = _crear_inversion(logged_in_client, "Calculada")
    inv_id = inv["id"]

    # Aporte 1: 100 ARS @ 1000 USD rate → 0.10 USD
    _crear_aporte(logged_in_client, inv_id, monto_ars=100, cotizacion_usd=1000, fecha="2026-01-15T00:00:00")
    # Aporte 2: 200 ARS @ 1100 USD rate → ~0.1818 USD
    _crear_aporte(logged_in_client, inv_id, monto_ars=200, cotizacion_usd=1100, fecha="2026-06-15T00:00:00")

    # Actualizar valor actual: 400 ARS @ 1200 USD rate → 0.3333 USD
    r = logged_in_client.put(f"{API}/inversiones/{inv_id}", json={
        "valor_actual_ars": 400.0,
        "cotizacion_usd_actual": 1200.0,
    })
    assert r.status_code == 200, r.text

    data = r.json()

    assert data["total_invertido_ars"] == 300.0  # 100 + 200
    # total_invertido_usd = 100/1000 + 200/1100 ≈ 0.1 + 0.181818 = 0.281818
    # Note: SQLite Decimal precision limits the result — use abs tolerance
    assert data["total_invertido_usd"] == pytest.approx(0.28, abs=0.01)
    # valor_actual_usd = 400/1200 ≈ 0.333333
    assert data["valor_actual_usd"] == pytest.approx(0.33, abs=0.01)
    # ganancia_perdida_ars = 400 - 300 = 100
    assert data["ganancia_perdida_ars"] == 100.0
    # ganancia_perdida_usd ≈ 0.333333 - 0.281818 ≈ 0.051515
    assert data["ganancia_perdida_usd"] == pytest.approx(0.05, abs=0.01)
    # rendimiento_pct = (400/300 - 1) * 100 ≈ 33.33
    assert data["rendimiento_pct"] == pytest.approx(33.33, abs=0.01)


def test_calculated_fields_loss(logged_in_client):
    """Inversión con pérdida → ganancia_perdida_ars negativa."""
    inv = _crear_inversion(logged_in_client, "Pérdida")
    inv_id = inv["id"]

    # Invertir 1000 ARS
    _crear_aporte(logged_in_client, inv_id, monto_ars=1000, fecha="2026-01-15T00:00:00")

    # Valor actual menor: 800 ARS
    r = logged_in_client.put(f"{API}/inversiones/{inv_id}", json={"valor_actual_ars": 800.0})
    assert r.status_code == 200, r.text
    data = r.json()

    assert data["total_invertido_ars"] == 1000.0
    assert data["valor_actual_ars"] == 800.0
    assert data["ganancia_perdida_ars"] == -200.0  # 800 - 1000 = -200
    assert data["rendimiento_pct"] == pytest.approx(-20.0)  # (800/1000 - 1) * 100 = -20
