# Tasks: Auto-select most-used category for a movement description

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~170–230 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (3 commit-sized work units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend aggregation + additive fields | PR 1 | `SECRET_KEY=test python -m pytest backend/tests/test_movimientos.py -v` | pytest TestClient on `GET /movimientos/descripciones/search` | Revert `backend/services/movimiento_service.py` + `backend/tests/test_movimientos.py` — no schema impact |
| 2 | Pure helper + vitest suite | PR 1 | `npm test` | N/A — pure function (no I/O); vitest covers all cases | Delete `frontend/src/utils/sugerenciaCategoria.ts` + `frontend/src/utils/sugerenciaCategoria.test.ts` |
| 3 | Form wiring: api.ts types + auto-apply | PR 1 | `npm test`; `npx tsc --noEmit` | Dev servers: new-movement form, type known description → category select auto-applies; check blur / manual-touch / edit-mode | Revert `frontend/src/services/api.ts` + `frontend/src/components/MovimientoForm.tsx` (unit 2 survives) |

## Phase 1: Backend Service + Tests

- [x] 1.1 RED: extend `test_search_descripciones_agrupa_y_filtra` in `backend/tests/test_movimientos.py` — 2× "Supermercado" with user-cat A, 1× with user-cat B → suggestion returns A (spec: known description aggregates usage)
- [x] 1.2 RED: add tie-break test — equal usage counts → most recent `fecha` wins, smaller stable id fallback (spec: tie breaks by recency)
- [x] 1.3 RED: extend `test_search_descripciones_aisla_por_usuario` — other user's category usage never leaks into suggestion fields (spec: per-user isolation)
- [x] 1.4 RED: extend search test with user-only category → `categoria_id` is `null` (spec: additive nullable payload)
- [x] 1.5 GREEN: in `backend/services/movimiento_service.py`, `buscar_descripciones` fetches `id, descripcion, categoria_id, user_category_id, fecha`; group by `desc.strip().lower()`; add `_sugerir_categoria_por_descripcion(filas) -> (user_category_id, categoria_id)` (count desc, max `fecha` desc, smaller id); emit nullable fields
- [x] 1.6 Verify: `SECRET_KEY=test python -m pytest backend/tests/test_movimientos.py -v` passes

## Phase 2: Frontend Helper + Tests

- [x] 2.1 Create `frontend/src/utils/sugerenciaCategoria.ts` — export `obtenerCategoriaSugerida(descripcion, suggestions, categoriasDisponibles, esEdicion, categoriaTouched): number | null`; exact trimmed CI match → `user_category_id` if present, id ∈ list, `!esEdicion`, `!categoriaTouched`; else null
- [x] 2.2 Create `frontend/src/utils/sugerenciaCategoria.test.ts` (mirror `presupuestoSuggestions.test.ts` conventions) — exact/CI/trimmed match applies; partial/first-time ⇒ null; touched ⇒ null; edit ⇒ null; `undefined` fields ⇒ null; id not in list ⇒ null; empty suggestions (offline) ⇒ null
- [x] 2.3 Verify: `npm test` (frontend vitest) — all helper cases pass

## Phase 3: Frontend Wiring

- [x] 3.1 Modify `frontend/src/services/api.ts` — add `user_category_id?: number | null` and `categoria_id?: number | null` to `DescripcionSuggestion`
- [x] 3.2 Modify `frontend/src/components/MovimientoForm.tsx` — add `categoriaTouchedRef` (set on manual category `<select>` change; reset in `resetForm`); call helper in `selectSuggestion` when `!movimientoToEdit`; add blur handler (~200ms delay) for exact-match apply; offline error path already yields empty suggestions → no-op
- [x] 3.3 Typecheck: `npx tsc --noEmit` in `frontend/` passes (helper + api.ts wiring compile)

## Phase 4: Integration / Verification

- [x] 4.1 Full backend suite: `SECRET_KEY=test python -m pytest backend/tests/ -v` passes
- [x] 4.2 Full frontend suite: `npm test`
- [x] 4.3 Runtime harness: dev servers — new movement with known description auto-applies category; manual category touch keeps choice; edit mode unchanged; offline preserves default
