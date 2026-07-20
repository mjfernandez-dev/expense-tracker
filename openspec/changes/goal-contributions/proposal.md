# Proposal: Goal Contributions

## Intent

Wishlist items have `monto_ahorrado` but it's manually set with no traceability of source, no integration with the cycle budget, and no validation that the money exists. Users need to track *where* savings came from — either from a category's budget (presupuesto) or from disponible — with cross-validation against actual available balances.

## Scope

### In Scope
- GoalContribution DB model, Pydantic schemas, Alembic migration
- Service validations per source type (disponible / presupuesto)
- POST `/api/wishlist/{id}/contribute` endpoint with split-source support
- Auto-update `monto_ahorrado` in WishlistItem on contribution
- Update `calcular_resumen()`: budget effective cap = `monto_estimado - ejecutado - contributed`; `saldo_disponible` deducts goal contributions
- Frontend: GoalContributeForm (source selector, split amounts), progress bar in WishlistItemCard

### Out of Scope
- Goal cancellation / refund contributions
- Recurring / scheduled contributions
- Batch contribution to multiple goals at once

## Capabilities

### New Capabilities
- `goal-contributions`: Track per-source contributions to wishlist items with cross-validation against budget disponible

### Modified Capabilities
- `wishlist-crud`: `monto_ahorrado` now auto-updates on contribution (still manually editable); frontend shows progress bar with `saved / estimated_cost`

## Approach

Introduce a `GoalContribution` table: FK to `WishlistItem`, `Ciclo`, optional `PresupuestoItem`, plus `amount`, `source_type` enum ("disponible", "presupuesto"), and `created_at`. A new service layer (`goal_service.py`) validates:

1. **Presupuesto source**: `amount <= monto_estimado - ejecutado - already_contributed_from_this_item`
2. **Disponible source**: `amount <= saldo_disponible_actual` (computed via `calcular_resumen`)

A single contribution endpoint accepts split sources (`[{source_type, presupuesto_item_id?, amount}]`). All mutations run in a single DB transaction: insert rows, update `WishlistItem.monto_ahorrado`. `calcular_resumen()` subtracts goal contributions from budget effective cap and from `saldo_disponible`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/models.py` | New | `GoalContribution` model |
| `backend/schemas.py` | New | Contribution request/response schemas |
| `backend/services/goal_service.py` | New | Validation + contribution logic |
| `backend/services/wishlist_service.py` | Modified | Auto-update `monto_ahorrado` |
| `backend/services/ciclo_service.py` | Modified | `calcular_resumen()` formula |
| `backend/routers/wishlist.py` | Modified | New contribute endpoint |
| `backend/alembic/versions/` | New | Migration for `goal_contributions` |
| `frontend/src/services/api.ts` | Modified | Contribute API function |
| `frontend/src/components/GoalContributeForm.tsx` | New | Contribution form UI |
| `frontend/src/components/WishlistItemCard.tsx` | Modified | Progress bar, contributed history |
| `frontend/src/components/WishlistPage.tsx` | Modified | Contribute button, total contributed |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Budget double-counting (same presupuesto_item contributes to multiple goals) | Low | Track per-item contributed sum, validate at insert |
| Race condition on `saldo_disponible` | Low | Single transaction, read current values at start |
| Formula change breaks existing cycle resums | Medium | Read-only history; `calcular_resumen` always recomputes from current data |

## Rollback Plan

1. Remove `goal_contributions` table (Alembic downgrade)
2. Revert `calcular_resumen()` to pre-change formula
3. Revert frontend components to pre-change state
4. Data loss: all contribution records are destroyed

## Dependencies

None.

## Success Criteria

- [ ] Contributions from presupuesto decrease the effective budget cap correctly
- [ ] Contributions from disponible decrease `saldo_disponible_actual`
- [ ] `monto_ahorrado` on WishlistItem equals sum of manual edits + tracked contributions
- [ ] Split-source contributions validated & committed atomically
- [ ] Frontend shows accurate progress bar and contribution form
