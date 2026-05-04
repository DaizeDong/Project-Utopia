---
reviewer_id: Plan-R12-non-temperate-fallback (A5-balance-critic finding 2)
feedback_source: assignments/homework7/Final-Polish-Loop/Round12/Feedbacks/A5-balance-critic.md
round: 12
date: 2026-05-01
build_commit: fa6cda1
priority: P1
track: balance (per-template starting resource buffer + difficulty modifier for non-Temperate maps)
freeze_policy: hard
rollback_anchor: fa6cda1
estimated_scope:
  files_touched: 1
  loc_delta: ~50
  new_tests: 1
  wall_clock: 35
conflicts_with: []
---

# Plan-R12-non-temperate-fallback — Buff starting resources for Highlands / Riverlands so non-Temperate maps don't wipe in 7-9 sim min on default fallback

**Plan ID:** Plan-R12-non-temperate-fallback
**Source feedback:** A5-balance-critic finding 2 ("Non-starter templates wipe in 7-9 sim minutes on default fallback")
**Track:** balance
**Priority:** **P1** — A5 measurements: Temperate Plains survived 39:33 sim, Highlands wiped at 8:28, Riverlands wiped at 7:16 — all on identical autopilot, 12-worker start. A5 quote: "three of six templates ... appear to be in a difficulty band the autopilot can't handle, which means they're effectively *unwinnable* for any player who relies on the fallback director." Critically, the title-screen "Best Runs" list confirms the imbalance: every run >300 pts is Temperate or Highlands; never Coastal/Archipelago/Riverlands/Fortified. The dominant strategy on the title screen is *"play Temperate Plains and ignore the other 5 maps."* Given LLM is offline by default in HW7 grading runs, this means 5 of 6 maps are functionally broken for the grader.
**Freeze policy:** hard — no new map, no new template, no new mechanic. Only adjusts existing per-template starting resource overrides in `src/world/scenarios/ScenarioFactory.js` and may add a per-template scenario buffer multiplier. ~50 LOC.
**Rollback anchor:** `fa6cda1`

---

## 1. Core problem (one paragraph)

`src/world/scenarios/ScenarioFactory.js:113-120` defines `STARTING_WOOD_BY_TEMPLATE`:
```js
const STARTING_WOOD_BY_TEMPLATE = Object.freeze({
  temperate_plains: 35,    // unchanged baseline
  fertile_riverlands: 32,  // mild dip — A5: ran out at 90s on Riverlands
  rugged_highlands: 38,    // slight bump — A5: wiped at 8:28
  fortified_basin: 36,
  archipelago_isles: 22,
  coastal_ocean: 20,
});
```
A5 measures: Highlands wipes at 8:28 (food crisis at 6:35); Riverlands wipes at 7:16 (food crisis at 6:46, wood gone by 1:48 because the Silted Hearth scenario forces a road-clearing build that consumes wood faster than the 32-pool replenishes). Temperate at 35 wood survives 39 minutes. The cluster of food-crisis times (6:35 / 6:46 within 11s of each other across 3 different maps + 3 different seeds) suggests the failure is structural, not stochastic — every map's fallback policy hits the same starvation cliff because starting food (320 across all maps per `INITIAL_RESOURCES.food`) drains at the universal 0.60/s rate. Temperate's 35 wood lets the colony build a farm before the cliff; Riverlands' 32 wood doesn't, because the Silted Hearth forces road-clearing first. Fix: (a) bump non-Temperate starting wood: Highlands 38→48, Riverlands 32→42 (cover farm + bootstrap road), Coastal 20→30, Archipelago 22→32, Fortified 36→44; (b) add a per-template starting food override for the maps with forced opening builds (Riverlands +60 food = 380 baseline, Fortified +40 = 360 because of wall-build slow-start); (c) add a per-template `scenarioDifficultyMultiplier` knob that's surfaced in the briefing copy.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — bump per-template starting wood + selectively boost food

Edit `src/world/scenarios/ScenarioFactory.js:113-120`:
```js
// CURRENT:
const STARTING_WOOD_BY_TEMPLATE = Object.freeze({
  temperate_plains: 35,
  fertile_riverlands: 32,
  rugged_highlands: 38,
  fortified_basin: 36,
  archipelago_isles: 22,
  coastal_ocean: 20,
});

// AFTER:
// R12 Plan-R12-non-temperate-fallback (A5 #2): bump non-Temperate starts so
// the autopilot fallback policy can build farm+lumber+1 spare BEFORE the
// universal 0.60/s food drain hits the 6:30 cliff. A5 R12 measured all
// non-Temperate maps wiping at 7-9 sim min while Temperate survived 39:33;
// pre-bumps Highlands 38→48, Riverlands 32→48, Coastal 20→34, Archipelago
// 22→34, Fortified 36→48. Temperate stays at 35 to preserve the long-horizon
// benchmark baseline.
const STARTING_WOOD_BY_TEMPLATE = Object.freeze({
  temperate_plains: 35,    // baseline preserved
  fertile_riverlands: 48,  // was 32 — Silted Hearth scenario forces road-clearing
  rugged_highlands: 48,    // was 38 — A5 wiped at 8:28
  fortified_basin: 48,     // was 36 — wall-heavy opening + saboteur tension
  archipelago_isles: 34,   // was 22 — bridge-required + water-fragmented spawn
  coastal_ocean: 34,       // was 20 — hardest map, harbor-required opening
});

// R12 Plan-R12-non-temperate-fallback Part 2: per-template starting food
// overrides for maps with forced opening builds that delay food production.
// Default 320 (from INITIAL_RESOURCES.food) is preserved for Temperate /
// Highlands; bumped for maps where the scenario forces non-food-producing
// first builds.
const STARTING_FOOD_BY_TEMPLATE = Object.freeze({
  temperate_plains: 320,
  rugged_highlands: 320,
  fertile_riverlands: 380,  // +60 for the Silted Hearth road-clear delay
  fortified_basin: 360,     // +40 for wall-heavy opening
  archipelago_isles: 360,   // +40 for bridge-build delay
  coastal_ocean: 380,       // +60 for harbor-build delay (A5: hardest map)
});
```

Add a sibling export:
```js
export function getTemplateStartingFood(templateId) {
  const food = STARTING_FOOD_BY_TEMPLATE[templateId];
  return typeof food === "number" ? food : null;
}
```

Then in `src/entities/EntityFactory.js` (search for the call to `getTemplateStartingResources`), add:
```js
food: getTemplateStartingFood(grid.templateId) ?? INITIAL_RESOURCES.food,
```

- Files: `src/world/scenarios/ScenarioFactory.js` (~25 LOC), `src/entities/EntityFactory.js` (~5 LOC), 1 unit test (~25 LOC).
- Scope: ~55 LOC.
- Expected gain: closes A5 #2. Non-Temperate maps should survive at least 15 sim minutes on autopilot (was 7-9).
- Main risk: bumping Temperate's siblings makes them easier than the official "starter" map. Acceptable trade-off — the alternative is 5 of 6 maps unwinnable.

### Suggestion B (in-freeze, MINIMAL VARIANT) — only bump Riverlands and Highlands

Skip Archipelago / Coastal / Fortified. Lowest-risk change:
```js
fertile_riverlands: 42,
rugged_highlands: 44,
```
~5 LOC. Closes A5's two most-egregious wipes but leaves the other 3 maps unaddressed.
- Files: `src/world/scenarios/ScenarioFactory.js`
- Scope: ~5 LOC

### Suggestion C (in-freeze, COMBINED with difficulty modifier) — also expose per-template difficulty in briefing copy

Add a `templateDifficulty: "easy" | "standard" | "hard"` field per template and surface it in the title-screen briefing:
```js
const TEMPLATE_DIFFICULTY = Object.freeze({
  temperate_plains: "easy",
  rugged_highlands: "standard",
  fertile_riverlands: "standard",
  fortified_basin: "hard",
  archipelago_isles: "hard",
  coastal_ocean: "hard",
});
```
~15 extra LOC. Sets player expectations correctly. Tangentially helpful but doesn't fix the wipes — defer unless reviewer pushes back on Suggestion A's "make easier" approach.
- Files: `src/world/scenarios/ScenarioFactory.js`, possibly `index.html` briefing copy
- Scope: ~15 extra LOC

### Suggestion D (FREEZE-VIOLATING, do not ship) — rewrite fallback director's per-map opening strategy

Audit `src/simulation/ai/director/EnvironmentDirectorSystem.js` and add per-template build sequences. Bigger AI change; defer to v0.10.2.

## 3. Selected approach

**Suggestion A** (per-template wood bumps + selective food bumps). Closes A5 #2 with the smallest mechanically correct change. The starting-resource override is the canonical R4-A5 P0-3 mechanism; this plan extends it consistently rather than introducing a new system.

## 4. Plan steps

- [ ] **Step 1 — Audit existing tests for `STARTING_WOOD_BY_TEMPLATE` and per-template resource assertions.**
  ```
  Grep -n "STARTING_WOOD_BY_TEMPLATE\|getTemplateStartingResources" test/ -r
  Grep -n "fertile_riverlands\|rugged_highlands\|coastal_ocean\|archipelago_isles\|fortified_basin" test/ -r
  ```
  Document tests that pin the current numbers. Likely 3-6 hits.
  - Type: read (no edit)

- [ ] **Step 2 — Update `src/world/scenarios/ScenarioFactory.js:113-120` per Suggestion A Part 1.**
  Replace the `STARTING_WOOD_BY_TEMPLATE` object with the new values. Update the comment block (lines 104-112) to cite R12 A5 #2 and reference A5's measured wipe times.
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Add `STARTING_FOOD_BY_TEMPLATE` + `getTemplateStartingFood()` export.**
  Add the new const after `STARTING_WOOD_BY_TEMPLATE` and the new export function after `getTemplateStartingResources`. Default to `null` for templates without overrides so the caller falls back to `INITIAL_RESOURCES.food`.
  - Type: add
  - depends_on: Step 2

- [ ] **Step 4 — Wire `getTemplateStartingFood` into `src/entities/EntityFactory.js`.**
  Search for the existing `getTemplateStartingResources` import/call. Add the food override read alongside it:
  ```js
  // R12 Plan-R12-non-temperate-fallback (A5 #2): per-template food overrides
  // for maps with forced opening builds that delay food production
  food: getTemplateStartingFood(grid.templateId) ?? INITIAL_RESOURCES.food,
  ```
  Add the `getTemplateStartingFood` import to the existing ScenarioFactory import line.
  - Type: edit
  - depends_on: Step 3

- [ ] **Step 5 — Update existing tests flagged in Step 1.**
  Update assertions to match new numbers. Comment with `// R12 non-temperate-fallback: A5 R12 wipe-time fix`.
  - Type: edit (existing tests)
  - depends_on: Step 4

- [ ] **Step 6 — Add a regression test `test/template-starting-resources-r12.test.js` (~30 LOC).**
  Test cases:
  1. `getTemplateStartingResources("rugged_highlands").wood === 48`.
  2. `getTemplateStartingResources("fertile_riverlands").wood === 48`.
  3. `getTemplateStartingResources("temperate_plains").wood === 35` (baseline preserved).
  4. `getTemplateStartingFood("fertile_riverlands") === 380`.
  5. `getTemplateStartingFood("temperate_plains") === 320`.
  6. `getTemplateStartingFood("unknown_template")` returns null (defensive — falls back to default).
  - Type: add
  - depends_on: Step 5

- [ ] **Step 7 — Run the suite + A5 repro benches.**
  `node --test test/*.test.js` — baseline 1646 / 0 fail / 2 skip preserved + Step 5 updates pass + Step 6 new test passes.
  Run 3 long-horizon benches matching A5's seeds:
  - `node scripts/long-horizon-bench.mjs --seed 94499 --preset rugged_highlands --max-days 30 --tick-rate 4` (A5 Run 2)
  - `node scripts/long-horizon-bench.mjs --seed 45030 --preset fertile_riverlands --max-days 30 --tick-rate 4` (A5 Run 3)
  - `node scripts/long-horizon-bench.mjs --seed 1638360143 --preset temperate_plains --max-days 30 --tick-rate 4` (A5 Run 1 baseline regression check)
  Expect: Highlands and Riverlands survive ≥ 15 sim minutes (was 8:28 and 7:16); Temperate ≥ 35 sim min (preserves baseline within 10%).
  - Type: verify
  - depends_on: Step 6

- [ ] **Step 8 — Manual Playwright per-map session.**
  Open the build, run an autopilot session on each of Highlands, Riverlands, Coastal, Archipelago, Fortified for at least 10 sim min each. Confirm: no map wipes inside 10 sim min; food does not crash to 0 inside the first 8 minutes.
  - Type: verify
  - depends_on: Step 7

- [ ] **Step 9 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"R12 Plan-R12-non-temperate-fallback (A5 P1 #2): bumped per-template starting wood (Highlands 38→48, Riverlands 32→48, Fortified 36→48, Coastal 20→34, Archipelago 22→34) and added per-template starting food overrides (Riverlands 320→380, Coastal 320→380, Archipelago 320→360, Fortified 320→360) so non-Temperate maps survive past the universal 6:30 food cliff on default autopilot. A5 R12 measured 7-9 min wipes on every non-Temperate map; Temperate baseline (35 wood, 320 food) preserved."*
  - Type: edit
  - depends_on: Step 8

## 5. Risks

- **Tests pinning the old wood/food values flip.** Step 1 audits; Step 5 updates. Likely 3-6 tests.
- **Long-horizon Temperate baseline could shift slightly.** Step 7 explicitly re-runs Temperate to confirm no regression; Temperate's wood/food values are unchanged so regression should be ≤ 5%.
- **Difficulty rebalance is a soft call.** A5 explicitly says "either rebalance starting resources up for non-temperate templates, or buff the fallback director's first-100-second build sequence on mountain/fertile/coastal tags" — this plan picks the resource-bump path. If the orchestrator wants the director-buff path instead, that's Suggestion D (deferred — bigger AI change).
- **Sibling Plan-R12-wood-food-balance also touches wood economy.** This plan changes starting wood; the sibling caps the proposer-driven wood production. Together they should have additive effect (more starting wood + less aggressive lumber proposing = more balanced economy). Implementer can ship both in one PR.
- **Possible affected tests:** `test/scenario-factory*.test.js`, `test/entity-factory*.test.js`, `test/template-starting-resources*.test.js`, `test/long-horizon-*.test.js`. Audit in Step 1.

## 6. Verification

- **New unit test:** `test/template-starting-resources-r12.test.js` (Step 6).
- **Bench regression:** Three benches in Step 7 — Highlands ≥ 15 min, Riverlands ≥ 15 min, Temperate ≥ 35 min.
- **Manual Playwright:** Step 8 — 5 maps × 10 sim min each.

## 7. UNREPRODUCIBLE marker

N/A — A5 captured the wipes with seed + sim time + score for all 3 maps in screenshots 06, 10, 13. Reliable repro on default boot.

---

## Acceptance criteria

1. `getTemplateStartingResources("rugged_highlands").wood === 48` (was 38).
2. `getTemplateStartingResources("fertile_riverlands").wood === 48` (was 32).
3. `getTemplateStartingFood("fertile_riverlands") === 380` (new override).
4. Bench: Highlands seed 94499 survives ≥ 15 sim min (was 8:28 in A5 Run 2).
5. Bench: Riverlands seed 45030 survives ≥ 15 sim min (was 7:16 in A5 Run 3).
6. Bench: Temperate seed 1638360143 survives ≥ 35 sim min (was 39:33 in A5 Run 1; ≤ 10% regression).
7. New unit test `test/template-starting-resources-r12.test.js` passes.
8. Test baseline 1646 / 0 fail / 2 skip preserved (+1 new pass; pre-existing tests updated for new values).

## Rollback procedure

```
git checkout fa6cda1 -- src/world/scenarios/ScenarioFactory.js src/entities/EntityFactory.js && rm test/template-starting-resources-r12.test.js
```
