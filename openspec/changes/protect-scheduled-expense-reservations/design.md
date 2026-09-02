# Design: Protect Scheduled-Expense Reservations

## Technical Approach

Treat `PresupuestoItem.gasto_programado_id != NULL` as the sole ownership boundary. A central policy will guard generic movement, explicit-link, bulk, granular, paid-movement, and category paths after tenant lookup and before mutation. Scheduled-expense and category-replacement orchestrators own one transaction; helpers mutate/flush but never commit.

## Architecture Decisions

| Decision | Choice | Alternative | Rationale |
|---|---|---|---|
| Ownership | `es_reserva_gasto_programado(item)` in one policy module | New role column | Reuses durable truth and avoids drift. |
| Guard semantics | Tenant lookup first: foreign/missing is 404; owned protected generic mutation is 409 with Spanish detail | Reveal protection before ownership | Prevents cross-tenant existence disclosure. Auto-match silently excludes protected items; explicit links fail. |
| Transactions | Orchestrator commits once; helpers only mutate or `flush()` | Nested commits | Preserves whole-operation rollback. |
| Concurrent payment | Tenant-scoped `SELECT ... FOR UPDATE`, PostgreSQL `READ COMMITTED`, and lifecycle state as idempotency record | Global Serializable or new table | Locks one expense without schema state. Winner returns 200; loser observes `pagado` and returns 409. SQLite keeps the flow without lock guarantees. |
| Repair | External immutable JSON evidence drives measure/apply/rollback with compare-before-write checks | Alembic data rewrite or repair-state table | Supports review and reversal without schema state. |
| UI tests | Add React Testing Library, user-event, and jsdom for this component | Build/type checks only | Preselection, category-kind payload, loading lock, and retained errors are interaction contracts requiring a DOM. |

## Data Flow

```text
Payment request(category only) -> lock owned scheduled expense -> validate category
  -> update expense + reservation -> create/link movement -> mark paid -> COMMIT
  any failure -------------------------------------------------------> ROLLBACK
```

Category replacement locks the owned source, selects only tenant records, validates the destination, updates pending/paid expenses, reservations, and payments, deletes the source, then commits once.

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/services/reserva_gasto_programado_policy.py` | Create | Central predicates and generic guard errors. |
| `backend/services/{movimiento,ciclo_commitment,gasto_programado,user_category}_service.py` | Modify | Apply guards, lock payment, propagate categories, and remove nested commits. |
| `backend/schemas.py`, `backend/routers/{gastos_programados,categorias}.py` | Modify | Category-only payment and atomic replacement orchestration. |
| `backend/services/reparacion_reservas_service.py`, `backend/scripts/reparar_reservas_gastos_programados.py` | Create | Tenant-bounded measure/apply/rollback and JSON evidence. |
| `frontend/src/{types/index.ts,services/api.ts,components/GastoProgramadoSection.tsx,components/MovimientoList.tsx}` | Modify | Typed payload, combined system/user selector, confirmation state, and hidden paid-movement controls. |
| `frontend/package.json`, `frontend/package-lock.json` | Modify | DOM test dependencies. |
| `backend/tests/test_{movimientos,ciclos,gastos_programados,categorias}.py` | Modify | Guard, tenant, rollback, and ordinary-item regressions; replace the defect-pinning test. |
| `backend/tests/test_reparacion_reservas.py`, `backend/tests/postgres/test_gasto_programado_concurrency.py`, `frontend/src/components/GastoProgramadoSection.test.tsx` | Create | Repair, real-PostgreSQL race, and DOM evidence. |

## Interfaces / Contracts

```python
class GastoProgramadoPagoRequest(BaseModel):
    categoria_id: int | None = None
    user_category_id: int | None = None  # exactly one; user category must be owned
```

The frontend uses tagged selections (`system:<id>` / `user:<id>`) and sends only matching IDs. The modal preselects the scheduled category, loads both collections, keeps other fields read-only, disables actions during submission, and remains open on error.

Repair evidence is versioned JSON with operation, timestamp, database fingerprint, mandatory `user_id`, input hash, counts, IDs, before/after links and states, action, and verification. It emits no descriptions.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit/integration SQLite | Every guard, both category kinds, atomic rollback/replacement/repair, tenant 404s, ordinary behavior | Existing session/TestClient fixtures plus injected flush/commit failures. |
| PostgreSQL integration | Two independent sessions submit concurrently | `TEST_POSTGRES_URL` job with barrier, committed isolated fixtures, loser 409, one-movement verification, and cleanup. SQLite is not substitute evidence. |
| Frontend DOM | Preselection, grouped options, exact payload, double-click lock, API error retention | Vitest + jsdom + React Testing Library. Build and lint remain required. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary is introduced; the repair utility executes database operations in-process.

## Migration / Rollout

No schema migration. Deploy guards/transactions, then UI, then repair `measure` per tenant. `apply` requires the reviewed hash, aborts on stale before-values, unlinks only movements differing from the reservation owner's `movimiento_id`, recalculates state, and verifies. `rollback` requires recorded after-values, restores before-values atomically, and verifies. The repair batch is the rollback boundary; roll it back before application guards, because old code can recreate contamination.

## Open Questions

None.
