# Wishlist Status Workflow Specification

## Purpose

Wishlist items MUST follow a defined status lifecycle (`draft → en-progreso → completado | cancelado`) with a "Wish Farm" rule that limits each user to a maximum of 3 items in `en-progreso` simultaneously. This encourages focused pursuit of goals rather than hoarding.

## Requirements

### Requirement: Status Enum

Every wishlist item MUST have a `status` field with one of four values: `draft`, `en-progreso`, `completado`, `cancelado`. New items default to `draft`.

#### Scenario: New item defaults to draft

- GIVEN an authenticated user
- WHEN they create a wishlist item without specifying `status`
- THEN the item's status is `draft`

### Requirement: Allowed Transitions

The system MUST enforce these status transitions:
- `draft` → `en-progreso` | `cancelado`
- `en-progreso` → `completado` | `cancelado`
- `completado` → (terminal, no further transitions)
- `cancelado` → (terminal, no further transitions)

#### Scenario: Valid transition from draft to en-progreso

- GIVEN an item with `status: "draft"`
- WHEN the user PATCHes `/wishlist/{id}` with `{ "status": "en-progreso" }`
- THEN the system returns HTTP 200 with `status: "en-progreso"`

#### Scenario: Invalid transition from completado to en-progreso

- GIVEN an item with `status: "completado"`
- WHEN the user attempts to change status to `en-progreso`
- THEN the system returns HTTP 400 with a descriptive error message

#### Scenario: Invalid transition from draft to completado

- GIVEN an item with `status: "draft"`
- WHEN the user attempts to change status to `completado`
- THEN the system returns HTTP 400

### Requirement: Wish Farm Limit

The system MUST enforce a maximum of 3 items per user with `status: "en-progreso"` at any time. Attempting to move a 4th item to `en-progreso` MUST fail.

#### Scenario: 4th en-progreso is rejected

- GIVEN the user already has 3 items with `status: "en-progreso"`
- WHEN they try to change a 4th item from `draft` to `en-progreso`
- THEN the system returns HTTP 400 with message "Ya tienes 3 items en progreso. Completa o cancela uno antes de activar otro."

#### Scenario: Completing an item frees a slot

- GIVEN the user has 3 items in `en-progreso` and changes one to `completado`
- WHEN they then move a 4th item from `draft` to `en-progreso`
- THEN the transition succeeds (slot count is now 3)

#### Scenario: Cancelar also frees a slot

- GIVEN the user has 3 items in `en-progreso` and cancels one
- WHEN they then move another item to `en-progreso`
- THEN the transition succeeds

#### Scenario: Draft items do not count toward limit

- GIVEN the user has 3 items in `en-progreso` and 10 items in `draft`
- WHEN they move a draft item to `cancelado`
- THEN the transition succeeds (draft count is irrelevant)

### Requirement: Status Display on Frontend

The frontend MUST display each item's status with a human-readable label and color.

#### Scenario: Render status badge

- GIVEN items with all four statuses
- WHEN rendered
- THEN each shows the correct Spanish label: "Borrador", "En Progreso", "Completado", "Cancelado" with distinct colors
