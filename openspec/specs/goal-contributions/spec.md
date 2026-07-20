# Goal Contributions Specification

## Purpose

Track per-source contributions to wishlist items with cross-validation against budget and disponible. Allow withdrawals. Integrate with cycle resumen calculation.

## Requirements

### Requirement: GoalContribution Model

The system MUST store each money movement to/from a goal in a `GoalContribution` table with: `goal_id` (FK WishlistItem), `ciclo_id` (FK Ciclo), `amount` (positive=contribute, negative=withdraw), `source_type` ("disponible" | "presupuesto"), `presupuesto_item_id` (nullable FK), and `created_at`.

#### Scenario: Positive amount records contribution

- GIVEN an active cycle and a wishlist item
- WHEN a contribution of 500 with source_type="disponible" is created
- THEN GoalContribution.amount is +500

#### Scenario: Negative amount records withdrawal

- GIVEN a goal with monto_ahorrado=1000
- WHEN a withdrawal of 300 is created
- THEN GoalContribution.amount is -300 with source_type="disponible"

### Requirement: Contribute to Goal

The system MUST expose POST `/wishlist/{id}/contribute` accepting `[{source_type, presupuesto_item_id?, amount}]`. All contributions SHALL be validated and committed atomically. `monto_ahorrado` on the wishlist item MUST auto-update to the sum of manual edits and net GoalContribution amounts.

#### Scenario: Contribute from disponible

- GIVEN active cycle with saldo_disponible_actual=1000
- WHEN user contributes 600 from "disponible"
- THEN HTTP 200 with updated monto_ahorrado
- AND saldo_disponible_actual decreases to 400

#### Scenario: Contribute from presupuesto item

- GIVEN a presupuesto item with monto_estimado=500, ejecutado=100, and no prior goal contributions
- WHEN user contributes 200 from that item
- THEN HTTP 200
- AND the item's effective remaining budget is 200 (500-100-200)

#### Scenario: Contribute exceeds disponible

- GIVEN saldo_disponible_actual=300
- WHEN user contributes 500 from "disponible"
- THEN HTTP 400 with validation error

#### Scenario: Contribute exceeds presupuesto remaining

- GIVEN a presupuesto item with monto_estimado=200, ejecutado=50, already_contributed=100
- WHEN user contributes 100 from that item
- THEN HTTP 400 with validation error

#### Scenario: Split-source contribution

- GIVEN disponible=1000 and two presupuesto items with sufficient remaining budget
- WHEN user contributes [{source_type:"disponible", amount:300}, {source_type:"presupuesto", presupuesto_item_id:1, amount:200}]
- THEN both GoalContribution rows created atomically
- AND monto_ahorrado increases by 500

### Requirement: Withdraw from Goal

The system MUST expose POST `/wishlist/{id}/withdraw` accepting `{amount}`. The amount SHALL return to "disponible" of the active cycle regardless of original contribution source. `monto_ahorrado` MUST decrease by the withdrawn amount.

#### Scenario: Withdraw returns to disponible

- GIVEN monto_ahorrado=800 and saldo_disponible_actual=500
- WHEN user withdraws 300
- THEN GoalContribution row with amount=-300 and source_type="disponible" is created
- AND monto_ahorrado decreases to 500
- AND saldo_disponible_actual increases to 800

#### Scenario: Withdraw exceeds monto_ahorrado

- GIVEN monto_ahorrado=200
- WHEN user withdraws 300
- THEN HTTP 400 with validation error

### Requirement: Updated Cycle Resumen Formula

The system SHALL update `calcular_resumen()` so presupuesto_efectivo subtracts goal contributions from each presupuesto item's cap, and saldo_disponible_total deducts total goal savings of the active cycle.

#### Scenario: Resumen reflects goal contributions

- GIVEN ingresos=5000, ahorro_objetivo=500
- AND monto_estimado=1000, ejecutado=300, goal_contrib_from_presupuesto=200
- AND goal_savings_from_disponible=300
- WHEN calcular_resumen() runs
- THEN presupuesto_efectivo = 1000 - 300 - 200 = 500
- AND saldo_disponible_total = 5000 - 500 - 300 - 500 = 3700

### Requirement: Frontend Contribution UI

The system SHOULD provide a GoalContributeForm for contributing with source selection and split amounts. WishlistItemCard SHOULD display a progress bar showing `monto_ahorrado / estimated_cost`.

#### Scenario: Contribute form shows available sources

- GIVEN a wishlist item detail view with sources loaded
- WHEN user opens the contribution form
- THEN they see disponible balance and each presupuesto item's remaining budget
- AND can enter amounts for multiple sources

#### Scenario: Progress bar reflects current savings

- GIVEN estimated_cost=1000 and monto_ahorrado=350
- WHEN WishlistItemCard renders
- THEN progress bar shows 35%
