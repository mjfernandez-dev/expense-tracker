# Delta for `router-service-boundaries`

## Purpose

Pure refactor: dead-code poda (already applied, no regression) plus moving business orchestration from `backend/routers/` into `backend/services/`. No API contract, schema, or feature change — `es_fijo` and the `gasto_fijo_id` column remain live. New capability: routers stay thin.

## ADDED Requirements

### Requirement: REQ-RS-01 Dead code removed

The system MUST NOT define or reference removed symbols: `backend/migrate_encryption.py`, `send_two_factor_code`, `send_welcome_email`, config keys `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET`/`EXPOSE_RESET_TOKEN`/`BACKEND_URL`/`FRONTEND_URL`, `_as_bool`, schemas `Token`/`CategoryCreate`. `config.py` MUST define only `APP_ENV`, `IS_PRODUCTION`, `ENCRYPTION_KEY`. `.env.example` MUST NOT list removed keys. `conftest.py` MUST NOT reference `main.ejecutar_generacion_mensual`. `getVapidPublicKey` MUST stay module-private in `push.ts`. `send_password_reset_email` MUST remain the only email sender.

#### Scenario: No references remain

- GIVEN the codebase after implementation
- WHEN grepping for each removed symbol
- THEN zero definitions or imports remain
- AND `.env.example`/`config.py` expose none of the removed keys

### Requirement: REQ-RS-02 Movimientos router is thin

Handlers for `POST /movimientos/` and `PUT /movimientos/{id}` MUST contain only dependency wiring, request model validation, service delegation, and response model mapping. The router MUST NOT contain `_validate_categoria`, GastoFijo template creation, `auto_detectar_presupuesto_item`/`apply_presupuesto_item_link` calls, `db.commit()`, or `joinedload` re-query logic; those MUST live in `movimiento_service`.

#### Scenario: Router delegates creation

- GIVEN a request to `POST /movimientos/`
- WHEN the handler executes
- THEN it invokes `movimiento_service.crear_movimiento(...)` and returns its result

#### Scenario: Router delegates update

- GIVEN a request to `PUT /movimientos/{id}`
- WHEN the handler executes
- THEN it invokes `movimiento_service.actualizar_movimiento(...)` and returns its result

### Requirement: REQ-RS-03 Categorias router is thin

`update_user_category` in `router/categorias.py` MUST delegate entirely to `user_category_service.actualizar_user_category` and MUST NOT call `verificar_nombre_unico` directly.

#### Scenario: Update delegates

- GIVEN an authorized update to `PUT /user-categories/{id}`
- WHEN the handler executes
- THEN it calls only the service layer and returns the updated category

### Requirement: REQ-RS-04 Movimiento service implements full orchestration

`movimiento_service.crear_movimiento`/`actualizar_movimiento` MUST implement: categoria validation (400 when neither id given; 404 for missing system or user-owned category), `resolve_clasificacion`, es_fijo GastoFijo creation when `tipo=="gasto" and es_fijo is True` (flush + set `db_movimiento.gasto_fijo_id`), presupuesto auto-detection and linking (`exclude_movimiento_id` on update), `db.commit()`, and eager-loading (`categoria`, `user_category`) before returning the row.

#### Scenario: es_fijo gasto creates template

- GIVEN `POST /movimientos/` body with `tipo="gasto"` and `es_fijo=True`
- WHEN the service runs
- THEN a `GastoFijo` row is created, flushed, and linked via `movimiento.gasto_fijo_id`

#### Scenario: Missing categorias rejected

- GIVEN a movimiento payload with `categoria_id=None` and `user_category_id=None`
- WHEN `crear_movimiento` runs
- THEN it raises HTTP 400

### Requirement: REQ-RS-05 Name-uniqueness encapsulated

`user_category_service.actualizar_user_category` MUST call `verificar_nombre_unico(category.user_id, update.nombre, db, exclude_id=category.id)` before mutating when `update.nombre` is provided and differs, raising HTTP 400 on duplicates.

#### Scenario: Duplicate name rejected

- GIVEN a user category renamed to an existing name
- WHEN `actualizar_user_category` runs
- THEN it raises HTTP 400 and does not persist

### Requirement: REQ-RS-06 Dead local variable removed

`create_movimiento` MUST NOT declare the local `gasto_fijo_id` variable. The `Movimiento.gasto_fijo_id` column and `es_fijo` behavior MUST remain unchanged; the GastoFijo link still assigns `db_movimiento.gasto_fijo_id`.

#### Scenario: Template linked without dead variable

- GIVEN an es_fijo gasto creation
- WHEN the service creates the template
- THEN `movimiento.gasto_fijo_id` is set from the template id, with no unused local

### Requirement: REQ-RS-07 Behavior and contract preserved

All existing HTTP contracts MUST remain unchanged: request/response shapes, status codes, error `detail` messages, and the es_fijo GastoFijo creation path. No schema field, model column, or Alembic migration MAY change.

#### Scenario: Existing tests stay green

- GIVEN the refactored backend
- WHEN running `SECRET_KEY=test python -m pytest backend/tests/ -v`
- THEN the full suite passes, including `test_gastos_fijos.py` and `test_ciclos.py`

### Requirement: REQ-RS-08 Service-level test coverage

Service-level tests in `test_movimientos.py` and `test_categorias.py` MUST cover the moved logic: es_fijo template creation, categoria validation errors, presupuesto auto-detection/link on create and update, duplicate-name rejection on update.

#### Scenario: Moved logic tested at service level

- GIVEN the service layer after refactor
- WHEN invoking service functions directly against the test DB
- THEN the moved orchestration paths are asserted without HTTP
