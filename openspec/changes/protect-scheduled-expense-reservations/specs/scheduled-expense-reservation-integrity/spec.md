# Scheduled-Expense Reservation Integrity Specification

## Requirements

### Requirement: Existing ownership boundary

An item with `gasto_programado_id` MUST be a protected reservation. Generic workflows MUST NOT link, relink, edit, delete, or repurpose it; no second ownership marker SHALL be required.

#### Scenario: Owning lifecycle updates its reservation
- GIVEN an owned protected reservation
- WHEN that scheduled-expense lifecycle performs a valid transition
- THEN it MAY update the reservation within that transition

#### Scenario: Cross-tenant reference
- GIVEN a reservation or scheduled expense owned by another user
- WHEN an operation references it
- THEN the system MUST reject it without revealing or changing the resource

### Requirement: Category-only payment confirmation

Payment confirmation MUST preselect the scheduled category, list valid system and user-owned categories, and permit changing only category. Amount, date, and payment method SHALL NOT be editable.

#### Scenario: Confirm with system category
- GIVEN a pending scheduled expense and an authorized system category
- WHEN the user confirms payment with that category
- THEN the scheduled expense, reservation, and payment movement MUST use it

#### Scenario: Confirm with user category
- GIVEN a pending scheduled expense and a category owned by the user
- WHEN the user confirms payment with that category
- THEN the scheduled expense, reservation, and payment movement MUST use it

#### Scenario: Invalid confirmation fields
- GIVEN confirmation with a foreign category or non-category edit
- WHEN it is submitted
- THEN the system MUST reject it without partial changes

### Requirement: Atomic and duplicate-safe payment

Payment SHALL atomically create one movement, link its reservation, and mark the expense paid. Any failure MUST roll back every change.

#### Scenario: Transaction failure
- GIVEN a pending scheduled expense
- WHEN any payment mutation fails
- THEN status, category, reservation, and movements MUST remain unchanged

#### Scenario: Sequential duplicate
- GIVEN an already-paid scheduled expense
- WHEN payment is submitted again
- THEN no additional transition or movement MUST persist

#### Scenario: Concurrent PostgreSQL submissions
- GIVEN one pending scheduled expense
- WHEN two PostgreSQL transactions submit payment concurrently
- THEN exactly one paid transition and one payment movement MUST persist
- AND the other submission MUST observe the completed outcome without duplication

### Requirement: Safe cancellation

Cancellation MUST remove only the owner's pending expense and reservation, without affecting ordinary items or movements.

#### Scenario: Cancel pending expense
- GIVEN a pending expense with its reservation
- WHEN its owner cancels it
- THEN both records MUST be removed and ordinary records MUST remain unchanged

### Requirement: Atomic category replacement

Category replacement SHALL migrate all affected pending or paid expenses, reservations, and payment movements owned by the user to an authorized category in one transaction. Failure MUST preserve prior references.

#### Scenario: Replace mixed lifecycle records
- GIVEN a category used by pending and paid scheduled expenses
- WHEN its owner replaces it with an authorized category
- THEN all expenses, reservations, and payments MUST reference the replacement

#### Scenario: Replacement rollback and tenant isolation
- GIVEN a record cannot be migrated or belongs to another user
- WHEN replacement runs
- THEN the transaction MUST roll back and foreign-tenant data MUST remain unchanged

### Requirement: Auditable historical repair

Repair MUST identify generic movements linked to reservations they do not own. Dry-run, apply, and rollback SHALL evidence counts, identifiers, actions, and verification results.

#### Scenario: Dry-run
- GIVEN valid and contaminated historical links
- WHEN repair runs in dry-run mode
- THEN it MUST report only contaminated links and MUST NOT mutate data

#### Scenario: Apply and verify
- GIVEN reviewed dry-run evidence
- WHEN repair applies to an authorized tenant scope
- THEN only reported contamination MUST be repaired atomically
- AND evidence MUST show before/after values and successful verification

#### Scenario: Evidence-based rollback
- GIVEN applied-repair evidence
- WHEN rollback is requested
- THEN captured values MUST be restored atomically and re-verified
