# Tasks: Tab único "Ciclo" (balance + presupuesto)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1038 (P1 200 + P2 145 + P3 310 + P4 383) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | P1 → P2 → P3 → P4 |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

> single-pr con ~1038 líneas > 400 → requiere `size:exception` del maintainer antes de apply.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 (P1) | Backend PATCH + resumen enrichment | PR 1 | `SECRET_KEY=test python -m pytest backend/tests/test_ciclos.py -v` | `uvicorn backend.main:app` + PATCH item vía curl | Revert endpoint/service; aditivo |
| 2 (P2) | Frontend infra: types/api/wizard/plantilla→Cuenta | PR 2 | `npm run build` (tsc strict) | `npm run dev` → wizard ahorro + AccountPage | Revert App/AccountPage/manager |
| 3 (P3) | CicloTab + nav 4 tabs | PR 3 | `npm run build` + smoke tests | `npm run dev` → tab Ciclo edición inline + pie | Revert App.tsx |
| 4 (P4) | Delete BalanceCiclo (chore) | PR 4 | `npm run build` (sin refs rotas) | `npm run dev` smoke | Git restore file |

## Phase 1 — Backend (P1): PATCH granular + resumen enriquecido

- [x] **T1** `backend/schemas.py`: add `PresupuestoItemPatch` (monto_estimado ge=0), `GastoNoPlanificadoRead` (categoria, importe), `ClasificacionImportes`.
- [x] **T2** `backend/schemas.py`: extender `CicloResumen` con `gastos_sin_presupuesto: List[GastoNoPlanificadoRead]`, `clasificacion_importes`.
- [x] **T3** `backend/services/ciclo_commitment_service.py`: `actualizar_monto_presupuesto_item(ciclo, item_id, nuevo_monto, db)`; item None → ValueError `_not_found` (404); monto<0 → `"El monto estimado no puede ser negativo"`; monto<ejecutado → detalle es 400; recalc `estado`, `confirmado`; commit.
- [x] **T4** `backend/routers/ciclos.py`: `PATCH /{ciclo_id}/presupuesto/items/{item_id}` reusando `_load_ciclo`/`_ciclo_to_read` + `current_user`; 404 sin revelar; 400 detalle es.
- [x] **T5** `backend/services/ciclo_service.py`: enriquecer `calcular_resumen` → `gastos_sin_presupuesto` (gastos con `presupuesto_item_id is None` + exceso de items, agrupados por categoría, Σ == `gastos_no_planificados`) y `clasificacion_importes` (Σ por `clasificacion`).
- [x] **T6** `backend/tests/conftest.py`: fixture `second_logged_in_client` (ownership).
- [x] **T7** `backend/tests/test_ciclos.py` (RED→GREEN): PATCH ok (200, estado recalc), monto<ejecutado → 400 es, item ajeno → 404, item inexistente → 404, enrichment `gastos_sin_presupuesto`/`clasificacion_importes`.

## Phase 2 — Frontend infra (P2): tipos, api, wizard, plantilla

- [x] **T8** `frontend/src/types/index.ts`: `PresupuestoItem.estado` → `'pendiente'|'parcial'|'efectivizado'` (quitar `'efectivado'` y `| string`); `CicloResumen` add `gastos_fijos`, `gastos_sin_presupuesto`, `clasificacion_importes`.
- [x] **T9** `frontend/src/services/api.ts`: `actualizarMontoPresupuestoItem(cicloId, itemId, monto_estimado)` → `api.patch` devuelve `Ciclo`.
- [x] **T10** `frontend/src/components/CicloWizard.tsx`: paso Ahorro bidireccional: `fuenteEdicion:'monto'|'porcentaje'`; editar monto → % = round1(importe/ingreso*100); editar % → importe = round(ingreso*%/100); ingreso=0 → % 0 (guard); persistir % vía `updateUserPreferences` en `handleFinish` no bloqueante.
- [x] **T11** `frontend/src/components/PresupuestoManager.tsx`: prop `refreshKey:number`; incluir en deps de `fetchGastosFijos`/`fetchCategories`.
- [x] **T12** `frontend/src/pages/AccountPage.tsx`: card inline con `<PresupuestoManager refreshKey={...}/>` + bump de refresh en `visibilitychange`.

## Phase 3 — CicloTab + navegación (P3)

- [ ] **T13** `frontend/src/components/CicloTab.tsx` (Create): reporte desde `resumen` (`saldo_disponible_actual`, `total_gastos`, `total_ingresos`, `ahorro_objetivo`, `semaforo`, `daily_cap`) SIN `getMovimientosByDateRange`; lista única `divide-y` (confirmed items badge "comprometida" + `gastos_sin_presupuesto` desc badge "sin comprometer"); barra progreso, estado, restante por fila; edición inline (`editingId/editingValue/savingId/inlineError`, éxito → `setSelectedCiclo(respuestaPATCH)`, error → detalle es y revert); `ClasificacionPie` desde `clasificacion_importes`.
- [ ] **T14** `frontend/src/App.tsx`: `type Tab = 'inicio'|'movimientos'|'ciclo'|'metas'`; quitar "balance"/"presupuesto"; render `CicloTab` en `ciclo`; quitar `PresupuestoManager`; renombrar wishlist→metas; bottom nav con 4 tabs.

## Phase 4 — Cleanup (P4)

- [ ] **T15** `backend/`N/A; `frontend/src/components/BalanceCiclo.tsx`: eliminar (dead tras P3) — `chore: remove BalanceCiclo`.
