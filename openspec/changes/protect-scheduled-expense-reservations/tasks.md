# Tasks: Protect Scheduled-Expense Reservations

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,200–1,700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Each PR starts from `main`; below 400 lines. Gates: `SECRET_KEY=test python -m pytest backend/tests/ -v`; `npm --prefix frontend test`; `npm --prefix frontend run lint`; `npm --prefix frontend run build`.

### Suggested Work Units

| Unit | Goal/completion | PR | Focused test | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Reservations safe; ordinary flows pass | PR 1 | `pytest backend/tests/test_movimientos.py backend/tests/test_ciclos.py backend/tests/test_gastos_programados.py -v` | TestClient movement/cycle/cancel | Policy/call sites |
| 2 | Payment atomic | PR 2 | `pytest backend/tests/test_gastos_programados.py -v` | TestClient payment | Payment orchestrator |
| 3 | References align or roll back | PR 3 | `pytest backend/tests/test_categorias.py backend/tests/test_movimientos.py -v` | TestClient reassignment/movements | Replacement/guards |
| 4 | UI interactions pass | PR 4 | `npm --prefix frontend test -- GastoProgramadoSection.test.tsx` | jsdom command | Payload/modal/tooling |
| 5 | Repair evidence verifies | PR 5 | `pytest backend/tests/test_reparacion_reservas.py -v` | Script `measure --user-id <id> --output evidence.json` | Recorded batch |
| 6 | Race persists once | PR 6 | PostgreSQL command in 6.2 | Same command | Harness/fixture |

## Phase 1: Core Protected-Reservation Boundary — PR 1

- [x] 1.1 RED: `backend/tests/test_{movimientos,ciclos,gastos_programados}.py` covers protected paths, tenant 404, ordinary behavior, and cancellation.
- [x] 1.2 GREEN: create `backend/services/reserva_gasto_programado_policy.py`; guard `movimiento_service.{load_presupuesto_item,auto_detectar_presupuesto_item,apply_presupuesto_item_link}` and `ciclo_commitment_service.{aplicar_presupuesto_bulk,actualizar_monto_presupuesto_item,crear_o_vincular_presupuesto_item}`.

## Phase 2: Atomic Category-Aware Payment — PR 2

- [ ] 2.1 RED: `backend/tests/test_gastos_programados.py` covers category kinds, invalid input/tenant, rollback, duplicate, and locking.
- [ ] 2.2 GREEN: add `backend/schemas.py::GastoProgramadoPagoRequest`; wire `backend/routers/gastos_programados.py::pagar_gasto_programado`; refactor its service to tenant `FOR UPDATE`, helper `flush()`, one commit, and loser 409.

## Phase 3: Replacement and Paid-Movement Guards — PR 3

- [ ] 3.1 RED: `backend/tests/test_categorias.py` and `backend/tests/test_movimientos.py` cover mixed replacement, rollback/isolation, and paid edit/delete 409 after ownership lookup.
- [ ] 3.2 GREEN: make `backend/services/user_category_service.py::reasignar_movimientos_categoria` migrate expenses/reservations/payments once; guard `movimiento_service.{actualizar_movimiento,eliminar_movimiento}`.

## Phase 4: Confirmation UI and DOM Harness — PR 4

- [ ] 4.1 RED: `frontend/src/components/GastoProgramadoSection.test.tsx` covers preselection, grouped categories, tagged payload, submit lock, retained error, read-only fields, and hidden paid controls.
- [ ] 4.2 GREEN: update `frontend/src/types/index.ts`, `frontend/src/services/api.ts`, `frontend/src/components/{GastoProgramadoSection,MovimientoList}.tsx`; configure jsdom/RTL/user-event in package files and `frontend/vite.config.ts`.

## Phase 5: Historical Repair — PR 5

- [ ] 5.1 RED: create `backend/tests/test_reparacion_reservas.py` for scoped measure, stale hash, atomic apply, private evidence, and checked rollback.
- [ ] 5.2 GREEN: create `backend/services/reparacion_reservas_service.py` and `backend/scripts/reparar_reservas_gastos_programados.py` with versioned JSON measure/apply/rollback.

## Phase 6: PostgreSQL Integration Evidence — PR 6

- [ ] 6.1 Add `backend/tests/postgres/test_gasto_programado_concurrency.py` with independent sessions, barrier, committed fixtures, cleanup, winner 200, loser 409, and one persisted outcome.
- [ ] 6.2 Run `TEST_POSTGRES_URL=<url> SECRET_KEY=test python -m pytest backend/tests/postgres/test_gasto_programado_concurrency.py -v`, all gates, and record results.
