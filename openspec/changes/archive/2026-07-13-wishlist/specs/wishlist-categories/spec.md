# Wishlist Categories Specification

## Purpose

Wishlist items MAY be associated with an existing `UserCategory` via foreign key. The system MUST also support creating a new category inline from the wishlist form — searching by name first to avoid duplicates.

## Requirements

### Requirement: Optional Category Association

Every wishlist item MAY have an optional `category_id` field referencing an existing `UserCategory` owned by the same user. This field is nullable.

#### Scenario: Create item with category

- GIVEN an authenticated user with a `UserCategory` named "Viajes" (id=5)
- WHEN they POST `/wishlist` with `{ "name": "Viaje a Bariloche", "estimated_cost": 2500, "category_id": 5 }`
- THEN the item is created with `category_id: 5`

#### Scenario: Create item without category

- GIVEN an authenticated user
- WHEN they POST `/wishlist` without `category_id`
- THEN the item is created with `category_id: null`

#### Scenario: Category from another user is rejected

- GIVEN user A has a category with id=5 and user B does not
- WHEN user B creates a wishlist item with `category_id: 5`
- THEN the system returns HTTP 404 (category not found for this user)

### Requirement: Inline Category Creation

The system MAY support inline category creation from the wishlist form. The frontend SHOULD provide a way to type a category name, search existing categories, and create a new one if no match exists.

#### Scenario: Inline create new category

- GIVEN the user types "Tecnología" in the category field and no existing category matches
- WHEN they submit the wishlist form
- THEN the system creates a new `UserCategory` with `nombre: "Tecnología"`
- AND the wishlist item references the newly created category id

#### Scenario: Inline reuses existing category

- GIVEN the user already has a `UserCategory` named "Tecnología"
- WHEN they type "Tecnología" in the category field
- THEN the form shows the existing category as a suggestion
- AND submitting creates the wishlist item referencing the existing category (no duplicate)

#### Scenario: Category name validation

- GIVEN the user tries to create a category inline with an empty name
- WHEN they submit
- THEN the system returns HTTP 422 with a validation error

### Requirement: Category Read on List

The wishlist list endpoint MUST include the associated category data (id, name, color) when an item has a `category_id`.

#### Scenario: List includes category data

- GIVEN a wishlist item with `category_id: 5` and that category has `nombre: "Viajes", color: "#3b82f6"`
- WHEN the frontend fetches the item list
- THEN the response includes a `category` nested object with `id`, `nombre`, and `color`
