"""Servicio de cálculo del ciclo financiero (Daily Solvency)."""
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from services.ciclo_commitment_service import calcular_progreso_presupuesto
from services import ciclo_time_service


def crear_nuevo_ciclo(
    db: Session,
    user_id: int,
    fecha_fin,
    ahorro_objetivo,
    movimiento_origen_id: Optional[int] = None,
) -> models.Ciclo:
    """
    Crea un ciclo financiero activo para el usuario.
    Raises ValueError si fecha_fin no es válida o ya existe un ciclo activo.
    """
    if fecha_fin <= ciclo_time_service.ahora_buenos_aires():
        raise ValueError("La fecha de fin debe ser posterior a hoy")

    existe_activo = (
        db.query(models.Ciclo)
        .filter(models.Ciclo.user_id == user_id, models.Ciclo.activo == True)
        .first()
    )
    if existe_activo:
        raise ValueError(f"Ya existe un ciclo activo (id={existe_activo.id}). Cerralo antes de crear uno nuevo.")

    fecha_inicio = ciclo_time_service.ahora_buenos_aires()

    ciclo = models.Ciclo(
        user_id=user_id,
        movimiento_origen_id=movimiento_origen_id,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        ahorro_objetivo=ahorro_objetivo,
        activo=True,
    )
    db.add(ciclo)
    db.flush()

    # Auto-importar gastos fijos activos como presupuesto_items
    gastos_fijos_activos = (
        db.query(models.GastoFijo)
        .filter(models.GastoFijo.user_id == user_id, models.GastoFijo.activo == True)
        .all()
    )
    for gf in gastos_fijos_activos:
        ultimo = (
            db.query(func.max(models.Movimiento.importe))
            .filter(models.Movimiento.gasto_fijo_id == gf.id)
            .scalar()
        )
        monto = ultimo or Decimal("0")
        db.add(models.PresupuestoItem(
            ciclo_id=ciclo.id,
            user_category_id=gf.user_category_id,
            categoria_id=gf.categoria_id,
            monto_estimado=monto,
            confirmado=True,
            descripcion=gf.descripcion,
            estado="pendiente",
            gasto_fijo_id=gf.id,
        ))

    db.commit()
    db.refresh(ciclo)
    return ciclo


def actualizar_fechas_ciclo(
    ciclo: models.Ciclo,
    fecha_inicio,
    fecha_fin,
    ahorro_objetivo,
    db: Session,
) -> None:
    """Actualiza fecha_inicio, fecha_fin y/o ahorro_objetivo del ciclo."""
    if fecha_inicio is not None:
        if fecha_inicio >= (fecha_fin or ciclo.fecha_fin):
            raise ValueError("La fecha de inicio debe ser anterior a la fecha de fin")
        ciclo.fecha_inicio = fecha_inicio
    if fecha_fin is not None:
        if fecha_fin <= ciclo_time_service.ahora_buenos_aires():
            raise ValueError("La fecha de fin debe ser posterior a hoy")
        ciclo.fecha_fin = fecha_fin
    if ahorro_objetivo is not None:
        ciclo.ahorro_objetivo = ahorro_objetivo
    db.commit()
    db.refresh(ciclo)


def cerrar_ciclo(ciclo: models.Ciclo, db: Session) -> None:
    """Cierra (desactiva) un ciclo financiero."""
    ciclo.activo = False
    db.commit()


def reabrir_ciclo(ciclo: models.Ciclo, db: Session) -> None:
    """
    Reactiva un ciclo cerrado.
    Raises ValueError si ya existe otro ciclo activo para el mismo usuario.
    """
    existe_activo = (
        db.query(models.Ciclo)
        .filter(models.Ciclo.user_id == ciclo.user_id, models.Ciclo.activo == True)
        .first()
    )
    if existe_activo:
        raise ValueError("Ya existe un ciclo activo. Cerralo antes de reabrir otro.")
    ciclo.activo = True
    db.commit()


def calcular_resumen(ciclo: models.Ciclo, db: Session, user_id: int) -> schemas.CicloResumen:
    """
    Calcula el resumen financiero del ciclo activo:
    - SaldoDisponible = Ingresos - AhorroObjetivo - PresupuestoConfirmado
    - DailyCap = SaldoDisponible / DíasRestantes
    - Semáforo según % del Daily Cap gastado hoy.
    """
    ahora = ciclo_time_service.ahora_buenos_aires()
    fecha_limite = min(ahora, ciclo.fecha_fin)

    # Todos los movimientos dentro del período del ciclo
    # + el movimiento que originó el ciclo (puede ser anterior a fecha_inicio)
    movimientos = (
        db.query(models.Movimiento)
        .filter(
            models.Movimiento.user_id == user_id,
            models.Movimiento.fecha >= ciclo.fecha_inicio,
            models.Movimiento.fecha <= fecha_limite,
        )
        .all()
    )

    # Incluir movimiento origen aunque esté fuera del rango de fechas
    if ciclo.movimiento_origen_id:
        mov_origen = db.query(models.Movimiento).filter(
            models.Movimiento.id == ciclo.movimiento_origen_id,
        ).first()
        if mov_origen and mov_origen not in movimientos:
            movimientos.append(mov_origen)

    total_ingresos = sum(
        m.importe for m in movimientos if m.tipo == "ingreso"
    )
    total_gastos = sum(
        m.importe for m in movimientos if m.tipo == "gasto"
    )
    gastos_no_planificados = sum(
        m.importe for m in movimientos if m.tipo == "gasto" and m.presupuesto_item_id is None
    )

    movimientos_por_item: dict[int, list[models.Movimiento]] = {}
    for movimiento in movimientos:
        if movimiento.presupuesto_item_id is None:
            continue
        movimientos_por_item.setdefault(movimiento.presupuesto_item_id, []).append(movimiento)

    progresos = {
        item.id: calcular_progreso_presupuesto(
            item,
            movimientos=movimientos_por_item.get(item.id, []),
        )
        for item in ciclo.presupuesto_items
    }

    # Add excess from linked items that exceed their budget as unplanned
    for p in progresos.values():
        if p.ejecutado > p.reservado:
            gastos_no_planificados += p.ejecutado - p.reservado

    # Presupuesto confirmado para este ciclo
    presupuesto_confirmado = sum(
        progresos[item.id].reservado
        for item in ciclo.presupuesto_items
        if item.confirmado
    )
    presupuesto_pendiente = sum(
        progresos[item.id].pendiente
        for item in ciclo.presupuesto_items
        if item.confirmado
    )
    presupuesto_ejecutado = sum(
        progresos[item.id].ejecutado
        for item in ciclo.presupuesto_items
        if item.confirmado
    )

    saldo_disponible_total = total_ingresos - ciclo.ahorro_objetivo - presupuesto_confirmado
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

    # Gasto acumulado hoy (excedentes de items vinculados cuentan como no planificados)
    inicio_hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    today_linked_per_item: dict[int, Decimal] = {}
    for m in movimientos:
        if m.tipo == "gasto" and m.fecha >= inicio_hoy and m.presupuesto_item_id is not None:
            prev = today_linked_per_item.get(m.presupuesto_item_id, Decimal("0"))
            today_linked_per_item[m.presupuesto_item_id] = prev + m.importe
    today_linked_excess = Decimal("0")
    for item_id, hoy_total in today_linked_per_item.items():
        p = progresos.get(item_id)
        if p is None:
            today_linked_excess += hoy_total
            continue
        ejecutado_prev = p.ejecutado - hoy_total
        pendiente_prev = max(Decimal("0"), p.reservado - ejecutado_prev)
        today_linked_excess += max(Decimal("0"), hoy_total - pendiente_prev)
    gasto_hoy = sum(
        m.importe
        for m in movimientos
        if m.tipo == "gasto" and m.fecha >= inicio_hoy and m.presupuesto_item_id is None
    ) + today_linked_excess

    # Semáforo
    if daily_cap > 0:
        porcentaje = float(Decimal(str(gasto_hoy)) / daily_cap) * 100
    else:
        porcentaje = 100.0 if gasto_hoy > 0 else 0.0

    if porcentaje < 80:
        semaforo = "verde"
    elif porcentaje < 100:
        semaforo = "amarillo"
    else:
        semaforo = "rojo"

    # Armar lista de presupuestoitems del ciclo
    presupuesto_items_read = [
        schemas.PresupuestoItemRead(
            id=item.id,
            ciclo_id=item.ciclo_id,
            categoria_id=item.categoria_id,
            user_category_id=item.user_category_id,
            monto_estimado=item.monto_estimado,
            monto_ejecutado=progresos[item.id].ejecutado,
            monto_pendiente=progresos[item.id].pendiente,
            confirmado=item.confirmado,
            descripcion=item.descripcion,
            estado=progresos[item.id].estado,
        )
        for item in ciclo.presupuesto_items
    ]

    # Armar lista de gastos_fijos del ciclo
    # "pendiente" se mapea a "comprometido" si el item está confirmado
    def _gf_estado(item, progreso):
        if progreso.ejecutado > 0:
            return progreso.estado  # parcial o efectivizado
        if item.confirmado:
            return "comprometido"
        return progreso.estado  # pendiente

    gastos_fijos_read = [
        schemas.GastoFijoCompromiso(
            id=item.id,
            gasto_fijo_id=item.gasto_fijo_id,
            descripcion=item.descripcion or "",
            monto_confirmado=item.monto_estimado,
            monto_ejecutado=progresos[item.id].ejecutado,
            monto_pendiente=progresos[item.id].pendiente,
            estado=_gf_estado(item, progresos[item.id]),
        )
        for item in ciclo.presupuesto_items
    ]

    return schemas.CicloResumen(
        ciclo_id=ciclo.id,
        fecha_inicio=ciclo.fecha_inicio,
        fecha_fin=ciclo.fecha_fin,
        dias_restantes=dias_restantes,
        total_ingresos=total_ingresos,
        ahorro_objetivo=ciclo.ahorro_objetivo,
        gastos_fijos_confirmados=presupuesto_confirmado,
        gastos_fijos_pendientes=presupuesto_pendiente,
        gastos_fijos_efectivizados=presupuesto_ejecutado,
        saldo_disponible_total=saldo_disponible_total,
        total_gastos=total_gastos,
        gastos_no_planificados=gastos_no_planificados,
        saldo_disponible_actual=saldo_disponible_actual,
        daily_cap=daily_cap,
        gasto_hoy=gasto_hoy,
        daily_cap_porcentaje_usado=round(min(porcentaje, 999.9), 1),
        semaforo=semaforo,
        presupuesto_items=presupuesto_items_read,
        gastos_fijos=gastos_fijos_read,
    )
