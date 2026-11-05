"""S5 (plantilla-matriz): los gastos sin presupuesto exponen ids de categoría.

La matriz de la plantilla junta presupuesto, ejecutado y sugerencia por id
(user_category_id / categoria_id); el backend debe exponer esos ids en las
filas de gastos_sin_presupuesto en lugar de quedar solo el nombre."""
from datetime import datetime, timedelta

import models

from services import ciclo_time_service


def test_gasto_sin_presupuesto_incluye_ids_categoria(logged_in_client, user_category_id, db_session):
    cliente = logged_in_client
    ahora = ciclo_time_service.ahora_buenos_aires()

    categoria_sistema = models.Category(nombre="Plantilla sys cat")
    db_session.add(categoria_sistema)
    db_session.commit()

    r = cliente.post("/ciclos/", json={
        "fecha_fin": (ahora + timedelta(days=15)).isoformat(),
        "ahorro_objetivo": 0,
    })
    assert r.status_code == 201, r.text
    ciclo = r.json()

    # Gasto con categoría personalizada -> user_category_id en la fila
    r = cliente.post("/movimientos/", json={
        "importe": 50.0,
        "fecha": ahora.isoformat(),
        "descripcion": "Gasto user",
        "tipo": "gasto",
        "user_category_id": user_category_id,
    })
    assert r.status_code == 200, r.text

    # Gasto con categoría del sistema -> categoria_id y user_category_id None
    r = cliente.post("/movimientos/", json={
        "importe": 30.0,
        "fecha": ahora.isoformat(),
        "descripcion": "Gasto sys",
        "tipo": "gasto",
        "categoria_id": categoria_sistema.id,
    })
    assert r.status_code == 200, r.text

    r = cliente.get(f"/ciclos/{ciclo['id']}")
    assert r.status_code == 200, r.text
    filas = r.json()["resumen"]["gastos_sin_presupuesto"]

    fila_user = next(f for f in filas if f["importe"] == 50.0)
    fila_sys = next(f for f in filas if f["importe"] == 30.0)

    assert fila_user["user_category_id"] == user_category_id
    assert fila_user["categoria_id"] is None
    assert fila_sys["categoria_id"] == categoria_sistema.id
    assert fila_sys["user_category_id"] is None
