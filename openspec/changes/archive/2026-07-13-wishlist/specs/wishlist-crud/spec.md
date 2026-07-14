# Wishlist CRUD Specification

## Purpose

Users MUST be able to manage their wishlist items — create, read, update, and delete — with full multi-tenant isolation by `user_id`. This spec covers the basic item lifecycle independent of status workflow or categorization.

## Requirements

### Requirement: Create Wishlist Item

The system MUST allow an authenticated user to create a new wishlist item with the following fields: `name` (required), `estimated_cost` (required, positive `MoneyDecimal`), `priority` (required enum), `status` (default `draft`), `category_id` (optional FK to `UserCategory`), and `notes` (optional).

#### Scenario: Create item with all required fields

- GIVEN an authenticated user with a valid session
- WHEN they POST `/wishlist` with `{ "name": "Viaje a Bariloche", "estimated_cost": 2500.00, "priority": "alta", "status": "draft" }`
- THEN the system returns HTTP 201 with the created item including `id`, `user_id`, `created_at`, and `updated_at`
- AND the `user_id` matches the authenticated user's id

#### Scenario: Create item with negative estimated_cost

- GIVEN an authenticated user
- WHEN they POST `/wishlist` with `estimated_cost: -100.00`
- THEN the system returns HTTP 422 with a validation error
- AND the item is NOT created

#### Scenario: Create item with encrypted name and notes

- GIVEN an authenticated user
- WHEN they POST `/wishlist` with `name` and `notes` containing sensitive text
- THEN both fields MUST be stored encrypted in the database via `EncryptedString`

### Requirement: Read Wishlist Items

The system MUST allow an authenticated user to list all their wishlist items, paginated, and retrieve a single item by id. Results MUST be scoped exclusively to the current user.

#### Scenario: List own items with pagination

- GIVEN a user has 15 wishlist items
- WHEN they GET `/wishlist?limit=10&offset=0`
- THEN the system returns HTTP 200 with 10 items and a `total` count of 15

#### Scenario: Cannot read another user's item

- GIVEN user A has a wishlist item with id=5
- WHEN user B GETs `/wishlist/5`
- THEN the system returns HTTP 404

### Requirement: Update Wishlist Item

The system MUST allow partial updates to a wishlist item's mutable fields: `name`, `estimated_cost`, `priority`, `status`, `category_id`, and `notes`.

#### Scenario: Partial update succeeds

- GIVEN a wishlist item owned by the user with `name: "PS5"` and `estimated_cost: 800.00`
- WHEN they PATCH `/wishlist/{id}` with `{ "estimated_cost": 750.00 }`
- THEN the system returns HTTP 200 with updated `estimated_cost`
- AND `name` and other fields remain unchanged

#### Scenario: Update non-owned item returns 404

- GIVEN a wishlist item owned by another user
- WHEN the current user PATCHes it
- THEN the system returns HTTP 404

### Requirement: Delete Wishlist Item

The system MUST allow an authenticated user to delete their own wishlist item.

#### Scenario: Delete own item

- GIVEN a wishlist item owned by the user
- WHEN they DELETE `/wishlist/{id}`
- THEN the system returns HTTP 204
- AND the item is removed from the database

#### Scenario: Delete non-existent item

- GIVEN no wishlist item with id=999 exists for the user
- WHEN they DELETE `/wishlist/999`
- THEN the system returns HTTP 404
