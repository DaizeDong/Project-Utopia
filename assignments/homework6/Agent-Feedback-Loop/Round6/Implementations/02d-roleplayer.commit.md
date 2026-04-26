---
reviewer_id: 02d-roleplayer
plan_source: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/02d-roleplayer.md
round: 6
wave: 3
date: 2026-04-25
parent_commit: 511b9da
head_commit: 2ef5c9a
status: DONE
steps_done: 9/9
tests_passed: 1372/1379
tests_new: test/lineage-birth.test.js, test/obituary-line.test.js, test/rivalry-delta.test.js
bench_seed42_devIndex: 71.44
bench_seed42_outcome: max_days_reached (90 days)
bench_seed42_passed: true
---

## Steps executed
- [x] **Step 1**: WORKER_NAME_BANK 40 → 84 unique first-names (deduped); LINEAGE_RELATION enum exported; `pickWorkerName(random, excludeSet?)` added with 3-retry reroll cap to bound RNG drift.
- [x] **Step 2**: `lineage = { parents: string[], children: string[], deathSec: -1 }` field added to every worker via `createWorker`. `createInitialEntitiesWithRandom` threads an `excludeSet` through the 13-colonist init loop.
- [x] **Step 3**: `PopulationGrowthSystem` picks 1-2 nearest living workers (manhattan-world < 8) as parents; wires `newborn.lineage.parents` AND `parent.lineage.children` (bidirectional); broadcasts `"X was born to Y and Z"` (or `"X arrived at the colony"` when no parent in range — no warehouse literal); emits `EVENT_TYPES.WORKER_BORN`; mirrors birth line into `state.gameplay.objectiveLog` and `state.debug.eventTrace` so storytellerStrip beat extractor can lift it.
- [x] **Step 4**: `WORKER_BORN` and `WORKER_RIVALRY` event types added to `GameEventBus.EVENT_TYPES`. No removals.
- [x] **Step 5**: `MortalitySystem` writes obituary line `"[t] {name}, {backstory}, died of {reason} near {anchorLabel}"` to `state.gameplay.deathLog` (new field, cap 24) AND `state.debug.eventTrace` AND `entity.obituary`. New `resolveAnchorLabel` helper walks scenario `routeLinks → depotZones → chokePoints → wildlifeZones`. `lineage.deathSec` stamp. Family-witness ("My parent / My child died") + rival-witness ("Felt grim relief" + +0.05 morale) memory variants added to `recordDeathIntoWitnessMemory`.
- [x] **Step 6**: `WorkerAISystem` proximity opinion drift adds `-0.02` delta when both workers empty-handed AND in `deliver` state simultaneously. Negative band crossings (`-0.15 Strained`, `-0.45 Rival`) emit `WORKER_RIVALRY` event + mirrored `"Became Strained / Rival"` memory. Negative magnitude is 40% of positive (0.02 vs 0.05) so social CI still trends net-up.
- [x] **Step 7**: `storytellerStrip.SALIENT_BEAT_PATTERNS` extended with obituary `^.+, .+, died of /`, born-to `\bborn to\b`, mother-of `\bmother of\b`, grim-relief `Felt grim relief`. New `HIGH_PRIORITY_PATTERNS` enables a two-pass extractor: first pass returns the latest within-horizon HIGH_PRIORITY beat, second pass falls through to legacy SALIENT order. `NARRATIVE_BEAT_MAX_LEN` raised 140 → 180.
- [x] **Step 8**: Documented no-op (see Deviations). Prior Wave-1 01b/01c devModeOn gate already covers the casual-profile hide contract; adding an additional `uiProfile === "casual"` gate broke the existing `hud-dev-string-quarantine.test.js` "dev mode includes Why no WHISPER" contract pinned in Wave-1.
- [x] **Step 9**: `EntityFocusPanel` memory lines auto-classified into `mem-obituary` / `mem-birth` / `mem-rivalry` / `mem-default` CSS classes (via `classifyMemoryLine` helper). New `Family:` line renders `parent of N · child of {names}` from `lineage.children` / `lineage.parents` (suppressed when empty).
- [x] **Step 10**: Verification (non-code). Tests + bench gate run.

## Tests
- **Pre-existing failures** (5, all baseline — unchanged from parent `511b9da`):
  - `not ok 147 - build-spam: per-copy wood cost is capped by BUILD_COST_ESCALATOR.warehouse.cap`
  - `not ok 348 - SceneRenderer source wires proximity fallback into \#pickEntity and a build-tool guard`
  - `not ok 372 - formatGameEventForLog returns null for noisy event types`
  - `not ok 573 - mood→output: low-mood worker (0.1) yields ≥40% less than high-mood (0.9)`
  - `not ok 942 - ui voice: main.js gates window.__utopia behind devModeGate but keeps __utopiaLongRun public`
- **Pre-existing skips** (2, baseline — unchanged).
- **New tests added** (4 cases, all passing):
  - `test/lineage-birth.test.js` (1 case)
  - `test/obituary-line.test.js` (2 cases)
  - `test/rivalry-delta.test.js` (1 case)
- **Failures resolved during iteration** (1):
  - `test/hud-dev-string-quarantine.test.js` "dev mode (state.controls.devMode=true): tooltip includes 'Why no WHISPER', badge hidden" — initially red after my Step 8 added a `uiProfile === "casual"` gate that overrode dev-mode. Reverted Step 8 to a documented no-op (see Deviations) since the pre-existing 01b/01c devModeOn gate already covers the plan's intent (casual players default to non-dev mode and never see the string). Test back to green; total fail count back to baseline 5.

## Deviations from plan
- **Step 8 reduced to a documented no-op**. The plan called for hiding `Why no WHISPER?: LLM never reached` under `state.controls.uiProfile === "casual"`. Implementing this verbatim broke `test/hud-dev-string-quarantine.test.js` "dev mode tooltip includes Why no WHISPER" — the test sets `state.controls.devMode = true` against the default `uiProfile: "casual"`, asserting that dev-mode wins universally. Inspecting the existing code, prior Wave-1 commits (01b at `db19ef5` and 01c at `35ba584`) already gate the engineering string behind `isDevMode(state)` (which checks `body.dev-mode` DOM class), and `createInitialGameState` defaults `uiProfile: "casual"` with no body.dev-mode set — so casual players already never see the string. The plan's intent is satisfied by the prior gating; the file edit reverted to a comment-only documentation update. CHANGELOG entry calls this out explicitly under "Notes". Passed-the-buck-rating: zero — Step 8 is documented as no-op in commit body, CHANGELOG, and this log.
- **Plan §6 birth event uses `EVENT_TYPES.WORKER_BORN` ALONGSIDE the legacy `VISITOR_ARRIVED` reuse**, not as a replacement. Plan said "emitEvent 调用替代当前的 VISITOR_ARRIVED 复用" but downstream EventPanel / Telemetry consumers may already key off VISITOR_ARRIVED (the existing `reason: "colony_growth"` payload). Replacing it would silently break those listeners. Compromise: BOTH events fire, with `VISITOR_ARRIVED.reason` bumped to `"colony_growth_birth"` when at least one parent was picked (so listeners can branch). The dedicated WORKER_BORN channel is still available for new narrative consumers. Plan §1 description ("不删旧事件类型；下游 EventPanel / Telemetry 不需要变更") matches this choice.
- **Lineage snapshot guard (R1.5 in plan §5) NOT added as a separate `ensureLineage` shim**. Reason: all downstream readers (EntityFocusPanel, MortalitySystem.recordDeathIntoWitnessMemory, PopulationGrowthSystem) defensively use `entity.lineage?.parents ?? []` patterns, so an old saved snapshot without `lineage` simply renders no kinship UI rows — same observable behaviour as the new initial-population workers (whose arrays are intentionally empty). Adds zero code, preserves R1 contract.
- **Step 6 negative path scope narrowed**. Plan listed three sub-paths: (a) tile-collision deliver, (b) +0.05 morale on rival's death, (c) Strained/Rival band-cross memory + WORKER_RIVALRY event. (a) implemented as "both empty-handed AND both in deliver state" (the strict reading of "deliver but carry落空"); (b) implemented in MortalitySystem (Step 5) since `recordDeathIntoWitnessMemory` already had the witness loop; (c) implemented in WorkerAISystem (Step 6). Net result: same three sub-paths covered, distributed between Steps 5 and 6 to avoid duplicating the witness-walk loop.

## Handoff to Validator
- **Bench check**: ran single seed (42) at 90 days, devIndex 71.44, passed=true. Validator should run the 4-seed gate (`--seeds=42,43,44,45 --max-days=365`) per plan §6 to confirm devIndex average ≥ 41.8 and births/deaths ratio within ±10% baseline. Lineage parent-picker uses no rngNext calls (walks state.agents in order); the no-replacement `pickWorkerName(excludeSet)` reroll cap (3 attempts) only fires for initial-pop spawns and is bounded — long-horizon-determinism.test.js passed clean on the run captured here.
- **Playwright smoke**: Validator may want to confirm casual UX actually shows the obituary beat. Steps:
  1. `npx vite`, open Broken Frontier (or any temperate scenario).
  2. Force a worker death via dev console (`worker.hunger = 0; worker.starvationSec = 60`) and observe `#storytellerBeat` flips to the obituary line within ~1s.
  3. Click on a witness worker; EntityFocusPanel "Recent Memory" should display a `mem-obituary`-classed line referring to the dead colleague.
  4. Wait for one birth (or `state.resources.food = 200`); confirm new colonist's EntityFocusPanel "Family" line reads `child of {parent name}` and Recent Memory contains "born to" copy (no "warehouse" literal).
- **Test areas to spot-check**:
  - `test/lineage-birth.test.js` — confirms PopulationGrowthSystem wires lineage both ways.
  - `test/obituary-line.test.js` — confirms HIGH_PRIORITY scan beats fire/visitor.
  - `test/rivalry-delta.test.js` — confirms rival witness path.
- **Wave-3 hand-off to 01e/02e**: storytellerStrip.SALIENT_BEAT_PATTERNS is a frozen array — 01e/02e Wave-3 plans must REPLACE the export (not mutate) when adding more patterns. HIGH_PRIORITY_PATTERNS is the obituary/birth/rivalry priority list; if 01e/02e add new urgent narrative patterns they should append to HIGH_PRIORITY_PATTERNS as well. Stage B §8 sequencing locks 02d FIRST in Wave-3, so 01e and 02e rebase on `2ef5c9a`.
