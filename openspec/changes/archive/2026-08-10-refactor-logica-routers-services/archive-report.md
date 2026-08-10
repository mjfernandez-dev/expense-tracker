# Archive Report: refactor-logica-routers-services

**Status**: Archived — change fully planned, implemented, verified, and closed.
**Archived to**: `openspec/changes/archive/2026-08-10-refactor-logica-routers-services/`
**Close date**: 2026-08-10

## Goal

Move business orchestration out of routers into services (movimiento + user-category), remove dead code, and relocate the email service under `services/`, keeping the API contract unchanged. The project rule "business logic belongs in `backend/services/`, NOT inside routers" becomes enforced for the touched features, and the commit gate (Gentleman Guardian Angel v2.10.1) passes on every delivered commit.

## What Was Delivered

| Commit | Content | Gate |
|--------|---------|------|
| `06847b2` | docs(sdd): planning artifacts (proposal/spec/design/tasks) | n/a (.md) |
| `f7d95ce` | WU1: dead-code poda (config, conftest, push.ts, .env.example, migrate_encryption.py deletion) | ✅ PASSED |
| `add9fbc` | WU2: router→service refactor (`movimiento_service`, `user_category_service`, thin routers, schemas poda, `email_service` relocation, service tests) | ✅ PASSED |
| `1015ec9` | docs(sdd): mark apply task complete | n/a (.md) |
| `e2540ab` | docs(sdd): verify report | n/a (.md) |

All commits pushed to `origin/main` (`377e7a5..e2540ab`).

## Implementation Summary

- `backend/services/movimiento_service.py` — owns the full pipeline: `listar_movimientos`, `crear_movimiento`, `actualizar_movimiento`, `eliminar_movimiento`, `buscar_descripciones`, `_validate_categoria`, plus pre-existing presupuesto helpers (`load_presupuesto_item`, `resolve_clasificacion`, `unlink_presupuesto_item_on_delete`, `auto_detectar_presupuesto_item`, `apply_presupuesto_item_link`). es_fijo GastoFijo flow preserved with `db.add(gf)` / `db.flush()` / `db_movimiento.gasto_fijo_id = gf.id` and NO dead local variable.
- `backend/routers/movimientos.py` — pure delegator; zero `db.query` / `db.delete` / `db.commit` inline (verified). `joinedload` import removed only after `listar_movimientos` moved to the service.
- `backend/routers/categorias.py` — `update_user_category` = fetch via `obtener_categoria_usuario` + single `actualizar_user_category` call; no direct `verificar_nombre_unico`.
- `backend/services/user_category_service.py` — `actualizar_user_category` runs `verificar_nombre_unico(...)` BEFORE mutation → HTTP 400, no persist (REQ-RS-05).
- `backend/schemas.py` — dead `Token` and `CategoryCreate` deleted; `MoneyDecimal` (line 9, float wire serializer) untouched — pre-existing design debt, accepted by the gate this cycle.
- `backend/email_service.py` → `backend/services/email_service.py` — relocated; `send_two_factor_code` + `send_welcome_email` removed (no callers); `datetime.now().year` → `ahora_buenos_aires().year`; template loader path fixed. `routers/auth.py` import updated.

## Verification Evidence (per verify-report.md `e2540ab`, snapshot at verify time; final state unchanged at close)

- Requirements: **8/8 REQ-RS satisfied** (RS-01..RS-08). Scenarios: **10/10**.
- Tests: **119 passed, 0 failed** (`SECRET_KEY=test python -m pytest backend/tests/ -v`), including `test_gastos_fijos.py` / `test_ciclos.py` regression coverage.
- Frontend typecheck: `npx tsc --noEmit` → exit 0.
- 5 new service-level tests: `test_service_crear_movimiento_es_fijo_crea_template`, `test_service_crear_movimiento_sin_categoria_400`, `test_service_crear_movimiento_autovincula_presupuesto`, `test_service_actualizar_movimiento_autovincula_presupuesto`, `test_service_actualizar_categoria_nombre_duplicado_400` (+3 endpoint tests for `search_descripciones`).
- Greps: zero references to removed symbols (`Token` schema, `CategoryCreate`, `send_two_factor_code`, `send_welcome_email`, `from email_service`).

## Accepted Follow-ups (NOT blockers — recorded for future work)

1. `backend/services/email_service.py:25` reads `FRONTEND_URL` via `os.getenv` locally (intentional standalone env read; does NOT reference removed `config.FRONTEND_URL`).
2. `docker-compose.yml` (lines 58–59, 94) and `README.md:133` still mention removed keys (`FRONTEND_URL`, `BACKEND_URL`, `MP_ACCESS_TOKEN`) — future docs chore.
3. `listar_movimientos` date boundary: `fecha_hasta` as date excludes same-day movements with non-midnight times (pre-existing behavior, moved verbatim).
4. `buscar_descripciones` in-memory scan has no cap before sorting/slicing (documented EncryptedString tradeoff; `limit` applied after aggregation).
5. `backend/routers/ciclos.py` and `backend/routers/gastos_fijos.py` still contain inline `db.query` in routers — same violation class as this change, out of scope; candidates for a future refactor.
6. Orphaned templates `backend/templates/two_factor_code.html` + `welcome.html` after sender removal — cleanup candidates.
7. Migration filename `backend/alembic/versions/xxxx_replace_gasto_fijo_with_presupuesto.py` — content healthy (revision `e5d4c3b2a1f0` chains correctly), only the `xxxx` prefix deviates from the naming convention; rename candidate.

## Spec Sync

- Delta spec `specs/router-service-boundaries/spec.md` synced to project store: **created** `openspec/specs/router-service-boundaries/spec.md` (byte-identical copy, hash `62947259f1708e9d0730e49a641575dbc9c7a21a`).
- No `openspec/config.yaml` — no `rules.archive` to apply.

## Archive Integrity

- Mechanical move via `git mv` from `openspec/changes/refactor-logica-routers-services/` to `openspec/changes/archive/2026-08-10-refactor-logica-routers-services/`.
- Readback: all 5 archived files byte-identical to HEAD blobs (`git hash-object` vs `git rev-parse HEAD:<path>`), 0 mismatches; source folder gone (`Test-Path` false).
- Archive contents: proposal.md ✅, specs/router-service-boundaries/spec.md ✅, design.md ✅, tasks.md ✅ (15/15 complete), verify-report.md ✅, archive-report.md ✅ (additive).
- Task completion gate: all 15 tasks checked (persisted artifact `tasks.md`).

## Close Notes

- The `sdd-archive` sub-agent phase returned `sdd_task_result_empty` three consecutive times (transport/provider failure, not a gate or repo defect). Per the SDD transport-failure contract, no further automatic retries were launched. After explicit user authorization ("hacelo ahora"), the orchestrator performed the archive closure manually following the sdd-archive skill contract: spec sync by mechanical shell copy with hash readback, change folder move via `git mv` with byte-identical readback, and this archive report. The dispatcher was left at `archive: ready`; manual closure recorded here completes the cycle in practice.
