"""Servicio del lector de tickets: foto -> datos estructurados.

Reglas que este modulo garantiza:

- **No persiste nada.** Devuelve los datos y el humano confirma con el flujo
  normal de movimientos, asi un parse equivocado nunca ensucia el libro.
- **La clave sale de la credencial activa del usuario**, no de una variable de
  entorno: sin credencial el lector responde 503 y la app sigue funcionando.
- **La imagen no se guarda**: se sube, se extrae y se borra del proveedor.
- **La fecha no se extrae.** La define el humano al crear el movimiento.
"""
from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal
from typing import List, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import schemas
from services import api_credential_service

TIER_DEFAULT = "agentic_plus"
TIMEOUT_EXTRACCION = 300.0
MAX_BYTES = 10 * 1024 * 1024
TIPOS_PERMITIDOS = {"image/jpeg", "image/png", "image/webp"}
EXTENSION_POR_TIPO = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

# Codigo de IVA que el ticket imprime pegado al nombre: "Queso ... (21,00)".
_CODIGO_IVA = re.compile(r"\s*\(\d{1,2},\d{1,2}\)\s*$")
# El OCR a veces repite el sufijo del nombre: "Papa Granel S/E 1 Kg S/E 1 Kg".
_SUFIJO_REPETIDO = re.compile(r"^(.+?)\s+(.{4,}?)\s+\2$")


class TicketItemExtraido(BaseModel):
    descripcion: str = Field(description="Nombre del producto tal como figura en el ticket")
    cantidad: Optional[float] = Field(
        default=None,
        description="Cantidad comprada. Para productos por peso es el peso en kg (ej. 0.832)",
    )
    importe_total: Optional[float] = Field(
        default=None,
        description="Importe de la linea ANTES de descuentos, tal como lo imprime el ticket",
    )


class TicketDescuentoExtraido(BaseModel):
    descripcion: str = Field(description="Texto del descuento tal como figura (ej. OFERTA QUESO LS)")
    importe: float = Field(description="Importe del descuento, en positivo")


class TicketExtraido(BaseModel):
    """Schema que se le pasa al proveedor. Sin fecha a proposito."""

    comercio: Optional[str] = Field(default=None, description="Nombre del comercio")
    total: Optional[float] = Field(
        default=None, description="Importe total abonado (TOTAL, no el subtotal)"
    )
    subtotal_sin_descuentos: Optional[float] = Field(
        default=None, description="Subtotal antes de descuentos, si el ticket lo imprime"
    )
    descuentos: Optional[float] = Field(
        default=None, description="Suma de todos los descuentos, en positivo"
    )
    descuentos_detalle: List[TicketDescuentoExtraido] = Field(
        default_factory=list, description="Descuentos individuales que imprime el ticket"
    )
    items: List[TicketItemExtraido] = Field(
        default_factory=list, description="Detalle de productos"
    )


SYSTEM_PROMPT = (
    "Extraes datos de un ticket de supermercado argentino. Copia los valores "
    "tal como estan impresos. El campo 'total' es el importe final abonado, "
    "no el subtotal sin descuentos. No extraigas la fecha."
)


def limpiar_descripcion(descripcion: str) -> str:
    """Saca ruido de impresion sin perder el nombre del producto.

    Se limpia aca y no en el cliente para que cualquier consumidor de la API
    reciba el mismo texto, y para poder testearlo sin levantar el frontend.
    """
    limpio = _CODIGO_IVA.sub("", descripcion).strip()
    repetido = _SUFIJO_REPETIDO.match(limpio)
    if repetido:
        limpio = f"{repetido.group(1)} {repetido.group(2)}"
    return limpio


def _decimal(valor: Optional[float]) -> Optional[Decimal]:
    if valor is None:
        return None
    return Decimal(str(valor)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _validar_archivo(contenido: bytes, tipo: str) -> None:
    if tipo not in TIPOS_PERMITIDOS:
        raise HTTPException(
            status_code=415,
            detail=f"Formato no soportado. Se aceptan: {', '.join(sorted(TIPOS_PERMITIDOS))}",
        )
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(contenido) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"La imagen supera el máximo de {MAX_BYTES // (1024 * 1024)} MB",
        )


def extraer_ticket(contenido: bytes, tipo: str, api_key: str, tier: str) -> TicketExtraido:
    """Llama al proveedor. Aislado para poder mockearlo en los tests."""
    from llama_cloud import LlamaCloud

    cliente = LlamaCloud(api_key=api_key)
    nombre = f"ticket.{EXTENSION_POR_TIPO.get(tipo, 'jpg')}"

    subido = cliente.files.create(
        file=(nombre, contenido, tipo),
        purpose="extract",
    )
    try:
        trabajo = cliente.extract.run(
            file_input=subido.id,
            configuration={
                "data_schema": TicketExtraido.model_json_schema(),
                "tier": tier,
                "extraction_target": "per_doc",
                "confidence_scores": True,
                "system_prompt": SYSTEM_PROMPT,
            },
            polling_timeout=TIMEOUT_EXTRACCION,
        )

        if trabajo.status != "COMPLETED":
            raise RuntimeError(f"La extracción terminó en estado {trabajo.status}: {trabajo.error_message}")

        resultado = trabajo.extract_result
        if isinstance(resultado, list):
            resultado = resultado[0] if resultado else {}
        if not isinstance(resultado, dict):
            raise RuntimeError(f"Forma de resultado inesperada: {type(resultado).__name__}")

        # Con confidence_scores el proveedor agrega metadatos por campo.
        datos = resultado.get("data", resultado)
        return TicketExtraido.model_validate(datos)
    finally:
        # La imagen no se conserva: se borra del proveedor apenas se extrae.
        try:
            cliente.files.delete(subido.id)
        except Exception:  # noqa: BLE001 - la limpieza no debe tapar el resultado
            pass


def _traducir_error(error: Exception) -> HTTPException:
    """Convierte el error del proveedor en algo accionable para el usuario.

    Los dos casos que importan son la cuota agotada y la clave invalida: en
    ambos el usuario tiene que ir a Integraciones, no probar con otra foto.

    Nunca se devuelve 401: el frontend lo interpreta como sesion vencida e
    intenta refrescar el token. El problema es de la credencial del proveedor,
    no de la sesion del usuario.
    """
    codigo = getattr(error, "status_code", None)
    texto = f"{error} {getattr(error, 'message', '')}".lower()

    if codigo == 402 or any(pista in texto for pista in ("quota", "insufficient", "credit")):
        return HTTPException(
            status_code=402,
            detail=(
                "La credencial activa de LlamaCloud se quedó sin créditos. "
                "Activá otra desde Cuenta → Integraciones."
            ),
        )

    if codigo in (401, 403) or any(
        pista in texto for pista in ("invalid api key", "unauthorized", "authentication")
    ):
        return HTTPException(
            status_code=502,
            detail=(
                "La credencial activa de LlamaCloud no es válida o fue revocada. "
                "Cargá una nueva en Cuenta → Integraciones."
            ),
        )

    return HTTPException(
        status_code=502,
        detail="No se pudo leer el ticket. Probá con otra foto o intentá de nuevo.",
    )


def leer_ticket(
    contenido: bytes,
    tipo: str,
    user_id: int,
    db: Session,
) -> schemas.TicketLeido:
    _validar_archivo(contenido, tipo)

    api_key = api_credential_service.obtener_clave_activa(user_id, db)
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "El lector de tickets está apagado: cargá una API key de LlamaCloud "
                "en Cuenta → Integraciones."
            ),
        )
    tier = api_credential_service.obtener_tier_activo(user_id, db) or TIER_DEFAULT

    try:
        extraido = extraer_ticket(contenido, tipo, api_key, tier)
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001 - se traduce a un error de API
        raise _traducir_error(error) from error

    return schemas.TicketLeido(
        comercio=extraido.comercio,
        total=_decimal(extraido.total),
        subtotal=_decimal(extraido.subtotal_sin_descuentos),
        items=[
            schemas.TicketItemLeido(
                descripcion=limpiar_descripcion(item.descripcion),
                cantidad=item.cantidad,
                importe=_decimal(item.importe_total),
            )
            for item in extraido.items
        ],
        descuentos=[
            schemas.TicketDescuentoLeido(
                descripcion=descuento.descripcion,
                importe=_decimal(descuento.importe) or Decimal("0"),
            )
            for descuento in extraido.descuentos_detalle
        ],
    )
