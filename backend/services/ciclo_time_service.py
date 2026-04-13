"""Reloj del módulo de ciclos fijado a horario de Buenos Aires."""
from datetime import datetime
from zoneinfo import ZoneInfo


BA_TIMEZONE = ZoneInfo("America/Argentina/Buenos_Aires")


def ahora_buenos_aires() -> datetime:
    """Devuelve un datetime naive representando la hora actual en Buenos Aires."""
    return datetime.now(BA_TIMEZONE).replace(tzinfo=None)
