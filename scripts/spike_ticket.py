"""Spike del lector de tickets: una foto -> JSON extraido + nota propuesta.

No forma parte de la app: sirve para validar la calidad real de LlamaParse
sobre un ticket argentino antes de construir endpoint, UI y tests encima.

Uso:
    python scripts/spike_ticket.py ruta/al/ticket.jpg [llx-api-key]

La clave se puede pasar como segundo argumento o por LLAMA_CLOUD_API_KEY.
En la app la clave vive cifrada en la DB (Cuenta -> Integraciones); este
script es de un solo uso y no la lee de ahi a proposito.

Flujo real del SDK (llama-cloud 2.20.0, verificado por introspeccion):

    1. client.files.create(file=..., purpose="extract") -> file.id
    2. client.extract.run(file_input=file.id, configuration={...}) -> ExtractV2Job
    3. job.extract_result es un dict; job.usage trae el consumo

`extract.run` NO acepta data_schema/tier como kwargs sueltos: todo va dentro
de `configuration`. Los tiers validos de extract son
turbo | cost_effective | agentic | agentic_plus (`fast` es tier de parse).
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()

TIER = "agentic_plus"


class TicketItem(BaseModel):
    descripcion: str = Field(description="Nombre del producto tal como figura en el ticket")
    cantidad: Optional[float] = Field(
        default=None,
        description="Cantidad comprada. Para productos por peso es el peso en kg (ej. 0.832)",
    )
    importe_total: Optional[float] = Field(
        default=None,
        description="Importe de la linea ANTES de descuentos, tal como lo imprime el ticket",
    )


class Descuento(BaseModel):
    descripcion: str = Field(description="Texto del descuento tal como figura (ej. OFERTA QUESO LS)")
    importe: float = Field(description="Importe del descuento, en positivo")


class TicketExtraido(BaseModel):
    comercio: Optional[str] = Field(default=None, description="Nombre del comercio")
    # Sin fecha a proposito: la fecha del movimiento la define el humano al
    # crearlo. Pedirsela al modelo solo agrega un campo donde puede inventar.
    total: Optional[float] = Field(default=None, description="Importe total abonado (TOTAL, no el subtotal)")
    subtotal_sin_descuentos: Optional[float] = Field(
        default=None, description="Subtotal antes de descuentos, si el ticket lo imprime"
    )
    descuentos: Optional[float] = Field(
        default=None, description="Suma de todos los descuentos, en positivo"
    )
    descuentos_detalle: list[Descuento] = Field(
        default_factory=list, description="Descuentos individuales que imprime el ticket"
    )
    items: list[TicketItem] = Field(default_factory=list, description="Detalle de productos")


def _money(value: Optional[float]) -> str:
    if value is None:
        return "s/d"
    entero, decimales = f"{value:,.2f}".split(".")
    return f"${entero.replace(',', '.')},{decimales}"


import re

# Codigo de IVA que el ticket imprime pegado al nombre del producto: "(21,00)".
_CODIGO_IVA = re.compile(r"\s*\(\d{1,2},\d{1,2}\)\s*$")
# El OCR a veces repite el sufijo del nombre: "Papa Granel S/E 1 Kg S/E 1 Kg".
_SUFIJO_REPETIDO = re.compile(r"^(.+?)\s+(.{4,}?)\s+\2$")


def _limpiar_descripcion(descripcion: str) -> str:
    """Saca ruido de impresion sin perder el nombre del producto.

    Se limpia al renderizar la nota, no en la extraccion: el JSON se queda
    fiel al ticket y el texto que lee el humano se queda legible.
    """
    limpio = _CODIGO_IVA.sub("", descripcion).strip()
    repetido = _SUFIJO_REPETIDO.match(limpio)
    if repetido:
        limpio = f"{repetido.group(1)} {repetido.group(2)}"
    return limpio


def _cantidad(valor: float) -> str:
    return f"{valor:g}".replace(".", ",")


def formatear_nota(ticket: TicketExtraido) -> str:
    """Texto legible que iria a Movimiento.nota (una linea por item)."""
    lineas: list[str] = []
    encabezado = ticket.comercio or ""
    if encabezado:
        lineas.append(encabezado)
    for item in ticket.items:
        descripcion = _limpiar_descripcion(item.descripcion)
        cantidad = f" x{_cantidad(item.cantidad)}" if item.cantidad and item.cantidad != 1 else ""
        lineas.append(f"{descripcion}{cantidad} — {_money(item.importe_total)}")
    if ticket.descuentos_detalle:
        for descuento in ticket.descuentos_detalle:
            lineas.append(f"{descuento.descripcion} — -{_money(descuento.importe)}")
    elif ticket.descuentos:
        lineas.append(f"Descuentos — -{_money(ticket.descuentos)}")
    lineas.append(f"Total — {_money(ticket.total)}")
    return "\n".join(lineas)


def verificar_aritmetica(ticket: TicketExtraido) -> list[str]:
    """Chequeos que el humano no deberia tener que hacer a mano.

    Si la suma de items no cierra contra el subtotal, o el total no cierra
    contra subtotal - descuentos, la extraccion perdio o invento una linea.
    """
    problemas: list[str] = []
    suma_items = round(sum(i.importe_total or 0 for i in ticket.items), 2)

    if ticket.subtotal_sin_descuentos is not None:
        if abs(suma_items - ticket.subtotal_sin_descuentos) > 0.05:
            problemas.append(
                f"items suman {suma_items} pero el subtotal impreso es {ticket.subtotal_sin_descuentos}"
            )
    if ticket.total is not None:
        esperado = round((ticket.subtotal_sin_descuentos or suma_items) - (ticket.descuentos or 0), 2)
        if abs(esperado - ticket.total) > 0.05:
            problemas.append(f"subtotal - descuentos da {esperado} pero el total extraido es {ticket.total}")
    if ticket.descuentos_detalle:
        suma_descuentos = round(sum(d.importe for d in ticket.descuentos_detalle), 2)
        if ticket.descuentos is not None and abs(suma_descuentos - ticket.descuentos) > 0.05:
            problemas.append(
                f"descuentos detallados suman {suma_descuentos} pero el total de descuentos es {ticket.descuentos}"
            )
    return problemas


def extraer(ruta: str, api_key: str, fresco: bool = False) -> tuple[TicketExtraido, dict]:
    from llama_cloud import LlamaCloud

    cliente = LlamaCloud(api_key=api_key)

    with open(ruta, "rb") as archivo:
        subido = cliente.files.create(
            file=(os.path.basename(ruta), archivo.read(), "image/jpeg"),
            purpose="extract",
        )

    trabajo = cliente.extract.run(
        file_input=subido.id,
        configuration={
            "data_schema": TicketExtraido.model_json_schema(),
            "tier": TIER,
            "extraction_target": "per_doc",
            "confidence_scores": True,
            "disable_cache": fresco,
            "system_prompt": (
                "Extraes datos de un ticket de supermercado argentino. Copia los valores "
                "tal como estan impresos. El campo 'total' es el importe final abonado, "
                "no el subtotal sin descuentos. No extraigas la fecha."
            ),
        },
        polling_timeout=300,
        verbose=True,
    )

    if trabajo.status != "COMPLETED":
        raise RuntimeError(f"Job {trabajo.status}: {trabajo.error_message}")

    resultado = trabajo.extract_result
    if isinstance(resultado, list):
        resultado = resultado[0] if resultado else {}
    if not isinstance(resultado, dict):
        raise RuntimeError(f"Forma de extract_result inesperada: {type(resultado).__name__}")

    # Con confidence_scores=True el SDK agrega metadatos por campo: se separan
    # para no romper la validacion del schema de negocio.
    datos = resultado.get("data", resultado)
    return TicketExtraido.model_validate(datos), _consumo(cliente, trabajo)


def _consumo(cliente, trabajo) -> dict:
    """`extract.run` no devuelve el uso: hay que releer el job terminado.

    El costo real importa porque define cuantos tickets entran en los 10.000
    creditos gratis por mes.
    """
    if trabajo.usage:
        return trabajo.usage.model_dump()
    try:
        recargado = cliente.extract.get(trabajo.id)
        if recargado.usage:
            return recargado.usage.model_dump()
    except Exception as error:  # noqa: BLE001 - el spike debe seguir aunque falle
        return {"error": f"no se pudo leer el consumo: {error}"}
    return {}


def main() -> int:
    argumentos = [a for a in sys.argv[1:] if a != "--fresh"]
    fresco = "--fresh" in sys.argv
    if len(argumentos) not in (1, 2):
        print("Uso: python scripts/spike_ticket.py ruta/al/ticket.jpg [llx-api-key] [--fresh]")
        print("  --fresh  ignora la cache de LlamaCloud (gasta creditos, pero informa el consumo real)")
        return 2
    api_key = argumentos[1] if len(argumentos) == 2 else os.environ.get("LLAMA_CLOUD_API_KEY", "")
    if not api_key:
        print("Falta la API key: pasala como segundo argumento o en LLAMA_CLOUD_API_KEY")
        return 2

    inicio = time.perf_counter()
    ticket, consumo = extraer(argumentos[0], api_key, fresco=fresco)
    segundos = time.perf_counter() - inicio

    print(f"\nLatencia: {segundos:.1f}s{' (cache)' if not fresco else ''}")
    print(f"Consumo:  {json.dumps(consumo, ensure_ascii=False)}")
    print("\n--- JSON extraido ---")
    print(json.dumps(ticket.model_dump(), ensure_ascii=False, indent=2))
    print("\n--- Verificacion aritmetica ---")
    problemas = verificar_aritmetica(ticket)
    print("\n".join(f"  FALLA: {p}" for p in problemas) if problemas else "  OK: items, subtotal, descuentos y total cierran")
    print("\n--- Nota propuesta para Movimiento.nota ---")
    print(formatear_nota(ticket))
    return 0 if not problemas else 1


if __name__ == "__main__":
    raise SystemExit(main())
