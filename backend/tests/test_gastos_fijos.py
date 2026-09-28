"""
Tests para gastos fijos recurrentes.
Cubre: creaci?n v?a es_fijo=True y sincronizaci?n con ciclos.
"""
from datetime import datetime, timedelta


def _payload_gasto(user_category_id: int, importe: float = 500.0, es_fijo: bool = False) -> dict:
    return {
        "importe": importe,
        "fecha": datetime.now().isoformat(),
        "descripcion": "Gas del hogar",
        "tipo": "gasto",
        "user_category_id": user_category_id,
        "es_fijo": es_fijo,
    }


def _crear_ingreso(logged_in_client, user_category_id: int, importe: float = 1000.0) -> dict:
    r = logged_in_client.post('/movimientos/', json={
        'importe': importe,
        'fecha': datetime.now().isoformat(),
        'descripcion': 'Sueldo',
        'tipo': 'ingreso',
        'user_category_id': user_category_id,
    })
    assert r.status_code == 200, r.text
    return r.json()


# ??? Crear movimiento como gasto fijo ?????????????????????????????????????????

def test_crear_movimiento_como_fijo_genera_template(logged_in_client, user_category_id):
    """Al crear un movimiento con es_fijo=True se crea el template de GastoFijo."""
    r = logged_in_client.post('/movimientos/', json=_payload_gasto(user_category_id, es_fijo=True))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data['gasto_fijo_id'] is not None
    assert data['is_auto_generated'] is False


def test_crear_movimiento_normal_no_genera_template(logged_in_client, user_category_id):
    """Sin es_fijo=True, no se crea ning?n template."""
    r = logged_in_client.post('/movimientos/', json=_payload_gasto(user_category_id, es_fijo=False))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data['gasto_fijo_id'] is None
    assert data['is_auto_generated'] is False


# ??? Sincronizaci?n con ciclo ?????????????????????????????????????????????????


def test_crear_ciclo_copia_gastos_fijos_activos(logged_in_client, user_category_id):
    template = logged_in_client.post('/movimientos/', json={
        **_payload_gasto(user_category_id, importe=800.0, es_fijo=True),
        'fecha': '2026-01-01T00:00:00',
    })
    assert template.status_code == 200, template.text
    gf_id = template.json()['gasto_fijo_id']

    ingreso = _crear_ingreso(logged_in_client, user_category_id, 3000.0)
    r_ciclo = logged_in_client.post('/ciclos/', json={
        'movimiento_origen_id': ingreso['id'],
        'fecha_fin': (datetime.now() + timedelta(days=20)).isoformat(),
        'ahorro_objetivo': 0,
    })
    assert r_ciclo.status_code == 201, r_ciclo.text

    gastos = r_ciclo.json()['resumen']['gastos_fijos']
    assert len(gastos) == 1
    assert gastos[0]['gasto_fijo_id'] == gf_id
    assert gastos[0]['monto_confirmado'] == 800.0
    assert gastos[0]['estado'] == 'comprometido'
