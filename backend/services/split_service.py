"""Servicio de cálculo de shares para gastos divididos."""
from decimal import Decimal, ROUND_DOWN


def calcular_shares(importe: Decimal, n: int) -> list[Decimal]:
    """
    Divide un importe entre n participantes con precisión Decimal.
    El primer participante absorbe el remanente de centavos.
    Retorna lista de n Decimals que suman exactamente al importe.
    """
    importe = importe if isinstance(importe, Decimal) else Decimal(str(importe))
    share_base = (importe / n).quantize(Decimal('0.01'), rounding=ROUND_DOWN)
    remainder = importe - share_base * n
    shares = []
    for i in range(n):
        amount = share_base + (remainder if i == 0 else Decimal('0'))
        shares.append(amount)
    return shares
