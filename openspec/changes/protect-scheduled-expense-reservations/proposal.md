# Proposal: Protect Scheduled-Expense Reservations

## Intent

Prevent generic movement, budget, and category workflows from corrupting reservations owned by scheduled expenses. Preserve lifecycle consistency during payment, category replacement, historical cleanup, and concurrent submissions without adding another ownership representation.

## Scope

### Goals and In Scope
- Enforce `gasto_programado_id != NULL` as the protected reservation boundary across generic movement and budget operations.
- Block generic edit/delete of scheduled-payment movements.
- Let `Registrar pago` correct only category, selecting from system and user categories.
- Atomically propagate payment/reassignment categories across scheduled expense, reservation, and payment movement.
- Measure and repair contaminated historical links with auditable evidence.
- Guarantee one persisted payment outcome under concurrent PostgreSQL submissions.

### Out of Scope
- Coordinated payment correction/reversal.
- Payment-time amount, date, or payment-method editing.
- New role/type columns or schema migrations unless later evidence proves unavoidable.

## User-Visible Behavior

Payment confirmation preselects the scheduled category and permits category-only correction. Protected payment movements cannot be changed or deleted through generic movement controls. Category replacement keeps pending and paid scheduled-expense records aligned.

## Invariant Boundaries

- Generic movement/budget flows may match or mutate only ordinary budget items.
- Only the owning scheduled-expense lifecycle may mutate or link a dedicated reservation.
- Payment and category migration update all owned records in one transaction or none.
- Concurrent payment attempts create at most one payment movement and one paid transition.

## Capabilities

### New Capabilities
- `scheduled-expense-reservation-integrity`: Ownership boundaries, atomic payment/category propagation, historical repair, and concurrent payment safety.

### Modified Capabilities
- `cycle-tab`: Granular and bulk budget editing must preserve protected reservations.
- `router-service-boundaries`: Movement auto-linking and mutation orchestration must enforce reservation ownership.

## Approach and Outcomes

Centralize the dedicated-reservation policy around the existing foreign key. Apply it in movement, cycle-budget, scheduled-expense, and category services. Use a PostgreSQL-safe transaction/locking strategy so one concurrent payer wins. Run historical repair as a controlled measure-then-apply operation producing counts, affected identifiers, actions, and verification results.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `backend/services/` | Modified | Enforce boundaries, atomic migration/payment, repair, concurrency |
| `backend/routers/`, `backend/schemas.py` | Modified | Category-only payment contract |
| `frontend/src/components/GastoProgramadoSection.tsx` | Modified | Category-aware confirmation |
| `frontend/src/services/api.ts`, `frontend/src/types/index.ts` | Modified | Payment payload/types |
| `backend/tests/`, frontend tests | Modified | Regression and concurrency evidence |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hidden mutation path bypasses ownership | Medium | Central policy plus cross-service regression tests |
| SQLite masks PostgreSQL races | High | PostgreSQL concurrency verification |
| Repair changes valid links | Medium | Dry-run evidence, bounded apply, post-check |

## Rollout and Rollback

Deploy protections before controlled repair; retain repair evidence. Roll back application changes by work unit. Repair rollback must restore captured link/state values transactionally; no schema rollback is expected.

## Dependencies

- PostgreSQL-capable concurrency test environment and production-data access controls for repair.

## Success Criteria

- [ ] Generic paths cannot match, edit, delete, or relink protected records.
- [ ] Payment/category replacement is atomic and tenant-safe.
- [ ] Concurrent payment persists exactly one movement and paid transition.
- [ ] Historical contamination is counted, repaired, and verified with evidence.
- [ ] Existing ordinary movement and budget behavior remains valid.
