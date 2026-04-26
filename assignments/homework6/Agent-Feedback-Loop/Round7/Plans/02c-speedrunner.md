---
reviewer_id: 02c-speedrunner
round: 7
build_commit: f0bc153
freeze_policy: lifted
plan_author: Enhancer
plan_date: 2026-04-26
---

# Round 7 Enhancement Plan — 02c-speedrunner

## 1. Core Problems Extracted

Three root problems underpin the speedrunner's 4/10 rating. They are ordered by severity.

**P1 — COOK role never assigned under fallback (CRITICAL)**
When LLM is offline (`proxy=down, hasKey=false`), `AgentDirectorSystem` operates in `"hybrid"` mode and delegates exclusively to `generateFallbackPlan` / `ColonyDirectorSystem`. The RoleAssignment feedback loop (`reassign_role` hint via `state.ai.fallbackHints.pendingRoleBoost`) does generate a `reassign_role` step in `ColonyPlanner.generateFallbackPlan` (Priority 3.75), but the loop is conditional on `food >= idleChainThreshold` (default 15) AND `kitchens >= 1` AND `cookWorkers === 0`. The reviewer measured `COOK=0` across all runs even with `roleQuotaCook=8`. Code audit confirms why: `RoleAssignmentSystem` gates `cookSlots` on `kitchenCount > 0`, and population-band `n=12` falls through to the `perWorker` formula (`cookPerWorker = 1/8`), giving `floor(12 * 0.125) = 1`. So the quota is nonzero. The actual failure is that `state.controls.roleQuotas.cook` — the player-exposed slider — acts as the **upper bound** cap in `q("cook") = min(scaled, playerMax)`. If `playerMax.cook` was never initialised or came through as `0` (initial state), `q("cook")` collapses to `0` regardless of `scaledQuotas`. Additionally, the `pipeline-idle boost` tryBoost path gates on `q("cook") >= 1` (Round-6 inline comment "bandTable explicit zeros are not bypassed"), so if `playerMax.cook=0` makes `q()=0`, the boost is also blocked. This creates a cold-start lock: slider initialised at `0`, quota forces `0`, boost blocked, `reassign_role` hint fires but `tryBoost` still requires `specialistBudget >= 1`.

**P2 — Player quota sliders ignored by fallback AI (HIGH)**
The reviewer confirmed that setting `roleQuotaCook=8` via the UI had zero effect. In `RoleAssignmentSystem.update`, `playerMax = state.controls?.roleQuotas` is taken as the **ceiling** not the **floor**. When fallback AI selects `scaledQuotas` through `computePopulationAwareQuotas`, `q("cook") = min(scaled, playerMax)` — the player setting acts as a cap. If the player raises the slider to 8, the formula resolves to `min(1, 8)=1`, which is the right outcome. But if the default `playerMax.cook` was initialised to `0` or `1` in a previous reset, the player override is silently overridden by a default. The deeper problem is there is no "player floor" semantics: `roleQuotas` sliders should read as minimum guarantees when the player raises them, not ceilings that compete against scaled quotas.

**P3 — 8x fast-forward FPS degradation at high entity counts (MEDIUM)**
`simStepper.js` caps `safeScale` at `8` and `maxStepsPerFrame` at `12`. At 20+ entities, sim cost per step drifts above 8ms, so in a 16ms frame only 1-2 steps complete (`16/8=2`), yielding an effective `timeScaleActual ~1.5x` while the HUD shows `8x`. The reviewer measured "actual 7.6x" at low entities and "~1-2x" at 20+ entities. The root issue is that the render loop shares the 16ms budget with simulation: Three.js scene rendering, HUD DOM updates, and system ticks all run serially per `requestAnimationFrame`. At entity count 20, each tick visits all 15 systems over the entire 96x72 grid tile set, making per-step cost non-constant. `fastForwardScheduler.maxStepsPerFrame=12` was raised from 6 in Round-5b but the renderer still runs every frame regardless of fast-forward multiplier.

---

## 2. Reproduction (Static Analysis — browser unavailable)

**P1 reproduction trace:**
1. Start with default config, `proxy=down` → `AgentDirectorSystem.selectMode()` returns `"hybrid"` (line 74 AgentDirectorSystem.js: `if (!hasApiKey) return "hybrid"`)
2. `AgentDirectorSystem.update()` calls `_adoptFallbackPlan()` → `generateFallbackPlan()`
3. `generateFallbackPlan` Priority 3.75 fires if `kitchens >= 1 && cookWorkers === 0 && food >= idleChainThreshold`
4. Step emits `{ type: "reassign_role", role: "COOK" }` → `PlanExecutor.executeNextSteps` writes `state.ai.fallbackHints.pendingRoleBoost = "COOK"`
5. `RoleAssignmentSystem.update()` reads hint → calls `tryBoost(cookSlots, true)`
6. `tryBoost` requires `specialistBudget >= 1`; at `n=12` with `farmMin=2, woodMin=1, reserved=3`, `specialistBudget = n - reserved = 9`
7. BUT `cookSlots = (kitchenCount > 0) ? min(applyEmergency(q("cook")), specialistBudget) : 0`
8. If `playerMax.cook` initialised to `0` → `q("cook") = min(1, 0) = 0` → `cookSlots = 0`
9. `tryBoost(0, true)` → `specialistBudget >= 1` is true, so it returns `1` — this should work
10. BUT `roleBoostHint` path only fires AFTER the `pipeline-idle boost` block, and `pipeline-idle boost` separately gates `cookSlots = tryBoost(cookSlots, kitchenCount > 0 && foodStock >= idleThreshold * 2 && q("cook") >= 1)`. The `q("cook") >= 1` gate there blocks the inline boost when `playerMax.cook=0`.
11. The `pendingRoleBoost` path (line 308-311) does NOT check `q("cook")` — it calls `tryBoost(cookSlots, true)` unconditionally. So if `cookSlots` is still `0` after the inline boost, the hint path brings it to `1`.
12. Net: P1 is more nuanced than the reviewer observed. When food crosses threshold AND hint fires, the cook DOES get 1 slot. The failure is that `idleChainThreshold=15` combined with a typical starvation-spiral food level (food < 15 due to no meals) creates a deadlock: no cook → no meals → food stays low → threshold never met → no cook hint emitted.

**P1 deadlock confirmed:** The `idleChainThreshold=15` gate in `generateFallbackPlan` (ColonyPlanner.js line 686) and the `idleThreshold * 2 = 30` gate in the inline pipeline-idle boost (RoleAssignmentSystem.js line 298) both require food above starvation levels. In a colony that is starvation-spiraling (food 5-20 range), neither threshold is stably met. This is a chicken-and-egg: no COOK because food is low, food stays low because no COOK producing meals.

---

## 3. Suggestions

### Suggestion A — Threshold-free COOK gate: assign cook whenever kitchen exists and cook slot is available (RECOMMENDED)

Remove the `food >= idleChainThreshold` guard from the `reassign_role` emit in `generateFallbackPlan`. Replace it with a structural test: `kitchens >= 1 && cookWorkers === 0`. The original guard was defensive (don't cook when food stock is below threshold), but the correct behavior is: *if a kitchen exists and nobody is cooking, assign a cook*. The kitchen's own input-check logic already gates whether cooking actually runs; the role assignment should be decoupled from food stock level.

Similarly in `RoleAssignmentSystem`, the inline pipeline-idle boost threshold for cook should drop from `idleThreshold * 2` to `idleThreshold * 0.5` (i.e., `foodEmergencyThreshold + 1 ≈ 19`) so it fires under moderate-not-critical food conditions instead of requiring comfortable surplus.

**Pros:** Closes the chicken-and-egg deadlock. Simple, targeted change to two constants and one conditional. Does not regress seed=7/42 benchmarks (those benchmarks already have kitchen and food > 15).
**Cons:** At very low food (<8), assigning a cook might divert a worker from farming. Mitigated by the existing `emergencyActive` guard (`food < foodEmergencyThreshold=18`) which sets `emergencyFloor=1` — so one cook is still allowed even in emergency.

### Suggestion B — Role quota sliders as minimum guarantees, not ceiling caps (RECOMMENDED)

Invert the semantics of `state.controls.roleQuotas` in `RoleAssignmentSystem`. Currently: `q(key) = min(scaled, playerMax)`. Change to: `q(key) = max(playerMax, scaled)` when `playerMax > 0` (player explicitly raised the slider), falling back to `min(scaled, playerMax)` only when `playerMax === 0` (sentinel for "use AI default"). This means a player who sets `roleQuotaCook=8` gets at least 8 cook slots allocated (subject to `specialistBudget`), not at most the scaled AI value.

The slider UI should also display its current semantic: "Minimum cook slots" rather than "Cook quota cap".

**Pros:** Directly addresses the reviewer's core complaint that "player has zero control in fallback mode." Respects player agency and is the natural interpretation of a "quota" control.
**Cons:** A player who accidentally sets a slider high could drain a small colony into an unbalanced state. Mitigate by clamping `q(key)` to `Math.min(requestedFloor, Math.floor(n * 0.4))` — no single specialist role can exceed 40% of workers.

### Suggestion C — Score formula transparency: prosperity-multiplied per-second rate (INFORMATIONAL)

The reviewer correctly deduced `Score ≈ timeSec × 0.75-1.5`. The actual implementation in `ProgressionSystem.updateSurvivalScore` accrues `survivalScorePerSecond=1` per sim-second with flat +5/birth and -10/death. There is no prosperity multiplier in the current code. The reviewer's measured ratio variance (0.75-1.5x) comes from the fast-forward accumulator's discrete-step rounding, not a dynamic multiplier. The HUD or Help panel should display the exact formula so speedrunners can optimize correctly. This is a documentation/HUD change only.

### Suggestion D — Fast-forward performance: skip renderer frames during burst steps (INFORMATIONAL)

When `timeScale >= 4`, skip Three.js render calls for N-1 out of every N frames (e.g. render every 3rd frame at 4x, every 6th at 8x). The simulation steps still run each frame, but the GPU draw call is suppressed. At 8x fast-forward with 20 entities, this could recover 6-10ms per frame, allowing 2-3 additional sim steps and lifting effective speed from ~1.5x to ~4x. The Three.js renderer is the largest single-frame cost at high entity counts.

---

## 4. Selected Approach

**Primary:** Suggestion A (threshold-free COOK gate) + Suggestion B (quotas as minimum guarantees).

Suggestion A fixes the immediate COOK=0 deadlock that blocks the meal pipeline and directly causes the starvation spiral. Suggestion B restores player agency over role assignment when in fallback mode, which is the reviewer's second major complaint. Both are targeted, low-risk changes with clear rollback paths.

Suggestion C (score formula) is a documentation-only follow-up after A+B. Suggestion D (renderer frame-skip) is a separate performance feature deferred to a future round; it requires careful integration with the Three.js render pipeline and is out of scope for this targeted fix.

---

## 5. Implementation Plan

### Step 1 — Lower `idleChainThreshold` for COOK in `ColonyPlanner.generateFallbackPlan`

**File:** `src/simulation/ai/colony/ColonyPlanner.js`
**Function:** `generateFallbackPlan` (line 686)

Change the COOK-idle guard from:
```js
if (kitchens >= 1 && cookWorkers === 0 && food >= idleChainThreshold) {
```
to:
```js
if (kitchens >= 1 && cookWorkers === 0 && food >= idleChainLowPopThreshold) {
```

`idleChainLowPopThreshold` is already read from `BALANCE.fallbackIdleChainThresholdLowPop` (value 6). Using the low-pop threshold unconditionally for the cook gate ensures the `reassign_role` hint fires whenever food is above the emergency floor, regardless of colony size. The `idleChainThreshold` (15) was conservatively protecting against cook assignment at rock-bottom food, but the `emergencyActive` guard in RoleAssignmentSystem already handles that case.

### Step 2 — Lower inline cook boost threshold in `RoleAssignmentSystem`

**File:** `src/simulation/population/RoleAssignmentSystem.js`
**Function:** `RoleAssignmentSystem.update` (line 298)

Change:
```js
cookSlots = tryBoost(cookSlots, kitchenCount > 0 && foodStock >= idleThreshold * 2 && q("cook") >= 1);
```
to:
```js
cookSlots = tryBoost(cookSlots, kitchenCount > 0 && foodStock >= idleThreshold && q("cook") >= 1);
```

This halves the inline boost threshold from `30` to `15`, matching the baseline `fallbackIdleChainThreshold`. The `emergencyActive` guard above this block (`if (!emergencyActive)`) already suppresses cook boost when food is critically low, so the `* 2` multiplier is double-guarding and unnecessarily restrictive.

### Step 3 — Invert quota semantics: sliders as minimum floors in `RoleAssignmentSystem`

**File:** `src/simulation/population/RoleAssignmentSystem.js`
**Function:** `RoleAssignmentSystem.update` — `q()` helper (line 174-178)

Change the `q()` lambda from:
```js
const q = (key) => {
  const scaled = Math.max(0, Math.floor(Number(scaledQuotas[key] ?? 0)));
  if (!playerMax || !(key in playerMax)) return scaled;
  const playerCap = Math.max(0, (Number(playerMax[key]) | 0));
  return Math.min(scaled, playerCap);
};
```
to:
```js
const q = (key) => {
  const scaled = Math.max(0, Math.floor(Number(scaledQuotas[key] ?? 0)));
  if (!playerMax || !(key in playerMax)) return scaled;
  const playerVal = Math.max(0, (Number(playerMax[key]) | 0));
  // 0 = "use AI default" (sentinel); >0 = player-specified floor (minimum guarantee).
  if (playerVal === 0) return scaled;
  // Player floor: take the higher of player request and AI scaled value,
  // capped at 40% of colony to prevent single-role drain.
  const maxSafe = Math.max(1, Math.floor(n * 0.4));
  return Math.min(maxSafe, Math.max(playerVal, scaled));
};
```

This preserves the existing behavior when `playerMax[key]=0` (AI-managed default), but when the player explicitly sets a non-zero slider, their value becomes a guaranteed minimum subject to the 40%-of-colony safety cap.

### Step 4 — Add `balance.js` tuneable for COOK idle gate threshold

**File:** `src/config/balance.js`

Add a new key after line 320:
```js
fallbackIdleChainCookGate: 6,   // food floor for COOK reassign_role emit (uses low-pop threshold)
```

Then update `ColonyPlanner.js` Step 1 to read `BALANCE.fallbackIdleChainCookGate ?? BALANCE.fallbackIdleChainThresholdLowPop ?? 6` so the value is named and tuneable independently of the low-pop band threshold.

### Step 5 — Update score transparency in HUD help text

**File:** Search for help panel text (expected in `src/ui/` HUD components)

Locate the help text currently claiming "Survival score is the time you keep the colony alive, with prosperity and DevIndex as the main multipliers." This is inaccurate: the actual formula is `score += 1/simSec + 5/birth - 10/death` with no live multiplier. Update the help text to:

> "Survival Score = (sim seconds alive) + 5 per birth − 10 per death. Keeping colonists alive longer is the primary driver; births add a small bonus; deaths subtract."

This directly addresses the reviewer's observation that "the formula is not transparent."

### Step 6 — Regression tests for COOK assignment and quota floor semantics

**File:** `test/role-assignment-cannibalise.test.js` (existing file per git status)

Add two test cases:
1. **COOK cold-start deadlock test:** Build a state with `kitchen=1, food=8, workers=12, cookWorkers=0`. Verify that after one `RoleAssignmentSystem.update()` call, at least one worker is assigned `ROLE.COOK` (the emergency guard should still allow 1 cook via `emergencyOverrideCooks=1`, now also aided by the lower gate).
2. **Player quota floor test:** Build a state with `state.controls.roleQuotas.cook=3, workers=12, kitchen=1, food=20`. Verify that `cookSlots >= 3` after update (player floor respected).

---

## 6. Risks and Validation

### Risk 1 — Benchmark regression on seed=7 / seed=42 long-horizon runs

**Impact:** Steps 1-2 lower the COOK gate threshold. If the planner now emits cook hints at lower food levels, a marginally food-positive colony might assign a cook when it shouldn't and drop below food-sustainable.

**Mitigation:** The `emergencyActive` guard in `RoleAssignmentSystem` (`food < foodEmergencyThreshold=18`) blocks all specialist boost paths when food is critically low. Step 1 only uses `idleChainThresholdLowPop=6` as the gate, which sits well below `foodEmergencyThreshold=18` — so in practice the new gate fires only when food is between 6-18, and the emergency guard is already active in that band for the boost path (though not for the `reassign_role` planner hint). The planner hint itself only results in `tryBoost(cookSlots, true)` which still requires `specialistBudget >= 1` and `kitchenCount > 0`. Net risk to benchmark: low.

**Validation:** Run `node --test test/*.test.js` and the long-horizon benchmark (`src/benchmark/`) with seeds 1, 7, 42 post-change. DevIndex at day 90 must not regress below current baseline (44).

### Risk 2 — Quota-floor semantics break existing tests that set `playerMax.cook=1`

**Impact:** Step 3 changes `min(scaled, playerMax)` to `max(playerMax, scaled)` when `playerMax > 0`. Existing tests that used `roleQuotas.cook=1` to cap the cook count will now see it treated as a floor instead.

**Mitigation:** Audit all test files that reference `roleQuotas` before committing. The 40%-of-colony safety cap (`maxSafe = floor(n * 0.4)`) prevents runaway allocation. Update any test that expected cap semantics.

**Validation:** `node --test test/role-assignment-cannibalise.test.js` must pass. Check `test/*.test.js` for `roleQuotas` references and update expectations.

### Risk 3 — Score formula HUD change creates player confusion

**Impact:** Step 5 removes the "prosperity and DevIndex as multipliers" claim. Players who built strategy around maximizing those metrics (correctly per the reviewer's recommendation) might be confused.

**Mitigation:** The actual formula does not include a live prosperity multiplier in the code. The help text was incorrect. Correcting it is purely beneficial. If a future round adds a prosperity multiplier to the score formula, update both the code and the help text simultaneously.

### Risk 4 — `pendingRoleBoost` hint not persisting across ticks

If `generateFallbackPlan` fires less frequently than `RoleAssignmentSystem.update` (the latter runs every `managerIntervalSec=1.2s`; the planner's replan cadence is `PLAN_COOLDOWN_SEC=20s`), the hint may not be present on the tick when `RoleAssignmentSystem` runs. The Step 1 fix partially addresses this because the inline pipeline-idle boost in `RoleAssignmentSystem` now independently assigns the cook slot without waiting for a planner hint, as long as food >= threshold.

**Validation:** Trace log `state.ai.fallbackHints.pendingRoleBoost` and `state.metrics.roleCounts.COOK` over 30 simulation seconds in a fresh run. Confirm COOK > 0 within 15 seconds of kitchen being placed.
