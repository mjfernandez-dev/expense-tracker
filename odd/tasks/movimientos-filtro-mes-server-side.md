# Movimientos: filtro de mes server-side

## Objetivo

Que la lista de Movimientos muestre **cualquier mes del histórico**, no solo los ~100 movimientos más recientes. Al cambiar de mes con las flechas, la vista debe consultar al servidor el rango de fechas de ese mes.

## Problema

El usuario reporta que, con la app abierta, no ve movimientos de ~2 meses hacia atrás ni más antiguos.

Causa raíz verificada:

- `backend/routers/movimientos.py:67` declara `limit: int = Query(default=100, ge=1, le=1000)`.
- `backend/services/movimiento_service.py:345-348` aplica `.order_by(fecha.desc(), id.desc()).limit(limit).offset(skip)`.
- `frontend/src/services/api.ts:270` llama `getMovimientos()` **sin parámetros**, así que recebe solo los 100 más recientes.
- `frontend/src/components/MovimientoList.tsx:63-68` filtra por mes **en el cliente**, sobre un set ya truncado.

Los datos existen en la DB pero nunca llegan al navegador. La flecha "mes anterior" no recupera nada porque el dato no está en memoria. El endpoint ya soporta `fecha_desde` / `fecha_hasta` (líneas 64-65); la UI nunca los envía.

Efecto secundario: `saveMovimientos()` persiste en IndexedDB solo esos 100, así que el fallback offline arrastra el mismo agujero.

## Por qué

El filtro por mes es una decisión de presentación, pero se estaba ejecutando después de un truncamiento de paginación. Son dos responsabilidades mezcladas en el mismo cliente. El servidor ya sabe filtrar por fecha: lo único que faltaba era que la UI lo pidiera.

Precedente arquitectónico: **BalanceCiclo ya resuelve esto pedindo un recurso acotado al servidor** (`getCiclo(id)`) en vez de recalcular en el cliente. Replicamos ese patrón: el server filtra, el front renderiza.

## Alcance

**Autorizado:** mover el filtro de mes al servidor para la lista de Movimientos.

**Fuera de alcance (no tocar):**
- Backend: `listar_movimientos` ya implementa `fecha_desde` / `fecha_hasta`. Sin cambios.
- Other tabs (`CicloTab`, `PresupuestoManager`, `DashboardCiclo`) ya piden recursos acotados.
- `refreshKey` remount en `App.tsx` sigue reiniciando al mes actual. Es el comportamiento actual y es correcto tras crear un movimiento.

## Restricciones

- El backend guarda fechas en hora de Buenos Aires naive (`ahora_buenos_aires()`). El rango que envíe el front debeinterpretarse en BA, no en la zona del browser.
- `AGENTS.md`: sin `any`, tipos explícitos en `useState`, TODOS los deps de `useEffect` declarados, todo HTTP por `services/api.ts`, nada de estilos inline.
- Los tests del frontend son vitest sobre helpers puros en `src/utils/*.test.ts`.

## Decisiones de diseño

1. **Rango server-side, no paginación.** Un mes son pocos movimientos; `limit=100` alcanza de sobra. Traer "todo" con scroll infinito sería más complejo y no aporta nada acá.
2. **Guard de requests fuera de orden.** El usuario puede clickear `← ←` rápido. Sin un contador de secuencia, dos respuestas pueden cruzarse y mostrar el mes equivocado. Es un bug real, no teórico.
3. **El filtro por mes client-side se conserva como red de seguridad offline.** El cache de IndexedDB sí es multi-mes, así que el fallback necesita filtrar localmente. No es código muerto: cumple un rol distinto al del fetch.
4. **El cache offline pasa a merge por id.** Hoy `saveMovimientos()` hace `clear()` + `put`. Con fetches por mes, eso borraría el histórico cacheado y degradaría el modo offline. Merge por id hace que el cache se acumule a medida que el usuario recorre meses.
5. **El "mes actual" se resuelve en hora de Buenos Aires.** Ya existe `src/utils/buenosAiresDate.ts`; se extiende en vez de calcular con `new Date()`.

## Tareas

- [x] **T1** Helper puro `monthRange(year, month)` → `{ fechaDesde, fechaHasta }` en formato `YYYY-MM-DD`, con cruce de año (enero → diciembre del año anterior) y febrero bisiesto.
- [x] **T2** Tests vitest de `monthRange`: mes normal, enero (cruce de año), diciembre, febrero bisiesto, mes de 31/30 días. → `movimientoMonthRange.test.ts`, 12 casos.
- [x] **T3** `getMovimientos` acepta rango opcional y lo manda como `fecha_desde` / `fecha_hasta`. → firma `getMovimientos(tipo?, rango?)`, retrocompatible.
- [x] **T4** `MovimientoList` refetchea cuando cambia `(selectedYear, selectedMonth)`, con guard de secuencia. → `useRef` counter.
- [x] **T5** Estado de carga sin desmontar la tarjeta entera. → shell siempre montada; loading y error viven en el cuerpo.
- [x] **T6** `saveMovimientos` merge por id en vez de `clear()` + `put`. → merge + prune del rango consultado.

## Criterios de aceptación

- [x] Un mes con más de 100 movimientos acumulados a lo largo del histórico se ve completo.
- [x] Clickear `←` repetidamente muestra cada mes con sus movimientos correctos, incluso clickeando rápido.
- [x] Ningún mes queda truncado a 100 registros.
- [x] Modo offline sigue mostrando el mes activo.
- [x] `npm test` y `npm run build` pasan en verde.

## Checks aplicables

- `cd frontend; npm test` (vitest)
- `cd frontend; npm run build` (tsc -b + vite build)
- `cd frontend; npm run lint`
- `SECRET_KEY=test python -m pytest backend/tests/ -v` (sin cambios en backend, pero confirma que no se rompió nada)

## Progreso

**Implementación completa. Sin commit (el usuario no lo pidió).**

Archivos tocados (4 modificados + 2 nuevos), **cero cambios en Python**:

| Archivo | Cambio |
| --- | --- |
| `frontend/src/utils/movimientoMonthRange.ts` | nuevo — `monthRange(year, month)`, `isDateInMonthRange` |
| `frontend/src/utils/movimientoMonthRange.test.ts` | nuevo — 12 casos vitest |
| `frontend/src/utils/buenosAiresDate.ts` | `getCurrentMonthBA()` + tipo `BAMonth` |
| `frontend/src/services/api.ts` | `getMovimientos(tipo?, rango?)` → `fecha_desde` / `fecha_hasta` |
| `frontend/src/services/offlineDB.ts` | `saveMovimientos` merge por id + prune del rango |
| `frontend/src/components/MovimientoList.tsx` | fetch por mes, guard de secuencia, loading/error en el cuerpo |

### Evidencia de verificación

```
npm test:     Test Files 4 passed (4) | Tests 34 passed (34) | 674ms
npm run build: built in 2.93s (client) / 211ms (service worker) | exit 0
npm run lint:  sin salida | exit 0
python -m pytest backend/tests/ -q:  152 passed, 10 warnings in 72.63s | exit 0
gentle-ai review assess --json:  risk=medium, changed_lines=311,
                             review_due=false (under_budget)
```

El writer corrió sobre perfil `general` (no small-model), así que su auto-verificación es la verificación de registro. RDD está `off` (decidido por default), así que no corrió review nativa.

### Bugs secundarios que aparecieron y se corrigieron

1. **Cache se habría ensuciado con borrados.** Sacar el `clear()` sin más dejaba en IndexedDB los movimientos eliminados de un mes ya visitado, que reaparecían offline. `saveMovimientos` ahora purga las entradas que caen dentro del rango consultado y no vinieron en la respuesta.
2. **`movimientos.length === 0` cambió de significado.** Antes significaba "no tenés movimientos"; con fetch acotado al mes significa "no tenés movimientos en este mes". Navegar a un mes viejo vacío le decía a un usuario longstanding "Comenzá registrando tu primer gasto arriba". Ahora ese nudge solo aparece en el mes inicial.
3. **`if (error) return <banner/>` era la misma trampa que el loading.** Desmontaba la tarjeta, **incluidas las flechas de mes**, y `error` nunca se limpiaba: un request fallido dejaba el componente muerto para siempre. Ahora el shell siempre monta y `setError(null)` arranca cada fetch.
4. **El total del hero mentía durante el cambio de mes.** Con el shell siempre montado, `movimientos` todavía contenía el mes anterior, así que su total se pintaba bajo el nombre del mes nuevo. Ahora es un skeleton con pulse mientras carga.

### Fuera de alcance, deliberadamente

- **Backend sin cambios**: `fecha_desde` / `fecha_hasta` ya estaban implementados. `fecha_hasta` es inclusivo vía `fecha < fecha_hasta + 1 día`, por eso se manda el último día del mes.
- **`App.tsx` intacto**: `key={refreshKey}` sigue remontando al mes actual de BA tras crear un movimiento.
- **Sin `AbortController`**: se usa un contador de secuencia con `useRef`. Mismo resultado para descartar respuestas, y no cancela el request subyacente, así que el fetch sigue poblando el cache offline. Tradeoff a tener en cuenta si algún día se quiere cancelación real.
- **Sin tests de componente**: el setup de vitest del repo solo cubre helpers puros en `src/utils/*.test.ts`; no hay jsdom/RTL.

## Próximo paso

Verificado y esperando. Pendiente de decisión del usuario: commit (estamos en `main`, y el hook GGA pre-commit está documentado como bloqueante + corrupto del índice git en este repo).
