# Proposal: Refactor Routers→Services + Dead-Code Pod

## Intent

The native code-review gate blocks commits touching `backend/routers/movimientos.py` and `backend/routers/categorias.py`: they orchestrate transactional business logic (GastoFijo template creation, presupuesto auto-detection, presupuesto linking, name-uniqueness check-then-update) that belongs in `backend/services/` per AGENTS.md. An audit also surfaced dead code (already-applied poda + a dead `gasto_fijo_id` local variable). One change removes both so the review gate stops blocking.

## Scope

### In Scope

**Inherited poda** (already applied in worktree, uncommitted — commit as part of this change):
- Delete `backend/migrate_encryption.py` (one-off script, references nonexistent `expenses` table)
- `backend/email_service.py`: drop `send_two_factor_code` + `send_welcome_email` (keep `send_password_reset_email`)
- `backend/config.py`: drop `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `EXPOSE_RESET_TOKEN`, `BACKEND_URL`, `FRONTEND_URL`, `_as_bool`; sync `.env.example`
- `backend/schemas.py`: drop dead `Token`, `CategoryCreate` (keep `TokenData`, `CategoryBase`, `CategoryRead`)
- `backend/routers/categorias.py`: `Dict`→`List` import; `backend/routers/movimientos.py`: drop unused `func` import
- `backend/tests/conftest.py`: drop phantom `main.ejecutar_generacion_mensual`
- `frontend/src/services/push.ts`: unexport `getVapidPublicKey`

**Router→service refactor** (review blockers):
- `movimiento_service.crear_movimiento()` / `actualizar_movimiento()`: encapsulate `_validate_categoria`, es_fijo GastoFijo creation, auto-detection, presupuesto link, commit, eager-load. Routers become thin wrappers.
- `user_category_service.actualizar_user_category()`: validate name-uniqueness internally (reuse `verificar_nombre_unico`); `update_user_category` delegates fully.
- Remove dead local `gasto_fijo_id` variable (`movimientos.py` lines 68/80-81).

**Tests**: service-level tests for moved logic in `test_movimientos.py` / `test_categorias.py`; keep `test_gastos_fijos.py` / `test_ciclos.py` green.

### Out of Scope

- Removing `es_fijo` schema field / GastoFijo feature — see Open Questions (live feature, 6+ tests depend on it)
- Dropping `gasto_fijo_id` column (needs Alembic migration; used by `ciclo_service`, `gastos_fijos_service`)
- Frontend work beyond the applied `push.ts` tweak; auth/ciclos/push router refactors

## Capabilities

### New Capabilities
None

### Modified Capabilities
None — pure refactor: no requirement or API-contract change (`es_fijo` stays, `gasto_fijo_id` stays).

## Approach

Move orchestration verbatim into service entry points; routers retain only `Depends` wiring and response models. Keep the es_fijo branch intact inside `crear_movimiento` (live creation path). Reuse existing service helpers (`resolve_clasificacion`, `auto_detectar_presupuesto_item`, `apply_presupuesto_item_link`). Fold uniqueness check into `actualizar_user_category`. Commit poda and refactor as separate coherent work units; run the full suite.

## Impact

| Area | Impact | Description |
|------|--------|-------------|
| `backend/routers/movimientos.py` | Modified | Thin wrappers; `_validate_categoria` moves out; dead `gasto_fijo_id` var removed |
| `backend/routers/categorias.py` | Modified | `update_user_category` delegates to service |
| `backend/services/movimiento_service.py` | Modified | New `crear_movimiento` / `actualizar_movimiento` |
| `backend/services/user_category_service.py` | Modified | `actualizar_user_category` validates uniqueness |
| `config.py`, `email_service.py`, `schemas.py`, `.env.example`, `conftest.py`, `push.ts` | Modified | Inherited poda |
| `backend/migrate_encryption.py` | Removed | Inherited poda |
| `backend/tests/test_movimientos.py`, `test_categorias.py` | Modified | Service-level tests added |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Regression in transactional flow (flush → HTTPException rollback) | Med | Move code verbatim; integration suite must stay green |
| es_fijo deletion breaks live GastoFijo feature | Med | Not deleting — flagged as Open Question |
| Poda + refactor inflate one change | Low | Coherent work-unit commits per concern |

## Rollback Plan

- `git revert` per commit — no schema or data migration involved.
- Worktree poda is uncommitted: stash/discard before the refactor commit if needed.
- Service helpers already exist; reverting the router commit restores prior behavior exactly.

## Dependencies

- None new. Verification run: `SECRET_KEY=test python -m pytest backend/tests/ -v`

## Success Criteria

- [ ] Routers contain no business orchestration (code-review gate passes)
- [ ] Full pytest suite green, including `test_gastos_fijos.py` / `test_ciclos.py`
- [ ] No reference to removed symbols (`gasto_fijo_id` var, removed config keys/functions, `migrate_encryption.py`)
- [ ] Frontend build unaffected by `push.ts` unexport

## Open Questions

1. **`es_fijo` is NOT dead** — the decision's "if nothing uses it" condition is false. Verified: `test_gastos_fijos.py` (6 tests) and `test_ciclos.py` create templates via `es_fijo=True`; the gastos_fijos router/service, scheduler, and cycle-commitment logic consume `Movimiento.gasto_fijo_id`. Recommendation: keep `es_fijo` and move it verbatim into the service. Full deprecation (schema field + feature + migration, likely with frontend removal) is a separate, larger change. Needs user confirmation.
2. Poda vs refactor as one PR or two? Default: one change per the user's decision, committed as separable work units.
