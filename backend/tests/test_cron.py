"""
Tests del cron de recordatorios de gastos programados:

- Lógica de ventana de notificación: gastos_programados_por_notificar /
  marcar_gastos_programados_notificados.
- Endpoint POST /api/cron/notificar-gastos-programados: secret, idempotencia
  diaria, fallo de un usuario sin abortar el run.
"""
from datetime import date, timedelta

import pytest

import models
from services import gasto_programado_service, push_service
from services.ciclo_time_service import ahora_buenos_aires


def _hoy() -> date:
    return ahora_buenos_aires().date()


def _crear_usuario(db_session, username: str):
    from auth import get_password_hash

    user = models.User(
        username=username,
        email=f"{username}@test.com",
        hashed_password=get_password_hash("Test123!"),
    )
    db_session.add(user)
    db_session.flush()
    return user


def _crear_gp(
    db_session,
    user_id: int,
    vencimiento: date,
    dias_anticipacion: int = 2,
    last_notified_on=None,
    estado: str = "pendiente",
):
    gp = models.GastoProgramado(
        user_id=user_id,
        importe=100,
        vencimiento=vencimiento,
        descripcion=f"GP {vencimiento.isoformat()}",
        dias_anticipacion=dias_anticipacion,
        last_notified_on=last_notified_on,
        estado=estado,
    )
    db_session.add(gp)
    db_session.flush()
    return gp


def _crear_suscripcion(db_session, user_id: int, endpoint: str):
    sub = models.PushSubscription(
        user_id=user_id,
        endpoint=endpoint,
        p256dh="p256dh-test",
        auth="auth-test",
    )
    db_session.add(sub)
    db_session.flush()
    return sub


# ── 1. Lógica de ventana (service level) ─────────────────────────────────────

def test_por_notificar_ventana_y_exclusiones(db_session):
    u = _crear_usuario(db_session, "u_ventana")
    hoy = _hoy()

    _crear_gp(db_session, u.id, vencimiento=hoy + timedelta(days=2), dias_anticipacion=2)
    _crear_gp(db_session, u.id, vencimiento=hoy + timedelta(days=1), dias_anticipacion=0)
    _crear_gp(db_session, u.id, vencimiento=hoy - timedelta(days=5), dias_anticipacion=2)
    _crear_gp(db_session, u.id, vencimiento=hoy + timedelta(days=2), dias_anticipacion=2, last_notified_on=hoy)
    _crear_gp(db_session, u.id, vencimiento=hoy + timedelta(days=1), dias_anticipacion=2, last_notified_on=hoy - timedelta(days=1))
    _crear_gp(db_session, u.id, vencimiento=hoy + timedelta(days=2), dias_anticipacion=2, estado="pagado")

    due = gasto_programado_service.gastos_programados_por_notificar(db_session, hoy)
    assert [gp.vencimiento for gp in due] == [
        hoy - timedelta(days=5),
        hoy + timedelta(days=1),
        hoy + timedelta(days=2),
    ]


def test_por_notificar_agrupa_y_ordena_por_usuario(db_session):
    u1 = _crear_usuario(db_session, "u_orden1")
    u2 = _crear_usuario(db_session, "u_orden2")
    hoy = _hoy()

    _crear_gp(db_session, u2.id, vencimiento=hoy + timedelta(days=1))
    _crear_gp(db_session, u1.id, vencimiento=hoy + timedelta(days=2))
    _crear_gp(db_session, u1.id, vencimiento=hoy + timedelta(days=1))

    due = gasto_programado_service.gastos_programados_por_notificar(db_session, hoy)
    assert [(gp.user_id, gp.vencimiento) for gp in due] == [
        (u1.id, hoy + timedelta(days=1)),
        (u1.id, hoy + timedelta(days=2)),
        (u2.id, hoy + timedelta(days=1)),
    ]


def test_marcar_gastos_programados_notificados(db_session):
    u = _crear_usuario(db_session, "u_marcar")
    hoy = _hoy()
    gp1 = _crear_gp(db_session, u.id, vencimiento=hoy + timedelta(days=2))
    gp2 = _crear_gp(db_session, u.id, vencimiento=hoy + timedelta(days=3))
    db_session.commit()

    gasto_programado_service.marcar_gastos_programados_notificados(
        [gp1.id, gp2.id], db_session, hoy
    )

    db_session.expire_all()
    assert db_session.get(models.GastoProgramado, gp1.id).last_notified_on == hoy
    assert db_session.get(models.GastoProgramado, gp2.id).last_notified_on == hoy


# ── 2. Endpoint: secret e idempotencia ───────────────────────────────────────

@pytest.fixture
def cron_secret(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "cron-secret-de-test")
    return "cron-secret-de-test"


def test_cron_requiere_secret(client, cron_secret):
    r = client.post("/cron/notificar-gastos-programados")
    assert r.status_code == 403

    r = client.post(
        "/cron/notificar-gastos-programados",
        headers={"X-Cron-Secret": "secreto-incorrecto"},
    )
    assert r.status_code == 403


def test_cron_sin_secret_configurado_403(client, monkeypatch):
    monkeypatch.delenv("CRON_SECRET", raising=False)
    r = client.post(
        "/cron/notificar-gastos-programados",
        headers={"X-Cron-Secret": "cualquiera"},
    )
    assert r.status_code == 403


def test_cron_notifica_una_vez_y_marca(client, db_session, cron_secret, monkeypatch):
    u = _crear_usuario(db_session, "u_cron_api")
    hoy = _hoy()
    gp = _crear_gp(db_session, u.id, vencimiento=hoy + timedelta(days=2), dias_anticipacion=2)
    _crear_suscripcion(db_session, u.id, endpoint="https://push.example.com/api1")
    db_session.commit()

    llamadas = []

    def fake_send(sub, payload):
        llamadas.append((sub.endpoint, payload["title"], payload["url"]))
        return True

    monkeypatch.setattr(push_service, "send_push_notification", fake_send)

    r = client.post(
        "/cron/notificar-gastos-programados",
        headers={"X-Cron-Secret": cron_secret},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"notified": 1, "users": 1, "failed": 0}
    assert len(llamadas) == 1
    assert llamadas[0][1] == "Recordatorio de gasto programado"
    assert llamadas[0][2] == "/"

    db_session.expire_all()
    assert db_session.get(models.GastoProgramado, gp.id).last_notified_on == hoy

    # Segunda corrida el mismo día: no notifica nada (idempotente)
    r2 = client.post(
        "/cron/notificar-gastos-programados",
        headers={"X-Cron-Secret": cron_secret},
    )
    assert r2.status_code == 200, r2.text
    assert r2.json() == {"notified": 0, "users": 0, "failed": 0}
    assert len(llamadas) == 1


def test_cron_fallo_de_un_usuario_no_aborta(client, db_session, cron_secret, monkeypatch):
    u_fail = _crear_usuario(db_session, "u_cron_fail")
    u_ok = _crear_usuario(db_session, "u_cron_ok")
    hoy = _hoy()
    gp_fail = _crear_gp(db_session, u_fail.id, vencimiento=hoy + timedelta(days=1))
    gp_ok = _crear_gp(db_session, u_ok.id, vencimiento=hoy + timedelta(days=1))
    _crear_suscripcion(db_session, u_fail.id, endpoint="https://push.example.com/fail")
    _crear_suscripcion(db_session, u_ok.id, endpoint="https://push.example.com/ok")
    db_session.commit()

    def fake_send(sub, payload):
        if "fail" in sub.endpoint:
            raise RuntimeError("push caído")
        return True

    monkeypatch.setattr(push_service, "send_push_notification", fake_send)

    r = client.post(
        "/cron/notificar-gastos-programados",
        headers={"X-Cron-Secret": cron_secret},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"notified": 1, "users": 2, "failed": 1}

    # Igual se marcan todos como notificados hoy (idempotencia del día)
    db_session.expire_all()
    assert db_session.get(models.GastoProgramado, gp_fail.id).last_notified_on == hoy
    assert db_session.get(models.GastoProgramado, gp_ok.id).last_notified_on == hoy
