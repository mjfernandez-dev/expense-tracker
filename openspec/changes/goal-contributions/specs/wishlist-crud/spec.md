# Delta for Wishlist CRUD

## MODIFIED Requirements

### Requirement: Update Wishlist Item

The system MUST allow partial updates to a wishlist item's mutable fields: `name`, `estimated_cost`, `priority`, `status`, `category_id`, `monto_ahorrado`, and `notes`. When `monto_ahorrado` is set via PATCH it SHALL be stored as-is; when contributions/withdrawals occur, `monto_ahorrado` SHALL be auto-updated as the sum of manual edits and net GoalContribution amounts.
(Previously: monto_ahorrado was not a mutable field via PATCH and was not auto-updated)

#### Scenario: Partial update succeeds

- GIVEN a wishlist item owned by the user with `name: "PS5"` and `estimated_cost: 800.00`
- WHEN they PATCH `/wishlist/{id}` with `{ "estimated_cost": 750.00 }`
- THEN the system returns HTTP 200 with updated `estimated_cost`
- AND `name` and other fields remain unchanged

#### Scenario: Update non-owned item returns 404

- GIVEN a wishlist item owned by another user
- WHEN the current user PATCHes it
- THEN the system returns HTTP 404

#### Scenario: Manual update of monto_ahorrado

- GIVEN a wishlist item with monto_ahorrado=0 and no contributions
- WHEN user PATCHes `/wishlist/{id}` with `{ "monto_ahorrado": 500.00 }`
- THEN HTTP 200 with monto_ahorrado=500.00
- AND no GoalContribution rows are created

## ADDED Requirements

### Requirement: Wishlist Progress Display

The WishlistItemCard component SHOULD display a progress bar showing `monto_ahorrado / estimated_cost` as a percentage, capped at 100%.

#### Scenario: Progress bar percentage

- GIVEN a wishlist item with estimated_cost=1000 and monto_ahorrado=350
- WHEN rendered in WishlistItemCard
- THEN the progress bar shows 35% filled

#### Scenario: Progress capped at 100%

- GIVEN a wishlist item with estimated_cost=1000 and monto_ahorrado=1200
- WHEN rendered in WishlistItemCard
- THEN the progress bar shows 100% filled
