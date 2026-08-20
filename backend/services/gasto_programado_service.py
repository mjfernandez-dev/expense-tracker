"""Servicio de gastos programados: obligaciones futuras con reserva de presupuesto.

Un GastoProgramado es una obligación de pago futura. Cuando su vencimiento cae
dentro del ciclo activo, reserva dinero como PresupuestoItem (descuenta el
saldo disponible). Al registrar el pago se crea un Movimiento real vinculado al
item y el gasto pasa a "pagado" sin descontar dos veces.
"""
import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

import models
from services import ciclo_service, ciclo_time_service, push_service
from services.ciclo_commitment_service import calcular_progreso_presupuesto
from services.movimiento_service import _validate_categoria

logger = logging.getLogger("finanzaapp")


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
        dias_anticipacion=data.dias_anticipacion,
        estado="pendiente",
        cuota_actual=data.cuota_actual,
        cuota_total=data.cuota_total,
    )
    db.add(gp)
    db.flush()

    reconciliar_reserva(db, user_id, gp)
    db.commit()
    return _gp_con_categorias(gp.id, db)


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

    for gp in pendientes:
        existe = (
            db.query(models.PresupuestoItem)
            .filter(
                models.PresupuestoItem.ciclo_id == ciclo.id,
                models.PresupuestoItem.gasto_programado_id == gp.id,
            )
            .first()
        )
        if existe is not None:
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


def gastos_programados_por_notificar(db: Session, hoy: date) -> list[models.GastoProgramado]:
    """Gastos programados pendientes cuya ventana de aviso ya arrancó y que no
    fueron notificados hoy (idempotencia diaria vía last_notified_on).

    Ventana: vencimiento - COALESCE(dias_anticipacion, 2) <= hoy. Los vencidos
    impagos siguen notificables mientras estén 'pendiente'. Ordena por
    user_id y vencimiento (para agrupar por usuario en el cron).
    """
    # Pre-filtro por cota superior: dias_anticipacion está acotado a 28 en el
    # schema, así que un vencimiento a más de 31 días nunca puede estar en
    # ventana. El filtro exacto se hace en Python (por fila, con COALESCE 2).
    candidatos = (
        db.query(models.GastoProgramado)
        .filter(
            models.GastoProgramado.estado == "pendiente",
            models.GastoProgramado.vencimiento <= hoy + timedelta(days=31),
            (models.GastoProgramado.last_notified_on.is_(None))
            | (models.GastoProgramado.last_notified_on < hoy),
        )
        .order_by(
            models.GastoProgramado.user_id.asc(),
            models.GastoProgramado.vencimiento.asc(),
        )
        .all()
    )
    return [
        gp
        for gp in candidatos
        if gp.vencimiento
        - timedelta(days=gp.dias_anticipacion if gp.dias_anticipacion is not None else 2)
        <= hoy
    ]


def marcar_gastos_programados_notificados(ids: list[int], db: Session, hoy: date) -> None:
    """Marca los gastos programados dados como notificados hoy (un solo UPDATE)."""
    if not ids:
        return
    db.query(models.GastoProgramado).filter(models.GastoProgramado.id.in_(ids)).update(
        {models.GastoProgramado.last_notified_on: hoy},
        synchronize_session=False,
    )
    db.commit()


def notificar_gastos_programados(db: Session, hoy: date) -> dict:
    """Envía recordatorios push de gastos programados pendientes y marca notificados.

    Idempotente por día: last_notified_on evita re-notificar el mismo día.
    Un fallo de push de un usuario no aborta el run; se devuelven conteos
    de notificados, usuarios alcanzados y fallidos.
    """
    debidos = gastos_programados_por_notificar(db, hoy)

    por_usuario: dict[int, list[models.GastoProgramado]] = {}
    for gp in debidos:
        por_usuario.setdefault(gp.user_id, []).append(gp)

    notificados = 0
    fallidos = 0
    for user_id, programados in por_usuario.items():
        subs = (
            db.query(models.PushSubscription)
            .filter(models.PushSubscription.user_id == user_id)
            .all()
        )
        for gp in programados:
            # gp.descripcion es EncryptedString: se desencripta acá. No loguear.
            payload = {
                "title": "Recordatorio de gasto programado",
                "body": f"«{gp.descripcion}» vence el {gp.vencimiento:%d/%m/%Y} — registrá el pago",
                "url": "/",
            }
            entregado = False
            for sub in subs:
                try:
                    if push_service.send_push_notification(sub, payload):
                        entregado = True
                    else:
                        db.delete(sub)
                except Exception as exc:
                    logger.error(
                        "cron_gp_push_error sub_id=%s gp_id=%s: %s",
                        sub.id,
                        gp.id,
                        exc,
                    )
            if entregado:
                notificados += 1
            else:
                fallidos += 1

    marcar_gastos_programados_notificados([gp.id for gp in debidos], db, hoy)
    return {"notified": notificados, "users": len(por_usuario), "failed": fallidos}
