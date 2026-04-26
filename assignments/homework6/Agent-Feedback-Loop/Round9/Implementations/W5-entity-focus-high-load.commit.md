---
round: 9
stage: C
wave: W5
plan: entity-focus-high-load
date: 2026-04-26
commit: "pending final Round9 commit"
status: implemented
source: "Round9/Plans/summary.md"
---

# W5 - entity-focus-high-load

## Implementation

- `EntityFocusPanel` now exports `deriveEntityFocusGroups()` and classifies live agents/animals into starving, hungry, blocked, idle, hauling, combat, and other.
- Entity Focus rows sort crisis groups first, then hunger/carry/id, so high-load lists surface urgent entities before routine workers.
- Worker list UI now renders filter chips with counts, stores `state.controls.entityFocusFilter`, and preserves the selected row even when pagination would hide it.
- The old `+N more` footer now includes a hidden-row status summary instead of only reporting a count.

## Files

- `src/ui/panels/EntityFocusPanel.js`
- `test/entity-focus-groups.test.js`
- `test/entityFocusWorkerList.test.js`

## Validation Evidence In Diff

- Added group derivation tests for every accepted focus group.
- Added ordering tests proving starving, hungry, and blocked rows outrank routine rows.
- Updated worker-list source tests to assert filter chips, delegate wiring, and selected-row preservation.
