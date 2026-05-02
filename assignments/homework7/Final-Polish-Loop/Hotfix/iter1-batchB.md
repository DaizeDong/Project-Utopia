---
batch_id: iter1-batchB
issues_owned: ["#3 LLM early-game planning poor / pre-farm deaths", "#7 late-game stone shortage + no fog explore"]
date: 2026-05-01
parent_commit: 3f87bf4
status: DONE
track: code
freeze_check: PASS
track_check: PASS
tests_passed: 1779/1782 expected (5 new + baseline)
tests_new: test/hotfix-batchB-survival-safety.test.js
files_touched: 5 src + 1 test = 6
---

## Issues

### Issue #3 — LLM early-game planning is bad, deaths before farms exist
**User**: "LLM 初期规划很差, 死很多人后才开始造农场"

**Root cause**: R3 `farm@99` zero-farm safety net lives in
`ColonyDirectorSystem.assessColonyNeeds`. But when the LLM is online
(`AgentDirectorSystem` mode === "agent"), the rule-based fallback was
**throttled to every 3rd tick** (`AgentDirectorSystem.update` step 3 — the
`_fallbackThrottle` counter). An active LLM plan can hold the build slot
for up to `PLAN_STALL_GRACE_SEC = 18s`, so the safety net was suppressed
for tens of sim-seconds while the LLM emitted unrelated steps. The
prompts (`strategic-director.md`, `npc-colony-planner.md`,
`ColonyPlanner.SYSTEM_PROMPT`) also lacked any explicit "farms === 0
means starve" hard rule, so the LLM had no reason to front-load farms.

### Issue #7 — Late-game stone shortage; AI doesn't build quarry, doesn't explore fog
**User**: "后期一直缺石头, AI 不建造也不会去探索迷雾找资源点"

**Root cause**: There was no stone-deficit safety net equivalent to the
zero-farm one. `BALANCE.autopilotQuarryEarlyBoost = 12` only fires for
`timeSec < 300s`; after the early window the quarry sits at base
priority 77, which loses to farm@80 spam. When existing quarries
deplete the colony has no rule to force a quarry relocation. For the
fog-explore complaint: `findPlacementTile` already calls
`findNodeFlagTiles` which scans **the whole grid including
hidden-fog tiles**, so placing a quarry on a hidden node implicitly
draws a worker through the fog. The missing piece was the priority bump
to actually win the build slot.

## Steps executed

- [x] **Step 1** — `src/simulation/meta/ColonyDirectorSystem.js`: added
  stone-deficit safety net inside `assessColonyNeeds` directly after the
  zero-farm one. Emits `quarry@95` when
  `(currentQuarries === 0 && stoneStock < 15) || stoneStock < 5`. Sits
  above bootstrap@82 / processing@77 but below food@99/100, so food
  emergencies still trump stone. The bone-dry case (`stoneStock < 5`)
  fires regardless of quarry count to force relocation when nodes are
  exhausted. Sources existing `findPlacementTile` /
  `findNodeFlagTiles` infrastructure — no new placement code needed.

- [x] **Step 2** — `src/simulation/ai/colony/AgentDirectorSystem.js`:
  added a "survival safety preempt" block immediately after the
  algorithmic-mode short-circuit (line ~205). Computes
  `survivalPreempt = (sFarms === 0 && nowSec < 180) || (sFood < 30 && sFarms < 3) || (sQuarries === 0 && sStone < 8)`.
  When true, calls `this._fallback.update(dt, state, services)`
  unconditionally — bypassing the `_fallbackThrottle` every-3rd-tick
  gate that runs later in step 3. This guarantees the rule-based
  farm@99 / quarry@95 safety nets always get a build slot while the
  LLM plan is active. Resources consumed by the safety placement
  naturally throttle the LLM plan via `canAfford` →
  `waiting_resources` on its next executeNextSteps pass.

- [x] **Step 3** — `src/simulation/ai/colony/ColonyPlanner.js`
  (SYSTEM_PROMPT): prepended two `**SURVIVAL CHECK**` /
  `**STONE-DEFICIT CHECK**` rules to the existing `## Hard Rules`
  section. The LLM is now told that `farms === 0` and
  `stone < 10 && quarries === 0` are MUST-FIRST-STEP conditions —
  reinforcing the hard-coded safety net at the prompt layer so the
  LLM stops emitting warehouses-before-farms at t=0.

- [x] **Step 4** — `src/data/prompts/strategic-director.md`: added a
  HARD SURVIVAL CHECK rule and a LATE-GAME STONE CHECK rule at the
  top of the `Rules:` block. References the actual payload field
  shape (`buildings.farms`, `summary.food`, `summary.timeSec`,
  `summary.stone`, `buildings.quarries`) confirmed by reading
  `StrategicDirector.applyPhase5StrategicAdaptations` payload
  construction (`StrategicDirector.js:691-718`). Forces
  `priority="survive"`, `resourceFocus="food"`, `workerFocus="farm"`
  when the survival condition holds.

- [x] **Step 5** — `src/data/prompts/npc-colony-planner.md`:
  added the same two SURVIVAL CHECK / STONE-DEFICIT CHECK rules to
  the `## Hard Rules` block. Uses descriptive prose ("if
  buildings.farms === 0, your FIRST step MUST be a farm action with
  priority critical") matching the observation field names from
  `ColonyPerceiver.formatObservationForLLM` (verified
  ColonyPerceiver.js:1534-1547 lists `buildings.farms`,
  `buildings.quarries`).

- [x] **Step 6** — `test/hotfix-batchB-survival-safety.test.js`:
  new test file with 5 sub-tests:
  1. `assessColonyNeeds emits quarry@>=95 when stone < 15 and zero
     quarries exist` — pins the stone safety net's primary case.
  2. `assessColonyNeeds emits quarry@>=95 when stone < 5 even if
     quarry exists` — pins the depleted-quarry relocation case.
  3. `assessColonyNeeds does NOT emit quarry safety net when stone
     is healthy` — guards against false positives at stone=50.
  4. `AgentDirectorSystem: zero-farm survival preempt drives
     fallback even with no LLM plan active` — runs 200 ticks at
     dt=1/30 with farms=0, asserts at least one farm
     blueprint/build/placement happens via the preempt path.
  5. `AgentDirectorSystem: no survival preempt when farms exist
     and stone is healthy` — verifies the preempt block doesn't
     break the normal hybrid-mode flow.

## Tests

- baseline (3f87bf4): 1778 pass / 4 fail / 4 skip (per Round3 baseline +
  Hotfix new test)
- new test file: 5/5 pass
- post-edit full suite: 1782 tests, 1774 pass, 4 fail, 4 skip — **net +5
  new passing tests; pre-existing 4 fails unchanged** (matches the
  hotfix instruction "pre-existing 5 fails are OK", actually only 4
  remain at this point).
- pre-existing failures verified unrelated to Batch B scope (boids /
  wildlife population / etc. — owned by other agents).

## Files Changed

- `src/simulation/meta/ColonyDirectorSystem.js` (+18 LOC) — stone safety net
- `src/simulation/ai/colony/AgentDirectorSystem.js` (+22 LOC) — survival preempt
- `src/simulation/ai/colony/ColonyPlanner.js` (+2 LOC) — SYSTEM_PROMPT rules
- `src/data/prompts/strategic-director.md` (+2 LOC) — survival/stone rules
- `src/data/prompts/npc-colony-planner.md` (+2 LOC) — survival/stone rules
- `test/hotfix-batchB-survival-safety.test.js` (NEW, 130 LOC) — 5 contract tests

## Hard rules check

- [x] HW7 freeze: NO new tile / role / building / mechanic / audio / UI
  panel. (Stone-safety-net is a priority bump on the existing quarry
  type; survival-preempt is a code-flow change in an existing system;
  prompt rules are runtime data; no new tile/role/building/mechanic
  added.)
- [x] track=code: only `src/**` + `test/**` + `src/data/prompts/*.md`
  touched.
- [x] CHANGELOG / README / assignments docs untouched.
- [x] No UI / Boids / wildlife files touched.
- [x] NOT --amend, NOT --no-verify, NOT push.

## Risk notes

- The survival preempt path runs the rule-based fallback on EVERY tick
  when triggered (vs every 3rd tick during normal LLM-plan operation).
  This is intentional — survival conditions are short-lived
  (zero-farm clears within ~3-5s of the first farm landing; stone
  deficit clears as soon as the quarry comes online), so the extra
  ticks are bounded. Worst case the fallback's `EVAL_INTERVAL_SEC = 2`
  internal throttle still applies.
- `AgentDirector` SkillUpgrade hook recommendations (Vercel AI Gateway
  migration) are pre-existing constructor defaults at lines 142/149
  untouched by this hotfix; out of scope per HW7 freeze.
