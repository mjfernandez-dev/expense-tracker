# Especificación Tab Ciclo (`cycle-tab`)

## Purpose

El tab único "Ciclo" reemplaza a "Balance" y absorbe la edición del presupuesto del ciclo. El backend (`calcular_resumen`) es la única fuente de verdad: el frontend no recalcula totales ni resultado del ciclo.

## Requirements

### Requirement: Navegación con tab "Ciclo"

La app MUST reemplazar los tabs "balance" y "presupuesto" por el tab "ciclo"; la navegación MUST quedar `inicio | movimientos | ciclo | metas`.

#### Scenario: Barra con 4 tabs

- GIVEN un usuario autenticado
- WHEN se renderiza la bottom nav
- THEN MUST aparecer exactamente Inicio, Movimientos, Ciclo, Metas
- AND MUST NOT existir tabs "Balance" ni "Presupuesto"

### Requirement: Resultado del ciclo sin recálculo cliente

El tab Ciclo MUST consumir `saldo_disponible_actual`, `total_gastos`, `total_ingresos`, `ahorro_objetivo`, `semaforo` y `daily_cap` desde `resumen`. El frontend MUST NOT recalcular totales desde movimientos ni usar `getMovimientosByDateRange` para el reporte. (Previously: BalanceCiclo recalculaba `totalGastos` y el resultado en cliente.)

#### Scenario: Reporte desde el resumen

- GIVEN un ciclo activo con movimientos
- WHEN se abre el tab Ciclo
- THEN resultado y totales MUST coincidir con `resumen`
- AND MUST NOT hacerse un fetch extra de movimientos

### Requirement: Ejecución presupuestaria por categoría

Cada `presupuesto_items[]` del resumen MUST mostrar: ejecutado, estimado, barra de progreso, estado (`pendiente`|`parcial`|`efectivizado`) y restante. El % de la barra MUST usarse solo para el render visual.

#### Scenario: Item parcial

- GIVEN item estimado 1000, ejecutado 400, estado "parcial"
- WHEN se renderiza la fila
- THEN MUST verse ejecutado/estimado, barra al 40% y restante 600

#### Scenario: Item pendiente

- GIVEN item con ejecutado 0
- WHEN se renderiza la fila
- THEN MUST verse estado "pendiente" y restante = estimado

### Requirement: Lista unificada comprometido / sin comprometer

La lista MUST integrar en un único render items presupuestados y gastos sin presupuesto, con marcador por fila: badge "comprometida" vs "sin comprometer". La integración MUST derivarse SIEMPRE del `resumen` (ej.: resumen enriquecido con desglose de `gastos_no_planificados` o flag por categoría); MUST NOT volver a buscar movimientos.

#### Scenario: Ambos marcadores

- GIVEN resumen con items y gastos sin presupuesto
- WHEN se renderiza la lista
- THEN cada fila con item MUST llevar "comprometida"
- AND cada fila sin item MUST llevar "sin comprometer"

#### Scenario: Solo comprometido

- GIVEN resumen sin gastos no planificados
- WHEN se renderiza la lista
- THEN MUST aparecer solo filas "comprometida"

### Requirement: PATCH granular de monto estimado (backend)

El backend MUST exponer `PATCH /ciclos/{id}/presupuesto/items/{item_id}` actualizando `monto_estimado`, con: ownership del ciclo y del item (404 si no corresponde al usuario), `monto_estimado >= 0` y `>= monto_ejecutado` (400, mismo criterio del bulk). MUST NOT eliminar items ad-hoc; el bulk replace MUST permanecer.

#### Scenario: Actualización válida

- GIVEN ciclo propio, item estimado 1000 ejecutado 400
- WHEN PATCH con monto_estimado=1200
- THEN MUST responder 200 con el item y su estado recalculado

#### Scenario: Item ajeno

- GIVEN un item de otro usuario
- WHEN se envía el PATCH
- THEN MUST responder 404 sin revelar el recurso

#### Scenario: Monto menor al ejecutado

- GIVEN item con ejecutado 500
- WHEN PATCH con monto_estimado=300
- THEN MUST responder 400 con detalle en español

#### Scenario: Item inexistente

- GIVEN un item_id fuera del ciclo
- WHEN se envía el PATCH
- THEN MUST responder 404

### Requirement: Edición inline del monto (frontend)

El tab MUST permitir editar inline `monto_estimado` vía el PATCH granular, con estados loading, error visible en español y refresco del resumen sin recarga total.

#### Scenario: Edición exitosa

- GIVEN un item en el tab Ciclo
- WHEN el usuario cambia el monto y confirma
- THEN MUST persistir vía PATCH y la fila MUST reflejar el resumen actualizado

#### Scenario: Error de validación

- GIVEN un monto menor al ejecutado
- WHEN se confirma la edición
- THEN MUST mostrarse el error y conservarse el monto anterior

### Requirement: Necesidad vs Deseo

El tab Ciclo MUST mantener la clasificación necesidad/deseo (ClasificacionPie) sin cambios de comportamiento.

#### Scenario: Pie de clasificación

- GIVEN un ciclo con gastos clasificados
- WHEN se renderiza el tab
- THEN MUST mostrarse la distribución necesidad/deseo como hoy

### Requirement: Tipos de frontend alineados

`CicloResumen` MUST declarar `gastos_fijos`. La unión `estado` de `PresupuestoItem` MUST incluir `'efectivizado'`; `'efectivado'` MUST dejar de usarse.

#### Scenario: Compilación sin casts

- GIVEN el código TypeScript actualizado
- WHEN se compila
- THEN `resumen.gastos_fijos` MUST ser accesible tipado
- AND `estado === 'efectivizado'` MUST ser válido

## Open Decisions (para design)

- Wire de la marca comprometido/sin: ¿campo nuevo `gastos_sin_presupuesto[]` en `CicloResumen` vs flag por categoría? (Recomendado: campo nuevo en el resumen, sin fetch extra.)
- POST para crear item ad-hoc al asignar monto a un gasto sin presupuesto: ¿incluirlo o fuera de scope? (Recomendado: fuera de scope, solo PATCH sobre existentes.)
