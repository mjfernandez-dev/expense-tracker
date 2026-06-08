"""
Tests para el módulo de Inversiones (FCI tracking).
Cubre CRUD de inversiones y carga de historial de precios.
"""
from decimal import Decimal
from datetime import datetime, timezone


def _inversion_payload() -> dict:
    return {
        "nombre": "SBS Renta Pesos",
        "ticker": "SBSRPEA",
        "cuotapartes": 100.0,
        "monto_invertido": 10000.0,
        "fecha_inversion": "2026-01-15T00:00:00",
        "notas": "Fondo de prueba",
    }


# ── CRUD Inversión ────────────────────────────────────────────────────────────


def test_listar_inversiones_vacio(logged_in_client):
    """Sin inversiones, devuelve lista vacía."""
    r = logged_in_client.get("/inversiones/")
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_crear_inversion(logged_in_client):
    """Crear una inversión básica."""
    r = logged_in_client.post("/inversiones/", json=_inversion_payload())
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["nombre"] == "SBS Renta Pesos"
    assert data["ticker"] == "SBSRPEA"
    assert data["activo"] is True
    assert "id" in data
    assert data["valor_actual"] is None  # sin historial todavía


def test_listar_inversiones_con_datos(logged_in_client):
    """Luego de crear, aparece en la lista."""
    logged_in_client.post("/inversiones/", json=_inversion_payload())
    r = logged_in_client.get("/inversiones/")
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data) == 1
    assert data[0]["nombre"] == "SBS Renta Pesos"


def test_obtener_inversion_detalle(logged_in_client):
    """GET /inversiones/{id} devuelve detalle con historial."""
    created = logged_in_client.post("/inversiones/", json=_inversion_payload()).json()
    inv_id = created["id"]

    r = logged_in_client.get(f"/inversiones/{inv_id}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["nombre"] == "SBS Renta Pesos"
    assert data["historial"] == []


def test_actualizar_inversion(logged_in_client):
    """PUT /inversiones/{id} actualiza campos."""
    created = logged_in_client.post("/inversiones/", json=_inversion_payload()).json()
    inv_id = created["id"]

    r = logged_in_client.put(f"/inversiones/{inv_id}", json={"nombre": "SBS Renta Plus"})
    assert r.status_code == 200, r.text
    assert r.json()["nombre"] == "SBS Renta Plus"


def test_eliminar_inversion(logged_in_client):
    """DELETE /inversiones/{id} elimina la inversión."""
    created = logged_in_client.post("/inversiones/", json=_inversion_payload()).json()
    inv_id = created["id"]

    r = logged_in_client.delete(f"/inversiones/{inv_id}")
    assert r.status_code == 204, r.text

    r = logged_in_client.get("/inversiones/")
    assert r.json() == []


def test_inversion_ajena_retorna_404(logged_in_client):
    """Inversión de otro usuario devuelve 404."""
    r = logged_in_client.get("/inversiones/999999")
    assert r.status_code == 404, r.text

    r = logged_in_client.put("/inversiones/999999", json={"nombre": "x"})
    assert r.status_code == 404, r.text

    r = logged_in_client.delete("/inversiones/999999")
    assert r.status_code == 404, r.text


# ── Historial de precios ──────────────────────────────────────────────────────


def test_agregar_historial(logged_in_client):
    """Agregar un precio histórico manual."""
    created = logged_in_client.post("/inversiones/", json=_inversion_payload()).json()
    inv_id = created["id"]

    hist_payload = {
        "fecha": "2026-06-01T00:00:00",
        "valor_cuota": 105.50,
    }
    r = logged_in_client.post(f"/inversiones/{inv_id}/historial", json=hist_payload)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["valor_cuota"] == 105.50
    assert data["fuente"] == "manual"


def test_historial_ajeno_retorna_404(logged_in_client):
    """No se puede agregar historial a inversión de otro."""
    r = logged_in_client.post("/inversiones/999999/historial", json={
        "fecha": "2026-06-01T00:00:00",
        "valor_cuota": 100.0,
    })
    assert r.status_code == 404, r.text


def test_historial_actualiza_valor_actual(logged_in_client):
    """Con historial de precio, el valor actual se calcula correctamente."""
    created = logged_in_client.post("/inversiones/", json=_inversion_payload()).json()
    inv_id = created["id"]

    # Agregar precio
    logged_in_client.post(f"/inversiones/{inv_id}/historial", json={
        "fecha": "2026-06-01T00:00:00",
        "valor_cuota": 110.0,
    })

    # Ver detalle
    r = logged_in_client.get(f"/inversiones/{inv_id}")
    data = r.json()
    # cuotapartes=100 * valor_cuota=110 = 11000
    assert data["valor_actual"] == 11000.0
    assert data["rendimiento_pct"] == 10.0  # (11000-10000)/10000 * 100
    assert data["ganancia_perdida"] == 1000.0


def test_historial_multiple_precios(logged_in_client):
    """Múltiples precios: se usa el último para valor actual."""
    created = logged_in_client.post("/inversiones/", json=_inversion_payload()).json()
    inv_id = created["id"]

    logged_in_client.post(f"/inversiones/{inv_id}/historial", json={
        "fecha": "2026-01-01T00:00:00",
        "valor_cuota": 100.0,
    })
    logged_in_client.post(f"/inversiones/{inv_id}/historial", json={
        "fecha": "2026-06-01T00:00:00",
        "valor_cuota": 120.0,
    })

    r = logged_in_client.get(f"/inversiones/{inv_id}")
    data = r.json()
    assert len(data["historial"]) == 2
    assert data["valor_actual"] == 12000.0  # 100 * 120


# ── Actualización automática (scraper) ────────────────────────────────────────


def test_actualizar_precio_sin_ticker(logged_in_client):
    """Inversión sin ticker devuelve 400 al intentar scraping."""
    created = logged_in_client.post("/inversiones/", json={
        "nombre": "Plazo Fijo",
        "monto_invertido": 5000.0,
    }).json()
    inv_id = created["id"]

    r = logged_in_client.post(f"/inversiones/{inv_id}/actualizar")
    assert r.status_code == 400, r.text
    assert "ticker" in r.text.lower() or "configurado" in r.text


def test_actualizar_precio_scraper_falla_gracia(logged_in_client):
    """Si el scraper falla, devuelve success=False sin error 500.
    Si funciona, devuelve success=True. Nunca 500."""
    created = logged_in_client.post("/inversiones/", json=_inversion_payload()).json()
    inv_id = created["id"]

    r = logged_in_client.post(f"/inversiones/{inv_id}/actualizar")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "success" in data
    assert "inversion_id" in data


# ── Sin cuotapartes ───────────────────────────────────────────────────────────


def test_inversion_sin_cuotapartes(logged_in_client):
    """Inversión sin cuotapartes no calcula valor actual."""
    created = logged_in_client.post("/inversiones/", json={
        "nombre": "Plazo Fijo",
        "monto_invertido": 5000.0,
    }).json()
    inv_id = created["id"]

    r = logged_in_client.get(f"/inversiones/{inv_id}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["cuotapartes"] is None
    assert data["valor_actual"] is None


# ── Auto-cálculo de cuotapartes ──────────────────────────────────────────


def test_actualizar_precio_auto_calcula_cuotapartes(logged_in_client):
    """Si no hay cuotapartes pero sí monto_invertido, al actualizar precio se calculan auto."""
    created = logged_in_client.post("/inversiones/", json={
        "nombre": "SBS Renta Pesos",
        "ticker": "SBSRPE",
        "monto_invertido": 1527069.78,
        "cuotapartes": None,
    }).json()
    inv_id = created["id"]
    assert created["cuotapartes"] is None

    r = logged_in_client.post(f"/inversiones/{inv_id}/actualizar")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"] is True
    assert data["valor_cuota"] is not None

    # Verificar que cuotapartes se haya calculado
    detalle = logged_in_client.get(f"/inversiones/{inv_id}").json()
    assert detalle["cuotapartes"] is not None
    assert detalle["cuotapartes"] > 0
    assert detalle["valor_actual"] is not None
    # Valor actual debe ser aprox monto_invertido
    assert abs(detalle["valor_actual"] - 1527069.78) < 1000

    # Segunda actualización: debe recalcular cuotapartes aunque ya tenga
    r2 = logged_in_client.post(f"/inversiones/{inv_id}/actualizar")
    assert r2.status_code == 200, r2.text
    detalle2 = logged_in_client.get(f"/inversiones/{inv_id}").json()
    assert detalle2["cuotapartes"] is not None
    assert detalle2["cuotapartes"] > 0
    # Sigue siendo aprox monto_invertido
    assert abs(detalle2["valor_actual"] - 1527069.78) < 1000
