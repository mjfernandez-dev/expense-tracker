"""
Tests del endpoint de series de cuotas (POST /gastos-programados/serie).

Una serie genera N GastoProgramados de una vez: producto, importe de cuota,
cuota inicial/total (para registrar deudas ya en curso, solo cuotas restantes),
primer vencimiento y categoría. Vencimientos mensuales sucesivos.
"""
import calendar
from datetime import date, datetime, timedelta

from services import ciclo_time_service


def _hoy() -> datetime:
    return ciclo_time_service.ahora_buenos_aires()


def _sumar_meses(fecha: date, meses: int) -> date:
    y = fecha.year + (fecha.month - 1 + meses) // 12
    m = (fecha.month - 1 + meses) % 12 + 1
    d = min(fecha.day, calendar.monthrange(y, m)[1])
    return date(y, m, d)


def _ingreso(user_category_id: int, importe: float = 2000.0) -> dict:
    return {
        "importe": importe,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Sueldo",
        "tipo": "ingreso",
        "user_category_id": user_category_id,
    }


def _serie_payload(user_category_id: int, **overrides) -> dict:
    payload = {
        "producto": "Zapatillas",
        "importe": 20000.0,
        "cuota_inicial": 4,
        "cuota_total": 6,
        "primer_vencimiento": (_hoy().date() + timedelta(days=14)).isoformat(),
        "user_category_id": user_category_id,
    }
    payload.update(overrides)
    return payload


# ── 1. La serie genera las N cuotas restantes con vencimientos mensuales ─────

def test_serie_crea_cuotas_restantes_con_vencimiento_mensual(logged_in_client, user_category_id):
    primer = _hoy().date() + timedelta(days=14)

    r = logged_in_client.post("/gastos-programados/serie", json=_serie_payload(user_category_id, importe=15000.0))
    assert r.status_code == 201, r.text
    data = r.json()
    assert len(data) == 3  # cuotas 4, 5 y 6

    for i, gp in enumerate(data):
        n = 4 + i
        assert gp["descripcion"] == f"Zapatillas — cuota {n}/6"
        assert gp["cuota_actual"] == n
        assert gp["cuota_total"] == 6
        assert gp["importe"] == 15000.0
        assert gp["estado"] == "pendiente"
        assert gp["vencimiento"] == _sumar_meses(primer, i).isoformat()
        assert gp["user_category_id"] == user_category_id


# ── 2. Las vencimientos dentro del ciclo activo se reservan ──────────────────

def test_serie_reserva_cuotas_del_ciclo_activo(logged_in_client, user_category_id):
    ingreso = logged_in_client.post("/movimientos/", json=_ingreso(user_category_id, 200000.0)).json()
    logged_in_client.post("/ciclos/", json={
        "movimiento_origen_id": ingreso["id"],
        "fecha_fin": (_hoy() + timedelta(days=95)).isoformat(),
        "ahorro_objetivo": 0,
    })

    r = logged_in_client.post("/gastos-programados/serie", json=_serie_payload(user_category_id, importe=5000.0))
    assert r.status_code == 201, r.text
    gp_ids = {gp["id"] for gp in r.json()}

    resumen = logged_in_client.get("/ciclos/activo").json()["resumen"]
    items_programados = [i for i in resumen["presupuesto_items"] if i.get("gasto_programado_id")]
    assert {i["gasto_programado_id"] for i in items_programados} == gp_ids
    assert all(i["monto_estimado"] == 5000.0 for i in items_programados)
    assert all(i["confirmado"] is True for i in items_programados)


# ── 3. Validaciones de schema ────────────────────────────────────────────────

def test_serie_rechaza_cuota_inicial_mayor_al_total(logged_in_client, user_category_id):
    r = logged_in_client.post("/gastos-programados/serie", json=_serie_payload(
        user_category_id, cuota_inicial=7, cuota_total=6
    ))
    assert r.status_code >= 400
    assert "cuota" in r.text.lower()


def test_serie_rechaza_valores_no_positivos(logged_in_client, user_category_id):
    r = logged_in_client.post("/gastos-programados/serie", json=_serie_payload(
        user_category_id, cuota_inicial=0
    ))
    assert r.status_code >= 400


def test_serie_rechaza_vencimiento_pasado(logged_in_client, user_category_id):
    r = logged_in_client.post("/gastos-programados/serie", json=_serie_payload(
        user_category_id, primer_vencimiento=(_hoy().date() - timedelta(days=1)).isoformat()
    ))
    assert r.status_code >= 400
    assert "vencimiento" in r.text.lower()


def test_serie_rechaza_falta_de_categoria(logged_in_client):
    r = logged_in_client.post("/gastos-programados/serie", json=_serie_payload(None))
    assert r.status_code >= 400
    assert "categor" in r.text.lower()
