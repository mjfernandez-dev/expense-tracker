# Ticket como lote de movimientos (Etapa 1: capturar bien)

## Objetivo

Convertir un ticket leído en **N movimientos, uno por renglón**, cada uno con el precio final pagado (precio de lista menos el descuento que le corresponde). El objetivo declarado por el usuario no es contable sino de información: saber cuánto paga por la unidad de un producto y poder compararlo en el tiempo.

Rama: `feat/ticket-por-renglon` (creada desde `main`) · Runner: `pytest` (backend) + `npm test` (frontend) · Estado: **implementado, verificado, pusheado; PR #6 abierto**

Esta feature **reemplaza S1 de `odd/tasks/lector-tickets.md`** (un movimiento por ticket con el detalle en la nota). El lector sigue igual: cambia qué se hace con lo que devuelve.

## Specs

**S1 — Un movimiento por renglón.**
Cada ítem del ticket se convierte en un movimiento propio. (L1 verbatim: *"que cada renglon es un movimiento"*)

**S2 — Categoría por renglón, con default único.**
Todos los renglones arrancan en la categoría que el usuario elija, y puede cambiarla en cada fila antes de confirmar. (L1 verbatim: *"en principio aparecen todos en una misma categoria, con posibilidad de cambiar por renglon"*)

**S3 — El importe de cada renglón es el precio final pagado.**
No el precio de lista: `importe de la línea − descuentos atribuidos a esa línea`. (L2 verbatim: *"si un item tiene descuento a mi me sirve saber el precio final que pague (precio - descuento)"*)

Atribución de descuentos: por nombre cuando el descuento nombra al producto (`OFERTA QUESO LS` → la línea del queso); si no se puede atribuir, se prorratea entre las líneas sin descuento propio. La suma de importes debe cerrar con el total del ticket.

**S4 — Se guarda la cantidad.**
Sin cantidad no hay precio por unidad: `$2.411,97` de banana no dice nada, `$2.899,00/kg` sí. Se guarda la cantidad tal como la imprime el ticket (unidades o kg).

**S5 — Se guarda el comercio.**
Para comparar entre súpers. Va en columna propia y cifrada (revela hábitos de consumo, igual que `nota`), no dentro de `descripcion`, que queda para el nombre del producto.

**S6 — El ticket es una unidad de creación.**
Todos los movimientos de un ticket se insertan en **una sola transacción** y comparten `lote_id`. O entran todos, o no entra ninguno. Con eso se puede deshacer un ticket completo.

**S7 — Guard aritmético.**
Antes de confirmar se verifica `suma(importes) == total del ticket`. Si no cierra, se muestra la diferencia exacta y se exige una confirmación explícita: un renglón que el modelo no leyó no puede pasar inadvertido.

**S8 — La fecha la define el humano y aplica a todos los renglones.**
Sigue vigente la decisión del lector: no se extrae fecha del ticket.

**S9 — El precio por unidad no se guarda, se calcula.**
`importe / cantidad`. Guardarlo crearía un dato que puede quedar desincronizado del importe.

## Tasks

| ID | Tarea | Spec | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Migración + modelo: `cantidad`, `comercio`, `lote_id` en `movimientos` | S4,S5,S6 | inline | hecho · `Risk: item 1` (migración; verificada con upgrade/downgrade real) |
| T2 | `POST /movimientos/lote` transaccional + refactor de `crear_movimiento` (sin commit por fila) + tests | S6 | inline | hecho · `Risk: none` |
| T3 | `ticket_service`: atribución de descuentos, precio final por renglón, cantidad y total en la respuesta | S3,S7 | inline | hecho · `Risk: none` |
| T4 | Frontend: pantalla de revisión con una fila por renglón (descripción, cantidad, precio final, categoría, borrar), guard aritmético y alta del lote | S1,S2,S7,S8 | inline | hecho · `Risk: none` |
| T5 | README + doc de la feature del lector marcando S1 como reemplazada | — | inline | hecho |

Ruta de todos los tasks: **inline**. Ningún unit independiente paralelo y el contexto no alcanzó el backstop; no se delegó ningún writer. Verificación: la misma sesión corrió los tests después de cada task.

## Decisiones de diseño

1. **Una transacción por ticket.** `crear_movimiento` hace `commit()` por movimiento; un lote de 12 dejaría tickets a medias ante cualquier error. Se extrae la construcción del movimiento y el lote commitea una sola vez.
2. **`lote_id` en vez de una tabla `tickets`.** Para deshacer y para agrupar en la UI alcanza con un identificador compartido; una tabla nueva agrega joins sin agregar información.
3. **`comercio` cifrado.** Mismo criterio que `nota`: el detalle de dónde compra una persona es sensible. Consecuencia aceptada: agrupar por comercio se hace en memoria, como ya pasa con `descripcion`.
4. **El precio por unidad es derivado.** Se calcula al mostrarlo; nunca se persiste.
5. **El descuento se atribuye, no se descarta.** Si se ignorara, el ciclo registraría más gasto del real, y el precio por producto quedaría inflado para siempre.
6. **Atomicidad por validación previa, no por rollback.** `db.rollback()` dentro de un servicio, con la sesión unida a la transacción raíz del harness de tests, borra los fixtures y rompe la autenticación. `crear_movimientos_lote` valida todo en modo read-only antes de agregar la primera fila; `get_db` ya hace commit al salir y rollback ante excepción.
7. **El lote no es idempotente por clave del cliente.** El `lote_id` lo genera el servidor. El doble toque se evita deshabilitando el botón mientras se envía.

## Log

**L1** — Pedido del usuario, verbatim:

> "esta buena la funcionalidad de lector de ticket. Analiza la posibilidad de que tras leer una factura se construya un estilo de formulario donde cada renglon es un movimiento, en principio aparecen todos en una misma categoria, con posibilidad de cambiar por renglon, y poder cargar un movimiento por renglon. Multiples movimientos tan solo leyendo una factura/ticket"

**L2** — La necesidad real, verbatim:

> "te voy a comentar mi necesidad. Mi necesidad es saber cuanto pague por un producto y con el paso del tiempo poder comparar. Entonces si un item tiene descuento a mi me sirve saber el precio final que pague (precio - descuento). Yo necesito una solucion a saber cuanto estoy pagando la unidad de X producto."

Consecuencia: agrupar por categoría queda descartado. El precio por producto es el dato que da valor a la feature, y agrupar lo destruye.

**L3** — Alcance elegido, verbatim: *"Etapa 1: capturar bien"*.

Se difiere la pantalla de comparación (etapa 2: precio por unidad de un producto en el tiempo, por súper). El argumento para capturar primero: los datos históricos no se pueden recuperar; cada ticket cargado con el diseño anterior queda incomparable.

**L4** — Cierre de T4 y T5 (2026-11-26). Se descarta `notaTicket.ts`: con un movimiento por renglón ya no se genera un texto de detalle. Queda `formatoMoneda.ts` con `formatearImporte()`, que conserva centavos (el formateador del dashboard los redondea). `MovimientoList` mantiene "ver completo" para notas que el usuario escriba a mano.

Riesgo conocido: un ticket con muchas filas siempre va a necesitar scroll dentro del modal; se mitigó con `max-h-[calc(100dvh-0.5rem)]` y con el auto-scroll a las filas apenas llega la respuesta del lector. No se resolvió con paginación porque el humano necesita ver y corregir todos los renglones antes de confirmar.

**L5** — Verificación (2026-11-26):

- `SECRET_KEY=test python -m pytest tests/ -q` → **210 passed**, exit 0 (antes: 202).
- `npm test -- --run` → **73 passed**, exit 0.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` → sin errores.
- Migración `b7d2e5c9a1f4` probada sobre SQLite real desde la revisión anterior con un movimiento cargado: `upgrade` agrega `cantidad`, `comercio` y `lote_id`; `downgrade` los quita.
- Sin verificación end-to-end contra LlamaCloud: la key local está revocada (401) y la válida vive cifrada en producción. Queda como deuda conocida, no como pase.
- `gentle-ai review assess --base-ref main --committed-only --json` sobre la rama completa → `risk: medium`, `review_due: false`, `review_due_reason: under_budget`. No se abrió ninguna transacción de revisión.

**L6** — Entregas en `ticket-por-renglon` (sin push):

| Commit | Contenido | Specs |
| --- | --- | --- |
| `cdc2a7f` | migración + modelo | S4,S5,S6 |
| `d5a386b` | lote transaccional, atribución de descuentos y tests backend | S3,S6,S7 |
| `1f867e3` | revisión por renglón, guard aritmético y alta del lote | S1,S2,S7,S8 |
| `4d629d6` | README y S1 del lector marcada como reemplazada | — |
| `99269f5` | estrategia de entrega e issue aprobado | — |

**L7** — Entrega (2026-11-26). El usuario autorizó push y PR. Con ~1726 líneas cambiadas, `chained-pr` exigía elegir estrategia: el usuario eligió explícitamente **un solo PR con `size:exception`** (aceptación del tamaño). Issue vinculado: **#5** (`status:approved`, `type:feature`), creado porque `branch-pr` exige un issue aprobado por PR y el repo no tenía ninguno. Rama renombrada a `feat/ticket-por-renglon` para cumplir el patrón `type/description`.

**L8** — Push a `origin/feat/ticket-por-renglon` e **issue #5** / **PR #6** abiertos. PR con `type:feature` y `size:exception` (aceptado explícitamente por el usuario). Base: `main`, head: `feat/ticket-por-renglon`, 5 commits propios sobre `53ebc02`. Merge queda a decisión del usuario.

**L9** — La etapa 2 (comparación histórica de precio por unidad) queda diferida hasta que haya datos capturados con este diseño.
