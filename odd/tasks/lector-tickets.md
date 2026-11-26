# Lector de tickets con LlamaParse

## Objetivo

Registrar un gasto desde la foto de un ticket de supermercado: el usuario saca la foto, el sistema extrae total, comercio y el detalle de ítems, y **precarga** el formulario de movimiento. La fecha la define el humano.

> **Estado (2026-11-26):** S1 y S1b quedan **reemplazadas** por `odd/tasks/ticket-por-renglon.md`. El lector ya no produce un movimiento único con el detalle en la nota: ahora precarga una revisión con un movimiento por renglón. El endpoint `/tickets/leer` sigue siendo el mismo; cambia qué hace el cliente con la respuesta.

Rama: `main` · Runner: `pytest` (backend) · Estado: **T0–T7 completos; pendiente una prueba real contra el endpoint desplegado**

## Specs

**S1 — Un movimiento por ticket, detalle en nota.** (L1 verbatim: *"movimiento unico + detalle en nota"*) — **REEMPLAZADA** por S1 de `odd/tasks/ticket-por-renglon.md`.
El lector nunca crea un movimiento por renglón. El total del ticket es el `importe`; los ítems van a `Movimiento.nota` como texto legible.
Se conserva como registro histórico de la decisión original. El usuario la revocó al explicar su necesidad real (L2 del documento nuevo): necesita el precio final **por producto** para compararlo en el tiempo.

**S1b — Qué precarga el lector y qué llena el humano.** (L6 verbatim: *"que se autocomplete el importe total, la descripcion con el nombre del supermercado y la nota. El resto el humano"*) — **PRECARGA REEMPLAZADA**: en la feature nueva se precargan las filas (descripción, cantidad, precio final y categoría); el humano elige fecha, categorías y confirma el guard aritmético. La fecha sigue siendo del humano, igual que acá.

| Campo | Origen |
| --- | --- |
| `importe` | total del ticket |
| `descripcion` | nombre del comercio |
| `nota` | detalle generado |
| `fecha`, `categoria_id`/`user_category_id`, `tipo` | **humano** |

La fecha **no se extrae**: la define el humano al crear el movimiento (L5 verbatim: *"no hace falta q lea la fecha. Eso lo indico yo cuando creo el movimiento"*).

**S2 — "Ver completo" para notas largas.** (L1 verbatim: *"un ver completo me parece bien"*)
`MovimientoList` hoy corta la nota con `max-h-40 overflow-hidden` (`MovimientoList.tsx:242`). Con un ticket completo adentro, la nota se trunca visualmente. Debe poder verse entera.

**S3 — `nota` sigue encriptada.** (decisión confirmada)
El detalle de un ticket revela hábitos de consumo: es el dato más sensible de la app. Se mantiene `EncryptedString` (`models.py:152`). Consecuencia aceptada: la búsqueda sobre `nota` no puede usar SQL; se resuelve con el patrón in-memory ya existente (`movimiento_service.py:374`).

**S4 — El lector precarga, no crea.** (supuesto de diseño, ver Decisiones)
`POST /tickets/leer` devuelve datos extraídos y **no** persiste nada. El usuario revisa y confirma con el flujo actual `POST /movimientos`. Un parse equivocado nunca ensucia el libro.

**S5 — Motor: LlamaCloud Extract.** (elección del usuario: *"modo agentic_plus"*)
Extracción guiada por JSON Schema (Pydantic), tier `agentic_plus`, `extraction_target="per_doc"`, `confidence_scores=True`. El tier se guarda por credencial (S7), no hardcodeado.
Verificado sobre un ticket real (ver Progreso T0): 9/9 ítems, total y descuentos cierran al centavo, **~31 s** por extracción fresca.

**S6 — El lector es opcional y no puede tumbar la app.** Si no hay ninguna credencial activa cargada, el endpoint responde `503` con mensaje claro. El arranque de la app no falla.

**S7 — La API key se administra desde la app.** (pedido del usuario, verbatim: *"Habria que hacer un modulo de configuracion donde haya un campo para poner la api key usado para llamaindex (si em quedo sin credito en uno podria usar otro)"*)
Credenciales por usuario y por proveedor, guardadas con `EncryptedString`. La clave es **write-only**: la API solo devuelve `clave_preview` enmascarado. Puede haber varias por proveedor con **una sola activa**, para rotar cuando se agotan los créditos. El tier es un campo de la credencial (default `agentic_plus`, elegido por el usuario).

## Tasks

| ID | Tarea | Spec | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T7 | Módulo de credenciales: tabla + migración + servicio + router + pantalla Integraciones + tests | S7 | inline | **hecho** (commit `27d2f6f`) |
| T0 | Spike: una foto real → JSON extraído + calidad + latencia + créditos | S5 | inline | **hecho** (commit `9875f9e`) |
| T1 | `services/ticket_service.py`: cliente LlamaCloud + schema Pydantic + formateo de nota | S1,S5 | inline | **hecho** |
| T2 | `routers/tickets.py`: `POST /tickets/leer` multipart, auth, rate limit, límites de tamaño/tipo | S4,S6 | inline | **hecho** |
| T3 | Tests pytest con cliente mockeado (503 sin credencial, 415 tipo inválido, 413 tamaño, 401 sin auth, mapeo de campos, no persiste) | S1,S4,S6 | inline | **hecho** (13 tests) |
| T4 | Frontend: `leerTicket()` en `api.ts` (timeout propio) + botón cámara en `MovimientoForm` + precarga + filas borrables con X | S1,S1b,S4 | inline | **hecho** |
| T5 | "Ver completo" de nota en `MovimientoList` | S2 | inline | **hecho** |
| T6 | `requirements.txt` (`llama-cloud`), README del módulo de credenciales | S6,S7 | inline | **hecho** |

## Log

**L1** — Pedido del usuario, verbatim:

> "sobre la posibilidad de sumar un lector de imagenes que me permita detallar un moviimento, habiamos quedado que era complicado que cada renglon genere un movimiento? y era mas sencillo agregar el detalle en una nota del movimiento?"

> "por que se encripta la nota? es necesario? / un ver completo me parece bien. / movimiento unico + detalle en nota"

> "lector" (elige arrancar por el lector de imágenes)

Elección de motor, verbatim: `"LlamaParse (hosted de LlamaIndex)"`.

**L2** — Verificaciones hechas antes de diseñar (no supuestos):

- `backend/requirements.txt`: sin `llama-index` ni SDK de LLM. `python-multipart==0.0.22` presente → multipart viable.
- Sin ningún endpoint de upload en el repo: `grep UploadFile|File(|FormData` → 0 matches. Feature greenfield.
- `llama-cloud==2.20.0` (PyPI): deps `anyio`, `distro`, `httpx`, `pydantic`, `sniffio`, `typing-extensions` — todas ya satisfechas. Árbol liviano.
- Precios (llamaindex.ai/pricing): 10.000 créditos gratis/mes; parse `fast`=1, `cost_effective`=3, `agentic`=10, `agentic_plus`=25 cr/página; **extract suma créditos aparte**; re-parse cacheado = 0; soporta imágenes (PNG/JPG) entre 130+ formatos.
- Cloud Run (`cloudbuild.yaml`): sin `--timeout` (default 300s), sin `--memory` (512Mi), sin `--set-secrets`. Un parse de 1 página entra en el timeout; conviene igual medirlo en T0.
- `openspec/specs/router-service-boundaries/spec.md:11` exige que `config.py` defina **solo** `APP_ENV`/`IS_PRODUCTION`/`ENCRYPTION_KEY`. **Queda satisfecho sin tocarlo**: la key vive cifrada en la DB (S7), no en el entorno.

**L3** — Spike corrido sobre la foto real. Resultado: 9/9 ítems, aritmética cerrada al centavo, ~31 s fresca. Detectado que la extracción de fecha erraba el año (`2024` por `2026`) → se eliminó el campo (S1b).

**L4** — El usuario ofrece la foto del ticket: *"en raiz de disco D deje la imagen de wsp del ticket"*.

**L5** — Recorte de alcance, verbatim: *"pero no hace falta q lea la fecha. Eso lo indico yo cuando creo el movimiento"*.

**L6** — Alcance de la precarga, verbatim: *"que se autocomplete el importe total, la descripcion con el nombre del supermercado y la nota. El resto el humano"*.

**L7** — Sobre el borrado del detalle, verbatim: *"ademas, dentro de la nota, cada renglon podria ser un 'objeto' facil de borrar completo? o tengo q borrar caracter por caracter si no quiero cargar algo?"*
Decisión: la nota no es el input, es el **resultado**. El endpoint devuelve los ítems como lista, la pantalla los muestra como filas con una X, y el texto se regenera con lo que queda. El textarea queda como escape hatch para edición manual. Consecuencia: `Movimiento.nota` sigue siendo un solo campo de texto; la estructura existe solo durante la precarga.

**L8** — Ubicación del botón, verbatim: *"Se me ocurre o al lago del boton registrar movimiento o directamente dentro del modal"*.
Decisión (aprobada por el usuario con *"si"*): **dentro del modal, arriba del toggle Gasto/Ingreso**. Hay dos puntos de entrada al modal (pill del tab Inicio y FAB del tab Movimientos); poner el botón afuera obligaba a implementarlo dos veces y a que el usuario lo buscara en dos lugares. `capture="environment"` para abrir la cámara trasera directo.

**L9** — Verificación real del servicio contra el proveedor: **falló por 401**. La key del `.env` local (`llx-ibCR…`, 52 chars) fue revocada — es la vieja, el usuario ya cargó una nueva en la app. El fallo destapó un defecto real: `_traducir_error` solo contemplaba cuota agotada, así que una key inválida caía en *"Probá con otra foto"*, un mensaje que miente sobre la causa. Corregido con una rama explícita para 401/403 que manda a Integraciones, **nunca devolviendo 401** (el frontend lo interpreta como sesión vencida e intenta refrescar el token: `api.ts:86`).

**L10** — Prueba en el celular, dos defectos reportados:
> "di clic en registrar movimiento y no se abrio el teclado numerico ni se hizo foco en ese campo como debe ser"

Causa: al agregar el lector, el autofoco del modal apuntaba al botón de la cámara en vez del importe. Regresión introducida en T4.

> "en celu el modal requiere que haga scroll hacia abajo para cerrar el movimiento. Me gustaria en entre el form completo en la pantalla sin scroll"

Decisión: el foco vuelve al importe y el form se compacta hasta entrar en un celular. Los dos pedidos se resuelven juntos: si el form entra completo, enfocar el importe no deja la cámara fuera de vista. Se quitó el título del form al crear (el modal ya se llama "Nuevo movimiento"), la cámara pasó a un botón compacto al lado del toggle, categoría y fecha van en 2 columnas también en mobile, y el modal usa `100dvh` en vez de `90vh` porque en iOS `vh` mide el viewport grande (con la barra del navegador oculta).

## Progreso T1–T6

| Archivo | Cambio |
| --- | --- |
| `backend/services/ticket_service.py` | schema de extracción (sin fecha), `limpiar_descripcion()` con `_CODIGO_IVA` y `_SUFIJO_REPETIDO`, `extraer_ticket()` (sube, extrae, borra la imagen en `finally`), `_traducir_error()` con ramas 402 / 401-403 / genérica, `leer_ticket()` con validación de tipo y tamaño |
| `backend/routers/tickets.py` | `POST /tickets/leer` (multipart, auth, `10/minute`); lee `MAX_BYTES + 1` para distinguir "justo en el límite" de "se pasó" sin cargar un archivo arbitrario en memoria |
| `backend/schemas.py` | `TicketItemLeido`, `TicketDescuentoLeido`, `TicketLeido` |
| `backend/main.py` | router incluido bajo `/api` |
| `backend/requirements.txt` | `llama-cloud==2.20.0` |
| `backend/tests/test_tickets.py` | 13 tests |
| `frontend/src/utils/notaTicket.ts` | `formatearImporte()` (con centavos) y `formatearNotaTicket()` |
| `frontend/src/components/MovimientoForm.tsx` | botón cámara + input `capture="environment"`, precarga de importe/descripción/nota, filas borrables (ítems y descuentos), nota como `textarea` |
| `frontend/src/components/MovimientoModal.tsx` | el autofoco va a `[data-autofocus]` (botón cámara) al crear, y al importe al editar: enfocar el importe hacía scroll y dejaba la cámara fuera de vista |
| `frontend/src/components/MovimientoList.tsx` | nota con `whitespace-pre-line` (antes los saltos de línea se colapsaban) y `max-h-[70vh] overflow-y-auto` en vez de `max-h-40` |
| `frontend/src/services/api.ts` | `leerTicket()` con `timeout: 300000` propio |
| `frontend/src/types/index.ts` | tipos del ticket |

### Evidencia de verificación

```
pytest backend/tests/test_tickets.py:  13 passed
pytest backend/tests/ (suite completa): 195 passed (antes 183)
npm test (vitest):                     66 passed (9 files)
npm run build (tsc -b + vite):         ✓ built
npm run lint:                          limpio
```

**No verificado**: una extracción real a través del endpoint. El SDK sí quedó validado en T0 con el mismo código de llamada, y el import de `llama_cloud` se comprobó en el Python local.

## Decisiones de diseño

1. **Precargar, no crear (S4).** El parser va a equivocarse: tickets arrugados, totales con descuentos, ítems cortados. Si el lector escribe directo en la DB, cada error es un movimiento falso en el libro y en el presupuesto del ciclo. Precargar deja al humano en el punto de control y reusa `POST /movimientos` sin duplicar lógica.
2. **Nota en texto legible, no JSON.** Se guarda `comercio`, una línea por ítem y el total. Un blob JSON en `nota` rompe la lectura humana, el "ver completo" y la futura búsqueda in-memory.
3. **El spike va primero (T0).** La incógnita real del feature no es el plumbing: es si LlamaParse lee bien un ticket argentino. Endpoint + UI + tests antes de ver un parse real es trabajo a ciegas.
4. **503 si falta la key, no crash.** `ENCRYPTION_KEY` sí aborta el arranque en producción porque sin ella no hay datos legibles. El lector es opcional: si falta, solo esa feature queda apagada.
5. **No se guarda la imagen.** El registro es la nota; la foto no se persiste (ni en DB ni en storage).

## Checks aplicables

- `SECRET_KEY=test python -m pytest backend/tests/ -v`
- `cd frontend; npm test`
- `cd frontend; npm run build` (tsc -b + vite build; `tsc --noEmit` da falso verde en este repo)
- `cd frontend; npm run lint`

**L3** — Decisiones y pedido del usuario, verbatim:

> "modo agentic_plus. Ya tengo cuenta en llamaindex, debere registrar mi api key en alguna parte de la app? Habria que hacer un modulo de configuracion donde haya un campo para poner la api key usado para llamaindex (si em quedo sin credito en uno podria usar otro). Si, el humano es el responsable del paso final. La foto luego la vemos."

Consecuencias:

- **Tier = `agentic_plus`** (25 cr/página + extract). Con 10.000 créditos gratis/mes quedan ~250-350 tickets/mes sin pagar. Se guarda por credencial, no hardcodeado.
- **Sin variable de entorno.** La clave vive en la DB del usuario, cifrada. Esto **anula** la necesidad de agregar `LLAMA_CLOUD_API_KEY` a `config.py`, así que `openspec/specs/router-service-boundaries/spec.md:11` (config.py define solo `APP_ENV`/`IS_PRODUCTION`/`ENCRYPTION_KEY`) queda satisfecho sin tocarlo.
- **S4 confirmado por el usuario**: "el humano es el responsable del paso final".
- **T7 implementado** en esta sesión, antes de la foto, porque no depende de LlamaParse.

## Progreso T7

Archivos:

| Archivo | Cambio |
| --- | --- |
| `backend/models.py` | nuevo `ApiCredential` (`api_credentials`): `proveedor`, `nombre`, `clave` cifrada, `tier`, `activa`, unique `(user_id, proveedor, nombre)` |
| `backend/alembic/versions/f3c8d1a7b2e4_add_api_credentials.py` | migración sobre head `9c3e7b1d4a58` |
| `backend/schemas.py` | `ApiCredentialCreate/Update/Read`; `Read` expone solo `clave_preview`; tier validado contra los 4 valores de LlamaCloud |
| `backend/services/api_credential_service.py` | CRUD + activación + `obtener_clave_activa()` / `obtener_tier_activo()` para el futuro ticket service |
| `backend/routers/configuracion.py` | `/configuracion/credenciales` (GET, POST, PUT, activar, DELETE) |
| `backend/main.py` | router incluido bajo `/api` |
| `backend/tests/test_api_credentials.py` | 11 tests |
| `frontend/src/pages/Integraciones.tsx` | pantalla de configuración (lista, alta, rotar clave, activar, eliminar con confirmación) |
| `frontend/src/pages/AccountPage.tsx` | card "Integraciones" |
| `frontend/src/main.tsx` | ruta `/account/integraciones` (protegida) |
| `frontend/src/services/api.ts`, `types/index.ts` | cliente y tipos |
| `README.md` | sección de endpoints de configuración |

Reglas de seguridad implementadas:

1. La clave **nunca** se devuelve: `GET` solo trae `clave_preview` (`llx-…cdef`).
2. Multi-tenant: todo filtra por `user_id`; otro usuario recibe 404.
3. Exactamente una activa por proveedor; borrar la activa promueve la más reciente.
4. La primera credencial de un proveedor queda activa sola: el lector funciona sin paso extra.

### Evidencia de verificación

```
pytest backend/tests/test_api_credentials.py:  11 passed
pytest backend/tests/ (suite completa):        183 passed (antes 172)
npm test (vitest):                             61 passed (8 files)
npm run build (tsc -b + vite):                 ✓ built in 4.78s
npm run lint:                                  1 error PREEXISTENTE en
                                               components/GastosProgramadosSection.tsx:216
                                               (archivo no tocado por esta feature)
```

## Progreso T0 (completo: spike corrido sobre la foto real)

Foto: `D:\WhatsApp Image 2026-11-25 at 12.23.56.jpeg` — ticket de **Vea Río IV Shopping**, 23/11/2026, **TOTAL $21.349,13**, subtotal sin descuentos $24.629,13, tres descuentos por línea por -$3.280,00. Foto inclinada sobre tela, con QR al pie: caso realista, no un escaneo limpio.

### Resultado de la extracción (`agentic_plus`, 1 corrida fresca + cacheadas)

| Medición | Valor |
| --- | --- |
| Ítems extraídos | **9 de 9** |
| Suma de ítems vs subtotal impreso | **$24.629,13 = $24.629,13** ✓ |
| Descuentos detallados vs total de descuentos | **-$3.280,00 = -$3.280,00** ✓ (los 3, atribuidos por nombre) |
| Subtotal − descuentos vs total | **$21.349,13 = $21.349,13** ✓ |
| ~~`medio_pago`~~ | Detectado (`PAGO QR GENERAL TRANSFERENCIA`), pero el campo se eliminó del proyecto: no se extrae ni se precarga |
| Latencia fresca | **30,9 s** |
| Latencia cacheada | 4,3–4,7 s |
| Créditos | **no reportados**: `extract.run` y `extract.get` devuelven `usage` vacío. Medir desde el dashboard de LlamaCloud |

La verificación aritmética quedó como código (`verificar_aritmetica`) y el script sale con exit code 1 si algo no cierra: no se confía en que el modelo diga "listo".

### Defectos encontrados y su resolución

| Defecto | Resolución |
| --- | --- |
| La fecha salió `2024-11-23` cuando el ticket dice `23/11/2026` (**un año mal**) | **Campo eliminado del schema.** El usuario define la fecha al crear el movimiento: pedirla solo agregaba un campo donde inventar |
| El modelo copiaba el código de IVA en el nombre: `Queso LS Cremon Light Pote 280GR POT 28 (21,00)` | `_CODIGO_IVA` lo quita al renderizar la nota. El JSON se queda fiel al ticket |
| Sufijo duplicado por OCR: `Papa Granel S/E 1 Kg S/E 1 Kg` | `_SUFIJO_REPETIDO` lo colapsa al renderizar |
| Cantidades con punto decimal (`0.832`) | Se formatean con coma en la nota |

### Corrección del SDK, verificada por introspección (`llama-cloud==2.20.0`, venv temporal fuera del repo)

| Supuesto (docs de terceros) | Realidad en 2.20.0 |
| --- | --- |
| `extract.run(file_input=(nombre, bytes, mime), data_schema=..., tier=..., confidence_scores=...)` | `extract.run(*, file_input: str, configuration: {...})`. Los kwargs sueltos **no existen**: revientan con `TypeError` |
| `file_input` = archivo | `file_input` = **File ID o parse job ID**. Hay que subir primero con `files.create(file=..., purpose="extract")` |
| Tiers de extract = `fast / cost_effective / agentic / agentic_plus` | Extract usa `turbo / cost_effective / agentic / agentic_plus`. **`fast` es tier de parse, no de extract** |

Por eso se corrigió `TIERS_LLAMACLOUD` en `schemas.py` y el selector de `Integraciones.tsx` (que además ya no muestra créditos por página: los publicados son de parse y extract suma los suyos, mostrarlos sería mentir).

### Restricción para T2/T4: el timeout

Una extracción fresca tarda **~31 s**. `frontend/src/services/api.ts` tiene `timeout: 35000` global: con una foto de celular subiendo por datos móviles, ese margen se pasa y el usuario ve un error con la extracción ya cobrada. El lector necesita su propio timeout (≥120 s) o un flujo asíncrono.

## Próximo paso

T0–T7 cerrados. Falta la única prueba que los mocks no dan: **una foto real contra el
endpoint desplegado**. La key del `.env` local fue revocada (401 al probarla), así que
la verificación real se hace desde la app, con la credencial que el usuario ya cargó
en Cuenta → Integraciones.

Pendiente: confirmar con una foto real desde la app ya desplegada.

Commits: `104bbe7` (lector) y `1844469` (nota completa), pusheados a `main`.
