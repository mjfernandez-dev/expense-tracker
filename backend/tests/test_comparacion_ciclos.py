"""Comparación de gasto acumulado entre el ciclo activo y el ciclo anterior.

Regla S1: el resumen del ciclo expone comparacion_anterior con el gasto
acumulado del ciclo anterior al mismo punto de comparación.
Regla S2: el punto de comparación es "falta X días" (ancla dias_restantes).
Regla S3: si ese punto cae antes del inicio del ciclo anterior, se cae a
"dia_transcurrido" (mismo día transcurrido desde el inicio).
Regla S4: sin ciclo anterior disponible, comparacion_anterior es None.
"""
from datetime import timedelta

from services import ciclo_time_service


def _crear_ciclo(client, fin_dias: int) -> dict:
    ahora = ciclo_time_service.ahora_buenos_aires()
    r = client.post("/ciclos/", json={
        "fecha_fin": (ahora + timedelta(days=fin_dias)).isoformat(),
        "ahorro_objetivo": 0,
    })
    assert r.status_code == 201, r.text
    return r.json()


def _patch_inicio(client, ciclo_id: int, dias_atraso: int) -> None:
    ahora = ciclo_time_service.ahora_buenos_aires()
    r = client.patch(f"/ciclos/{ciclo_id}", json={
        "fecha_inicio": (ahora - timedelta(days=dias_atraso)).isoformat(),
    })
    assert r.status_code == 200, r.text


def _gasto(
    client,
    user_category_id: int,
    importe: float,
    fecha=None,
    presupuesto_item_id: int | None = None,
) -> dict:
    ahora = ciclo_time_service.ahora_buenos_aires()
    payload = {
        "importe": importe,
        "fecha": fecha.isoformat() if hasattr(fecha, "isoformat") else (fecha or ahora.isoformat()),
        "descripcion": "Pago test",
        "tipo": "gasto",
        "user_category_id": user_category_id,
    }
    if presupuesto_item_id is not None:
        payload["presupuesto_item_id"] = presupuesto_item_id
    r = client.post("/movimientos/", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _confirmar_presupuesto(client, ciclo_id: int, monto: float) -> dict:
    r = client.post(f"/ciclos/{ciclo_id}/presupuesto/", json={
        "items": [{"monto_estimado": monto, "confirmado": True, "descripcion": "Alquiler"}]
    })
    assert r.status_code == 200, r.text
    return r.json()["resumen"]["presupuesto_items"][0]


def _resumen_ciclo_activo(client) -> dict:
    r = client.get("/ciclos/activo")
    assert r.status_code == 200, r.text
    return r.json()["resumen"]


def test_comparacion_total_y_libre_con_ancla_dias_restantes(logged_in_client, user_category_id):
    cliente = logged_in_client
    ahora = ciclo_time_service.ahora_buenos_aires()

    # Ciclo A (anterior): ventana de 30 días atrás, con presupuesto y gastos
    ciclo_a = _crear_ciclo(cliente, fin_dias=20)
    _patch_inicio(cliente, ciclo_a["id"], dias_atraso=30)
    item_a = _confirmar_presupuesto(cliente, ciclo_a["id"], 1000.0)

    fecha_antes_corte = (ahora - timedelta(days=12)).isoformat()
    fecha_despues_corte = (ahora - timedelta(days=8)).isoformat()
    _gasto(cliente, user_category_id, 250.0, fecha=fecha_antes_corte)
    _gasto(cliente, user_category_id, 150.0, fecha=fecha_antes_corte)
    _gasto(cliente, user_category_id, 200.0, fecha=fecha_antes_corte, presupuesto_item_id=item_a["id"])
    _gasto(cliente, user_category_id, 100.0, fecha=fecha_despues_corte)

    # Cierre de A y creación del ciclo B de 10 días
    r = cliente.delete(f"/ciclos/{ciclo_a['id']}")
    assert r.status_code == 200, r.text
    ciclo_b = _crear_ciclo(cliente, fin_dias=10)
    item_b = _confirmar_presupuesto(cliente, ciclo_b["id"], 1000.0)
    _gasto(cliente, user_category_id, 200.0, presupuesto_item_id=item_b["id"])
    _gasto(cliente, user_category_id, 50.0)

    comp = _resumen_ciclo_activo(cliente)["comparacion_anterior"]

    # A la falta de 11 días del ciclo B, el punto de A es su fin - 10 días
    assert comp["ciclo_anterior_id"] == ciclo_a["id"]
    assert comp["ancla"] == "dias_restantes"
    assert comp["dias_comparados"] == 11
    # Antes del corte de A: 250 + 150 libres + 200 vinculado; el de $100 queda fuera
    assert comp["total_anterior"] == 600.0
    assert comp["libre_anterior"] == 400.0
    # Ciclo B hasta hoy: 200 vinculado + 50 libre
    assert comp["total_actual"] == 250.0
    assert comp["libre_actual"] == 50.0


def test_comparacion_fallback_dia_transcurrido(logged_in_client, user_category_id):
    cliente = logged_in_client
    ahora = ciclo_time_service.ahora_buenos_aires()

   # Ciclo A con inicio 30 días atrás; el gasto queda en su primer día
    ciclo_a = _crear_ciclo(cliente, fin_dias=20)
    _patch_inicio(cliente, ciclo_a["id"], dias_atraso=30)
    gasto_adentro = (ahora - timedelta(days=30) + timedelta(seconds=10)).isoformat()
    _gasto(cliente, user_category_id, 77.5, fecha=gasto_adentro)

    r = cliente.delete(f"/ciclos/{ciclo_a['id']}")
    assert r.status_code == 200, r.text

    # B de 40 días: comparar 41 días antes del fin de A cae antes del inicio de A
    # -> fallback al día transcurrido de B (día 1: primer día de A)
    ciclo_b = _crear_ciclo(cliente, fin_dias=40)

    comp = _resumen_ciclo_activo(cliente)["comparacion_anterior"]

    assert comp["ciclo_anterior_id"] == ciclo_a["id"]
    assert comp["ancla"] == "dia_transcurrido"
    assert comp["dias_comparados"] == 1
    assert comp["total_anterior"] == 77.5
    assert comp["libre_anterior"] == 77.5
    assert comp["total_actual"] == 0.0
    assert comp["libre_actual"] == 0.0


def test_comparacion_sin_ciclo_anterior_es_none(logged_in_client, user_category_id):
    cliente = logged_in_client
    _crear_ciclo(cliente, fin_dias=10)

    resumen = _resumen_ciclo_activo(cliente)

    assert resumen["comparacion_anterior"] is None


def test_comparacion_ciclo_anterior_degenerado_es_none(logged_in_client, user_category_id, db_session):
    cliente = logged_in_client
    import models
    from decimal import Decimal
    from services import ciclo_service

    # Ciclo anterior "degenerado" (fecha_fin <= fecha_inicio) → None, sin excepción
    ciclo_a = _crear_ciclo(cliente, fin_dias=20)
    r = cliente.delete(f"/ciclos/{ciclo_a['id']}")
    assert r.status_code == 200, r.text
    ciclo_b = _crear_ciclo(cliente, fin_dias=10)

    previo = db_session.query(models.Ciclo).filter(models.Ciclo.id == ciclo_a["id"]).first()
    previo.fecha_fin = previo.fecha_inicio
    db_session.commit()

    ciclo_b_model = db_session.query(models.Ciclo).filter(models.Ciclo.id == ciclo_b["id"]).first()
    hoy = ciclo_time_service.ahora_buenos_aires().date()

    comp = ciclo_service.calcular_comparacion_ciclo_anterior(
        db_session, ciclo_b_model, ciclo_b_model.user_id, Decimal("0"), Decimal("0"), 5, hoy
    )
    assert comp is None
