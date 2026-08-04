# Design: Tab único "Ciclo" (balance + presupuesto)

## Resumen técnico

Backend como única fuente de verdad: se agrega PATCH granular de item y se enriquece `calcular_resumen` (desglose `gastos_sin_presupuesto[]`, `clasificacion_importes`) para que el frontend elimine el recálculo y el fetch de movimientos. Frontend: tab único "Ciclo" (`CicloTab.tsx`) reemplaza Balance+Presupuesto; edición inline vía PATCH; plantilla (`PresupuestoManager`) migra a `AccountPage` con `refreshKey`; wizard de ahorro sincroniza importe↔% y persiste el default al confirmar. Se alinean tipos (`gastos_fijos`, union `estado` con `'efectivizado'`).

## Architecture Decisions

| # | Decisión | Opciones descartadas | Elección |
|---|---|---|---|
| 1 | Crear item ad-hoc al asignar monto | POST /presupuesto/items | **Fuera de scope: solo PATCH sobre existentes.** Bulk ya crea items nuevos; POST duplicaría lógica de categorías/dup. |
| 2 | Wire comprometido/sin | Flag por categoría | **Campo nuevo `gastos_sin_presupuesto[]`** en `CicloResumen`, calculado en `calcular_resumen`; frontend une 2 listas en un render. |
| 3 | Precisión % ahorro | Entero | **1 decimal**; importe `Math.round` (pesos); ingreso=0 → `% = 0` (guard antes de dividir). |
| 4 | Persistir % default | En cada cambio | **Solo al confirmar wizard** (`updateUserPreferences` en `handleFinish`, no bloqueante). |
| 5 | Ubicación plantilla | Ruta `/account/presupuesto-template` | **Card inline en `AccountPage`** + prop `refreshKey` (sin ruta nueva; menos superficie). |
| 6 | Necesidad/Deseo sin fetch | Mantener `getMovimientosByDateRange` | **Añadir `clasificacion_importes` al resumen** (spec prohíbe el fetch en el reporte). |
| 7 | BalanceCiclo | Refactor in-place | **`CicloTab.tsx` nuevo; eliminar `BalanceCiclo.tsx`** tras el swap (evita dead code). |

## Data Flow

```
GET /ciclos/{id} ──► CicloRead.resumen (fuente única)
   ├─ saldo_disponible_actual, total_*, semaforo, daily_cap
   ├─ presupuesto_items[]       → filas "comprometida"
   └─ gastos_sin_presupuesto[]  → filas "sin comprometer"
        (unión client-side en CicloTab, sin recalcular)

Edición inline → PATCH /ciclos/{id}/presupuesto/items/{item_id}
   → service valida (ownership 404, monto>=ejecutado 400)
   → devuelve CicloRead actualizado → CicloTab reemplaza selección (sin re-fetch)
```

## File Changes

| File | Acción | Descripción |
|---|---|---|
| `backend/routers/ciclos.py` | Modify | `PATCH /{ciclo_id}/presupuesto/items/{item_id}` (reusa `_load_ciclo`, `_ciclo_to_read`). |
| `backend/services/ciclo_commitment_service.py` | Modify | `actualizar_monto_presupuesto_item()` (validación monto≥0 y ≥ejecutado, estado recalculado). |
| `backend/services/ciclo_service.py` | Modify | Enriquecer `calcular_resumen` con `gastos_sin_presupuesto[]` y `clasificacion_importes`. |
| `backend/schemas.py` | Modify | `PresupuestoItemPatch`, `GastoNoPlanificadoRead`, campos en `CicloResumen`. |
| `backend/tests/conftest.py` | Modify | Fixture `second_logged_in_client` (para ownership). |
| `backend/tests/test_ciclos.py` | Modify | Tests PATCH (éxito/400/404/ownership) + resumen enriquecido. |
| `frontend/src/types/index.ts` | Modify | `gastos_fijos`, `gastos_sin_presupuesto`, `clasificacion_importes`, union `'efectivizado'` (quitar `'efectivado'` y `\| string`). |
| `frontend/src/services/api.ts` | Modify | `actualizarMontoPresupuestoItem()`. |
| `frontend/src/components/CicloTab.tsx` | Create | Reporte + lista unificada + edición inline + pie. |
| `frontend/src/components/BalanceCiclo.tsx` | Delete | Sustituido por CicloTab. |
| `frontend/src/App.tsx` | Modify | Tabs `inicio\|movimientos\|ciclo\|metas`; render `CicloTab`; quitar `PresupuestoManager`. |
| `frontend/src/components/PresupuestoManager.tsx` | Modify | Prop `refreshKey` en effects de fetch. |
| `frontend/src/pages/AccountPage.tsx` | Modify | Card plano + `PresupuestoManager refreshKey` (+ bump por `visibilitychange`). |
| `frontend/src/components/CicloWizard.tsx` | Modify | Paso Ahorro bidireccional + persistencia % en `handleFinish`. |

## Interfaces / Contracts

```python
# schemas.py
class PresupuestoItemPatch(BaseModel):
    monto_estimado: MoneyDecimal = Field(..., ge=0)

class GastoNoPlanificadoRead(BaseModel):
    categoria: str
    importe: MoneyDecimal

class CicloResumen(BaseModel):
    ...
    gastos_sin_presupuesto: List[GastoNoPlanificadoRead] = []
    clasificacion_importes: ClasificacionImportes = ...  # {necesidad, deseo, sin_clasificar}
```

```python
# ciclo_commitment_service.py
def actualizar_monto_presupuesto_item(ciclo, item_id, nuevo_monto, db) -> PresupuestoItem:
    item = next((i for i in ciclo.presupuesto_items if i.id == item_id), None)
    if item is None: raise ValueError("_not_found")          # → 404 (404 sin revelar)
    if nuevo_monto < 0: raise ValueError("El monto estimado no puede ser negativo")
    prog = calcular_progreso_presupuesto(item)
    if nuevo_monto < prog.ejecutado:
        raise ValueError(f"El monto estimado no puede ser menor a lo ya ejecutado ({prog.ejecutado:.2f})")  # → 400
    item.monto_estimado = nuevo_monto
    item.confirmado = True if prog.ejecutado > 0 else item.confirmado
    item.estado = calcular_progreso_presupuesto(item).estado
    db.commit(); return item
```

```ts
// api.ts
export const actualizarMontoPresupuestoItem =
  (cicloId: number, itemId: number, monto_estimado: number): Promise<Ciclo> =>
  api.patch(`/ciclos/${cicloId}/presupuesto/items/${itemId}`, { monto_estimado }).then(r => r.data);
```

`calcular_resumen`: `gastos_sin_presupuesto` = agrupación por categoría (user_category→categoria→"Sin categoría") de gastos con `presupuesto_item_id is None`, más el exceso de items vinculados atribuido a su categoría (Σ filas == `gastos_no_planificados`). `clasificacion_importes` = Σ gastos por `clasificacion`.

Frontend unifica: `items = resumen.presupuesto_items.filter(confirmado)` (badge "comprometida") + `resumen.gastos_sin_presupuesto` ordenado desc (badge "sin comprometer"), en un solo `divide-y`. Edición inline: estado `editingId/editingValue/savingId/inlineError`; éxito → `setSelectedCiclo(respuestaPATCH)` (sin re-fetch); error → `inlineError = detail` y revierte.

Wizard Ahorro: `fuenteEdicion: 'monto'|'porcentaje'`; editar monto → deriva `%`; editar `%` → deriva monto; guards ingreso=0 (→0) y redondeo (importe `Math.round`).

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Backend | PATCH válido (200, estado recalculado) | `test_ciclos.py` |
| Backend | monto<ejecutado → 400 detalle es | idem |
| Backend | item inexistente → 404; ciclo/item ajeno → 404 | idem + `second_logged_in_client` |
| Backend | `gastos_sin_presupuesto`/`clasificacion_importes` | idem |
| Smoke | Acceso a `SECRET_KEY=test python -m pytest backend/tests/ -v` | ejecución |
| Frontend | Smoke manual local (sin tests unit): tabs, edición inline, sync ahorro, refresh plantilla | `npm run dev` |

## Threat Matrix

N/A — sin routing de CLI, subprocesos, automatización VCS/PR, clasificación de ejecutables ni integración de procesos; solo API HTTP + UI React.

## Migration / Rollout — Slices (single-pr > budget 400 → chained)

El cambio supera 400 líneas (adiciones+eliminaciones). Se proponen 4 fases sin romper la app, cada una ≤400:

| Slice | Contenido | ± líneas estimadas |
|---|---|---|
| P1 | Backend: PATCH + resumen enrichment + schemas + tests (+conftest) | ~200 |
| P2 | Frontend infra: types + api + wizard ahorro + `PresupuestoManager`→AccountPage + quitar tab presupuesto | ~145 |
| P3 | `CicloTab.tsx` + `App.tsx` tabs (ciclo reemplaza balance) + `clasificacion_importes` en pie | ~310 |
| P4 | `chore:` eliminar `BalanceCiclo.tsx` (queda sin referencia tras P3) | ~383 (≤400) |

P1 aditivo/independiente; cada fase con tests/verificación y rollback acotado (P1: revert endpoint; P2: revert manager; P3: revert App; P4: restore file).

**Guard lines**
```
Decision needed before apply: Yes
Chained PRs recommended: Yes
400-line budget risk: High
```

## Open Questions

Ninguno bloqueante. (P4 crea dead code temporal `BalanceCiclo.tsx` entre P3 y P4 — aceptado en cadena.)
