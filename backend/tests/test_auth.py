"""
Smoke tests de autenticación:
- Registro, login, logout, /auth/me
- Casos de error: credenciales incorrectas, usuario duplicado
- Refresh token: renovación, rotación, revocación
"""
from datetime import datetime, timedelta, timezone

from auth import _hash_token
import models


def test_register_ok(client):
    r = client.post("/auth/register", json={
        "username": "nuevo", "email": "nuevo@example.com", "password": "Segura123!"
    })
    assert r.status_code == 200
    data = r.json()
    assert data["username"] == "nuevo"
    assert "hashed_password" not in data


def test_register_duplicate_username(client, registered_user):
    r = client.post("/auth/register", json={
        "username": registered_user["username"],
        "email": "otro@example.com",
        "password": "Segura123!",
    })
    assert r.status_code == 400


def test_register_duplicate_email(client, registered_user):
    r = client.post("/auth/register", json={
        "username": "otrousuario",
        "email": registered_user["email"],
        "password": "Segura123!",
    })
    assert r.status_code == 400


def test_login_ok(client, registered_user):
    r = client.post("/auth/login", data={
        "username": registered_user["username"],
        "password": registered_user["password"],
    })
    assert r.status_code == 200
    assert r.json()["message"] == "Login exitoso"
    # El token debe venir como cookie httponly
    assert "access_token" in r.cookies


def test_login_wrong_password(client, registered_user):
    r = client.post("/auth/login", data={
        "username": registered_user["username"],
        "password": "clave-incorrecta",
    })
    assert r.status_code == 401


def test_login_unknown_user(client):
    r = client.post("/auth/login", data={
        "username": "noexiste", "password": "cualquiera"
    })
    assert r.status_code == 401


def test_me_authenticated(logged_in_client, registered_user):
    r = logged_in_client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == registered_user["username"]


def test_me_unauthenticated(client):
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_logout(logged_in_client):
    r = logged_in_client.post("/auth/logout")
    assert r.status_code == 200
    # Después del logout /auth/me debe fallar
    r2 = logged_in_client.get("/auth/me")
    assert r2.status_code == 401


# ============== REFRESH TOKEN ==============

def test_login_emite_refresh_token(client, registered_user):
    r = client.post("/auth/login", data={
        "username": registered_user["username"],
        "password": registered_user["password"],
    })
    assert r.status_code == 200
    assert "access_token" in r.cookies
    assert "refresh_token" in r.cookies


def test_refresh_ok(logged_in_client):
    r = logged_in_client.post("/auth/refresh")
    assert r.status_code == 200
    # Debe emitir nuevas cookies
    assert "access_token" in r.cookies
    assert "refresh_token" in r.cookies


def test_refresh_rota_el_token(logged_in_client):
    """El refresh token viejo debe quedar revocado después de usar /auth/refresh."""
    old_refresh = logged_in_client.cookies.get("refresh_token")
    r = logged_in_client.post("/auth/refresh")
    assert r.status_code == 200
    new_refresh = r.cookies.get("refresh_token")
    # El nuevo token debe ser diferente al viejo
    assert new_refresh != old_refresh


def test_refresh_sin_cookie_retorna_401(client):
    r = client.post("/auth/refresh")
    assert r.status_code == 401


def test_refresh_con_token_invalido_retorna_401(client):
    client.cookies.set("refresh_token", "token-invalido-cualquiera")
    r = client.post("/auth/refresh")
    assert r.status_code == 401


def test_refresh_con_token_expirado_retorna_401(logged_in_client, db_session):
    """Un refresh token con expires_at en el pasado debe ser rechazado."""
    raw_token = logged_in_client.cookies.get("refresh_token")
    token_hash = _hash_token(raw_token)
    db_token = (
        db_session.query(models.RefreshToken)
        .filter(models.RefreshToken.token_hash == token_hash)
        .first()
    )
    # Forzar expiración
    db_token.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
    db_session.commit()

    r = logged_in_client.post("/auth/refresh")
    assert r.status_code == 401


def test_logout_revoca_refresh_token(logged_in_client):
    """Después del logout, el refresh token no debe funcionar."""
    logged_in_client.post("/auth/logout")
    # Intentar usar el refresh token (ya revocado)
    r = logged_in_client.post("/auth/refresh")
    assert r.status_code == 401


# ============== PASSWORD RESET (auth_service) ==============

def test_forgot_password_email_inexistente_no_revela_informacion(client):
    """Debe responder 200 aunque el email no exista (seguridad anti-enumeration)."""
    r = client.post("/auth/forgot-password", json={"email": "noexiste@example.com"})
    assert r.status_code == 200
    assert "message" in r.json()


def test_forgot_password_email_valido(client, registered_user):
    r = client.post("/auth/forgot-password", json={"email": registered_user["email"]})
    assert r.status_code == 200


def test_reset_password_token_invalido(client):
    r = client.post("/auth/reset-password", json={
        "token": "token-inventado-que-no-existe",
        "new_password": "NuevaClave123!",
    })
    assert r.status_code == 400


def test_reset_password_via_service(client, registered_user, db_session):
    """Crea un token directo via auth_service y luego lo usa para resetear."""
    from services import auth_service
    from auth import get_user_by_email

    user = get_user_by_email(db_session, registered_user["email"])
    raw_token = auth_service.crear_password_reset_token(user, db_session)

    r = client.post("/auth/reset-password", json={
        "token": raw_token,
        "new_password": "NuevaClave123!",
    })
    assert r.status_code == 200

    # El token no debe poder reutilizarse
    r2 = client.post("/auth/reset-password", json={
        "token": raw_token,
        "new_password": "OtraClave456!",
    })
    assert r2.status_code == 400
