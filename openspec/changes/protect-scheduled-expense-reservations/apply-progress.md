# Apply Progress: Protect Scheduled-Expense Reservations

## Delivery Boundary

- Strategy: `auto-chain`, `stacked-to-main`
- Work unit: `pr1-protected-reservation-boundary`
- Completed scope: tasks 1.1 and 1.2 only
- Deferred scope: tasks 2.1 through 6.2
- Review budget: below the 400 changed-line limit

## Completed Tasks

- [x] 1.1 Added regression coverage for protected movement links, tenant-safe 404 behavior, ordinary auto-linking, bulk and granular budget operations, protected PATCH rejection, and cancellation isolation. Replaced the defect-pinning contamination test with a rejection regression.
- [x] 1.2 Added the central scheduled-expense reservation policy and applied it to generic movement and cycle-budget paths while preserving ordinary behavior.

## RED / GREEN Evidence

| Stage | Command | Exact result |
|---|---|---|
| RED | `$env:SECRET_KEY='test'; python -m pytest backend/tests/test_movimientos.py backend/tests/test_ciclos.py backend/tests/test_gastos_programados.py -v` | Exit 1: 6 failed, 67 passed; failures covered protected auto-linking, explicit linking, bulk/granular mutation, protected PATCH, and contamination. |
| GREEN | `$env:SECRET_KEY='test'; python -m pytest backend/tests/test_movimientos.py backend/tests/test_ciclos.py backend/tests/test_gastos_programados.py -v` | Exit 0: 73 passed, 11 warnings. |
| Full backend regression | `$env:SECRET_KEY='test'; python -m pytest backend/tests/ -v` | Exit 0: 163 passed, 11 warnings in 69.46s. |

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `$env:SECRET_KEY='test'; python -m pytest backend/tests/test_movimientos.py backend/tests/test_ciclos.py backend/tests/test_gastos_programados.py -v` → exit 0, 73 passed, 11 warnings. |
| Runtime harness command/scenario and exact result | The focused TestClient suite exercised movement create/link, cycle bulk/granular create/PATCH, tenant isolation, and scheduled-expense cancellation through real FastAPI routes → exit 0, 73 passed. |
| Rollback boundary | Revert `backend/services/reserva_gasto_programado_policy.py`, the guarded call-site changes in `backend/services/{movimiento,ciclo_commitment}_service.py`, and the PR 1 regressions in the three backend test files. No later payment, frontend, repair, or PostgreSQL behavior is included. |

## Deviations and Issues

- None. The implementation matches the PR 1 design and preserves tenant lookup before protected-item rejection.
- Existing SQLAlchemy, Pydantic, pytest-asyncio, and SQLite drop-order warnings remain unchanged.
