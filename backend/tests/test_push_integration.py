"""
Integration tests for the push notification infrastructure.

Test 1: POST /push/subscribe upsert — same endpoint updates row in-place
Test 2: Scheduler job deletes stale subscription on 410 response
"""
import sys
import os
from datetime import date
from unittest.mock import patch

# Ensure the backend root is on the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import models
from services.scheduler_service import _job_check_vencimientos


# ── Helper ─────────────────────────────────────────────────────────────────

def _register_and_login(client) -> dict:
    payload = {
        "username": "pushuser",
        "email": "push@example.com",
        "password": "PushPass123!",
    }
    r = client.post("/auth/register", json=payload)
    assert r.status_code == 200, r.text
    r = client.post("/auth/login", json={
        "username": payload["username"],
        "password": payload["password"],
    })
    assert r.status_code == 200, r.text
    return payload


# ── Test 1: subscribe upsert ────────────────────────────────────────────────

def test_subscribe_upsert_same_endpoint_updates_row(client, db_session):
    """
    POST /push/subscribe with the same endpoint twice:
    - second call updates p256dh/auth in-place (no duplicate row)
    - returns the same subscription id
    """
    creds = _register_and_login(client)
    _ = creds  # login already set the session cookie

    first = client.post("/push/subscribe", json={
        "endpoint": "https://e1.example.com/push",
        "p256dh": "k1",
        "auth": "a1",
    })
    assert first.status_code == 200, first.text
    first_id = first.json()["id"]

    second = client.post("/push/subscribe", json={
        "endpoint": "https://e1.example.com/push",
        "p256dh": "k2",
        "auth": "a2",
    })
    assert second.status_code == 200, second.text
    second_id = second.json()["id"]

    # Same ID — no duplicate row
    assert first_id == second_id

    # Exactly one row in the DB for this endpoint
    rows = (
        db_session.query(models.PushSubscription)
        .filter(models.PushSubscription.endpoint == "https://e1.example.com/push")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].p256dh == "k2"
    assert rows[0].auth == "a2"


# ── Test 2: scheduler deletes expired subscription on 410 ──────────────────

def test_scheduler_deletes_subscription_on_410(db_session):
    """
    When send_push_notification returns False (simulates 410 Gone),
    the scheduler job deletes the subscription row and does not raise.
    """
    from auth import get_password_hash

    # Create test data directly in the fixture DB
    user = models.User(
        username="scheduler_test_user",
        email="sched@example.com",
        hashed_password=get_password_hash("Test1234!"),
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()  # get user.id

    # GastoFijo that should_notify returns True for today:
    # dia_vencimiento = today's day, dias_anticipacion = 0 → fires on the due day
    today = date.today()
    gf = models.GastoFijo(
        user_id=user.id,
        descripcion="Test Servicio",
        activo=True,
        dia_vencimiento=today.day,
        dias_anticipacion=0,
    )
    db_session.add(gf)
    db_session.flush()

    # Create a PushSubscription for this user
    sub = models.PushSubscription(
        user_id=user.id,
        endpoint="https://expired.example.com/push",
        p256dh="some_key",
        auth="some_auth",
    )
    db_session.add(sub)
    db_session.flush()
    sub_id = sub.id

    # Wrap db_session so close() is a no-op (prevents fixture teardown issues)
    class _NoCloseSession:
        """Delegates everything to the real session except close()."""
        def __init__(self, real):
            self._real = real

        def __getattr__(self, name):
            return getattr(self._real, name)

        def close(self):
            pass  # Do NOT close the fixture session

    wrapped = _NoCloseSession(db_session)

    # Patch send_push_notification to return False (simulate 410 response)
    # Patch SessionLocal so the job uses the same fixture DB connection
    with patch(
        "services.scheduler_service.send_push_notification",
        return_value=False,
    ), patch(
        "services.scheduler_service.SessionLocal",
        return_value=wrapped,
    ):
        # Job must not raise even on 410
        _job_check_vencimientos()

    # Subscription must be deleted
    remaining = (
        db_session.query(models.PushSubscription)
        .filter(models.PushSubscription.id == sub_id)
        .first()
    )
    assert remaining is None, "Stale subscription should have been deleted on 410"
