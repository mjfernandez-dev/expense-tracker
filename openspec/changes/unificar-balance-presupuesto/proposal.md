# Proposal: Tab único "Ciclo" (balance + presupuesto)

## Intent

Balance y Presupuesto son redundantes; el presupuesto editable solo se alcanza desde Inicio vía EditCicloModal, y BalanceCiclo recalcula client-side duplicando la fuente de verdad (`calcular_resumen`). Objetivo: tab único "Ciclo" donde reporte y edición convivan, backend como fuente única, plantilla como configuración previa.

## Scope

### In Scope
- Tab "Ciclo" reemplaza a "Balance"; tab "Presupuesto" se desarma (inicio\|movimientos\|ciclo\|metas).
- Lista unificada comprometido + sin comprometer, badge por fila, estado (efectivizado/parcial/pendiente), restante.
- Edición inline del monto comprometido → evaluar PATCH.
- Necesidad vs Deseo: se mantiene (ClasificacionPie).
- Paso Ahorro wizard: importe y % sincronizados bidireccional ("último campo tocado manda"); cambio de % persiste como default (`porcentaje_ahorro_default`).
- Mover plantilla (PresupuestoManager) a Configuración.
- Eliminar recálculo cliente.

### Out of Scope
- Tab inicio INTACTO (DashboardCiclo, EditCicloModal, historial).
- Wizard sin rediseño salvo paso Ahorro.
- Sin migración de datos de ciclos existentes.

## Capabilities

### New Capabilities
- `cycle-tab`: ejecución presupuestaria, lista unificada, edición inline del monto comprometido, `resumen` sin recálculo cliente.
- `cycle-wizard-savings-step`: sincronización bidireccional importe/% ahorro; persistencia del nuevo default de %.
- `budget-template`: plantilla desde Configuración/Cuenta, fuera del ciclo activo.

### Modified Capabilities
- None (no hay spec previa de ciclo/presupuesto; wishlist ajena).

## Approach

Tab "Ciclo" con sub-secciones mobile-first. El frontend consume campos de `resumen` (`saldo_disponible_actual`, `total_gastos`, `gastos_no_planificados`, `semaforo`, `presupuesto_items[]`). Lista unificada en un render con marcador por fila. Se agrega PATCH granular (`PATCH /ciclos/{id}/presupuesto/items/{item_id}`) como alternativa al bulk replace. PresupuestoManager se reubica en AccountPage. Se alinean tipos `CicloResumen` (`gastos_fijos`, union `estado`).

## Affected Areas

- `App.tsx` (Mod) — tabs: balance+presupuesto → ciclo; `CicloTab.tsx` (New)
- `BalanceCiclo.tsx` (Refactor) — sin recálculo; `PresupuestoManager.tsx` (Mod, a Cuenta)
- `CicloWizard.tsx` (Mod) — paso Ahorro bidireccional
- `api.ts`+`types/index.ts` (Mod) — PATCH item, `gastos_fijos`, `estado`
- `routers/ciclos.py` (Mod) — PATCH `/presupuesto/items/{item_id}`; `routers/auth.py` (Mod) — PATCH preferences
- `tests/test_ciclos.py` (Mod) — tests PATCH item

## Risks

- Bulk replace pierde items ad-hoc (Med) — mantener bulk + PATCH granular
- Scroll largo mobile (Med) — sub-nav interna, secciones colapsables
- Regresión bottom-nav/refresh plantilla (Med) — smoke test; fix refreshKey
- Regression visual sin tests frontend (Med) — smoke test local

## Rollback Plan

1. Revert App.tsx a tabs anteriores; restaurar BalanceCiclo/PresupuestoManager.
2. Mantener endpoint bulk; quitar PATCH granular (aditivo).
3. Sin migración de datos.

## Dependencies

- PATCH por item de presupuesto (nuevo) para edición inline.
- PATCH /auth/me/preferences (existente) para default de ahorro.

## Success Criteria

- [ ] Tab "Ciclo" muestra ejecución presupuestaria y edita monto comprometido inline.
- [ ] Ningún recálculo cliente del resultado del ciclo; todo proviene de `resumen`.
- [ ] Plantilla en Configuración/Cuenta, ausente del tab Ciclo.
- [ ] Ciclos existentes (presupuesto_items) intactos.
