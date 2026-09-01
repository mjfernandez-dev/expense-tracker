from datetime import datetime
from decimal import Decimal
import importlib.util
from pathlib import Path
from unittest.mock import patch

from cryptography.fernet import Fernet
import pytest

import config
import models
from services import ciclo_service, ciclo_time_service


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "a50e8bfdc426_reconcile_legacy_midnight_movimientos.py"
)
SPEC = importlib.util.spec_from_file_location("legacy_cycle_reconciliation", MIGRATION_PATH)
assert SPEC is not None and SPEC.loader is not None
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


@pytest.fixture(autouse=True)
def _configure_test_encryption(monkeypatch):
    monkeypatch.setattr(config, "ENCRYPTION_KEY", Fernet.generate_key().decode())


def _crear_usuario(db_session, suffix: str) -> models.User:
    usuario = models.User(
        username=f"legacy-{suffix}",
        email=f"legacy-{suffix}@example.com",
        hashed_password="not-used",
    )
    db_session.add(usuario)
    db_session.flush()
    return usuario


def _crear_categoria(db_session, usuario: models.User, suffix: str) -> models.UserCategory:
    categoria = models.UserCategory(
        user_id=usuario.id,
        nombre=f"Supermercado {suffix}",
        color="#000000",
    )
    db_session.add(categoria)
    db_session.flush()
    return categoria


def _crear_ciclos_adyacentes(db_session, usuario: models.User):
    anterior = models.Ciclo(
        user_id=usuario.id,
        fecha_inicio=datetime(2026, 8, 1, 0, 0),
        fecha_fin=datetime(2026, 9, 30, 23, 59, 59),
        ahorro_objetivo=Decimal("0"),
        activo=False,
    )
    actual = models.Ciclo(
        user_id=usuario.id,
        fecha_inicio=datetime(2026, 8, 31, 11, 5),
        fecha_fin=datetime(2026, 9, 30, 23, 59, 59),
        ahorro_objetivo=Decimal("0"),
        activo=True,
    )
    db_session.add_all([anterior, actual])
    db_session.flush()
    return anterior, actual


def _movimiento_legacy(
    usuario: models.User,
    categoria: models.UserCategory,
    importe: str,
    created_at: datetime,
    descripcion: str,
) -> models.Movimiento:
    return models.Movimiento(
        user_id=usuario.id,
        user_category_id=categoria.id,
        importe=Decimal(importe),
        fecha=datetime(2026, 8, 31, 0, 0),
        created_at=created_at,
        descripcion=descripcion,
        tipo="gasto",
    )


def _ejecutar_reparacion(db_session) -> None:
    with patch.object(migration.op, "get_bind", return_value=db_session.connection()):
        migration.upgrade()
    db_session.flush()
    db_session.expire_all()


def test_repara_split_mismo_dia_y_ejecucion_del_presupuesto(
    db_session, monkeypatch
):
    usuario = _crear_usuario(db_session, "split")
    categoria = _crear_categoria(db_session, usuario, "split")
    anterior, actual = _crear_ciclos_adyacentes(db_session, usuario)
    item = models.PresupuestoItem(
        ciclo_id=actual.id,
        user_category_id=categoria.id,
        monto_estimado=Decimal("100000"),
        confirmado=True,
        descripcion="Supermercado",
    )
    movimientos = [
        _movimiento_legacy(
            usuario, categoria, importe, created_at, descripcion
        )
        for importe, created_at, descripcion in [
            ("10000", datetime(2026, 8, 31, 9, 0), "Earlier one"),
            ("12000", datetime(2026, 8, 31, 10, 30), "Earlier two"),
            ("8000", datetime(2026, 8, 31, 11, 5), "Supermercado one"),
            ("7800", datetime(2026, 8, 31, 12, 30), "Supermercado two"),
        ]
    ]
    db_session.add_all([item, *movimientos])
    db_session.flush()

    _ejecutar_reparacion(db_session)
    _ejecutar_reparacion(db_session)
    monkeypatch.setattr(
        ciclo_time_service,
        "ahora_buenos_aires",
        lambda: datetime(2026, 8, 31, 18, 0),
    )

    anterior = db_session.get(models.Ciclo, anterior.id)
    actual = db_session.get(models.Ciclo, actual.id)
    resumen_anterior = ciclo_service.calcular_resumen(anterior, db_session, usuario.id)
    resumen_actual = ciclo_service.calcular_resumen(actual, db_session, usuario.id)
    reparados = db_session.query(models.Movimiento).filter(
        models.Movimiento.id.in_([movimiento.id for movimiento in movimientos])
    ).order_by(models.Movimiento.created_at).all()

    assert [movimiento.fecha for movimiento in reparados] == [
        movimiento.created_at for movimiento in reparados
    ]
    assert [movimiento.presupuesto_item_id for movimiento in reparados] == [
        None,
        None,
        item.id,
        item.id,
    ]
    assert resumen_anterior.total_gastos == Decimal("22000")
    assert resumen_actual.total_gastos == Decimal("15800")
    progreso = next(
        item_resumen
        for item_resumen in resumen_actual.presupuesto_items
        if item_resumen.id == item.id
    )
    assert progreso.monto_ejecutado == Decimal("15800")
    assert progreso.monto_estimado == Decimal("100000")


def test_deja_sin_vincular_si_el_item_ordinario_es_ambiguo(db_session):
    usuario = _crear_usuario(db_session, "ambiguous")
    categoria = _crear_categoria(db_session, usuario, "ambiguous")
    _, actual = _crear_ciclos_adyacentes(db_session, usuario)
    db_session.add_all([
        models.PresupuestoItem(
            ciclo_id=actual.id,
            user_category_id=categoria.id,
            monto_estimado=Decimal("100000"),
            confirmado=True,
        ),
        models.PresupuestoItem(
            ciclo_id=actual.id,
            user_category_id=categoria.id,
            monto_estimado=Decimal("50000"),
            confirmado=True,
        ),
    ])
    movimiento = _movimiento_legacy(
        usuario,
        categoria,
        "8000",
        datetime(2026, 8, 31, 12, 0),
        "Ambiguous",
    )
    db_session.add(movimiento)
    db_session.flush()

    _ejecutar_reparacion(db_session)
    db_session.refresh(movimiento)

    assert movimiento.fecha == movimiento.created_at
    assert movimiento.presupuesto_item_id is None


def test_no_retrocede_tras_sucesor_vencido_y_falla_cerrado_con_inicios_duplicados(
    db_session,
):
    usuario = _crear_usuario(db_session, "expired-successor")
    categoria = _crear_categoria(db_session, usuario, "expired-successor")
    anterior, sucesor = _crear_ciclos_adyacentes(db_session, usuario)
    sucesor.fecha_fin = datetime(2026, 8, 31, 11, 30)
    item_anterior = models.PresupuestoItem(
        ciclo_id=anterior.id,
        user_category_id=categoria.id,
        monto_estimado=Decimal("100000"),
        confirmado=True,
    )
    item_sucesor = models.PresupuestoItem(
        ciclo_id=sucesor.id,
        user_category_id=categoria.id,
        monto_estimado=Decimal("100000"),
        confirmado=True,
    )
    duplicados = [
        models.Ciclo(
            user_id=usuario.id,
            fecha_inicio=datetime(2026, 8, 31, 13, 0),
            fecha_fin=datetime(2026, 8, 31, 14, 0),
            ahorro_objetivo=Decimal("0"),
            activo=False,
        )
        for _ in range(2)
    ]
    db_session.add_all([item_anterior, item_sucesor, *duplicados])
    db_session.flush()
    despues_del_sucesor = _movimiento_legacy(
        usuario,
        categoria,
        "8000",
        datetime(2026, 8, 31, 12, 30),
        "After expired successor",
    )
    inicio_duplicado = _movimiento_legacy(
        usuario,
        categoria,
        "7800",
        datetime(2026, 8, 31, 13, 10),
        "Ambiguous duplicate start",
    )
    db_session.add_all([despues_del_sucesor, inicio_duplicado])
    db_session.flush()

    _ejecutar_reparacion(db_session)
    db_session.refresh(despues_del_sucesor)
    db_session.refresh(inicio_duplicado)

    for movimiento in [despues_del_sucesor, inicio_duplicado]:
        assert movimiento.fecha == datetime(2026, 8, 31, 0, 0)
        assert movimiento.presupuesto_item_id is None


def test_no_toca_fecha_historica_ni_reserva_programada(db_session):
    usuario = _crear_usuario(db_session, "controls")
    categoria = _crear_categoria(db_session, usuario, "controls")
    anterior, actual = _crear_ciclos_adyacentes(db_session, usuario)
    programado = models.GastoProgramado(
        user_id=usuario.id,
        importe=Decimal("8000"),
        vencimiento=datetime(2026, 9, 5).date(),
        descripcion="Scheduled",
        user_category_id=categoria.id,
    )
    db_session.add(programado)
    db_session.flush()
    reserva = models.PresupuestoItem(
        ciclo_id=actual.id,
        user_category_id=categoria.id,
        monto_estimado=Decimal("8000"),
        confirmado=True,
        gasto_programado_id=programado.id,
    )
    historico = models.Movimiento(
        user_id=usuario.id,
        user_category_id=categoria.id,
        importe=Decimal("4000"),
        fecha=datetime(2026, 8, 30, 0, 0),
        created_at=datetime(2026, 8, 31, 12, 0),
        descripcion="Historical entry",
        tipo="gasto",
    )
    reservado = _movimiento_legacy(
        usuario,
        categoria,
        "8000",
        datetime(2026, 8, 31, 12, 30),
        "Scheduled control",
    )
    item_medianoche = models.PresupuestoItem(
        ciclo_id=anterior.id,
        user_category_id=categoria.id,
        monto_estimado=Decimal("10000"),
        confirmado=True,
    )
    medianoche_exacta = _movimiento_legacy(
        usuario,
        categoria,
        "10000",
        datetime(2026, 8, 31, 0, 0),
        "Intentional exact midnight",
    )
    db_session.add_all([
        reserva,
        historico,
        reservado,
        item_medianoche,
        medianoche_exacta,
    ])
    db_session.flush()

    _ejecutar_reparacion(db_session)
    db_session.refresh(historico)
    db_session.refresh(reservado)
    db_session.refresh(medianoche_exacta)

    assert historico.fecha == datetime(2026, 8, 30, 0, 0)
    assert historico.presupuesto_item_id is None
    assert reservado.fecha == reservado.created_at
    assert reservado.presupuesto_item_id is None
    assert medianoche_exacta.fecha == datetime(2026, 8, 31, 0, 0)
    assert medianoche_exacta.presupuesto_item_id is None


def test_reparacion_no_cruza_usuarios(db_session):
    usuario = _crear_usuario(db_session, "tenant-one")
    otro_usuario = _crear_usuario(db_session, "tenant-two")
    categoria = models.Category(nombre="Shared legacy category")
    db_session.add(categoria)
    db_session.flush()

    _, ciclo_usuario = _crear_ciclos_adyacentes(db_session, usuario)
    _, ciclo_ajeno = _crear_ciclos_adyacentes(db_session, otro_usuario)
    item_usuario = models.PresupuestoItem(
        ciclo_id=ciclo_usuario.id,
        categoria_id=categoria.id,
        monto_estimado=Decimal("100000"),
        confirmado=True,
    )
    item_ajeno = models.PresupuestoItem(
        ciclo_id=ciclo_ajeno.id,
        categoria_id=categoria.id,
        monto_estimado=Decimal("100000"),
        confirmado=True,
    )
    movimiento = models.Movimiento(
        user_id=usuario.id,
        categoria_id=categoria.id,
        importe=Decimal("8000"),
        fecha=datetime(2026, 8, 31, 0, 0),
        created_at=datetime(2026, 8, 31, 12, 0),
        descripcion="Tenant safe",
        tipo="gasto",
    )
    db_session.add_all([item_usuario, item_ajeno, movimiento])
    db_session.flush()

    _ejecutar_reparacion(db_session)
    db_session.refresh(movimiento)

    assert movimiento.presupuesto_item_id == item_usuario.id
    assert movimiento.presupuesto_item_id != item_ajeno.id
