"""Tests del lector de tickets (/tickets/leer).

Cubren lo que puede romperse en silencio: que el lector no escriba nada en la
base, que sin credencial quede apagado en vez de romper, y que los limites de
archivo se apliquen antes de gastar una llamada al proveedor.
"""
from decimal import Decimal

import services.ticket_service as ticket_service

CREDENCIAL = {
    "proveedor": "llamacloud",
    "nombre": "LlamaCloud principal",
    "clave": "llx-1234567890abcdef1234567890abcdef",
    "tier": "agentic_plus",
}

TICKET_FAKE = ticket_service.TicketExtraido(
    comercio="Vea Rio IV - Shopping",
    total=21349.13,
    subtotal_sin_descuentos=24629.13,
    descuentos=3280.0,
    descuentos_detalle=[
        ticket_service.TicketDescuentoExtraido(descripcion="OFERTA QUESO LS", importe=1440.0),
    ],
    items=[
        ticket_service.TicketItemExtraido(
            descripcion="Queso LS Cremon Light Pote 280GR POT 28 (21,00)",
            cantidad=1.0,
            importe_total=4290.0,
        ),
        ticket_service.TicketItemExtraido(
            descripcion="Papa Granel S/E 1 Kg S/E 1 Kg",
            cantidad=1.044,
            importe_total=3026.56,
        ),
    ],
)


def _crear_credencial(client):
    r = client.post("/api/configuracion/credenciales", json=CREDENCIAL)
    assert r.status_code == 200, r.text


def _subir(client, contenido=b"imagen", tipo="image/jpeg"):
    return client.post(
        "/api/tickets/leer",
        files={"archivo": ("ticket.jpg", contenido, tipo)},
    )


def test_sin_autenticacion_devuelve_401(client):
    assert _subir(client).status_code == 401


def test_sin_credencial_activa_devuelve_503(logged_in_client):
    r = _subir(logged_in_client)

    assert r.status_code == 503, r.text
    assert "Integraciones" in r.json()["detail"]


def test_tipo_no_soportado_devuelve_415(logged_in_client):
    _crear_credencial(logged_in_client)

    r = _subir(logged_in_client, tipo="application/pdf")

    assert r.status_code == 415, r.text


def test_archivo_vacio_devuelve_400(logged_in_client):
    _crear_credencial(logged_in_client)

    r = _subir(logged_in_client, contenido=b"")

    assert r.status_code == 400, r.text


def test_archivo_demasiado_grande_devuelve_413(logged_in_client, monkeypatch):
    monkeypatch.setattr(ticket_service, "MAX_BYTES", 10)
    _crear_credencial(logged_in_client)

    r = _subir(logged_in_client, contenido=b"x" * 11)

    assert r.status_code == 413, r.text


def test_lee_el_ticket_y_no_crea_movimientos(logged_in_client, db_session, monkeypatch):
    _crear_credencial(logged_in_client)
    monkeypatch.setattr(ticket_service, "extraer_ticket", lambda *a, **k: TICKET_FAKE)

    r = _subir(logged_in_client)

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["comercio"] == "Vea Rio IV - Shopping"
    assert data["total"] == 21349.13
    assert data["subtotal"] == 24629.13
    assert len(data["items"]) == 2
    assert data["descuentos"][0]["descripcion"] == "OFERTA QUESO LS"

    # El lector precarga: no persiste nada (S4).
    assert db_session.execute(
        __import__("sqlalchemy").text("SELECT COUNT(*) FROM movimientos")
    ).scalar() == 0


def test_limpia_el_ruido_de_impresion(logged_in_client, monkeypatch):
    _crear_credencial(logged_in_client)
    monkeypatch.setattr(ticket_service, "extraer_ticket", lambda *a, **k: TICKET_FAKE)

    items = _subir(logged_in_client).json()["items"]

    assert items[0]["descripcion"] == "Queso LS Cremon Light Pote 280GR POT 28"
    assert items[1]["descripcion"] == "Papa Granel S/E 1 Kg"
    assert items[1]["cantidad"] == 1.044


def test_cuota_agotada_devuelve_402_con_instruccion(logged_in_client, monkeypatch):
    _crear_credencial(logged_in_client)

    def _sin_creditos(*args, **kwargs):
        raise RuntimeError("402 quota exceeded for this organization")

    monkeypatch.setattr(ticket_service, "extraer_ticket", _sin_creditos)

    r = _subir(logged_in_client)

    assert r.status_code == 402, r.text
    assert "Integraciones" in r.json()["detail"]


def test_error_del_proveedor_devuelve_502_sin_filtrar_detalle(logged_in_client, monkeypatch):
    _crear_credencial(logged_in_client)

    def _falla(*args, **kwargs):
        raise RuntimeError("internal stack trace with secret llx-abc")

    monkeypatch.setattr(ticket_service, "extraer_ticket", _falla)

    r = _subir(logged_in_client)

    assert r.status_code == 502, r.text
    assert "llx-abc" not in r.text


def test_clave_invalida_manda_a_integraciones_y_no_devuelve_401(logged_in_client, monkeypatch):
    """Una key revocada no es una sesion vencida: si devolvieramos 401 el
    frontend intentaria refrescar el token y el usuario veria un logout."""
    _crear_credencial(logged_in_client)

    class AuthenticationError(Exception):
        status_code = 401
        message = "Invalid API Key. Please check your region."

        def __str__(self):
            return "Error code: 401 - {'detail': 'Invalid API Key.'}"

    def _clave_invalida(*args, **kwargs):
        raise AuthenticationError()

    monkeypatch.setattr(ticket_service, "extraer_ticket", _clave_invalida)

    r = _subir(logged_in_client)

    assert r.status_code == 502, r.text
    assert "Integraciones" in r.json()["detail"]
    assert "no es válida" in r.json()["detail"]


def test_otro_usuario_sin_credencial_no_usa_la_ajena(logged_in_client, second_logged_in_client):
    _crear_credencial(logged_in_client)

    r = _subir(second_logged_in_client)

    assert r.status_code == 503, r.text


def test_limpiar_descripcion_es_idempotente():
    assert ticket_service.limpiar_descripcion("Queso (21,00)") == "Queso"
    assert ticket_service.limpiar_descripcion("Queso") == "Queso"
    assert ticket_service.limpiar_descripcion("Papa S/E 1 Kg S/E 1 Kg") == "Papa S/E 1 Kg"


def test_decimal_no_pierde_centavos():
    assert ticket_service._decimal(21349.13) == Decimal("21349.13")
    assert ticket_service._decimal(None) is None


# ============== DESCUENTOS ATRIBUIDOS AL PRECIO DE CADA RENGLÓN ==============

def test_atribuye_el_descuento_al_producto_que_nombra():
    """'OFERTA QUESO LS' descuenta el queso, no el promedio del ticket."""
    atribuidos = ticket_service.atribuir_descuentos(
        nombres=["Queso LS Cremon 280g", "Papa Granel 1 Kg"],
        importes_lista=[Decimal("4290.00"), Decimal("3026.56")],
        descuentos=[("OFERTA QUESO LS", Decimal("1440.00"))],
    )

    assert atribuidos == [Decimal("1440.00"), Decimal("0.00")]


def test_prorratea_el_descuento_que_no_nombra_ningun_producto():
    atribuidos = ticket_service.atribuir_descuentos(
        nombres=["Producto Uno", "Producto Dos"],
        importes_lista=[Decimal("300.00"), Decimal("100.00")],
        descuentos=[("DESCUENTO GENERAL", Decimal("40.00"))],
    )

    assert atribuidos == [Decimal("30.00"), Decimal("10.00")]


def test_nunca_descuenta_mas_que_el_precio_del_renglon():
    """El sobrante de un descuento mayor al precio se prorratea entre los demás."""
    atribuidos = ticket_service.atribuir_descuentos(
        nombres=["Queso Cremon", "Papa Granel"],
        importes_lista=[Decimal("100.00"), Decimal("100.00")],
        descuentos=[("OFERTA QUESO", Decimal("150.00"))],
    )

    assert atribuidos == [Decimal("100.00"), Decimal("50.00")]


def test_el_prorrateo_conserva_los_centavos():
    """Repartir 0,10 entre tres líneas iguales no puede perder centavos."""
    atribuidos = ticket_service.atribuir_descuentos(
        nombres=["Uno Grande", "Dos Grande", "Tres Grande"],
        importes_lista=[Decimal("10.00"), Decimal("10.00"), Decimal("10.00")],
        descuentos=[("SELLO", Decimal("0.10"))],
    )

    assert sum(atribuidos) == Decimal("0.10")


def test_ajusta_el_total_solo_por_ruido_de_redondeo():
    finales = ticket_service._ajustar_al_total(
        [Decimal("10.00"), Decimal("20.00")], Decimal("30.01")
    )

    assert sum(finales) == Decimal("30.01")


def test_no_esconde_una_diferencia_grande_contra_el_total():
    """Un renglón que el modelo no leyó tiene que quedar visible, no repartido."""
    finales = [Decimal("10.00"), Decimal("20.00")]

    assert ticket_service._ajustar_al_total(finales, Decimal("100.00")) == finales


def test_usa_subtotal_menos_total_si_el_modelo_no_devolvio_el_descuento():
    extraido = ticket_service.TicketExtraido(
        total=90.0,
        subtotal_sin_descuentos=100.0,
        items=[
            ticket_service.TicketItemExtraido(descripcion="Uno", importe_total=50.0),
            ticket_service.TicketItemExtraido(descripcion="Dos", importe_total=50.0),
        ],
    )

    descuentos = ticket_service._descuentos_del_ticket(extraido)

    assert descuentos == [("Descuentos del ticket", Decimal("10.00"))]


def test_lee_el_ticket_con_el_precio_final_por_renglon(logged_in_client, monkeypatch):
    """El importe que se lleva al movimiento ya tiene el descuento aplicado."""
    _crear_credencial(logged_in_client)
    monkeypatch.setattr(ticket_service, "extraer_ticket", lambda *a, **k: TICKET_FAKE)

    items = _subir(logged_in_client).json()["items"]

    assert items[0]["importe_lista"] == 4290.0
    assert items[0]["descuento"] == 1440.0
    assert items[0]["importe"] == 2850.0
    assert items[1]["importe_lista"] == 3026.56
    assert items[1]["descuento"] == 0.0
    assert items[1]["importe"] == 3026.56
