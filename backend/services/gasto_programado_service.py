"""Servicio de gastos programados: obligaciones futuras con reserva de presupuesto.

Un GastoProgramado es una obligación de pago futura. Cuando su vencimiento cae
dentro del ciclo activo, reserva dinero como PresupuestoItem (descuenta el
saldo disponible). Al registrar el pago se crea un Movimiento real vinculado al
item y el gasto pasa a "pagado" sin descontar dos veces.
"""
import calendar
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

import models
from services import ciclo_service, ciclo_time_service
from services.ciclo_commitment_service import calcular_progreso_presupuesto
from services.movimiento_service import _validate_categoria


_GP_LOAD_OPTIONS = (
    joinedload(models.GastoProgramado.categoria),
    joinedload(models.GastoProgramado.user_category),
)


def _gp_con_categorias(gp_id: int, db: Session) -> models.GastoProgramado:
    """Re-query con eager loading de categorías para el response model."""
    return (
        db.query(models.GastoProgramado)
        .options(*_GP_LOAD_OPTIONS)
        .filter(models.GastoProgramado.id == gp_id)
        .first()
    )


def _movimiento_con_categorias(movimiento_id: int, db: Session) -> models.Movimiento:
    """Re-query con eager loading de categorías para el response model."""
    return (
        db.query(models.Movimiento)
        .options(
            joinedload(models.Movimiento.categoria),
            joinedload(models.Movimiento.user_category),
        )
        .filter(models.Movimiento.id == movimiento_id)
        .first()
    )


def _cargar_gp_o_404(gp_id: int, user_id: int, db: Session) -> models.GastoProgramado:
    """Carga un gasto programado validando propiedad (multi-tenant)."""
    gp = (
        db.query(models.GastoProgramado)
        .filter(models.GastoProgramado.id == gp_id, models.GastoProgramado.user_id == user_id)
        .first()
    )
    if not gp:
        raise HTTPException(status_code=404, detail="Gasto programado no encontrado")
    return gp


def crear_gasto_programado(
    data,
    user_id: int,
    db: Session,
) -> models.GastoProgramado:
    """Crea un gasto programado pendiente y reconcilia su reserva en el ciclo activo."""
    _validate_categoria(data.categoria_id, data.user_category_id, user_id, db)

    gp = models.GastoProgramado(
        user_id=user_id,
        importe=data.importe,
        vencimiento=data.vencimiento,
        descripcion=data.descripcion,
        nota=data.nota,
        categoria_id=data.categoria_id,
        user_category_id=data.user_category_id,
        medio_pago=data.medio_pago,
        clasificacion=data.clasificacion,
        estado="pendiente",
        cuota_actual=data.cuota_actual,
        cuota_total=data.cuota_total,
    )
    db.add(gp)
    db.flush()

    reconciliar_reserva(db, user_id, gp)
    db.commit()
    return _gp_con_categorias(gp.id, db)


def sumar_meses(fecha: date, meses: int) -> date:
    """Suma meses manteniendo el día, con clamp al último día del mes
    (31 de enero + 1 mes → 28/29 de febrero)."""
    anio = fecha.year + (fecha.month - 1 + meses) // 12
    mes = (fecha.month - 1 + meses) % 12 + 1
    dia = min(fecha.day, calendar.monthrange(anio, mes)[1])
    return date(anio, mes, dia)


def crear_serie_gastos_programados(
    data,
    user_id: int,
    db: Session,
) -> list[models.GastoProgramado]:
    """Genera las cuotas restantes de una deuda en un solo comando.

    Crea un GastoProgramado pendiente por cuota (cuota_inicial..cuota_total,
    para registrar deudas ya en curso con solo lo que falta pagar), cada una
    con su vencimiento mensual. Las que vencen dentro del ciclo activo quedan
    reservadas por reconciliar_reserva.
    """
    _validate_categoria(data.categoria_id, data.user_category_id, user_id, db)

    gps: list[models.GastoProgramado] = []
    for offset, numero in enumerate(range(data.cuota_inicial, data.cuota_total + 1)):
        gp = models.GastoProgramado(
            user_id=user_id,
            importe=data.importe,
            vencimiento=sumar_meses(data.primer_vencimiento, offset),
            descripcion=f"{data.producto} — cuota {numero}/{data.cuota_total}",
            nota=data.nota,
            categoria_id=data.categoria_id,
            user_category_id=data.user_category_id,
            medio_pago=data.medio_pago,
            clasificacion=data.clasificacion,
            estado="pendiente",
            cuota_actual=numero,
            cuota_total=data.cuota_total,
        )
        db.add(gp)
        gps.append(gp)
    db.flush()

    for gp in gps:
        reconciliar_reserva(db, user_id, gp)
    db.commit()

    return [_gp_con_categorias(gp.id, db) for gp in gps]


def listar_gastos_programados(
    user_id: int,
    db: Session,
    estado: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[models.GastoProgramado]:
    """Lista los gastos programados del usuario con filtro opcional por estado."""
    query = db.query(models.GastoProgramado).options(*_GP_LOAD_OPTIONS).filter(
        models.GastoProgramado.user_id == user_id
    )
    if estado:
        query = query.filter(models.GastoProgramado.estado == estado)
    return query.order_by(
        models.GastoProgramado.vencimiento.asc(),
        models.GastoProgramado.id.asc(),
    ).limit(limit).offset(skip).all()


def actualizar_gasto_programado(
    gp_id: int,
    user_id: int,
    data,
    db: Session,
) -> models.GastoProgramado:
    """Actualiza los campos provistos y reconcilia la reserva del ciclo activo."""
    gp = _cargar_gp_o_404(gp_id, user_id, db)

    if "categoria_id" in data.model_fields_set or "user_category_id" in data.model_fields_set:
        _validate_categoria(data.categoria_id, data.user_category_id, user_id, db)

    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(gp, campo, valor)

    reconciliar_reserva(db, user_id, gp)
    db.commit()
    return _gp_con_categorias(gp.id, db)


def cancelar_gasto_programado(
    gp_id: int,
    user_id: int,
    db: Session,
) -> models.GastoProgramado:
    """Cancela un gasto programado pendiente y libera su reserva si no fue ejecutada."""
    gp = _cargar_gp_o_404(gp_id, user_id, db)

    if gp.estado != "pendiente":
        raise HTTPException(status_code=400, detail="Solo se puede cancelar un gasto programado pendiente")

    item = (
        db.query(models.PresupuestoItem)
        .filter(models.PresupuestoItem.gasto_programado_id == gp.id)
        .first()
    )
    if item is not None and calcular_progreso_presupuesto(item).ejecutado > 0:
        raise HTTPException(status_code=400, detail="No se puede cancelar: ya tiene pagos registrados")
    if item is not None:
        db.delete(item)

    gp.estado = "cancelado"
    db.commit()
    return _gp_con_categorias(gp.id, db)


def eliminar_gasto_programado(
    gp_id: int,
    user_id: int,
    db: Session,
) -> None:
    """Elimina definitivamente un gasto programado pendiente y libera su reserva."""
    gp = _cargar_gp_o_404(gp_id, user_id, db)

    if gp.estado != "pendiente":
        raise HTTPException(status_code=400, detail="Solo se puede eliminar un gasto programado pendiente")

    item = (
        db.query(models.PresupuestoItem)
        .filter(models.PresupuestoItem.gasto_programado_id == gp.id)
        .first()
    )
    if item is not None and calcular_progreso_presupuesto(item).ejecutado > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar: ya tiene pagos registrados")
    if item is not None:
        db.delete(item)

    db.delete(gp)
    db.commit()


def pagar_gasto_programado(
    gp_id: int,
    user_id: int,
    db: Session,
) -> tuple[models.GastoProgramado, models.Movimiento]:
    """Registra el pago: crea el Movimiento real, lo vincula a la reserva y
    marca el gasto como pagado. Todo en una única transacción atómica."""
    gp = _cargar_gp_o_404(gp_id, user_id, db)

    if gp.estado != "pendiente":
        raise HTTPException(status_code=409, detail="El gasto programado ya fue pagado o cancelado")

    item = (
        db.query(models.PresupuestoItem)
        .filter(models.PresupuestoItem.gasto_programado_id == gp.id)
        .first()
    )

    movimiento = models.Movimiento(
        tipo="gasto",
        fecha=ciclo_time_service.ahora_buenos_aires(),
        importe=gp.importe,
        descripcion=gp.descripcion,
        nota=gp.nota,
        categoria_id=gp.categoria_id,
        user_category_id=gp.user_category_id,
        medio_pago=gp.medio_pago,
        clasificacion=gp.clasificacion,
        user_id=user_id,
        presupuesto_item_id=item.id if item is not None else None,
    )
    db.add(movimiento)
    db.flush()

    if item is not None:
        # El FK al item hace que el nuevo movimiento cuente en la ejecución
        item.estado = calcular_progreso_presupuesto(item).estado

    gp.estado = "pagado"
    gp.movimiento_id = movimiento.id
    db.commit()
    return _gp_con_categorias(gp.id, db), _movimiento_con_categorias(movimiento.id, db)


def pagar_mes_gastos_programados(
    user_id: int,
    db: Session,
) -> dict:
    """Paga de una vez todas las cuotas pendientes cuyo vencimiento cae dentro
    del ciclo activo (el pago único del resumen de la tarjeta). Cada cuota se
    paga vía pagar_gasto_programado: movimiento real con la categoría propia y
    ejecución de su item de presupuesto."""
    ciclo = ciclo_service.get_ciclo_activo(db, user_id)
    if ciclo is None:
        raise ValueError("No hay un ciclo activo para pagar el mes")

    pendientes = (
        db.query(models.GastoProgramado)
        .filter(
            models.GastoProgramado.user_id == user_id,
            models.GastoProgramado.estado == "pendiente",
            models.GastoProgramado.vencimiento <= ciclo.fecha_fin,
        )
        .all()
    )

    pagados = []
    total = Decimal("0")
    for gp in pendientes:
        programado, movimiento = pagar_gasto_programado(gp.id, user_id, db)
        total += programado.importe
        pagados.append({
            "programado": programado,
            "movimiento": movimiento,
        })

    return {"pagados": pagados, "total": total}


def reconciliar_reserva(
    db: Session,
    user_id: int,
    gp: models.GastoProgramado,
) -> None:
    """Sincroniza la reserva (PresupuestoItem) del gasto programado con el ciclo activo.

    - Sin ciclo activo: no hay nada que reservar (la reserva ocurre al crear el ciclo).
    - Gasto no pendiente: elimina la reserva del ciclo activo si no fue ejecutada.
    - Vencimiento dentro del ciclo: crea o actualiza la reserva confirmada.
    - Vencimiento fuera del ciclo: elimina la reserva del ciclo activo si no fue ejecutada.
    Raises ValueError si el monto estimado queda por debajo de lo ya ejecutado.
    """
    active = ciclo_service.get_ciclo_activo(db, user_id)
    if not active:
        return

    item = (
        db.query(models.PresupuestoItem)
        .filter(
            models.PresupuestoItem.ciclo_id == active.id,
            models.PresupuestoItem.gasto_programado_id == gp.id,
        )
        .first()
    )

    if gp.estado != "pendiente":
        if item is not None and calcular_progreso_presupuesto(item).ejecutado == 0:
            db.delete(item)
        db.commit()
        return

    within = gp.vencimiento <= active.fecha_fin.date()
    if within:
        if item is not None:
            ejecutado = calcular_progreso_presupuesto(item).ejecutado
            if Decimal(str(gp.importe)) < ejecutado:
                raise ValueError(
                    f"El monto estimado no puede ser menor a lo ya ejecutado ({ejecutado:.2f})"
                )
            item.monto_estimado = gp.importe
            item.descripcion = gp.descripcion
            item.categoria_id = gp.categoria_id
            item.user_category_id = gp.user_category_id
            item.confirmado = True
            item.estado = calcular_progreso_presupuesto(item).estado
        else:
            db.add(models.PresupuestoItem(
                ciclo_id=active.id,
                categoria_id=gp.categoria_id,
                user_category_id=gp.user_category_id,
                monto_estimado=gp.importe,
                confirmado=True,
                descripcion=gp.descripcion,
                estado="pendiente",
                gasto_programado_id=gp.id,
            ))
    else:
        if item is not None and calcular_progreso_presupuesto(item).ejecutado == 0:
            db.delete(item)

    db.commit()


def importar_gastos_programados_al_ciclo(
    ciclo: models.Ciclo,
    user_id: int,
    db: Session,
) -> None:
    """Importa los gastos programados pendientes con vencimiento dentro del ciclo
    como items de presupuesto confirmados. NO commitea (el caller lo hace)."""
    pendientes = (
        db.query(models.GastoProgramado)
        .filter(
            models.GastoProgramado.user_id == user_id,
            models.GastoProgramado.estado == "pendiente",
            models.GastoProgramado.vencimiento <= ciclo.fecha_fin.date(),
        )
        .all()
    )

    # Detección de duplicados en UNA query (antes: una query por gasto pendiente — N+1).
    gp_ids_ya_importados: set = {
        row[0]
        for row in (
            db.query(models.PresupuestoItem.gasto_programado_id)
            .filter(
                models.PresupuestoItem.ciclo_id == ciclo.id,
                models.PresupuestoItem.gasto_programado_id.isnot(None),
            )
            .all()
        )
    }

    for gp in pendientes:
        if gp.id in gp_ids_ya_importados:
            continue
        db.add(models.PresupuestoItem(
            ciclo_id=ciclo.id,
            categoria_id=gp.categoria_id,
            user_category_id=gp.user_category_id,
            monto_estimado=gp.importe,
            confirmado=True,
            descripcion=gp.descripcion,
            estado="pendiente",
            gasto_programado_id=gp.id,
        ))
