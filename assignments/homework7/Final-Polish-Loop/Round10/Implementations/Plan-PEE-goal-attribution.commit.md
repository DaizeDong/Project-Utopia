# Plan-PEE-goal-attribution — Commit Log

**Plan:** `Round10/Plans/Plan-PEE-goal-attribution.md`
**Track:** code (P1, R10 implementer 5/5 — final)
**Status:** SHIPPED
**Parent commit:** `30eeec3` (Plan-PDD-smart-pathing)
**Head commit:** `652220f`

---

## Summary

Closes PEE's "told me what to do but not when I'd done it" loop. The `first_warehouse` milestone toast no longer says "First extra Warehouse raised: The logistics net has a second anchor" (the misleading copy that called the player's only second warehouse "extra"). When the new warehouse pushes a scenario depot to `ready` (auto-recomputed by `getScenarioRuntime` from the live grid via `hasWarehouseNear`), the toast now reads `"First Warehouse covers <depot label>: Frontier route reclaimed."` (with `\bruined\s+\b` stripped — "east ruined depot" → "east depot"). When no depot is in scope, the neutral fallback `"First Warehouse raised: Delivery anchor established."` still avoids the "extra" misnomer.

The `unreadyDepots` "dequeue" is automatic — `runtime.depots[].ready` is derived live from the grid via `hasWarehouseNear` (radius 2 Manhattan). No mutable `unreadyDepots` array existed to splice; the bug was purely the milestone copy not reflecting the depot recognition. Plan's Step 2 dequeue prescription was satisfied by the existing live-recompute path; this implementer focused on Steps 3 (toast rewrite) + 4 (round-trip test).

## Files changed

| File | Δ | Purpose |
|---|---|---|
| `src/simulation/meta/ProgressionSystem.js` | +27/-7 | `first_warehouse` rule defaults rewritten (drop "extra"); `detectMilestones` now takes `runtime` and overrides label/message at emit time when a depot is `ready` |
| `test/scenario-frontier-depot-dequeue.test.js` | +110 (new) | Round-trip test (2 cases): warehouse-on-depot → ready+depot-named toast; no-depot → neutral toast, no "first extra" regression |
| `CHANGELOG.md` | +18 | Unreleased v0.10.2-r10-pee-goal-attribution entry |

Approx +20/-7 source LOC, well within plan's ~40 LOC budget. Hard-freeze compliant: no new tile / role / building / mood / mechanic / event type / HUD pill / BALANCE knob — only a milestone string change + emit-time read of an already-cached runtime object.

## Tests

- `node --test test/scenario-frontier-depot-dequeue.test.js` → 2/2 pass
- `node --test test/progression-milestone.test.js test/progression-system.test.js test/progression-extended-milestones.test.js test/milestone-emission.test.js test/milestone-tone-gate.test.js test/milestone-tone-gate-firstmeal.test.js test/alpha-scenario.test.js` → 22/22 pass
- **Full suite:** `node --test test/*.test.js` → **1977 pass / 0 fail / 4 skip** across 1582 top-level tests / 120 suites. +2 net from this plan (the 2 new round-trip cases). No regressions.

## Suggestions deferred

- **Suggestion C** (HUD "Frontier 0/2 ✕ depot ✕ route" pill) — new HUD element, freeze violation; tagged for v0.10.3.
- **Suggestion D** (cyan ring on scenario-goal tiles) — new renderer overlay, freeze violation; tagged for v0.10.3.

## CONFIRM

```
$ git log --oneline -2
652220f ux(milestone r10): Plan-PEE-goal-attribution — depot-aware "first warehouse" toast (drop "first extra" misnomer)
30eeec3 fix(pathing r10): Plan-PDD-smart-pathing — dual-search road planning + multi-tile bridge sequences
```
