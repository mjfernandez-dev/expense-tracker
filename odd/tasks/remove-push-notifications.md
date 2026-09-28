# Feature: Eliminar notificaciones push (Web Push) y el Historial de gastos programados

## Objetivo

Desmontar por completo la funcionalidad de notificaciones Web Push y el Historial de
gastos programados. El push no funcionó nunca en producción y el usuario decidió
sacarlo en lugar de seguir depurándolo.

Incluye el drop de la tabla `push_subscriptions` y de las 4 columnas que existían
**solo** para calcular la ventana de notificación.

## Problema

Diagnóstico del 25/09/2026: las notificaciones nunca llegaron. Causas acumuladas:

1. El opt-in solo se disparaba con la transición `dia_vencimiento: null → valor`
   (`PresupuestoManager.tsx:126`), un evento único sin reintento. Con el campo ya
   cargado, la suscripción era imposible de activar.
2. `/push/vapid-public-key` devolvía 503 en el entorno Docker: `docker-compose.yml`
   no pasa ninguna variable `VAPID_*` al backend y no usa `env_file`.
3. El job `check_vencimientos` (GastosFijo) solo existía como cron in-process de
   APScheduler, sin endpoint HTTP para Cloud Scheduler. En Cloud Run con
   scale-to-zero no se disparaba.
4. `gasto_programado_service.py:426` marcaba `last_notified_on` de forma
   incondicional, incluso cuando el push fallaba: un fallo dejaba sin reintento
   hasta el día siguiente.

## Alcance

### Backend — borrar archivo completo
- `backend/routers/push.py` — 3 endpoints (`/vapid-public-key`, `POST|DELETE /subscribe`)
- `backend/services/push_service.py` — envío, upsert y borrado de suscripción
- `backend/tests/test_push_integration.py`
- `backend/tests/test_cron.py`

### Backend — recortes
- `services/gasto_programado_service.py` — quitar `notificar_gastos_programados`,
  `gastos_programados_por_notificar`, `marcar_gastos_programados_notificados` e
  el import de `push_service`.
- `services/scheduler_service.py` — quitar el job `check_vencimientos`,
  `_job_check_vencimientos`, `should_notify`, `effective_day` e el import de
  `send_push_notification`. Conservar `create_scheduler` (limpieza de tokens) y
  `_job_cleanup_tokens`.
- `routers/cron.py` — borrar el archivo completo (su único endpoint es el de
  notificaciones) y quitar su registro en `main.py`.
- `main.py` — quitar el registro del router `push` y del router `cron`.
- `schemas.py` — quitar `PushSubscribeRequest` y `PushSubscribeResponse`.
- `models.py` — quitar el modelo `PushSubscription` y los 4 campos de abajo.
- `requirements.txt` — quitar `pywebpush>=2.0.0`.

### Frontend
- `frontend/src/services/push.ts` — borrar archivo completo.
- `frontend/src/components/PresupuestoManager.tsx` — quitar el import (L6), el
  estado `showPushConfirm` (L60), `triggerPushOptIn` (L79-98),
  `handlePushOptInConfirm` (L100-112), el disparo dentro de `handleVencimientoBlur`
  (L126-128), el aviso `!isPushSupported()` (L557) y el modal de confirmación (L705+).
  **No tocar** `autoSaveError` / `setAutoSaveError`: es compartido con el auto-save
  del porcentaje (L189) y de los montos (L213, L243).
- `frontend/public/sw.js` — quitar solo los listeners `push` y `notificationclick`
  (L14-42). **Conservar** `registerSW` en `main.tsx` y todo el precache de Workbox:
  de eso depende el modo offline y que la app sea instalable.

### Migración Alembic
Nuevo archivo en `backend/alembic/versions/`, con `down_revision = 'a50e8bfdc426'`
(head actual, cadena lineal) y un `revision` real de 12 chars hex, nunca placeholder.
`downgrade()` recrea todo lo que el `upgrade()` dropea.

- drop table `push_subscriptions`
- drop column `gastos_fijos.dia_vencimiento`
- drop column `gastos_fijos.dias_anticipacion`
- drop column `gastos_programados.dias_anticipacion`
- drop column `gastos_programados.last_notified_on`

**Se conserva** `gastos_programados.vencimiento`: es núcleo, se muestra en los
pendientes.

Fuera de alcance: infra de GCP (env vars `VAPID_*` / `CRON_SECRET` en Cloud Run y el
job de Cloud Scheduler) — requiere acceso del usuario, ver "Pendiente manual".

## Tareas

- [ ] **T1**: Backend — borrar los 4 archivos completos.
- [ ] **T2**: Backend — recortes en `gasto_programado_service.py`,
  `scheduler_service.py`, `main.py`, `schemas.py`, `models.py`, `requirements.txt`.
- [ ] **T3**: Frontend — borrar `push.ts` y recortar `PresupuestoManager.tsx` y `sw.js`.
- [ ] **T4**: Migración Alemmic con `down_revision = 'a50e8bfdc426'`, drop de tabla +
  4 columnas, `downgrade()` completo.
- [ ] **T5**: Ajustar `backend/tests/test_gastos_programados.py:66`, que asserta el
  default de `dias_anticipacion` (campo que deja de existir).
- [ ] **T6**: Verificar — suite backend completa, typecheck y tests frontend.

## Checks

- `SECRET_KEY=test python -m pytest backend/tests/ -v` — debe pasar sin nuevos
  failures respecto de la línea base
- `npx tsc -b` en `frontend/` — exit 0
- `npm test` en `frontend/` — 24/24 (línea base actual)
- Sin logs de debug, sin TODOs sin issue, sin código muerto ni imports huérfanos
- Alembic: `alembic heads` debe mostrar un solo head nuevo

## Pendiente manual (requiere acceso del usuario, no lo hace el código)

- [ ] Borrar env vars `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_MAILTO` de Cloud Run.
- [ ] Borrar `CRON_SECRET` de Cloud Run y su default en `backend/Dockerfile`.
- [ ] **Borrar el job de Cloud Scheduler** que pega a
      `/api/cron/notificar-gastos-programados`. Si queda vivo tras borrar el
      endpoint, llena los logs de 404 todos los días.
- [ ] Rotar `CRON_SECRET`: quedó expuesto en una conversación de debugging.
