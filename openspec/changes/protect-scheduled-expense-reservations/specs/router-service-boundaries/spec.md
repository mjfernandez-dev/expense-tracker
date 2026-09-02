# Delta for `router-service-boundaries`

## ADDED Requirements

### Requirement: Scheduled-payment movements reject generic mutation

After normal tenant-safe ownership validation, generic movement edit and delete operations MUST reject a movement referenced as a scheduled expense's payment. Only a coordinated lifecycle operation MAY change or reverse it.

#### Scenario: Edit paid movement
- GIVEN an owned movement linked as a scheduled payment
- WHEN generic movement edit is requested
- THEN the request MUST be rejected and all records MUST remain unchanged

#### Scenario: Delete paid movement
- GIVEN an owned movement linked as a scheduled payment
- WHEN generic movement deletion is requested
- THEN the request MUST be rejected and the scheduled lifecycle MUST remain intact

#### Scenario: Foreign paid movement
- GIVEN a movement owned by another user
- WHEN generic edit or deletion references it
- THEN the request MUST reject it without revealing the movement or its lifecycle

## MODIFIED Requirements

### Requirement: REQ-RS-04 Movimiento service implements full orchestration

`movimiento_service.crear_movimiento` and `actualizar_movimiento` MUST validate categories (400 when neither ID is supplied; 404 for a missing system category or non-owned user category), resolve classification, create and link a fixed-expense template for a fixed expense, auto-detect and link a budget item, commit, and eagerly load category relationships before returning. Auto-detection MUST exclude the updated movement and consider only ordinary items, including when a protected reservation shares the category. Generic create or update MUST reject an explicitly supplied protected reservation. (Previously: orchestration could auto-detect or explicitly link protected reservations.)

#### Scenario: Fixed expense creates template
- GIVEN `POST /movimientos/` has `tipo="gasto"` and `es_fijo=True`
- WHEN the service runs
- THEN a fixed-expense template MUST be created and linked to the movement

#### Scenario: Missing categories rejected
- GIVEN a movement payload has neither system nor user category
- WHEN creation runs
- THEN it MUST be rejected with HTTP 400

#### Scenario: Ordinary auto-linking
- GIVEN an ordinary item and protected reservation match a movement category
- WHEN generic create or update auto-links the movement
- THEN it MUST select only the ordinary item

#### Scenario: No ordinary match
- GIVEN only a protected reservation matches the movement category
- WHEN generic auto-linking runs
- THEN the movement MUST remain unlinked from that reservation

#### Scenario: Explicit protected link
- GIVEN a generic movement request explicitly names a protected reservation
- WHEN create or update runs
- THEN it MUST be rejected and MUST NOT mutate either record
