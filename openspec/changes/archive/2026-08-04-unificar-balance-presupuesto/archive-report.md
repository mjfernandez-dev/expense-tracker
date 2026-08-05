# Archive Report: unificar-balance-presupuesto

**Status**: ARCHIVED
**Verdict**: PASS
**Review gate**: allow
**Archived at**: 2026-08-04
**Artifact store mode**: openspec (filesystem) + hybrid Engram persistence

## Final State

The change was planned, implemented, verified, and reviewed before this archive
phase ran. This report reflects the state of the change AT CLOSE per the
final-state authority hierarchy: native review authority (review gate, terminal
receipt, and store bindings) rank highest, followed by the persisted tasks
artifact and explicit final-state facts; intermediate snapshots
(`apply-progress`, earlier `verify-report` states) are history, not final facts.

- **Verdict**: PASS — full suite green (164 tests passed / 0 failed, exit 0),
  strict build exit 0, verify verdict `pass`.
- **Requirements**: 15/15 compliant.
- **Scenarios**: 24/24 compliant (cycle-tab 14, cycle-wizard-savings-step 7,
  budget-template 3).
- **CRITICAL findings**: None. **Warnings**: None (resolved — see below).
- **Tasks**: 15/15 complete, all checked `[x]` in `tasks.md`.

### Review Gate (Native Review Authority)

- `reviewGate.result`: **allow**, `nextRecommended`: **archive**.
- Lineage: `review-sdd-unificar-final` approved.
- Store revision: `sha256:e4028f9ed4a68dae2ad019359bcea9bc6446e8e927dfbf82adb08d6e85e4dd20`
- SDD review binding revision: `sha256:48d4d8a49794a99c84599756c39935de5b91980b90111bfdb4e39758da90f2d8`
- `verify-report.md` committed as `d7eccbf`; no production code changed after
  verification.

## Specs Synced

All three delta specs were new domains (no prior main spec existed), so each
delta spec is the complete authoritative spec and was copied directly into the
main specs source of truth.

| Domain | Action | Details |
|--------|--------|---------|
| `budget-template` | Created | 3 requirements / 3 scenarios (Plantilla en Configuración, Contenido, Refresco) |
| `cycle-tab` | Created | 8 requirements / 14 scenarios (navegación, resumen sin recálculo, ejecución, lista unificada, PATCH granular, edición inline, necesidad/deseo, tipos) |
| `cycle-wizard-savings-step` | Created | 4 requirements / 7 scenarios (sincronización bidireccional, redondeo, ingreso cero, persistencia default) |

## Issues Resolution (per verify-report, at verification time)

- The initial verification run recorded a pre-existing test failure
  (`test_ciclos.py::test_no_permite_superar_monto_comprometido`). Investigation
  (per `verify-report`, 2026-08-04) concluded it was a **stale test** asserting
  a 400 on over-spend that was never implemented in production. The real product
  rule — from the historical-maximum feature — permits a linked gasto to exceed
  its committed `monto_estimado`, recording the over-spend as `efectivizado` for
  historical maximum capture.
- Maintainer decision: **permit over-spend**.
- Fix: commit `0a12c9a` (`test(ciclos): document over-spending rule`) renamed the
  stale test to `test_gasto_vinculado_puede_superar_monto_comprometido` and
  updated its assertions to the actual rule. **No production code was changed
  in this fix.** Full suite re-run: 164 passed / 0 failed, exit 0.
- SUGGESTION (non-blocking, from verify-report): frontend scenarios (inline edit,
  wizard, refresh) have no automated unit tests; verified by strict build + source
  inspection per documented manual-smoke strategy. A Vitest + Testing Library
  harness would add runtime coverage. Recorded here as a known, accepted residual.

## Source of Truth Updated

The following main specs now reflect the new behavior:
- `openspec/specs/budget-template/spec.md`
- `openspec/specs/cycle-tab/spec.md`
- `openspec/specs/cycle-wizard-savings-step/spec.md`

## Archive Contents

The change folder moved to `openspec/changes/archive/2026-08-04-unificar-balance-presupuesto/`:
- `proposal.md` ✓
- `specs/` (3 domains) ✓
- `design.md` ✓
- `tasks.md` ✓ (15/15 tasks complete, no unchecked implementation tasks)
- `verify-report.md` ✓
- `archive-report.md` ✓ (this file)

## SDD Cycle Complete

The change `unificar-balance-presupuesto` has been fully planned, implemented,
verified, reviewed, and archived. Ready for the next change.
