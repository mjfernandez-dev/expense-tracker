# Proposal: Auto-select most-used category for a movement description

## Intent

Requirement (Spanish): "Que al elegir la descripción de un movimiento se auto-elija la categoría más usada en esa descripción."

Reduce manual categorization for recurring movements: choosing a known description (via the existing suggestion listbox) auto-applies the category most frequently used for that exact description. Extends the existing description autocomplete — no new endpoint, no migration.

## Scope

### In Scope
- Backend: `buscar_descripciones` aggregates the most-used category per exact trimmed case-insensitive description (both `categoria_id` and `user_category_id`), tie-break by recency.
- Frontend: auto-apply `user_category_id` on suggestion select/Enter and on blur (exact match), guarded by a manual-touch ref; disabled in edit mode.
- Types: `DescripcionSuggestion` gains optional category fields (additive, backward compatible).
- Tests: extend the 3 existing search tests (aggregation, tie-break, isolation); pure frontend helper + unit test.

### Out of Scope
- System-category application — the form `<select>` lists custom user categories only; documented limitation, optional follow-up.
- Offline suggestion — existing `searchDescripciones` gap; graceful degradation, default category preserved.
- Edit-mode suggestion — open question at proposal review; default disabled in v1.

## Capabilities

### New Capabilities
- `movement-category-suggestion`: most-used category aggregation per movement description in `buscar_descripciones` and guarded auto-application in `MovimientoForm`.

### Modified Capabilities
None — no existing spec pins the description-search contract; behavior is additive.

## Approach

Extend the existing `GET /movimientos/descripciones/search` flow: `buscar_descripciones` also aggregates `categoria_id`/`user_category_id` per exact trimmed CI description (count per category, then most recent `fecha`, then stable id); response entries gain optional category fields. Hook the existing suggestion flow in `MovimientoForm.tsx`: on suggestion select/Enter and on blur, apply the suggested `user_category_id` only if the category `<select>` was never manually touched (`categoriaTouchedRef`) and the description changed. First-time description → no suggestion (keep default). Edit mode unchanged.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/services/movimiento_service.py` | Modified | Category aggregation in `buscar_descripciones` (+ `_sugerir_categoria_por_descripcion`) |
| `frontend/src/services/api.ts` | Modified | `DescripcionSuggestion` optional category fields |
| `frontend/src/components/MovimientoForm.tsx` | Modified | Auto-apply suggestion with manual-touch guard |
| `frontend/src/utils/sugerenciaCategoria.ts` (new) | New | Pure helper + unit test |
| `backend/tests/test_movimientos.py` | Modified | Extend 3 search tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Per-keystroke in-memory scan grows with history | Med | Pre-existing cost; cap scanned rows in v1, keep listbox semantics |
| Overriding explicit user category choice | Low | `categoriaTouchedRef` — apply only when select untouched |
| Suggestion is a system category the form cannot represent | Med | v1 no-op; documented follow-up |
| Offline: no suggestion | Low | Graceful; default preserved |
| Edit-mode exclusion surprises user | Med | Open question at review; disabled by default in v1 |

## Rollback Plan

Revert form hooking and the helper in `MovimientoForm.tsx` / `api.ts` (single work unit); revert aggregation in `buscar_descripciones`. Response fields are additive, so old clients are unaffected. No migration or schema rollback required.

## Dependencies

- None external. Relies on the existing debounced autocomplete flow and the EncryptedString in-memory scan pattern.

## Success Criteria

- [ ] Choosing a known description auto-applies its most-used user category when the select was not manually touched.
- [ ] Explicit manual category choice is never overridden.
- [ ] First-time descriptions keep the default category; ties break by recency.
- [ ] No suggestion in edit mode or offline (default preserved).
- [ ] Backend search tests + frontend helper tests pass (`SECRET_KEY=test python -m pytest backend/tests/ -v`; vitest).
