"""Servicio de cálculo del ciclo financiero (Daily Solvency)."""
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload

import models
import schemas


def calcular_resumen(ciclo: models.Ciclo, db: Session, user_id: int) -> schemas.CicloResumen:
    """
    Calcula el resumen financiero del ciclo activo:
    - SaldoDisponible = Ingresos - AhorroObjetivo - GastosFijosConfirmados
    - DailyCap = SaldoDisponible / DíasRestantes
    - Semáforo según % del Daily Cap gastado hoy.
    """
    ahora = datetime.now()
    fecha_limite = min(ahora, ciclo.fecha_fin)

    # Todos los movimientos dentro del período del ciclo
    movimientos = (
        db.query(models.Movimiento)
        .filter(
            models.Movimiento.user_id == user_id,
            models.Movimiento.fecha >= ciclo.fecha_inicio,
            models.Movimiento.fecha <= fecha_limite,
        )
        .all()
    )

    total_ingresos = sum(
        m.importe for m in movimientos if m.tipo == "ingreso"
    )
    total_gastos = sum(
        m.importe for m in movimientos if m.tipo == "gasto"
    )
    gastos_no_planificados = sum(
        m.importe for m in movimientos if m.tipo == "gasto" and m.ciclo_gasto_fijo_id is None
    )

    # Gastos fijos confirmados para este ciclo
    gastos_fijos_confirmados = sum(
        cgf.monto_confirmado
        for cgf in ciclo.gastos_fijos_ciclo
        if cgf.confirmado
    )
    gastos_fijos_pendientes = sum(
        cgf.monto_confirmado
        for cgf in ciclo.gastos_fijos_ciclo
        if cgf.confirmado and cgf.estado != "efectivizado"
    )
    gastos_fijos_efectivizados = sum(
        cgf.monto_confirmado
        for cgf in ciclo.gastos_fijos_ciclo
        if cgf.confirmado and cgf.estado == "efectivizado"
    )

    saldo_disponible_total = total_ingresos - ciclo.ahorro_objetivo - gastos_fijos_confirmados
    saldo_disponible_actual = saldo_disponible_total - gastos_no_planificados

    # Días restantes (mínimo 1 para evitar división por cero)
    hoy = ahora.date()
    fecha_fin_date = ciclo.fecha_fin.date()
    dias_restantes = max(1, (fecha_fin_date - hoy).days + 1)

    # Daily Cap (nunca negativo)
    if saldo_disponible_actual > 0:
        daily_cap = Decimal(str(saldo_disponible_actual)) / Decimal(str(dias_restantes))
    else:
        daily_cap = Decimal('0')

    # Gasto acumulado hoy
    inicio_hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    gasto_hoy = sum(
        m.importe
        for m in movimientos
        if m.tipo == "gasto" and m.fecha >= inicio_hoy and m.ciclo_gasto_fijo_id is None
    )

    # Semáforo
    if daily_cap > 0:
        porcentaje = float(Decimal(str(gasto_hoy)) / daily_cap * 100)
    else:
        porcentaje = 100.0 if gasto_hoy > 0 else 0.0

    if porcentaje < 80:
        semaforo = "verde"
    elif porcentaje < 100:
        semaforo = "amarillo"
    else:
        semaforo = "rojo"

    # Armar lista de gastos fijos del ciclo
    gastos_fijos_read = [
        schemas.CicloGastoFijoRead(
            id=cgf.id,
            ciclo_id=cgf.ciclo_id,
            gasto_fijo_id=cgf.gasto_fijo_id,
            monto_confirmado=cgf.monto_confirmado,
            confirmado=cgf.confirmado,
            descripcion_override=cgf.descripcion_override,
            estado=cgf.estado,
            gasto_fijo=cgf.gasto_fijo,
        )
        for cgf in ciclo.gastos_fijos_ciclo
    ]

    return schemas.CicloResumen(
        ciclo_id=ciclo.id,
        fecha_inicio=ciclo.fecha_inicio,
        fecha_fin=ciclo.fecha_fin,
        dias_restantes=dias_restantes,
        total_ingresos=total_ingresos,
        ahorro_objetivo=ciclo.ahorro_objetivo,
        gastos_fijos_confirmados=gastos_fijos_confirmados,
        gastos_fijos_pendientes=gastos_fijos_pendientes,
        gastos_fijos_efectivizados=gastos_fijos_efectivizados,
        saldo_disponible_total=saldo_disponible_total,
        total_gastos=total_gastos,
        gastos_no_planificados=gastos_no_planificados,
        saldo_disponible_actual=saldo_disponible_actual,
        daily_cap=daily_cap,
        gasto_hoy=gasto_hoy,
        daily_cap_porcentaje_usado=round(min(porcentaje, 999.9), 1),
        semaforo=semaforo,
        gastos_fijos=gastos_fijos_read,
    )
