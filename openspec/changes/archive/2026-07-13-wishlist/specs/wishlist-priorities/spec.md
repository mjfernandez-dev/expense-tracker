# Wishlist Priorities Specification

## Purpose

Wishlist items MUST have a three-tier priority system (`alta`, `media`, `baja`) that governs display ordering and visual distinction. Priorities help users focus on what matters most.

## Requirements

### Requirement: Priority Enum

Every wishlist item MUST have a `priority` field constrained to one of three values: `alta`, `media`, `baja`. The field is required on creation with no default.

#### Scenario: Create item with valid priority

- GIVEN an authenticated user
- WHEN they create a wishlist item with `priority: "alta"`
- THEN the item is created successfully with `priority: "alta"`

#### Scenario: Create item with invalid priority

- GIVEN an authenticated user
- WHEN they create a wishlist item with `priority: "urgente"`
- THEN the system returns HTTP 422 with a validation error

### Requirement: Priority-Based Sorting

The system MUST return wishlist items sorted by priority precedence: `alta` first, then `media`, then `baja`. Within the same priority, items MUST be sorted by `created_at` descending (newest first).

#### Scenario: List returns priority-sorted items

- GIVEN a user has items with priorities media, alta, and baja
- WHEN they GET `/wishlist`
- THEN the response order is: all `alta` items first, then `media`, then `baja`

### Requirement: Priority Display Label

The frontend MUST display a human-readable label and color indicator for each priority level.

#### Scenario: UI renders priority badge

- GIVEN a wishlist item with `priority: "alta"`
- WHEN the frontend renders the item card
- THEN it shows "Alta" text with a red-colored badge

#### Scenario: UI renders each priority correctly

- GIVEN items with all three priorities
- WHEN rendered in a list
- THEN each shows the correct label: "Alta", "Media", "Baja" with distinct colors (red, yellow, green respectively)

### Requirement: Priority Change

The system SHOULD allow updating an item's priority after creation.

#### Scenario: Change priority

- GIVEN an item with `priority: "baja"`
- WHEN the user PATCHes `/wishlist/{id}` with `{ "priority": "alta" }`
- THEN the item's priority is updated to `"alta"`
- AND the item appears first in the sorted list
