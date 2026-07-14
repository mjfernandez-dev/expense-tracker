# Wishlist Farm Sizes Specification

## Purpose

Wishlist items MUST have a computed size tier derived from `estimated_cost`. This size is a read-only derived value — not stored in the database — that drives a visual badge on the frontend and helps users gauge financial commitment at a glance.

## Requirements

### Requirement: Size Derivation

The system MUST derive size from `estimated_cost` using these thresholds:
- **Chico**: `estimated_cost < 500`
- **Mediano**: `500 <= estimated_cost <= 5000`
- **Grande**: `estimated_cost > 5000`

#### Scenario: Cost below 500 yields Chico

- GIVEN a wishlist item with `estimated_cost: 450.00`
- WHEN the backend returns the item
- THEN the response includes `size: "chico"`

#### Scenario: Cost exactly 500 yields Mediano

- GIVEN a wishlist item with `estimated_cost: 500.00`
- WHEN the backend returns the item
- THEN the response includes `size: "mediano"`

#### Scenario: Cost exactly 5000 yields Mediano

- GIVEN a wishlist item with `estimated_cost: 5000.00`
- WHEN the backend returns the item
- THEN the response includes `size: "mediano"`

#### Scenario: Cost above 5000 yields Grande

- GIVEN a wishlist item with `estimated_cost: 7500.00`
- WHEN the backend returns the item
- THEN the response includes `size: "grande"`

### Requirement: Size as Read-Only Derived Field

The `size` field MUST be computed at read time from `estimated_cost`. It MUST NOT be a stored column or directly writable via API.

#### Scenario: Size is immutable via API

- GIVEN a user creates an item with `estimated_cost: 300`
- WHEN they attempt to POST `{ ..., "size": "grande" }`
- THEN the backend ignores or rejects the `size` field
- AND the response shows `size: "chico"` (derived from actual cost)

### Requirement: Size Badge on Frontend

The frontend MUST display a badge showing the size label with a color indicator.

#### Scenario: Render size badge

- GIVEN an item with `size: "grande"`
- WHEN the item card renders
- THEN a badge displays "Grande" with a purple/indigo color

#### Scenario: Render all three size badges

- GIVEN items with sizes chico, mediano, and grande
- WHEN rendered
- THEN each shows the correct Spanish label: "Chico", "Mediano", "Grande" with distinct visual treatments
