```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:b1c1371938d941ddf0352123953e017c0624fb649d0b1517005146cc2c74d0f5
verdict: pass
blockers: 0
critical_findings: 0
requirements: 8/8
scenarios: 10/10
test_command: SECRET_KEY=test python -m pytest backend/tests/ -v
test_exit_code: 0
test_output_hash: sha256:83e1b7150d76fd626299a7db1c71a17a08f8205b5b925ae95fa1eec55f585d77
build_command: npx tsc --noEmit (frontend/)
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: refactor-logica-routers-services
**Version**: N/A (single-spec delta, router-service-boundaries)
**Mode**: Standard (no strict-TDD runner cached; orchestrator did not flag strict TDD)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 15 |
| Tasks complete | 15 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: ✅ Passed (`npx tsc --noEmit` in `frontend/`, exit code 0, zero output)

**Tests**: ✅ 119 passed / ❌ 0 failed / ⚠️ 0 skipped (exit code 0)
```text
SECRET_KEY=test python -m pytest backend/tests/ -v
====================== 119 passed, 10 warnings in 46.89s ======================
```
Coverage command configured none → ➖ Not available (not required for this change).

### Status Header
- **CRITICAL**: 0
- **WARNING**: 0
- **SUGGESTION**: 2

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| REQ-RS-01 | No references remain | Suite import-pass + grep (see evidence) | ✅ COMPLIANT |
| REQ-RS-02 | Router delegates creation | `test_movimientos.py::test_crear_gasto` + `test_crear_ingreso` (HTTP) | ✅ COMPLIANT |
| REQ-RS-02 | Router delegates update | `test_movimientos.py::test_actualizar_movimiento` (HTTP) | ✅ COMPLIANT |
| REQ-RS-03 | Update delegates | `test_categorias.py::test_actualizar_categoria_exitosa` + `test_actualizar_categoria_nombre_duplicado` (HTTP) | ✅ COMPLIANT |
| REQ-RS-04 | es_fijo gasto creates template | `test_service_crear_movimiento_es_fijo_crea_template` | ✅ COMPLIANT |
| REQ-RS-04 | Missing categorias rejected | `test_service_crear_movimiento_sin_categoria_400` + HTTP `test_sin_categoria_retorna_400` | ✅ COMPLIANT |
| REQ-RS-05 | Duplicate name rejected | `test_service_actualizar_categoria_nombre_duplicado_400` | ✅ COMPLIANT |
| REQ-RS-06 | Template linked without dead variable | `test_service_crear_movimiento_es_fijo_crea_template` (asserts `.gasto_fijo_id is not None`, `.activo is True`) | ✅ COMPLIANT |
| REQ-RS-07 | Existing tests stay green | Full suite — 119 passed incl. `test_gastos_fijos.py` (7) + `test_ciclos.py`; `npx tsc --noEmit` exit 0 | ✅ COMPLIANT |
| REQ-RS-08 | Moved logic tested at service level | 4 service tests in `test_movimientos.py` + 1 in `test_categorias.py`, all PASSED | ✅ COMPLIANT |

**Compliance summary**: 10/10 scenarios compliant

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| REQ-RS-01 | ✅ Implemented | `config.py` defines only `APP_ENV`/`IS_PRODUCTION`/`ENCRYPTION_KEY` (13 lines); `.env.example` lists none of the removed keys; `backend/migrate_encryption.py` deleted (commit `f7d95ce`); `send_two_factor_code`/`send_welcome_email`/`_as_bool`/schemas `Token`/`CategoryCreate`/`ejecutar_generacion_mensual` absent from source; `getVapidPublicKey` unexported (`frontend/src/services/push.ts:11`); `send_password_reset_email` sole sender (`routers/auth.py:28`) |
| REQ-RS-02 | ✅ Implemented | `routers/movimientos.py` (80 lines) is pure delegation: `create_movimiento` body = single `movimiento_service.crear_movimiento(...)` call (line 23); `update_movimiento` = single service call (line 59); grep of routers shows zero `db.query|db.delete|db.commit` in `movimientos.py`/`categorias.py`; no `_validate_categoria`/GastoFijo/auto-detect/joinedload remnants |
| REQ-RS-03 | ✅ Implemented | `routers/categorias.py:75-76` = `obtener_categoria_usuario(...)` + single `actualizar_user_category(...)`; no direct `verificar_nombre_unico` |
| REQ-RS-04 | ✅ Implemented | `movimiento_service.py:179-222` `crear_movimiento`: `_validate_categoria` (400 both-None; 404 missing) → `model_dump(exclude={"presupuesto_item_id","es_fijo"})` → `resolve_clasificacion` → es_fijo flow (`db.add(gf)`/`db.flush()`/`gasto_fijo_id = gf.id`, lines 197-207) → auto-detect → `apply_presupuesto_item_link` → `db.commit()` → `_movimiento_con_categorias` joinedload re-query (lines 166-176). `actualizar_movimiento` (225-271): 404 not-owned, same pipeline, auto-detect with `exclude_movimiento_id=movimiento_id` (line 265) |
| REQ-RS-05 | ✅ Implemented | `user_category_service.py:140-142`: `update.nombre is not None and update.nombre != category.nombre` → `verificar_nombre_unico(..., exclude_id=category.id)` BEFORE `category.nombre = update.nombre`; duplicate raises HTTP 400 (line 46) pre-mutation; test asserts `cat1.nombre == "Original"` (no persist) |
| REQ-RS-06 | ✅ Implemented | No `gasto_fijo_id` local anywhere in `movimiento_service.py` (direct `db_movimiento.gasto_fijo_id = gf.id` at line 207). Consumers intact: `scheduler_service.py:54` (`GastoFijo.activo == True`), `ciclo_service.py:102-134` (auto-import active GastoFijos via `gasto_fijo_id=gf.id`) + `ciclo_commitment_service.calcular_progreso_presupuesto` consumed at `movimiento_service.py:11`; model/schema columns unchanged (`models.py:160`, `schemas.py:179,189`) |
| REQ-RS-07 | ✅ Implemented | No schema field, model column, or migration changed (git diff `add9fbc` = routers/services/schemas-poda/tests only; no `alembic/versions` touched). Full suite + tsc green |
| REQ-RS-08 | ✅ Implemented | `test_movimientos.py`: `test_service_crear_movimiento_es_fijo_crea_template` (200), `test_service_crear_movimiento_sin_categoria_400` (230), `test_service_crear_movimiento_autovincula_presupuesto` (252), `test_service_actualizar_movimiento_autovincula_presupuesto` (280); `test_categorias.py`: `test_service_actualizar_categoria_nombre_duplicado_400` (172) |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Service signature `user_id: int` | ✅ Yes | `crear_movimiento(movimiento, user_id, db)` / `actualizar_movimiento(movimiento_id, movimiento_update, user_id, db)` |
| Commit in service, router stops committing | ✅ Yes | `db.commit()` at `movimiento_service.py:221,270`; routers contain no `db.commit` |
| Private `_validate_categoria` moved verbatim | ✅ Yes | `movimiento_service.py:142-163`, 400/404 semantics intact |
| Reuse `db_session` fixture + `_crear_user` seeding | ✅ Yes | Local `_crear_user` in test files; direct service calls, no client dependency on the 5 new tests |
| Reuse helpers `resolve_clasificacion`/`auto_detectar`/`apply_presupuesto_item_link` | ✅ Yes | All reused inside service entry points |

### Issues Found
**CRITICAL**: None
**WARNING**: None
**SUGGESTION**:
1. `backend/services/email_service.py:25` still reads `FRONTEND_URL = os.getenv("FRONTEND_URL", ...)`. Verified it is an independent local env read for the password-reset link (no `config` import, file moved `backend/email_service.py` → `backend/services/email_service.py` in `add9fbc`), so it does NOT reference the removed `config.FRONTEND_URL` key — REQ-RS-01 stands. Recommendation: keep, but consider documenting it as an intentional standalone env read.
2. `docker-compose.yml:58-59,94` still passes `FRONTEND_URL`/`BACKEND_URL` env names and `README.md:133` still documents `MP_ACCESS_TOKEN`. These are deployment/documentation strings, not references to the removed config keys, and out of the change's grep scope (`backend/` + `frontend/src`). Recommendation: update README in a future docs chore for consistency.

### Spec Drift
None discovered. REQ-RS-01..08 all satisfied; no contract, schema, column, or migration change; es_fijo/GastoFijo pipeline preserved verbatim in the service. The review-watch item (strict grep for removed-config-key references) resolved COMPLIANT with evidence: grep of `backend/` + `frontend/src` earlier in this run shows the removed keys only as README/deployment strings outside source.

### Verdict
PASS — all 15 tasks complete, 8/8 requirements and 10/10 scenarios satisfied with passing runtime evidence (119 pytest + tsc clean), routers delegating cleanly, es_fijo semantics preserved.
