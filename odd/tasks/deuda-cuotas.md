# Feature: deuda-cuotas (consumos en tarjeta vía GastoProgramado)

Objetivo: gestionar consumos en tarjeta (cuotas por producto) con el sistema existente `GastoProgramado`; alta de series en Plantilla, pago con botón "Pagar mes".
Branch: `main` (flujo acordado: commit → push main → deploy Cloud Run → revisar en prod, revert si se arrepiente)
Entrega: `ask-on-risk` — push a main lo decide el usuario al cierre.
Runner backend: `$env:SECRET_KEY='test'; python -m pytest backend/tests/ -v` · frontend: `npx tsc --noEmit` + `npm run test` (vitest; sin infra de tests de componente → checks estructurales + verificación de render manual).

## Specs

- S1: usar el sistema existente `GastoProgramado` — NO un modelo "Deuda" nuevo, NO línea nueva en el header (ingresos/ahorro/presupuesto no cambia: las cuotas reservadas caen DENTRO de −presupuesto como items con `gasto_programado_id`).
- S2: cuotas por producto con categoría real (Ropa, Varios, etc.). Ropa/Varios siguen SIN monto fijo — cuotas ≠ monto fijo, mecanismos independientes.
- S3 (usuario verbatim, 2026-11-06): "si, pagar mes" — botón **Pagar mes** que marca pagadas todas las cuotas pendientes del ciclo de una vez (pago único del resumen).
- S4 (usuario): la sección de gestión va en **Plantilla** (pestaña Presupuesto), no en Ciclo — "es algo mas general que particular". Ciclo solo muestra items programados auto-reservados.
- S5: cuotas pagadas NUNCA caen en "Gastos sin comprometer" (ejecutan su item). Al pagar, movimientos SOLO con la categoría del programado.
- S6: alta de serie de cuotas en un comando: producto, importe cuota, cuota inicial/total, primer vencimiento, categoría.
- S7: alta de deuda ya en curso: dar de alta SOLO las cuotas restantes (kas va por la 3/6 → serie 4-6).
- S8: retirar el compromiso manual de TarjetaCredito (doble conteo) — acción de datos del usuario; solo recordar, no es código.
- S9: vencimientos mensuales sucesivos desde el primer vencimiento (suma de meses, con clamp de día).

## Tasks

- T1 (S6, S9, S1): backend — `SerieGastoCreate` schema + `crear_serie_gastos_programados` service + `POST /gastos-programados/serie`. Route: inline. Commit: `6043718`. Verificación: RED→GREEN 6/6 en `test_gasto_programado_serie.py` (cuotas restantes, reserva en ciclo activo, validaciones).
- T2 (S3, S5): backend — `pagar_mes_gastos_programados` service + `POST /gastos-programados/pagar-mes` (paga cuotas pendientes con vencimiento ≤ fecha_fin del ciclo activo; devuelve `pagados[]` + `total`). Route: inline. Commit: `88db39e`. Verificación: RED→GREEN 3/3; suite completa 171 passed.
- T3 (S6, S3): frontend — wrappers en `api.ts` (`crearSerieGastoProgramado`, `pagarMesGastosProgramados`) + tipos (`SerieGastoCreate`). Route: inline. Commit: pending.
- T4 (S4, S6, S7): frontend — `GastosProgramadosSection.tsx`: listado de cuotas pendientes agrupadas por producto, alta de serie (form), botón Pagar mes (n · $X), cancelar cuota. Route: inline. Commit: pending.
- T5 (S4): integración — card "Gastos programados" en la sub-pestaña Plantilla de `CicloTab`, debajo de la Matriz; `onChanges` refresca ciclo activo. Route: inline. Commit: pending.

## Log

- L1 (2026-11-06): usuario: "retomemos lo de deuda/cuota". Contexto previo: proceso "no se como manejar en la app el registro de los consumos en tarjeta de credito; actualmente una categoria TarjetaCredito con monto comprometido = total a pagar, pero es producto de cuotas de 3 productos distintos en distinto número de cuotas". Validado paso a paso: usar GastoProgramado (backend completo existe, UI huérfana), cuotas con categoría real, retirar TarjetaCredito manual (doble conteo), Pagar mes ("si, pagar mes"), sección en Plantilla ("mas general que particular").
- Predicción de líneas: backend ~250 (serie + pagar-mes + tests) · frontend ~350 (sección + form + integración) → >400 total: flujo con commits por unidad, push a main decidido por usuario al cierre.
