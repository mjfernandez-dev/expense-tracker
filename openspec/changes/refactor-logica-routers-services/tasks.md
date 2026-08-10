# Tasks: Refactor Routers→Services + Dead-Code Pod

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450–590 combined (WU1 poda ~100–150, mostly deletions; WU2 refactor ~350–440) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (poda) → PR 2 (refactor) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Dead-code poda (applied in worktree) | PR 1 | `SECRET_KEY=test python -m pytest backend/tests/ -v` | N/A — pure deletions; verified by git diff + symbol grep, no runtime path added | `git revert` poda commit; gated files return to import-only state |
| 2 | Router→service refactor + service tests | PR 2 | `SECRET_KEY=test python -m pytest backend/tests/test_movimientos.py backend/tests/test_categorias.py -v` | Full suite over real HTTP (TestClient) + `npx tsc --noEmit` in `frontend/` | `git revert` refactor commit; routers restore full orchestration |

## Phase 1: Work Unit 1 — Dead-Code Poda (verify + commit; edits already applied)

- [ ] 1.1 Verify worktree diffs match binding: `git status --short` shows only poda files; `git diff` shows `categorias.py` = `Dict`→`List` import only, `movimientos.py` = `func` import drop only, `conftest.py` = phantom `main.ejecutar_generacion_mensual` removed, `backend/migrate_encryption.py` deleted
- [ ] 1.2 Grep `backend/` + `frontend/src` for zero references to removed symbols: `send_two_factor_code`, `send_welcome_email`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `EXPOSE_RESET_TOKEN`, `BACKEND_URL`, `FRONTEND_URL`, `_as_bool`, `Token`, `CategoryCreate`, `ejecutar_generacion_mensual`, `migrate_encryption` (REQ-RS-01)
- [ ] 1.3 Confirm `config.py` exposes only `APP_ENV`/`IS_PRODUCTION`/`ENCRYPTION_KEY`, `.env.example` lists no removed keys, `push.ts` does not export `getVapidPublicKey`, `send_password_reset_email` is sole email sender (REQ-RS-01)
- [ ] 1.4 Run `SECRET_KEY=test python -m pytest backend/tests/ -v` — full suite green (REQ-RS-07)
- [ ] 1.5 Commit staged poda files only as `chore: remove dead code and abandoned feature scaffolding` — excludes refactor work; no runtime behavior change

## Phase 2: Work Unit 2 — Refactor: Service Orchestration

- [ ] 2.1 `backend/services/movimiento_service.py`: add `import schemas` + `joinedload`; port private `_validate_categoria(categoria_id, user_category_id, current_user_id, db)` verbatim — HTTP 400 when both None, 404 for missing system/user category (dep: 2.5)
- [ ] 2.2 `movimiento_service.py`: add `crear_movimiento(movimiento, user_id, db)` — `model_dump(exclude={"presupuesto_item_id","es_fijo"})`, `resolve_clasificacion`, es_fijo GastoFijo flow (`db.add(gf)`, `db.flush()`, `db_movimiento.gasto_fijo_id = gf.id`, NO `gasto_fijo_id` local — REQ-RS-06), auto-detect + `apply_presupuesto_item_link`, `db.commit()`, `joinedload` eager re-query (REQ-RS-04)
- [ ] 2.3 `movimiento_service.py`: add `actualizar_movimiento(movimiento_id, movimiento_update, user_id, db)` — 404 not-owned, field assignment, `resolve_clasificacion`, auto-detect with `exclude_movimiento_id=movimiento_id`, link, commit, eager re-query (REQ-RS-04)
- [ ] 2.4 `backend/services/user_category_service.py`: `actualizar_user_category` calls `verificar_nombre_unico(category.user_id, update.nombre, db, exclude_id=category.id)` BEFORE mutation when name provided and differs → HTTP 400 (REQ-RS-05; dep: 3.2)
- [ ] 2.5 `backend/routers/movimientos.py`: `create_movimiento`/`update_movimiento` bodies become single service delegations; delete `_validate_categoria`, `gasto_fijo_id` local, and unused imports (`joinedload`, `Decimal`, `auto_detectar_presupuesto_item`, `apply_presupuesto_item_link`) (REQ-RS-02)
- [ ] 2.6 `backend/routers/categorias.py`: `update_user_category` = `obtener_categoria_usuario(category_id, current_user.id, db)` + single `actualizar_user_category` call; drop direct `verificar_nombre_unico` (REQ-RS-03)

## Phase 3: Work Unit 2 — Tests + Verification

- [ ] 3.1 `backend/tests/test_movimientos.py`: add local `_crear_user` helper (`models.User` + `get_password_hash`, `test_presupuesto.py` pattern); service tests on `db_session`: es_fijo gasto creates GastoFijo template (`mov.gasto_fijo_id is not None`, `.activo is True`), both-categories-None → 400, presupuesto auto-link on create and update (REQ-RS-08)
- [ ] 3.2 `backend/tests/test_categorias.py`: service test — rename to duplicate name → HTTP 400 via `actualizar_user_category`, assert `cat.nombre` unchanged (no persist) (REQ-RS-08)
- [ ] 3.3 Run `SECRET_KEY=test python -m pytest backend/tests/ -v` incl. `test_gastos_fijos.py`/`test_ciclos.py` (REQ-RS-07); run `npx tsc --noEmit` in `frontend/`
- [ ] 3.4 Commit as `refactor: move movimiento and user-category orchestration into services`; confirm final `movimientos.py`/`categorias.py` contain zero business orchestration (gate-clean)
