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
import unicodedata
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

ZERO = Decimal("0.00")
CENTAVO = Decimal("0.01")
# Por debajo de esto la diferencia contra el total es ruido de redondeo, no un
# renglón mal leído: se corrige en silencio en vez de alarmar al usuario.
TOLERANCIA_REDONDEO = Decimal("0.10")

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


def _palabras(texto: str) -> set[str]:
    """Palabras significativas, sin acentos ni mayúsculas, para comparar nombres."""
    sin_acentos = "".join(
        caracter
        for caracter in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(caracter)
    )
    return {
        palabra
        for palabra in re.findall(r"[a-z0-9]+", sin_acentos.lower())
        if len(palabra) >= 3
    }


def _item_del_descuento(descripcion_descuento: str, nombres: list[str]) -> Optional[int]:
    """Busca el renglón que nombra el descuento: "OFERTA QUESO LS" -> la línea del queso.

    Se queda con el que comparte más palabras. Empate: el primero del ticket, para
    que el resultado sea determinista.
    """
    palabras_descuento = _palabras(descripcion_descuento)
    mejor_indice: Optional[int] = None
    mejor_puntaje = 0
    for indice, nombre in enumerate(nombres):
        puntaje = len(palabras_descuento & _palabras(nombre))
        if puntaje > mejor_puntaje:
            mejor_indice, mejor_puntaje = indice, puntaje
    return mejor_indice


def _repartir_proporcional(monto: Decimal, cupos: list[Decimal]) -> list[Decimal]:
    """Reparte `monto` en proporción a los cupos, sin superar ninguno.

    El redondeo por línea puede dejar centavos sueltos: se los lleva la línea con
    más cupo para que la suma repartida sea exactamente `monto`.
    """
    total_cupo = sum(cupos, ZERO)
    if monto <= ZERO or total_cupo <= ZERO:
        return [ZERO for _ in cupos]

    monto = min(monto, total_cupo)
    cuotas = [
        (monto * cupo / total_cupo).quantize(CENTAVO, rounding=ROUND_HALF_UP)
        for cupo in cupos
    ]
    diferencia = monto - sum(cuotas, ZERO)
    if diferencia:
        mayor = max(range(len(cupos)), key=lambda indice: cupos[indice])
        cuotas[mayor] += diferencia
    return cuotas


def atribuir_descuentos(
    nombres: list[str],
    importes_lista: list[Decimal],
    descuentos: list[tuple[str, Decimal]],
) -> list[Decimal]:
    """Devuelve el descuento que le corresponde a cada renglón.

    Regla, en este orden:

    1. Si el descuento nombra a un producto, va a ese renglón.
    2. Si no se puede atribuir, se prorratea por importe de lista.
    3. Nunca se descuenta más de lo que cuesta el renglón: el sobrante se
       prorratea entre los demás.

    Nunca se descarta un descuento: ignorarlo inflaría el precio pagado de todos
    los productos y la comparación en el tiempo quedaría mal para siempre.
    """
    atribuidos = [ZERO for _ in nombres]
    pendiente = ZERO

    for texto, monto in descuentos:
        if monto <= ZERO:
            continue
        indice = _item_del_descuento(texto, nombres)
        if indice is None:
            pendiente += monto
            continue
        cupo = max(ZERO, importes_lista[indice] - atribuidos[indice])
        aplicado = min(monto, cupo)
        atribuidos[indice] += aplicado
        pendiente += monto - aplicado

    if pendiente > ZERO:
        cupos = [
            max(ZERO, importe - atribuido)
            for importe, atribuido in zip(importes_lista, atribuidos)
        ]
        for indice, cuota in enumerate(_repartir_proporcional(pendiente, cupos)):
            atribuidos[indice] += cuota

    return atribuidos


def _ajustar_al_total(finales: list[Decimal], total: Optional[Decimal]) -> list[Decimal]:
    """Corrige solo el ruido de redondeo contra el total impreso.

    Una diferencia mayor que la tolerancia es un renglón mal leído o un descuento
    que el modelo no devolvió: se deja visible para que el guard de la UI la
    muestre en vez de esconderla repartiendo el error entre las líneas.
    """
    if total is None or not finales:
        return finales

    diferencia = sum(finales, ZERO) - total
    if diferencia == ZERO or abs(diferencia) > TOLERANCIA_REDONDEO:
        return finales

    ajustados = list(finales)
    indice = max(range(len(ajustados)), key=lambda posicion: ajustados[posicion])
    if ajustados[indice] - diferencia < ZERO:
        return finales
    ajustados[indice] -= diferencia
    return ajustados


def _descuentos_del_ticket(extraido: TicketExtraido) -> list[tuple[str, Decimal]]:
    """Descuentos a aplicar: el detalle si vino, si no la suma impresa o la resta subtotal-total."""
    detalle = [
        (descuento.descripcion, monto)
        for descuento in extraido.descuentos_detalle
        if (monto := _decimal(descuento.importe)) and monto > ZERO
    ]
    if detalle:
        return detalle

    suma = _decimal(extraido.descuentos)
    if not suma:
        subtotal = _decimal(extraido.subtotal_sin_descuentos)
        total = _decimal(extraido.total)
        if subtotal is not None and total is not None and subtotal > total:
            suma = subtotal - total

    if suma and suma > ZERO:
        return [("Descuentos del ticket", suma)]
    return []


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

    nombres = [limpiar_descripcion(item.descripcion) for item in extraido.items]
    importes_lista = [_decimal(item.importe_total) or ZERO for item in extraido.items]

    atribuidos = atribuir_descuentos(nombres, importes_lista, _descuentos_del_ticket(extraido))
    finales = _ajustar_al_total(
        [
            max(ZERO, importe - descuento)
            for importe, descuento in zip(importes_lista, atribuidos)
        ],
        _decimal(extraido.total),
    )

    return schemas.TicketLeido(
        comercio=extraido.comercio,
        total=_decimal(extraido.total),
        subtotal=_decimal(extraido.subtotal_sin_descuentos),
        items=[
            schemas.TicketItemLeido(
                descripcion=nombre,
                cantidad=item.cantidad,
                importe_lista=importe,
                descuento=max(ZERO, importe - final),
                importe=final,
            )
            for item, nombre, importe, final in zip(
                extraido.items, nombres, importes_lista, finales
            )
        ],
        descuentos=[
            schemas.TicketDescuentoLeido(
                descripcion=descuento.descripcion,
                importe=_decimal(descuento.importe) or Decimal("0"),
            )
            for descuento in extraido.descuentos_detalle
        ],
    )
