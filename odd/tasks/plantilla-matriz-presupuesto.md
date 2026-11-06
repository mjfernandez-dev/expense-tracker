# Feature: plantilla-matriz-presupuesto

**Objetivo:** vista unificada por categoría del presupuesto: matriz (nombre | presupuestado | ejecutado) en la subtab Plantilla, con sugerencia (default) editable y acción explícita de actualizar sugerencia al sobre-gastar. Sin auto-escritura de la plantilla.
**Branch:** `feat/plantilla-matriz`
**Estrategia de entrega:** work-unit commits en la branch; push/merge decisión del usuario.
**Test runners:** backend `SECRET_KEY=test python -m pytest backend/tests/ -v` (PowerShell: `$env:SECRET_KEY='test'`) · frontend `npm run test` (vitest, en `frontend/`).

## Specs

- S1 (usuario, verbatim): "Nombre categoria---presupuestado--- ejecutado" — matriz por categoría en la Plantilla con presupuestado del ciclo activo, ejecutado, y columna de sugerencia (monto_default) más apagado.
- S2 (usuario, verbatim + corrección aceptada): "lo que haya en presupuestado seria fuente de verdad para siempre, es decir cuando se inicie un nuevo ciclo se toma eso como sugerencia" — el nuevo ciclo pre-carga la sugerencia; el presupuestado de cada ciclo es editable sin mutar la plantilla (diseño corregido convenido).
- S3 (usuario, verbatim + corrección): "Si lo ejecutado es mas que lo presupuestado se ajusta lo presupuestado a ese maximo para siempre" — corregido: el sobre-gasto NUNCA escribe la plantilla automáticamente; la fila lo marca y ofrece acción explícita "Actualizar sugerencia a $ejecutado".
- S4 (diseño convenido): "si queres cambiar el presupuesto ir a esta plantilla directamente" — el presupuesto del ciclo se edita desde la matriz; EditCicloModal queda solo con fechas + ahorro (se retira su sección de presupuesto y su sync de defaults).
- S5 (implementación): GastoNoPlanificadoRead expone `user_category_id` y `categoria_id` opcionales para que la matriz junte datos por id y no por nombre; cambio aditivo, sin migraciones.
- S6: al presupuestar desde la matriz una categoría sin item (gasto sin comprometer), se reusa el flujo existente `crearItemPresupuesto` con `user_category_id`; no se re-implementa la creación

## Tasks

- T1 (S5) Backend: ids en GastoNoPlanificadoRead + agregación con ids en ciclo_service + tests RED→GREEN. Route: inline. Commit: `backend tests plantilla ids`.
- T2 (S1) Frontend: util pura `armarMatrizPresupuesto` (join items/sin-presupuesto/categorías, excede, sugerencia) + vitest RED→GREEN. Route: inline. Commit: `frontend matriz util`.
- T3 (S1, S2, S3, S6) UI: componente MatrizPresupuesto + integración en PresupuestoManager (ciclo activo via API) + tipos. Route: inline. Commit: `33d6344` (feat: matriz de presupuesto en plantilla). Verificación: tsc --noEmit limpio, vitest 44/44.
- T4 (S4) EditCicloModal: retirar sección presupuesto y syncDefaults (quedar fechas+ahorro), verificar DashboardCiclo. Route: inline. Commit: `f70d77f` (refactor: simplificar EditCicloModal a fechas y ahorro). Verificación: tsc limpio, vitest 44/44, suite backend completa 162 passed.

## Log

- L1 (2026-11-05): petición original (verbatim): "esta bien, pero pensando en la B seria algo asi? Nombre categoria---presupuestado--- ejecutado ... lo que haya en presupuestado seria fuente de verdad para siempre, es decir cuando se inicie un nuevo ciclo se toma eso como sugerencia. seria posible que al crear un nuevo ciclo se cambien las sugerencias? desaparezcan? si queres cambviar el presupuesto ir a esta plantilla directamente. Si lo ejecutado es mas que lo presupuestado se ajusta lo presupuestado a ese maximo para siempre." Luego en el mismo turno se convino la versión corregida (sin rastrillo automático, acción explícita) y el usuario ordenó: "implementá con tu recomendación".
- L1.1 (2026-11-05): Decisiones de diseño: matriz SIEMPRE refleja el ciclo activo (no el ciclo seleccionado del dropdown) porque es presupuesto actual + config; excede solo se marca en filas con item (ejecutado > estimado); ejecutado de filas sin item muestra el importe sin comprometer con badge; sistema categorías (sin user_category) muestran sugerencia "—".
- L1.2 (2026-11-05): Contexto Engram #225 (movimientos futuros entre ciclos): el resumen activo filtra fecha <= min(ahora, fin), por lo que la matriz no muestra gastos futuros; se preserva el corte exclusivo en el sucesor ya en _movimientos_de_ciclo.
- L2 (2026-11-06): Cierre T3 — defects corregidos en MatrizPresupuesto (export `MatrizPresupuesto`, callback checkbox `onToggleMontoFijo`, `iniciarComprometer`/`confirmarComprometer`, typo). Wire-up en PresupuestoManager: fetch ciclo activo + `useMemo(armarMatrizPresupuesto(items confirmados, gastos_sin_presupuesto, categories))`, matriz a ancho completo reemplazando la lista "Categorías con monto fijo", form Nueva categoría + card ahorro intactos, adaptadores fila→handlers (handleMontoChange/handleMontoBlur/handleToggleMontoFijo/handleEdit/openDeleteModal), `onCambios` re-carga ciclo+categorías, `onError` → autoSaveError. Commit 33d6344; tsc limpio; vitest 44/44.
- L3 (2026-11-06): Cierre T4 — EditCicloModal reducido a fechas + ahorro (-163 líneas); única nota que guía a la matriz de Plantilla; DashboardCiclo.tsx:112 compatible (mismas props). Commit f70d77f; suite backend 162 passed.
- Estado final: T1-T4 completadas y verificadas (S1-S6 cubiertas). Push/merge de feat/plantilla-matriz queda como decisión del usuario.
