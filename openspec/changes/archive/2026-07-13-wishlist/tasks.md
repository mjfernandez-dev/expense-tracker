# Tasks: Wishlist (Lista de Deseos)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650–800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Backend (model→schemas→service→router→migration + tests) → PR 2: Frontend (types→api→components→App.tsx) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

```
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

> ⚠️ Estimated additions across 14 files exceed the 400-line review budget. With `single-pr` strategy, a `size:exception` is required before apply. Consider splitting into backend-first / frontend-next stacked PRs to keep each diff reviewable.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend: model, schemas, service, router, migration, tests | PR 1 | All backend concerns (6 new + 3 modified + migration + tests) |
| 2 | Frontend: types, API client, components, App.tsx wiring | PR 2 | All frontend concerns (3 new + 3 modified), depends on PR 1 API contract |

If keeping single PR: mark `size:exception` in Delivery Strategy and proceed.

## Phase 1: Backend Foundation — Model & Schemas & Service

- [x] 1.1 Add `WishlistItem` model to `backend/models.py` (user_id FK, EncryptedString name+notes, Numeric estimated_cost/monto_ahorrado, String priority/status/category_id, timestamps)
- [x] 1.2 Add `WishlistItemCreate/Update/Read` schemas to `backend/schemas.py` (MoneyDecimal fields, priority/status validators, `@computed_field size` on Read)
- [x] 1.3 Create `backend/services/wishlist_service.py` with private helpers (`_derive_size`, `_validate_transition`, `_check_wish_farm_limit`, `_get_or_create_category`) and public CRUD functions

## Phase 2: Backend Wiring — Router & Registration & Migration

- [x] 2.1 Create `backend/routers/wishlist.py` (prefix="/wishlist", 5 endpoints: GET list/get, POST create, PATCH update, DELETE), all guarded by `get_current_active_user`, ownership-filtered
- [x] 2.2 Register router in `backend/main.py` — add import + `api_router.include_router(wishlist.router)` after push
- [x] 2.3 Generate Alembic migration `create_wishlist_items_table` with revision parent `b4a50c6e16e5`

## Phase 3: Frontend Foundation — Types & API Client

- [x] 3.1 Add `WishlistItem`, `WishlistItemCreate`, `WishlistItemUpdate` interfaces to `frontend/src/types/index.ts` (Spanish domain types for priority/status/size)
- [x] 3.2 Add `getWishlistItems`, `createWishlistItem`, `updateWishlistItem`, `deleteWishlistItem` functions to `frontend/src/services/api.ts`

## Phase 4: Frontend UI — Components & Tab Wiring

- [x] 4.1 Create `frontend/src/components/WishlistPage.tsx` — fetches list, renders loading/error/empty states, passes items to cards
- [x] 4.2 Create `frontend/src/components/WishlistItemCard.tsx` — card with priority badge, size badge, status pill, action buttons (edit/delete)
- [x] 4.3 Create `frontend/src/components/WishlistForm.tsx` — modal form with name, cost, priority/status selects, inline category search+create, notes
- [x] 4.4 Wire tab in `frontend/src/App.tsx` — add `'wishlist'` to `Tab` union, tab config entry, conditional `<WishlistPage/>` render, bottom nav item

## Phase 5: Backend Tests

- [x] 5.1 Create `backend/tests/test_wishlist.py` — unit tests for `_derive_size` boundaries, `_validate_transition` matrix coverage, `@computed_field size` schema instantiation
- [x] 5.2 Integration tests: full CRUD (201/200/200/204), Wish Farm limit (max 3 en-progreso → 400), multi-tenant isolation, inline category creation+dedup, invalid status transitions → 400
