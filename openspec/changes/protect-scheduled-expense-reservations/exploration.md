## Exploration: Protect scheduled-expense reservations

### Current State
Scheduled expenses already have a durable discriminator: a dedicated `PresupuestoItem` has `gasto_programado_id != NULL`, with uniqueness on `(ciclo_id, gasto_programado_id)` (`backend/models.py:117-140`, migration `backend/alembic/versions/b8c5a7d3e9f1_add_gastos_programados.py:56-86`). No new schema field is required to identify reservation ownership.

The reproduced failure is caused by generic category matching ignoring that discriminator. `auto_detectar_presupuesto_item()` selects the first confirmed item matching the movement category without excluding dedicated reservations (`backend/services/movimiento_service.py:78-120`). Both generic create and update invoke it (`crear_movimiento()` at lines 203-248; `actualizar_movimiento()` at lines 251-299). `apply_presupuesto_item_link()` also accepts an explicitly supplied dedicated item because it validates ownership and confirmation only (lines 123-163). Once linked, `calcular_progreso_presupuesto()` counts every linked expense as execution (`backend/services/ciclo_commitment_service.py:32-65`), so cancellation and deletion correctly observe the contaminated ARS 17,000 as a payment and block (`backend/services/gasto_programado_service.py:135-183`).

Dedicated reservations are exposed to additional generic mutations:

- Bulk replacement matches existing items by category/description, may overwrite a dedicated reservation, and deletes every unmatched zero-execution item (`aplicar_presupuesto_bulk()`, `backend/services/ciclo_commitment_service.py:69-167`).
- Granular creation reuses the first category-matching item and may overwrite a dedicated reservation (`crear_o_vincular_presupuesto_item()`, lines 206-327).
- Granular amount PATCH accepts any item ID and can edit a scheduled reservation outside the scheduled-expense flow (`actualizar_monto_presupuesto_item()`, lines 170-203).
- Category deletion deletes all matching budget items, including dedicated reservations (`eliminar_user_category()`, `backend/services/user_category_service.py:106-129`). Category reassignment updates movements only, then calls that deletion path; it does not update `GastoProgramado` or its reservation (`reasignar_movimientos_categoria()`, lines 79-103; `backend/routers/categorias.py:101-116`).
- A paid scheduled movement remains editable and deletable through generic movement endpoints/UI. `GastoProgramado.movimiento_id` identifies it, but generic update/delete does not check that reference (`backend/services/movimiento_service.py:61-75,251-299`; `frontend/src/components/MovimientoList.tsx:116-150,227-246`). This can create post-payment drift or a dangling lifecycle even after the payment flow is fixed.

The payment endpoint is currently atomic at one final commit and copies the scheduled expense category into the reservation-linked movement, but accepts no confirmation payload (`pagar_gasto_programado()`, `backend/services/gasto_programado_service.py:186-227`; router `backend/routers/gastos_programados.py:63-76`). The frontend uses a generic yes/no `ConfirmModal`; it displays amount and description but cannot correct category (`frontend/src/components/GastoProgramadoSection.tsx:55-78,196-223`; `frontend/src/services/api.ts:516-524`).

Current test capability was validated rather than inherited from the stale SDD initialization note:

- Full backend: `$env:SECRET_KEY='test'; python -m pytest backend/tests/ -q` — **158 passed**, 11 warnings, 65.55s. The suite uses FastAPI `TestClient` and transactional SQLite fixtures (`backend/tests/conftest.py:63-107`).
- Focused backend baseline: `test_gastos_programados.py test_movimientos.py test_ciclos.py test_presupuesto.py` — **83 passed**, 11 warnings, 43.79s.
- Frontend: `npm test` — **2 files / 16 tests passed**; `npm run build` and `npm run lint` also passed. Vitest is configured, contrary to the stale note, but current tests are pure TypeScript and there is no DOM/component test dependency such as React Testing Library or jsdom (`frontend/package.json:6-38`).
- Existing coverage misses the reproduced cross-feature collision. More importantly, `test_editar_importe_por_debajo_de_lo_ejecutado_devuelve_400` deliberately attaches an ordinary movement to a dedicated reservation (`backend/tests/test_gastos_programados.py:263-284`), so it currently teaches the suite to accept the invalid state and must be replaced, not preserved.

### Affected Areas
- `backend/services/movimiento_service.py` — exclude dedicated reservations from auto-detection and reject generic explicit links to them; define behavior for update/delete of scheduled-payment movements.
- `backend/services/ciclo_commitment_service.py` — preserve dedicated reservations during bulk replacement; exclude them from category/description matching; reject direct granular amount edits; ensure granular creation makes/reuses only ordinary items.
- `backend/services/gasto_programado_service.py` — accept and validate the confirmed category, propagate it to scheduled expense, reservation, and movement before one commit, and preserve rollback/idempotency behavior.
- `backend/services/user_category_service.py` — prevent destructive deletion of dedicated reservations and make category reassignment aware of scheduled expenses and their reservations/payments.
- `backend/schemas.py` — add a payment-confirmation request schema with category fields and exactly-one-category validation.
- `backend/routers/gastos_programados.py` — pass the confirmation payload to the service and retain tenant-safe errors.
- `backend/models.py` — evidence source for the existing discriminator and relationships; no schema change is currently recommended.
- `backend/tests/test_gastos_programados.py` — exact reproduction, corrected-category payment, atomic rollback, cancellation, idempotency, and replacement of the defect-pinning test.
- `backend/tests/test_movimientos.py` — ordinary create/update must ignore dedicated reservations; explicit generic linking must be rejected; scheduled-payment mutation policy tests.
- `backend/tests/test_ciclos.py` — bulk preserve/no-match/no-delete tests and granular create/PATCH protection tests.
- `backend/tests/test_categorias.py` and/or `backend/tests/test_presupuesto.py` — deletion/reassignment behavior when scheduled expenses and dedicated reservations reference a category.
- `frontend/src/components/GastoProgramadoSection.tsx` — replace the payment yes/no content with a category-aware confirmation flow, preselected from the scheduled expense, with loading/error handling.
- `frontend/src/services/api.ts` — send the payment confirmation payload.
- `frontend/src/types/index.ts` — add the payment request type; existing scheduled expense category data is sufficient for preselection.
- `frontend/package.json` plus a new component test file — only if proposal scope requires DOM-level confirmation-flow tests; current Vitest capability alone cannot render/test React UI.

### Approaches
1. **Use the existing ownership discriminator as a hard boundary** — treat `gasto_programado_id != NULL` as a protected item in every generic path, while the scheduled payment service remains the only writer allowed to attach its movement.
   - Pros: Fixes the root class across auto-link, explicit link, bulk, granular, and category flows; no schema migration or duplicate source of truth; aligns with the existing unique constraint and explicit payment link.
   - Cons: Requires a centralized predicate/policy and tests across several services; existing paid-movement edit/delete behavior needs a product decision.
   - Effort: Medium

2. **Add an item role/type column** — introduce values such as `generic`, `scheduled`, and possibly `fixed`, then gate operations by role.
   - Pros: Makes ownership visible without inspecting foreign keys and could generalize to future reservation types.
   - Cons: Duplicates truth already encoded by `gasto_programado_id`, requires migration/backfill and consistency constraints, and expands scope without solving category reassignment or paid-movement lifecycle by itself.
   - Effort: High

### Recommendation
Use Approach 1 and centralize the rule as “dedicated scheduled reservation” rather than scattering raw null checks. The invariant should be: generic movement and budget operations MUST only match/mutate ordinary items; a dedicated item MAY be mutated only by its owning scheduled-expense lifecycle. The payment request should carry the selected category, prefilled from the scheduled expense. Backend validation should resolve exactly one valid system/user category, then update `GastoProgramado`, its active-cycle reservation (if present), and the new `Movimiento` in one transaction and one commit. Any validation, flush, or commit failure must roll back all three.

No schema migration is needed for the behavior because `gasto_programado_id` and `movimiento_id` already encode ownership. A one-time **data repair** remains a proposal decision: production rows can be detected deterministically where a movement points to a dedicated item but its ID differs from the owning `GastoProgramado.movimiento_id` (or the owner is still pending). Such rows can be unlinked and item state recalculated without changing schema.

Recommended implementation/test work units for the `auto-chain` strategy are: (1) backend reservation boundary plus regression tests; (2) atomic payment-category contract plus backend tests; (3) frontend confirmation flow plus appropriate UI tests; (4) category and paid-movement lifecycle hardening. This change is likely to exceed the 400-line review budget once tests and frontend harness work are included, so these are suitable chained PR slices rather than file-type commits.

Unresolved product questions for the interactive proposal round:

- Should generic edit/delete of a movement created by a scheduled payment be blocked (recommended for this change), or should it invoke a coordinated correction/reversal that updates/reopens the scheduled expense and reservation?
- On category reassignment, should pending and paid scheduled expenses be migrated atomically to the destination category (recommended), or should category deletion be blocked while any scheduled expense references it?
- Should the payment confirmation permit only category correction, as requested, or also amount/date/payment-method edits? Restricting it to category keeps the transaction and UX bounded.
- Must the selector expose both system and user categories? The backend model supports both, while the current scheduled-expense creation UI lists only user categories.
- Should historical contaminated links be repaired automatically through a data migration, or only reported/cleaned through an administrative command after measuring affected rows?
- Is concurrent double-submit protection required in this scope? Sequential duplicate payment is tested, but the current read-then-write flow has no row lock and does not prove concurrency safety.

### Risks
- Filtering only `auto_detectar_presupuesto_item()` would fix the reproduction but leave explicit links, bulk replacement, granular edits, and category deletion able to corrupt the same invariant.
- Bulk and granular flows may legitimately create an ordinary item with the same category as a dedicated reservation; selection must be deterministic and restricted to ordinary items rather than assuming category uniqueness.
- Paid scheduled movements are currently indistinguishable in frontend movement types; hiding buttons client-side alone is insufficient, so backend enforcement is required.
- Internal helpers such as `reconciliar_reserva()` currently commit; reusing a committing helper inside the new payment transaction could break atomicity. The payment path needs a no-commit mutation boundary.
- SQLite integration tests validate transactional behavior but cannot fully prove PostgreSQL row-lock/concurrent-submit semantics.
- Existing category deletion/reassignment may encounter FK differences between SQLite tests and PostgreSQL production; tests must assert domain behavior before database errors.
- Adding DOM-level frontend tests introduces test dependencies/configuration and increases the review workload; omitting them leaves the new confirmation interaction covered only indirectly by build/type checks.

### Ready for Proposal
Yes. The root cause and systemic mutation paths are identified, the existing schema supports the recommended boundary, and current backend/frontend verification commands pass. The proposal should explicitly resolve paid-movement lifecycle, category reassignment semantics, historical data repair, selector category scope, and concurrent payment protection before specification/design.
