# Feature: Correcciones de seguridad — CSRF y revocación de sesiones

## Objetivo

Cerrar los dos hallazgos MEDIOS de la auditoría de seguridad (commit 879bf3e):

1. **CSRF en producción**: cookies con `SameSite=None` + sin validación de Origin.
   Usted tiene una API que es vulnerable a una *cross-site request* desde un sitio malicioso
   (por ejemplo, `POST /auth/logout` o `POST /gastos-programados/{id}/pagar`).
   Para mitigarlo, el backend debe rechazar requests con método que cambie estado
   (POST/PUT/PATCH/DELETE) cuyo header `Origin` no esté en `ALLOWED_ORIGINS`.

2. **Revocación de refresh tokens** al cambiar o resetear la contraseña: las sesiones
   existentes deben quedar inválidas cuando el usuario cambia su password.

## Alcance

- `backend/main.py`: agregar middleware `OriginCheckMiddleware` que valide `Origin` para requests de mutación.
- `backend/services/auth_service.py`: revocar refresh tokens activos del usuario en `cambiar_password` y `resetear_password`.
- Tests: cubrir el middleware (origin permitido / no permitido / ausente) y la revocación.

Fuera de alcance: frontend, migraciones, deploy, security headers (LOW separado).

## Tareas

- [x] **T1**: Implementar `OriginCheckMiddleware` en `backend/main.py` — clase post-RequestLogging, más externo; bloquea POST/PUT/PATCH/DELETE con Origin fuera de ALLOWED_ORIGINS (403 `"Origen no permitido"`); GET/HEAD/OPTIONS y requests sin Origin pasan (cron/curl/tests). Evidencia: suite + test_csrf.py.
- [x] **T2**: Revocar refresh tokens en `cambiar_password` y `resetear_password` — helper `_revocar_refresh_tokens` (UPDATE revoked=True, synchronize_session=False) llamado antes del commit en ambas ramas.
- [x] **T3**: Tests para middleware de Origin — `backend/tests/test_csrf.py`: origin malicioso → 403, origin permitido → 200, sin origin → 200, GET con origin malicioso → 401 (llega a ruta).
- [x] **T4**: Tests para revocación de refresh tokens — `backend/tests/test_auth.py`: `test_change_password_revoca_refresh_token`, `test_reset_password_revoca_refresh_token` → refresh 200 antes, 401 después.

## Check evidence

- `SECRET_KEY=test python -m pytest backend/tests/ -v` → **181 passed** (padre re-ejecutó; writer 181 passed)
- Commit `9d28bf9` — `fix(auth): validar Origin en requests de escritura (CSRF)` (main.py + test_csrf.py)
- Commit `1c49888` — `fix(auth): revocar refresh tokens al cambiar o resetear contraseña` (auth_service.py + test_auth.py)
- Nota: commits con `--no-verify` por bloqueo del hook GGA en este runtime (free tier de OpenCode CLI); usuario autorizó.

## Checks

- `SECRET_KEY=test python -m pytest backend/tests/ -v` — debe pasar sin nuevos failures
- Sin logs de debug, sin TODOs sin issue, sin dead code

## Arcón (RDD)

- RDD: off (decidido por default) — no hay review que arrancar; entrega por policy ordinaria.
- Correcciones por unidad de trabajo con commits en branch `fix/security-csrf-revocacion`.