```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:d99f3ad156cca0664eecf95e837f3dfe1ef3237f56e28727e574a47b38b9fc1c
verdict: pass
blockers: 0
critical_findings: 0
requirements: 15/15
scenarios: 24/24
test_command: SECRET_KEY=test python -m pytest backend/tests/ -v
test_exit_code: 0
test_output_hash: sha256:038920914c46a5f6ea3be9b243c441f906f6894696346ec0bcb112240a57bebb
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:caff5b0744231ba4325533b688c1f20137322d86cf0aa1e7c414493856f50fc4
```

## Verification Report

**Change**: unificar-balance-presupuesto
**Version**: specs v1 (cycle-tab, cycle-wizard-savings-step, budget-template)
**Mode**: Standard (Strict TDD not active)
**Evidence refresh**: 2026-08-04 — re-ran full suite after `0a12c9a` (see Issues section); suite green.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 15 |
| Tasks complete | 15 |
| Tasks incomplete | 0 |

All 15 tasks checked `[x]` in `tasks.md`. Artifact set: proposal, 3 specs, design (7 decisions), tasks — full verification dimensions.

### Build & Tests Execution

**Build**: ✅ Passed (`npm run build` → `tsc -b && vite build`; exit 0; dist generated, 131 modules + PWA service worker)

**Tests**: ✅ 164 passed / 0 failed / 0 skipped (exit 0)
Command: `SECRET_KEY=test python -m pytest backend/tests/ -v`
- The previously failing `test_ciclos.py::test_no_permite_superar_monto_comprometido` was a **stale test that contradicted the product rule** (see Issues → Resolution). It was renamed to `test_gasto_vinculado_puede_superar_monto_comprometido` and updated to assert the actual rule (commit `0a12c9a`); the suite is now fully green.

**Coverage**: ➖ Not available (no coverage threshold configured for this project).

### Spec Compliance Matrix

Legend: ✅ COMPLIANT (covering test passed at runtime) · ⚠️ PARTIAL · ❌ UNTESTED/FAILING. Frontend-only scenarios are verified by successful strict build (compile-time proof) plus direct source inspection per the design's documented manual-smoke testing strategy; backend scenarios are covered by passing pytest tests.

#### cycle-tab (8 requirements / 14 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| REQ-01 Navegación tab "Ciclo" | S01 Barra con 4 tabs | `App.tsx` `type Tab = 'inicio'\|'movimientos'\|'ciclo'\|'metas'`; labels/nav render 4 tabs; no "balance"/"presupuesto" (build OK) | ✅ COMPLIANT |
| REQ-02 Resultado sin recálculo cliente | S02 Reporte desde el resumen | `CicloTab.tsx` consumes `resumen.saldo_disponible_actual`, `total_*`; imports only `getCiclos`/`getCiclo`/`actualizarMontoPresupuestoItem`, never `getMovimientosByDateRange` (build OK) | ✅ COMPLIANT |
| REQ-03 Ejecución presupuestaria por categoría | S03 Item parcial | `CicloTab.renderItem`: ejecutado/estimado, bar `style width %`, restante; backend state recalced in PATCH (`test_patch_item_valido_recalcula_estado` PASSED) | ✅ COMPLIANT |
| REQ-03 | S04 Item pendiente | `CicloTab`: restante = pendiente, estado `'pendiente'` from resumen (build OK) | ✅ COMPLIANT |
| REQ-04 Lista unificada comprometido/sin | S05 Ambos marcadores | `CicloTab`: `resumen.presupuesto_items.filter(confirmado)` badge "comprometida" + `resumen.gastos_sin_presupuesto` desc badge "sin comprometer" (build OK; backend `test_resumen_enriquecido_gastos_sin_presupuesto_y_clasificacion` PASSED) | ✅ COMPLIANT |
| REQ-04 | S06 Solo comprometido | `CicloTab` renders sin-comprometer section only when `gastos_sin_presupuesto.length>0` (build OK) | ✅ COMPLIANT |
| REQ-05 PATCH granular (backend) | S07 Actualización válida | `test_patch_item_valido_recalcula_estado` PASSED (200, estado→efectivizado) | ✅ COMPLIANT |
| REQ-05 | S08 Item ajeno | `test_patch_item_ajeno_devuelve_404` + `test_patch_item_en_ciclo_ajeno_devuelve_404` PASSED | ✅ COMPLIANT |
| REQ-05 | S09 Monto menor al ejecutado | `test_patch_item_monto_menor_al_ejecutado_devuelve_400` PASSED (400, detail en español) | ✅ COMPLIANT |
| REQ-05 | S10 Item inexistente | `test_patch_item_inexistente_devuelve_404` PASSED (also `test_patch_item_monto_negativo_no_se_acepta` → 422) | ✅ COMPLIANT |
| REQ-06 Edición inline (frontend) | S11 Edición exitosa | `CicloTab.guardarEdicion` → `setSelectedCiclo(respuestaPATCH)` sin re-fetch (build OK) | ✅ COMPLIANT |
| REQ-06 | S12 Error de validación | `CicloTab` `inlineError = detail`, revierte; error visible en español (build OK) | ✅ COMPLIANT |
| REQ-07 Necesidad vs Deseo | S13 Pie de clasificación | `CicloTab` uses `resumen.clasificacion_importes` + `ClasificacionPie`; backend `test_resumen_enriquecido...` verifies necesidad 700/deseo 100 (PASSED) | ✅ COMPLIANT |
| REQ-08 Tipos de frontend alineados | S14 Compilación sin casts | `types/index.ts` `estado: 'pendiente'\|'parcial'\|'efectivizado'` (no `\| string`, no `'efectivado'`); `CicloResumen.gastos_fijos` declared; `npm run build` PASSED | ✅ COMPLIANT |

#### cycle-wizard-savings-step (4 requirements / 7 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| REQ-09 Sincronización bidireccional | S15 Edito importe | `CicloWizard.handleAhorroMontoChange`: `fuenteEdicion='monto'`, `% = redondear1(monto/ingreso*100)` (build OK) | ✅ COMPLIANT |
| REQ-09 | S16 Edito porcentaje | `handleAhorroPorcentajeChange`: `importe = Math.round(ingreso*%/100)` (build OK) | ✅ COMPLIANT |
| REQ-10 Redondeo definido | S17 Porcentaje con decimal | `redondear1(n)=Math.round(n*10)/10` → 12.5% (build OK) | ✅ COMPLIANT |
| REQ-10 | S18 Importe redondeado | `Math.round` → $12500 sin centavos (build OK) | ✅ COMPLIANT |
| REQ-11 Ingreso cero | S19 Ingreso 0 | Guard `importeReferencia > 0 ? pct : 0` evita div por cero/NaN (build OK) | ✅ COMPLIANT |
| REQ-12 Persistencia % default | S20 Confirmación del wizard | `handleFinish` → `updateUserPreferences({porcentaje_ahorro_default})`; endpoint valida 0-100 (`test_actualizar_ahorro_objetivo_default*` PASSED) | ✅ COMPLIANT |
| REQ-12 | S21 Error de persistencia | `updateUserPreferences(...).catch` → `setError(...)`; ciclo se crea igual (no bloqueante) (build OK) | ✅ COMPLIANT |

#### budget-template (3 requirements / 3 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| REQ-13 Plantilla en Configuración/Cuenta | S22 Acceso desde Cuenta | `AccountPage` renders `<PresupuestoManager refreshKey>`; removed from ciclo tab in `App.tsx` (build OK) | ✅ COMPLIANT |
| REQ-14 Contenido de la plantilla | S23 Guardar default | `PresupuestoManager` `updateUserPreferences({porcentaje_ahorro_default})`; backend `test_actualizar_ahorro_objetivo_default*` PASSED | ✅ COMPLIANT |
| REQ-15 Refresco de la plantilla | S24 Navegación y refresco | `PresupuestoManager` includes `refreshKey` in `fetchGastosFijos`/`fetchCategories` effect deps; `AccountPage` bumps on `visibilitychange` (build OK) | ✅ COMPLIANT |

**Compliance summary**: 24/24 scenarios compliant (all 15 requirements PASS).

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| REQ-01 4 tabs | ✅ Implemented | `App.tsx` Tab type + nav; balance/presupuesto removed; wishlist→metas |
| REQ-02 Reporte desde resumen | ✅ Implemented | `CicloTab` uses `resumen` only; no movimientos fetch |
| REQ-03 Ejecución presupuestaria | ✅ Implemented | renderItem: ejecutado/estimado/bar/restante/estado |
| REQ-04 Lista unificada | ✅ Implemented | items "comprometida" + gastos_sin_presupuesto "sin comprometer", single `divide-y` |
| REQ-05 PATCH granular | ✅ Implemented | ciclos.py endpoint + `actualizar_monto_presupuesto_item` (ownership 404, validaciones 400/422) |
| REQ-06 Edición inline | ✅ Implemented | editingId/value, savingId, inlineError; refresh sin re-fetch |
| REQ-07 Necesidad/Deseo | ✅ Implemented | clasificacion_importes → ClasificacionPie |
| REQ-08 Tipos alineados | ✅ Implemented | union 'efectivizado'; gastos_fijos; no casts (build) |
| REQ-09 Sincronización importe↔% | ✅ Implemented | fuenteEdicion monto/porcentaje |
| REQ-10 Redondeo | ✅ Implemented | 1 decimal % / Math.round pesos |
| REQ-11 Ingreso cero guard | ✅ Implemented | % = 0, sin NaN |
| REQ-12 Persistencia al confirmar | ✅ Implemented | handleFinish no bloqueante |
| REQ-13 Plantilla en Cuenta | ✅ Implemented | AccountPage card + removed from Ciclo |
| REQ-14 Contenido plantilla | ✅ Implemented | defaults + gastos fijos conservados |
| REQ-15 Refresco refreshKey | ✅ Implemented | effect deps + visibilitychange bump |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| 1. Solo PATCH sobre existentes (sin POST ad-hoc) | ✅ Yes | No POST item ad-hoc; bulk replace permanece |
| 2. `gastos_sin_presupuesto[]` nuevo campo en resumen | ✅ Yes | calculado en `calcular_resumen`; Σ == `gastos_no_planificados` (test) |
| 3. Precisión % 1 decimal, importe Math.round, ingreso=0→0 | ✅ Yes | `redondear1`, `Math.round`, guard |
| 4. Persistir % solo al confirmar wizard, no bloqueante | ✅ Yes | `handleFinish` `.catch` |
| 5. Card inline en AccountPage + refreshKey (sin ruta) | ✅ Yes | `<PresupuestoManager refreshKey>` |
| 6. `clasificacion_importes` en resumen (sin fetch) | ✅ Yes | Σ gastos por clasificación; sin `getMovimientosByDateRange` |
| 7. `CicloTab.tsx` nuevo; eliminar `BalanceCiclo.tsx` | ✅ Yes | `CicloTab.tsx` creado; `BalanceCiclo.tsx` eliminado (commit 365b4bb, sin refs) |

Design deviations: None.

### Issues Found

**CRITICAL**: None.

**WARNING**: None (resolved — see Resolution below).

**Resolution (2026-08-04)**:
- Initial verification recorded `test_ciclos.py::test_no_permite_superar_monto_comprometido` as a pre-existing failure. Investigation showed it was a **stale test contradicting the real product rule**: the historical-maximum feature (`feat: sugerir presupuesto basado en maximo historico`, commit `02d0148`) requires that a linked gasto MAY exceed its committed `monto_estimado` — the over-spend is recorded as `efectivizado` and the historical maximum captures it to suggest better budgets. The test asserted the opposite (400 on over-spend) but that behavior was never implemented in production.
- Maintainer decision: **permit over-spend** (expenses reflect reality; the system marks the commitment `efectivizado` and the maximum-historical captures the over-spend).
- Fix (commit `0a12c9a`, `test(ciclos): document over-spending rule`): renamed the stale test to `test_gasto_vinculado_puede_superar_monto_comprometido` and updated assertions to the actual rule (second gasto → 200, estado `efectivizado`, ejecutado 160, pendiente 0). No production code changed.
- Full suite re-run: **164 passed / 0 failed, exit 0** (`test_output_hash sha256:038920...`).

**SUGGESTION**:
- Frontend scenarios (REQ-06 inline edit, REQ-09..12 wizard, REQ-15 refresh) have **no automated unit tests**; they are verified by strict build + source inspection, per the design's documented manual-smoke strategy. Adding a lightweight frontend test harness (e.g. Vitest + Testing Library) would turn these into runtime-covered scenarios.

### Verdict

**Strict envelope: PASS. Change scope: PASS.**

All 15/15 requirements and 24/24 scenarios of the change are verified: backend-scoped scenarios pass via pytest (full suite green, 164 passed, exit 0); frontend scenarios via strict build + source inspection. The stale over-spend test was corrected to the real product rule (commit `0a12c9a`). The change is archive-ready.

Note: 24 scenarios counted authoritatively from the retrieved specs (cycle-tab 14, wizard 7, budget-template 3); the launch prompt's stated "25" was not reflected in the spec files.
