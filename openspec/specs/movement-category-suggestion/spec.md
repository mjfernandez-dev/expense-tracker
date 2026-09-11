# movement-category-suggestion Specification

## Purpose

Auto-select the most-used category when a movement description is chosen from the existing autocomplete, reducing manual categorization for recurring movements. Applies only when creating new movements; edit mode is unaffected.

## Requirements

### Requirement: Most-used category aggregation per description

The system MUST aggregate category usage for each exact trimmed, case-insensitive description of the current user's movements, considering both `categoria_id` and `user_category_id`. The suggested user category MUST be the most frequently used; ties MUST break by most recent `fecha`, then by stable id. Aggregation MUST be scoped to the authenticated user's own movements only (per-user isolation). Because `descripcion` uses `EncryptedString`, aggregation MUST run over decrypted rows in memory, not as DB-level grouping.

#### Scenario: Known description aggregates usage

- GIVEN the user has 3 movements with description "Supermercado", 2 with `user_category_id` A and 1 with user_category B
- WHEN the user searches "super"
- THEN the most-used user category A is returned for that suggestion

#### Scenario: Tie breaks by recency

- GIVEN two categories with equal usage counts
- WHEN aggregation runs
- THEN the category of the most recent movement is chosen, falling back to the smaller stable id

#### Scenario: Per-user isolation

- GIVEN another user has different category usage for the same description
- WHEN the current user searches
- THEN only the current user's movements are aggregated

### Requirement: Additive suggestion payload

The search response MUST include optional category fields (`user_category_id`, `categoria_id`) per suggestion without changing the existing `descripcion`/`frecuencia` contract. Fields MUST be nullable so old clients and uncategorized descriptions remain unaffected.

#### Scenario: Suggestion without category history

- GIVEN a description never categorized before
- WHEN the search response is built
- THEN category fields are null and the client treats it as no suggestion

### Requirement: Auto-apply only when creating

The frontend MUST auto-apply the suggested `user_category_id` only when creating a new movement. In edit mode, the system MUST NOT auto-apply suggestions; the movement keeps its current category.

#### Scenario: New movement auto-applies suggestion

- GIVEN a new movement, a description chosen from suggestions, and the category select untouched
- WHEN the user selects the suggestion
- THEN `user_category_id` is applied and the select reflects it

#### Scenario: Edit mode never auto-applies

- GIVEN an existing movement being edited
- WHEN its description changes and a suggestion exists
- THEN the category select stays unchanged

### Requirement: Manual-touch guard

The system MUST NOT override an explicit user category choice. If the user manually touched the category select, auto-application MUST be skipped even when a suggestion matches.

#### Scenario: Explicit choice wins

- GIVEN the user manually chose category X
- WHEN a suggestion recommending category Y is selected
- THEN the select remains category X

### Requirement: Exact-match blur and first-time descriptions

On blur, the system MAY auto-apply the suggestion only when the typed description exactly matches a suggestion (trimmed, case-insensitive). Descriptions with no matching suggestion MUST keep the default category.

#### Scenario: Exact match on blur

- GIVEN the typed description equals an existing suggestion and the select is untouched
- WHEN the field blurs
- THEN the suggested category is applied

#### Scenario: First-time description keeps default

- GIVEN a description with no matching history
- WHEN the field blurs
- THEN the default category is preserved

### Requirement: Offline graceful degradation

When suggestions cannot be fetched, the system MUST NOT apply any category and MUST preserve the current/default selection.

#### Scenario: Search endpoint unavailable

- GIVEN `searchDescripciones` fails
- WHEN the user picks a description
- THEN no category is auto-applied and the existing error state is shown
