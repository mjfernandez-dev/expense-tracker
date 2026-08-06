"""
Tests para gastos fijos recurrentes.
Cubre: creaci?n v?a es_fijo=True, CRUD del template y sincronizaci?n con ciclos.
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


# ??? Listar gastos fijos ??????????????????????????????????????????????????????

def test_listar_gastos_fijos_vacio(logged_in_client):
    """Sin gastos fijos, devuelve lista vac?a."""
    r = logged_in_client.get('/gastos-fijos/')
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_listar_gastos_fijos_con_datos(logged_in_client, user_category_id):
    """Luego de crear un gasto fijo, aparece en la lista con stats."""
    logged_in_client.post('/movimientos/', json=_payload_gasto(user_category_id, importe=1200.0, es_fijo=True))

    r = logged_in_client.get('/gastos-fijos/')
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data) == 1
    gf = data[0]
    assert gf['activo'] is True
    assert gf['max_importe'] == 1200.0
    assert gf['ultimo_importe'] == 1200.0
    assert gf['total_meses'] == 1


# ??? Toggle activo ????????????????????????????????????????????????????????????

def test_toggle_activo(logged_in_client, user_category_id):
    """Se puede pausar y reactivar un gasto fijo."""
    logged_in_client.post('/movimientos/', json=_payload_gasto(user_category_id, es_fijo=True))
    lista = logged_in_client.get('/gastos-fijos/').json()
    gf_id = lista[0]['id']

    r = logged_in_client.put(f'/gastos-fijos/{gf_id}', json={'activo': False})
    assert r.status_code == 200, r.text
    assert r.json()['activo'] is False

    r = logged_in_client.put(f'/gastos-fijos/{gf_id}', json={'activo': True})
    assert r.status_code == 200, r.text
    assert r.json()['activo'] is True


def test_toggle_gasto_fijo_ajeno_retorna_404(logged_in_client):
    """No se puede modificar un gasto fijo de otro usuario."""
    r = logged_in_client.put('/gastos-fijos/999999', json={'activo': False})
    assert r.status_code == 404, r.text


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


# ??? Autenticaci?n ????????????????????????????????????????????????????????????

def test_gastos_fijos_sin_auth_retorna_401(client):
    """Sin autenticaci?n, los endpoints retornan 401."""
    assert client.get('/gastos-fijos/').status_code == 401
    assert client.put('/gastos-fijos/1', json={'activo': False}).status_code == 401
