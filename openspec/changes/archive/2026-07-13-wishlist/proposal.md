# Proposal: Wishlist (Lista de Deseos)

## Intent

Users lack a medium-to-long-term planning tool separate from daily impulse-control (Necesidad vs Deseo on movimientos). A wishlist lets them track purchase goals — a trip, a PlayStation, a medical treatment — with priority labels and a "Wish Farm" mechanic that limits active items to 3, encouraging focus over accumulation.

## Scope

### In Scope
- Full CRUD for wishlist items with priority (Alta/Media/Baja) and size (Chico < $500, Mediano $500–$5000, Grande > $5000)
- Wish Farm rule: max 3 items in "en-progreso" per user
- Category selection: reuse UserCategory table + inline creation
- New backend model, router, service, schemas, Alembic migration
- New frontend tab + components: list page, card, form

### Out of Scope
- Integration with movimientos or Balance (deferred to post-MVP)
- Cycle budget integration or data migration from existing files

## Capabilities

### New Capabilities
- `wishlist-crud`: Create, read, update, delete items scoped by user_id
- `wishlist-priorities`: Three-tier priority (Alta, Media, Baja) label + sorting
- `wishlist-farm-sizes`: Three-tier size derived from estimated_cost; UI badge
- `wishlist-status-workflow`: Lifecycle: draft → en-progreso → completado | cancelado. Enforce max 3 "en-progreso" per user.
- `wishlist-categories`: Reuse existing UserCategory FK; inline creation from form

### Modified Capabilities
None — first capability grouping for this domain.

## Approach

Add `WishlistItem` model with fields: id, user_id, name, estimated_cost (Numeric 10,2), priority (enum), size (derived), status (enum), category_id (FK), notes (EncryptedString), timestamps. New router at `/wishlist`. Frontend adds "Lista de Deseos" tab in App.tsx with three components: list page, item card, create/edit form.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/models.py` | Modified | Add WishlistItem model |
| `backend/schemas.py` | Modified | Add Pydantic schemas |
| `backend/routers/wishlist.py` | New | CRUD endpoints |
| `backend/services/wishlist_service.py` | New | Wishlist business logic |
| `backend/alembic/versions/` | New | Migration |
| `backend/main.py` | Modified | Register router |
| `backend/tests/test_wishlist.py` | New | Tests |
| `frontend/src/types/index.ts` | Modified | TS interface |
| `frontend/src/services/api.ts` | Modified | API client functions |
| `frontend/src/components/WishlistPage.tsx` | New | Main list view |
| `frontend/src/components/WishlistItemCard.tsx` | New | Card component |
| `frontend/src/components/WishlistForm.tsx` | New | Create/edit form |
| `frontend/src/App.tsx` | Modified | New tab + route |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Wish Farm 3-item ceiling blocks legitimate use | Low | Status changes free slots (draft/complete) |
| Inline category creation duplicates existing ones | Low | Search existing by name first, create only if no match |

## Rollback Plan

Alembic downgrade -1, remove router registration from main.py, delete router/service files, restore App.tsx tab config.

## Dependencies

- Existing UserCategory model and auth dependency (`get_current_active_user`)
- No external libraries needed

## Success Criteria

- [ ] All CRUD endpoints tested with auth + multi-tenant scoping
- [ ] Wish Farm limit enforced: 4th "en-progreso" returns 400 error
- [ ] Frontend renders wishlist tab with full create/edit/delete flow
- [ ] Migration applies and rolls back cleanly
