# Delta for `cycle-tab`

## ADDED Requirements

### Requirement: Protected reservations survive bulk editing

Bulk budget replacement MUST exclude protected reservations from matching, updates, and deletion while preserving ordinary-item behavior.

#### Scenario: Bulk replacement with protected reservation
- GIVEN a cycle containing ordinary items and a scheduled-expense reservation
- WHEN the owner applies a bulk budget replacement
- THEN the reservation MUST remain unchanged
- AND only ordinary items MAY be matched, updated, created, or deleted

### Requirement: Granular creation uses ordinary items

Granular budget creation MUST create or reuse only ordinary items, even when a protected reservation has the same category or description.

#### Scenario: Matching reservation exists
- GIVEN a protected reservation matches the requested category
- WHEN the owner creates a granular budget item
- THEN an ordinary item MUST be created or reused
- AND the reservation MUST remain unchanged

## MODIFIED Requirements

### Requirement: PATCH granular de monto estimado (backend)

The backend MUST expose `PATCH /ciclos/{id}/presupuesto/items/{item_id}` for ordinary items only, updating `monto_estimado` with cycle/item ownership checks (404 when not owned), `monto_estimado >= 0`, and `monto_estimado >= monto_ejecutado` (400). It MUST reject direct edits to protected reservations and MUST retain bulk replacement. (Previously: any owned item, including a scheduled-expense reservation, could be edited.)

#### Scenario: Valid update
- GIVEN an owned ordinary item estimated at 1000 and executed at 400
- WHEN PATCH sends `monto_estimado=1200`
- THEN it MUST return 200 with recalculated item state

#### Scenario: Foreign item
- GIVEN an item owned by another user
- WHEN PATCH is submitted
- THEN it MUST return 404 without revealing the resource

#### Scenario: Amount below executed value
- GIVEN an ordinary item executed at 500
- WHEN PATCH sends `monto_estimado=300`
- THEN it MUST return 400 with a Spanish detail

#### Scenario: Missing item
- GIVEN an `item_id` outside the cycle
- WHEN PATCH is submitted
- THEN it MUST return 404

#### Scenario: Protected reservation
- GIVEN an owned item with `gasto_programado_id`
- WHEN PATCH is submitted through the granular budget endpoint
- THEN it MUST be rejected and remain unchanged
