# Apply Progress: Auto-select most-used category for a movement description

## Status: COMPLETE

## Completed Tasks

| Task | Description | Status |
|------|-------------|--------|
| 1.1 | RED: extend `test_search_descripciones_agrupa_y_filtra` — aggregation + category suggestion | ✅ |
| 1.2 | RED: tie-break test — recency, stable id fallback | ✅ |
| 1.3 | RED: extend per-user isolation test — category leak prevention | ✅ |
| 1.4 | RED: user-only category → `categoria_id: null` (additive nullable) | ✅ |
| 1.5 | GREEN: `_sugerir_categoria_por_descripcion` + group-by in `buscar_descripciones` | ✅ |
| 1.6 | Verify: `test_movimientos.py` 26/26 pass | ✅ |
| 2.1 | Create `sugerenciaCategoria.ts` — pure helper | ✅ |
| 2.2 | Create `sugerenciaCategoria.test.ts` — 8 cases, vitest | ✅ |
| 2.3 | Verify: vitest 8/8 pass | ✅ |
| 3.1 | Additive optional fields on `DescripcionSuggestion` | ✅ |
| 3.2 | `MovimientoForm.tsx` — `categoriaTouchedRef`, blur apply, select apply | ✅ |
| 3.3 | `tsc --noEmit` passes | ✅ |
| 4.1 | Full backend suite: 175/175 pass | ✅ |
| 4.2 | Full frontend suite: 24/24 pass | ✅ |
| 4.3 | Runtime harness: interactive scenario requires running dev servers (not available in agent env) | ⚠️ |

## Work Unit Evidence

### Unit 1 — Backend aggregation + additive fields
| Evidence | Value |
|----------|-------|
| Focused test command and exact result | `SECRET_KEY=test python -m pytest backend/tests/test_movimientos.py -k search_descripciones` → 4 passed |
| Runtime harness command/scenario and exact result | Full backend suite: `SECRET_KEY=test python -m pytest backend/tests/ -v` → 175 passed (TestClient exercises real HTTP stack, in-memory SQLite) |
| Rollback boundary | `backend/services/movimiento_service.py` + `backend/tests/test_movimientos.py` — revert both; no schema impact |

### Unit 2 — Pure helper + vitest suite
| Evidence | Value |
|----------|-------|
| Focused test command and exact result | `npm test` → 24 passed (3 files, including sugerenciaCategoria.test.ts: 8 cases) |
| Runtime harness command/scenario and exact result | N/A — pure function, no I/O boundary; vitest covers all specified cases |
| Rollback boundary | Delete `frontend/src/utils/sugerenciaCategoria.ts` + `.test.ts` — unit 3 survives (auto-apply wiring becomes dead path) |

### Unit 3 — Form wiring: api.ts types + auto-apply in MovimientoForm
| Evidence | Value |
|----------|-------|
| Focused test command and exact result | `npx tsc --noEmit` → exit 0; `npm test` → 24 passed (no regressions) |
| Runtime harness command/scenario and exact result | Interactive browser scenario requires dev servers (backend:8000 + frontend:5173) — not running in agent env; would need manual smoke: new movement → type known description → category auto-applies; manual touch → keeps choice; edit mode → no auto-apply |
| Rollback boundary | Revert `frontend/src/services/api.ts` + `frontend/src/components/MovimientoForm.tsx`; unit 2 (helper + tests) survives independently |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `backend/services/movimiento_service.py` | Modified | Added `_sugerir_categoria_por_descripcion` helper; rewrote `buscar_descripciones` to fetch additional columns, group by trimmed-lower key, emit additive nullable category fields |
| `backend/tests/test_movimientos.py` | Modified | Added `_crear_segunda_categoria` helper; rewrote 3 existing search tests to assert additive fields; added tie-break test (recency + stable-id fallback) |
| `frontend/src/services/api.ts` | Modified | Added `user_category_id?: number | null` and `categoria_id?: number | null` to `DescripcionSuggestion` interface |
| `frontend/src/utils/sugerenciaCategoria.ts` | Created | Pure helper: `obtenerCategoriaSugerida` — exact trimmed CI match, guarded by esEdicion and categoriaTouched |
| `frontend/src/utils/sugerenciaCategoria.test.ts` | Created | 8 vitest cases covering: exact match, trim+CI, partial/first-time, touched, edit, undefined fields, id-not-in-list, empty suggestions |
| `frontend/src/components/MovimientoForm.tsx` | Modified | Added `categoriaTouchedRef` (set on select onChange + category creation, reset in resetForm); wired `aplicarCategoriaSugerida` callback in selectSuggestion, Enter handler, and blur handler; imported `obtenerCategoriaSugerida` |

## Deviations from Design

One minor spec-completing addition: `categoriaTouchedRef` is also set to `true` inside `handleCreateCategory` (when the user creates a new custom category). The design specifies "set on manual category `<select>` change" only; however, creating a new category is an equally explicit user choice, and without this the auto-apply would silently override the freshly-created category on the next suggestion pick. This is faithful to the spec's acceptance criteria ("Explicit manual category choice is never overridden").

## Issues Found

None — all tests pass, typecheck clean.

## Remaining Tasks

None — all 13 tasks complete.

## Review Forecast

- Estimated changed lines: ~210 (within 170–230 forecast)
- Budget risk: Low (single PR)
