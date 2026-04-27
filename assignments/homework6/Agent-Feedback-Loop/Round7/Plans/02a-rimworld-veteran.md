---
reviewer_id: 02a-rimworld-veteran
round: 7
build_commit: f0bc153
freeze_policy: lifted
date: 2026-04-26
---

# Plan: 02a-rimworld-veteran — Round 7

## 1. Core Problems (distilled from feedback)

### Problem 1 — Starving worker does not interrupt current task to eat (CRITICAL)

The reviewer observed Dova Vesper at 15-18% well-fed, with `eat:1.40` as her top intent score in the Entity Focus panel, yet remaining in `farm`/`deliver` state for 20+ real seconds. This happened on every map tested.

**Root cause (two-layer):**

- **Layer A — StatePlanner `deliver` hysteresis traps starving workers.**
  In `src/simulation/npc/state/StatePlanner.js` → `deriveWorkerDesiredState`, when `currentFsmState === "deliver"`, the deliver hysteresis threshold drops to `workerDeliverLowThreshold` (1.2), so a worker carrying even 1.2 units returns `desiredState: "deliver"` from the local rule, overriding the hunger check at line 112. The hunger check at line 112 correctly short-circuits to `seek_food` only when `hunger < workerHungerSeekThreshold` (default 0.14). A worker at 15-18% is inside that window. However, the hunger check requires `state.resources.food > 0 && state.buildings.warehouses > 0`. At scenario start or food-scarce moments, the warehouse exists but `state.resources.food` may still register as 0 during sampling lag, causing the check to fall through to the deliver branch.

- **Layer B — Policy intent can override the local `seek_food` decision.**
  In `applyPolicyIntentPreference`, when the policy's top intent is `farm` or `lumber` with `veryStrongSignal` (weight ≥ 1.35, dominance ≥ 0.45), the code at line 396 tests `isProtectedLocalState(groupId, localDesired)`. `deliver` is protected; `seek_food` is marked critical but NOT protected against policy override when it is the *local* desired state derived from hunger — the `mapsToSurvivalState` guard at line 380 only prevents the policy from pushing TOWARD seek_food; it does not prevent the policy from pushing AWAY from seek_food back toward a work intent.

- **Layer C — Carry-food self-eat path is gated on `state.resources.food > 0`.**
  `consumeEmergencyRation` (WorkerAISystem.js line 440-458) ignores `worker.carry.food`. A worker carrying 1.9 food with `hunger < 0.18` could eat immediately from carry, but the function checks warehouse food and returns early because it does not count carry. This is the "she's holding 1.9 food and dying" scenario the reviewer described.

### Problem 2 — Warehouse fire event is invisible to the player (HIGH)

`WorldEventSystem` emits `WAREHOUSE_FIRE`, calls `pushWarning` (appends to `state.metrics.warningLog`), and calls `recordWorkerEventMemory` (writes to a few workers' `recentEvents`). None of this reaches `state.gameplay.objectiveLog`, which is the only source the `EventPanel` renders via its "Recent log" block. The `EventPanel` reads `state.events.active` for scripted events and `state.gameplay.objectiveLog` for free-text lines. Fire events end up exclusively in:
- `state.metrics.warningLog` (DeveloperPanel only, dev mode required)
- A handful of workers' `agent.memory.recentEvents` (requires clicking each worker in Entity Focus)

The reviewer found one fire event only because she systematically read every worker's memory.

### Problem 3 — Resource runout warning is low-visibility (MEDIUM)

The "≈ 0m 6s until empty" text exists and is styled with `warn-critical`/`warn-soon` CSS classes in HUDController, but it sits inside the Colony panel's resource row as a small inline hint. It has no dedicated alert banner, no HUD flash, and no entry in any visible log. A player who is not already watching the Colony panel misses it entirely.

---

## 2. Suggestions

### Suggestion A — Hard-interrupt: starving threshold preempts deliver+policy in StatePlanner

**Mechanism:** Add an explicit starvation preemption guard at the very top of `deriveWorkerDesiredState` — before the hunger hysteresis block and before any deliver check — using a higher threshold (`STARVING_PREEMPT_THRESHOLD`, e.g. 0.22) that is intentionally above `workerHungerSeekThreshold` (0.14). When `hunger < STARVING_PREEMPT_THRESHOLD` AND a food source exists (warehouse food OR carry food), return `seek_food`/`eat` unconditionally, regardless of current FSM state or carry load.

Additionally, annotate `seek_food` as a protected state in `isProtectedLocalState` so that `applyPolicyIntentPreference` cannot override it even at very strong signal levels. Currently `isCriticalLocalState` returns true for `seek_food` but it is not in `isProtectedLocalState` — these two functions are used in different override guards and the asymmetry creates the escape hatch.

For Layer C (carry-eat): extend `consumeEmergencyRation` to consume from `worker.carry.food` first when `state.resources.food <= 0` and `worker.carry.food > 0`. This directly fixes the "holding 1.9 food while dying" scenario without requiring a warehouse trip.

**Pros:** Fixes all three sub-layers. Minimal API surface change. Aligns with RimWorld's hard-coded eat priority. Test-expressible as a unit test (hunger < threshold + food in carry → state = seek_food/eat).
**Cons:** Slightly tightens the deliver loop. Workers in the middle of a deliver at 21% hunger will abort. Mitigated by using 0.22 as the preempt threshold (vs 0.14 for normal seek) — only genuinely critical workers interrupt.

### Suggestion B — Surface dynamic events to objectiveLog and add HUD toast banner

**Mechanism:** In `WorldEventSystem`, after emitting `WAREHOUSE_FIRE` and `VERMIN_SWARM`, push a formatted line into `state.gameplay.objectiveLog` using the same `unshift + slice(0,24)` pattern used by `MortalitySystem` and `ProgressionSystem`. This immediately makes fire events visible in the EventPanel's "Recent log" section without any UI changes.

For higher-visibility, add a persistent HUD toast mechanism: a small `#criticalEventBanner` element in the HUD (below the resource bar, above the storyteller strip) that renders the most recent critical event (fire, worker death, food crisis) for 8 real seconds, then fades. The `HUDController.render()` poll checks `state.gameplay.objectiveLog[0]` for entries newer than 8 seconds and sets the banner text.

For resource runout, promote the "≈ Xs until empty" warning to also push a line into `state.gameplay.objectiveLog` (from HUDController's `#updateRunoutHints`) when it first crosses below 60 seconds, with a dedup guard keyed on `${resource}:runout:${Math.floor(eta/10)}`.

**Pros:** Closes the event-visibility gap for all three hidden-event types in one unified log. EventPanel already exists and renders the log. No new UI panel required.
**Cons:** Rapid-fire events (many warehouses catching fire) could flood the log — mitigated by the existing 24-entry cap and 30s dedup already in `recordWorkerEventMemory`.

---

## 3. Selected Approach

Both suggestions are complementary and non-exclusive. **Implement both** in priority order:

1. **Suggestion A first** — the starving-worker bug is the reviewer's #1 complaint and the most game-breaking. It has zero UX dependency.
2. **Suggestion B second** — event visibility is the reviewer's #3 complaint but structurally simpler to implement.

The resource depletion warning (Problem 3) is addressed as a lightweight addition inside Suggestion B's log-push mechanism, requiring no separate step.

---

## 4. Implementation Plan

### Step 1 — Add starvation preempt constants to balance config
**File:** `src/config/balance.js`
**Function/location:** top of the `BALANCE` freeze object (near `workerHungerSeekThreshold`)
**Change:** Add `workerStarvingPreemptThreshold: 0.22` and `workerCarryEatInEmergency: true`. These constants gate the new hard-interrupt and carry-eat behaviors, allowing tuning without code changes.

### Step 2 — Protect `seek_food` state from policy override in StatePlanner
**File:** `src/simulation/npc/state/StatePlanner.js`
**Function:** `isProtectedLocalState`
**Change:** Add `if (groupId === "workers" && (localState === "seek_food" || localState === "eat")) return true;`. This extends the protection already given to `deliver` to the hunger-survival states, closing the escape hatch where `applyPolicyIntentPreference` could push a hungry worker away from eating via a very-strong-signal work intent.

### Step 3 — Add hard starvation preempt block at top of `deriveWorkerDesiredState`
**File:** `src/simulation/npc/state/StatePlanner.js`
**Function:** `deriveWorkerDesiredState`
**Change:** Before the existing hunger hysteresis block (line 101), insert a new guard:
```js
const starvingThreshold = Number(BALANCE.workerStarvingPreemptThreshold ?? 0.22);
const hasFoodSource = (state.resources.food > 0 && state.buildings.warehouses > 0)
  || Number(worker.carry?.food ?? 0) > 0;
if (hunger < starvingThreshold && hasFoodSource) {
  return {
    desiredState: isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.WAREHOUSE])
      ? "eat"
      : "seek_food",
    reason: "rule:starving-preempt",
  };
}
```
This fires earlier than the 0.14 threshold, covers carry-food scenarios where `state.resources.food` is 0, and unconditionally wins before the deliver-hysteresis branch.

### Step 4 — Allow `consumeEmergencyRation` to consume from carry food
**File:** `src/simulation/npc/WorkerAISystem.js`
**Function:** `consumeEmergencyRation`
**Change:** After the `if (Number(state.resources.food ?? 0) <= 0) return;` guard, add a carry-food fallback path: if `state.resources.food <= 0` but `worker.carry.food > 0`, consume from carry instead. Keep the existing cooldown mechanism. Also remove the `if (worker.debug?.reachableFood) return;` guard for carry consumption (reachable food via warehouse is irrelevant when the food is already in hand).

```js
function consumeEmergencyRation(worker, state, dt, nowSec) {
  const eatRecoveryTarget = getWorkerEatRecoveryTarget(worker);
  const hungerNow = Number(worker.hunger ?? 0);
  if (hungerNow >= WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD) return;
  worker.blackboard ??= {};
  const nextAllowed = Number(worker.blackboard.emergencyRationCooldownSec ?? -Infinity);
  if (nowSec < nextAllowed) return;
  const recoveryPerFood = getWorkerRecoveryPerFoodUnit(worker);
  const eatRate = Number(BALANCE.hungerEatRatePerSecond ?? 5) * 0.22;
  const gainCap = Math.max(0, eatRecoveryTarget - hungerNow);
  const desiredFood = Math.min(eatRate * dt, gainCap / recoveryPerFood);
  // Prefer colony warehouse food; fall back to carried food in emergency
  const warehouseFood = Number(state.resources.food ?? 0);
  const carryFood = Number(worker.carry?.food ?? 0);
  if (warehouseFood <= 0 && carryFood <= 0) return;
  if (warehouseFood > 0 && !worker.debug?.reachableFood) {
    const eat = Math.min(desiredFood, warehouseFood);
    if (eat <= 0) return;
    state.resources.food -= eat;
    worker.hunger = clamp(worker.hunger + eat * recoveryPerFood, 0, 1);
  } else if (carryFood > 0) {
    const eat = Math.min(desiredFood, carryFood);
    if (eat <= 0) return;
    worker.carry.food = Math.max(0, carryFood - eat);
    worker.hunger = clamp(worker.hunger + eat * recoveryPerFood, 0, 1);
  }
  worker.blackboard.emergencyRationCooldownSec = nowSec + WORKER_EMERGENCY_RATION_COOLDOWN_SEC;
}
```

### Step 5 — Push fire and vermin events into objectiveLog
**File:** `src/world/events/WorldEventSystem.js`
**Function:** `checkWarehouseDensityRisk` (the function that calls `emitEvent` for `WAREHOUSE_FIRE` and `VERMIN_SWARM`, lines ~739 and ~763)
**Change:** After each `emitEvent` call, push a formatted line into `state.gameplay.objectiveLog`:
```js
// After WAREHOUSE_FIRE emitEvent:
if (state.gameplay) {
  if (!Array.isArray(state.gameplay.objectiveLog)) state.gameplay.objectiveLog = [];
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const lossTotal = Math.round(lossFood + lossWood + lossStone + lossHerbs);
  state.gameplay.objectiveLog.unshift(
    `[${nowSec.toFixed(1)}s] Warehouse fire at (${loc.ix},${loc.iz}) — ${lossTotal} resources lost`
  );
  state.gameplay.objectiveLog = state.gameplay.objectiveLog.slice(0, 24);
}
```
Apply the same pattern for `VERMIN_SWARM` with a distinct message string.

### Step 6 — Push resource-runout warnings into objectiveLog (with dedup)
**File:** `src/ui/hud/HUDController.js`
**Function:** `#updateRunoutHints` (the private method around line 1700 that writes "until empty" text)
**Change:** When `smoothed < 60` and the hint text is newly set (i.e., the previous frame was not already in warn-critical), push a single deduped line into `state.gameplay.objectiveLog`. Gate on a `_runoutLoggedAt` map per resource to avoid repeated pushes:
```js
// Inside the warn-critical branch:
const logKey = `${resource}:runout`;
const lastLogged = this._runoutLoggedAt?.[resource] ?? -Infinity;
if (nowSec - lastLogged > 45) {  // re-warn at most every 45s per resource
  this._runoutLoggedAt ??= {};
  this._runoutLoggedAt[resource] = nowSec;
  if (state.gameplay) {
    if (!Array.isArray(state.gameplay.objectiveLog)) state.gameplay.objectiveLog = [];
    state.gameplay.objectiveLog.unshift(
      `[${nowSec.toFixed(1)}s] Warning: ${resource} nearly depleted (< 60s)`
    );
    state.gameplay.objectiveLog = state.gameplay.objectiveLog.slice(0, 24);
  }
}
```

### Step 7 — Add EventPanel "Recent log" visibility boost (expand shown entries)
**File:** `src/ui/panels/EventPanel.js`
**Function:** `render`
**Change:** The current render shows only `objectiveLog.slice(0, 3)` entries. Increase to `slice(0, 6)` to give fire + runout events more surface area. Also apply CSS class `warn-critical` to lines containing keywords "fire", "depleted", "died" so they render in orange/red rather than muted gray. This is a pure UI change with no logic risk.

---

## 5. Risks and Verification

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `workerStarvingPreemptThreshold: 0.22` interrupts workers too aggressively, reducing harvest throughput | Medium | Threshold is above `workerHungerSeekThreshold` (0.14) but well below the `workerHungerRecoverThreshold` (0.35). Workers only break out at genuinely dangerous hunger levels. Monitor DevIndex regression in benchmark. |
| Carry-eat consumes food that should be delivered, reducing colony stock | Low | `consumeEmergencyRation` already has a per-worker cooldown of 2.8s and only fires at < 0.18 hunger. The carry deduction is tiny (eatRate × dt ≈ 0.05–0.1 units per tick). Net effect: 1 dead worker prevented per scenario vs. fractional carry loss. |
| `objectiveLog` floods with fire events if many warehouses are hot simultaneously | Low | The existing 30s dedup in `recordWorkerEventMemory` is per-tile. The new objectiveLog push needs its own 30s dedup keyed on `fire:${ix},${iz}` — add this guard in Step 5. |
| `#updateRunoutHints` runs in the render loop; adding `state.gameplay` mutation in a render method is an architectural smell | Low | Runout hint already reads `state` in render. The push is gated behind a 45s cooldown so it fires at most once per minute per resource. Acceptable short-term. |
| Step 2 (protect `seek_food` in `isProtectedLocalState`) may break tests that verify policy can redirect hungry workers | Low | Search test suite for "seek_food" + "policy" test cases; update expected outcomes. The behavioral contract change is intentional and aligns with stated design principle. |

### Verification Checklist

1. **Unit test — starving preempt:**
   Add `test/starvation-preempt.test.js`. Construct a worker with `hunger: 0.15`, `carry.food: 1.9`, `state.resources.food: 0`, `buildings.warehouses: 1`. Call `planEntityDesiredState`. Assert `desiredState === "seek_food"` and `reason` contains `"starving-preempt"`.

2. **Unit test — carry-eat emergency ration:**
   Construct worker with `hunger: 0.10`, `carry.food: 2.0`, `state.resources.food: 0`. Call `consumeEmergencyRation` with `dt: 0.1`. Assert `worker.hunger > 0.10` and `worker.carry.food < 2.0`.

3. **Unit test — objectiveLog fire entry:**
   Mock `WorldEventSystem`'s density risk path to fire. Assert `state.gameplay.objectiveLog[0]` contains `"fire"` and `"resources lost"`.

4. **Regression — existing 865 tests must pass unchanged.** Run `node --test test/*.test.js`.

5. **Manual smoke — Temperate Plains (Broken Frontier):** Observe Dova Vesper at < 20% hunger. Confirm she transitions to `seek_food` within 2 game seconds. Confirm Entity Focus panel shows `reason: rule:starving-preempt`.

6. **Manual smoke — Fortified Basin (Hollow Keep):** Wait for a warehouse fire event. Confirm the EventPanel "Recent log" shows a fire entry within 1 real second of the event occurring.

7. **Benchmark regression:** Run `node src/benchmark/BenchmarkRunner.js` with `standard` preset. DevIndex should not regress below the current 44 baseline.
