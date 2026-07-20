# Tasks: Goal Contributions

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~780 (model + migration + service + endpoints + ciclo formula + 3 frontend files + tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (infra) → PR 2 (backend logic) → PR 3 (frontend) → PR 4 (tests) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Model + migration + schemas + types | PR 1 | base=main; no business logic, pure data structures |
| 2 | goal_service.py + router endpoints + ciclo formula | PR 2 | base=main; depends on PR 1 types, no UI changes |
| 3 | Frontend: api.ts + GoalContributeForm + cards | PR 3 | base=main; depends on PR 2 endpoints existing |
| 4 | Tests: unit + integration + formula | PR 4 | base=main; depends on PR 2 code |

## Phase 1: Foundation (Model, Migration, Schemas, Types)

- [ ] 1.1 Add `GoalContribution` model to `backend/models.py` with FKs to WishlistItem, Ciclo, PresupuestoItem (nullable), source_type, amount, created_at
- [ ] 1.2 Create Alembic migration `add_goal_contributions_table.py` (down_revision: `c9d8e7f6a5b4`) with FK indexes and nullable presupuesto_item_id
- [ ] 1.3 Add schemas to `backend/schemas.py`: `GoalContributionSource`, `ContributeRequest`, `ContributeResponse`, `WithdrawRequest`, `GoalContributionRead`
- [ ] 1.4 Add frontend types to `frontend/src/types/index.ts`: `GoalContributionSource`, `ContributeRequest`, `WithdrawRequest`, `GoalContributionRead`

## Phase 2: Backend Core Logic (Service, Routes, Formula)

- [ ] 2.1 Create `backend/services/goal_service.py` with `contribute_to_goal()` — validates each source (presupuesto remaining balance, disponible saldo), creates rows atomically, updates `monto_ahorrado`
- [ ] 2.2 Add `withdraw_from_goal()` to same service — validates sufficient monto_ahorrado, creates negative amount row, updates monto_ahorrado
- [ ] 2.3 Add `POST /{id}/contribute` and `POST /{id}/withdraw` to `backend/routers/wishlist.py` with ownership validation
- [ ] 2.4 Update `backend/services/ciclo_service.py` `calcular_resumen()` — subtract goal contributions from presupuesto_efectivo cap and from saldo_disponible_total

## Phase 3: Frontend UI

- [ ] 3.1 Add `contributeToGoal()` and `withdrawFromGoal()` to `frontend/src/services/api.ts`
- [ ] 3.2 Create `frontend/src/components/GoalContributeForm.tsx` — modal with source selector (disponible + presupuesto items), split amount inputs, validation display; reuses WishlistForm modal pattern
- [ ] 3.3 Update `frontend/src/components/WishlistItemCard.tsx` — add progress bar (`monto_ahorrado / estimated_cost`, capped 100%), contribute/withdraw buttons
- [ ] 3.4 Update `frontend/src/components/WishlistPage.tsx` — wire contribute/withdraw handlers, open GoalContributeForm modal, refresh after contribution

## Phase 4: Testing

- [ ] 4.1 Unit test `goal_service.contribute_to_goal()` — disponible validation, presupuesto remaining validation, split-source atomicity, insufficient funds
- [ ] 4.2 Unit test `goal_service.withdraw_from_goal()` — success, insufficient monto_ahorrado
- [ ] 4.3 Integration test `POST /wishlist/{id}/contribute` — success and error (exceeds disponible, exceeds presupuesto, non-owned item)
- [ ] 4.4 Integration test `POST /wishlist/{id}/withdraw` — success and error (exceeds monto_ahorrado)
- [ ] 4.5 Unit test `calcular_resumen()` — verify presupuesto_efectivo and saldo_disponible_total when goal contributions exist
