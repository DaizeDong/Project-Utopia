# Plan-PBB-recruit-flow-fix — Restore `foodProducedPerMin` Telemetry So Auto-Recruit Can Fire

**Plan ID:** Plan-PBB-recruit-flow-fix
**Source feedback:** `assignments/homework7/Final-Polish-Loop/Round10/Feedbacks/PBB-recruit-growth.md`
**Track:** code (correctness — load-bearing telemetry)
**Priority:** P0 **CRITICAL** — **FOUNDATIONAL BUG**
**Freeze policy:** hard
**Rollback anchor:** `d2a83b5`
**Estimated scope:** ~40 LOC across 3 files (1 prod, 1 prod-init, 1 test)

---

## Why this is foundational (read this first)

The `state.metrics.foodProducedPerMin` field is **structurally always 0** in shipped play because no code path calls `recordResourceFlow(state, "food", "produced", ...)` on the worker farm-deposit path (`WorkerAISystem.js:846`). Consumed and spoiled flows ARE recorded correctly (`ResourceSystem.js:390,418`, `ProcessingSystem.js:184`), so the metric was a HUD curiosity from before R5 — *until R5 PC built a load-bearing population-growth gate on top of it*:

> `BALANCE.recruitMinFoodHeadroomSec = 60` — `RecruitmentSystem` refuses to add to the recruit queue unless projected `food / drainRate ≥ 60s`.

With `producedPerMin = 0`, `drainRate = workersCount × 0.6` and headroom is **`food / (workers × 0.6)`** ≈ 44s for 12 workers + 320 food. **Mathematically unsatisfiable** in early-mid game. The PBB Playwright trace confirmed: 80 sim-seconds, autopilot ON, LLM driving, `birthsTotal = 0`, `recruitTotal = undefined`, `recruitQueue` stuck at 0, `populationGrowthBlockedReason = "food headroom 40s < 60s (auto-fill skipped)"` for the entire run.

**R5 PC weaponised a pre-existing broken metric.** Any subsequent plan that touches `foodHeadroomSec` (R6 PC pacing cooldown, R8 Iter 4 recruit cap, anything that reads `foodProducedPerMin`) is currently dead code. This plan restores the metric so every dependent gate becomes meaningful instead of a permanent "no" switch.

## Hard-freeze posture

NO new tile / role / building / mood / mechanic / audio / UI panel. Touch only:
- One existing function call (`recordResourceFlow`) added at one existing mutation site.
- One defensive default initialisation for an existing-but-uninitialised metric field.
- One new invariant test exercising the existing harness.

No new BALANCE knobs, no new systems, no new HUD elements, no new resource categories. The `recordResourceFlow` helper, `_resourceFlowAccum.food.produced` slot, and `foodProducedPerMin` derivation already exist — we are filling in a missing call site, not creating a new pipeline.

---

## Atomic steps

### Step 1 — Add the missing produced-flow record at worker farm-deposit

**File:** `src/simulation/npc/WorkerAISystem.js:846` (the warehouse unload path)

**Before:**
```js
state.resources.food += unloadFood;
```

**After:**
```js
state.resources.food += unloadFood;
recordResourceFlow(state, "food", "produced", unloadFood);
```

Confirm `recordResourceFlow` is already imported at the top of `WorkerAISystem.js`. If not (likely — production-side recording was previously absent from this file), add to the existing import block:

```js
import { recordResourceFlow } from "../economy/ResourceSystem.js";
```

(Path may differ — match the existing relative-import convention used by the file's other economy-system imports. No new dependency edge created; the helper is already exported.)

### Step 1b — Audit and patch the bootstrap-no-warehouse direct-deposit path

The v0.8.6 Tier 0 fix added a "FARM workers deposit directly to `state.resources.food` when no warehouse exists" safety net. Per the feedback's Files-Touched section, this is also a silent mutation. Grep within `WorkerAISystem.js` for any other `state.resources.food +=` lines (the feedback notes the bootstrap path specifically) and add the same `recordResourceFlow(state, "food", "produced", amount)` call after each. Estimated: 1–2 additional sites in the same file.

If a sister grain (raw `state.resources.wood +=`, `.stone +=`, `.herbs +=`) exists at the same site for the worker harvest pipeline, the feedback flags those as **likely affected by the same telemetry bug** but NOT load-bearing under R5 PC's gate. **Out of scope for this hard-freeze plan** — record as follow-up in CHANGELOG. We touch ONLY food because food is what gates recruit; touching wood/stone/herb production telemetry expands the change surface beyond the foundational bug.

### Step 2 — Defensively initialise `state.metrics.recruitTotal = 0`

**File:** Locate the metrics-initialisation site (the feedback notes "only incremented inside the spawn branch at `PopulationGrowthSystem.js:262`"; never initialised elsewhere). Most likely `state.metrics` initial-shape definition lives in `src/state/createInitialState.js` or `src/simulation/economy/MetricsSystem.js` or is constructed in `RecruitmentSystem.constructor`. Use Grep `metrics:\s*{` and `state.metrics =` to find the canonical site.

Add `recruitTotal: 0,` next to the existing `birthsTotal: 0,` field in the metrics-shape literal. If no canonical shape exists, add `state.metrics.recruitTotal = state.metrics.recruitTotal ?? 0;` once at the top of `RecruitmentSystem.update` (before any branch).

This prevents `state.metrics.recruitTotal + 1 → NaN` in any downstream consumer, per the feedback's Secondary Findings #1.

### Step 3 — Add an invariant test for the metric pipeline

**File:** Create `test/recruit-food-flow-invariant.test.js` (new test file is permitted under hard-freeze — tests are not gameplay).

Test shape:
1. Build a minimal harness state with 1 worker carrying `unloadFood = 10` and a warehouse at the worker's tile (use existing test fixtures for consistency — pattern from `test/economy-flow.test.js` if present, otherwise `test/worker-deposit.test.js` analogue).
2. Tick the worker once via `WorkerAISystem.update` (or call the deposit branch directly per existing test conventions).
3. Manually call the existing flow-flush (the feedback notes the flush at `ResourceSystem.js:579`) — typically `flushResourceFlows(state, dt)` or whatever helper computes `foodProducedPerMin` from the accumulator.
4. Assert: `state.metrics.foodProducedPerMin > 0` after a non-zero deposit. Stronger: assert the per-minute projection equals `unloadFood × (60 / dt)` within a tolerance.
5. Negative-control: with `unloadFood = 0` (worker carries nothing), assert `foodProducedPerMin === 0`.

This test is the canary that ensures a future refactor cannot silently re-break the production-side telemetry.

### Step 4 — Run the suite and confirm green

`node --test test/*.test.js` — baseline 1646 pass / 0 fail / 2 skip per CLAUDE.md v0.10.0 line. The new invariant test adds one passing case. Existing recruit / population / economy tests must stay green; if any of them previously asserted `foodProducedPerMin === 0` as a "current behaviour" comment, that assertion was *wrong* and should flip — note in CHANGELOG.

### Step 5 — Manual Playwright re-verification (matches PBB methodology)

Re-run the PBB scenario: `localhost:19090/?dev=1`, `alpha_broken_frontier`, `setAiEnabled(true,{coverageTarget:"llm"})`, `timeScale=8`. Sample at 80 sim-seconds. Expected: `foodProducedPerMin > 0` once farms are harvesting; `foodHeadroomSec` rises above 60 when production matches eat-rate; `recruitQueue` increments; `birthsTotal > 0`. No code change required — pure verification.

---

## Suggestions (≥2, ≥1 not freeze-violating)

### Suggestion A (in-freeze, RECOMMENDED — proper fix per feedback Option A) — Steps 1–5 as written

The feedback ranked Option A as "proper fix." This plan implements it. Restores telemetry truth so every existing gate (R5 PC, R6 PC pacing, future plans) becomes meaningful. Hard-freeze compliant: no new mechanics, only a missing helper-call addition and a defensive init.

### Suggestion B (in-freeze, BELT-AND-BRACES) — Add Option D defensive guard inside `computeFoodHeadroomSec`

Layered safety: in `src/simulation/population/PopulationGrowthSystem.js:69-77`, add a guard at the top of `computeFoodHeadroomSec`:

```js
const farmsPresent = (state?.buildings?.farms ?? 0) > 0;
const producedPerMin = Number(state?.metrics?.foodProducedPerMin ?? 0);
if (producedPerMin === 0 && farmsPresent) {
  // Telemetry-broken-but-farms-exist fallback: assume net-positive so the gate doesn't deadlock.
  return Infinity;
}
// ...existing body
```

This is a defensive layer that survives even if a future refactor accidentally re-breaks `recordResourceFlow` at the deposit site. Does NOT replace Step 1 — it backstops it. Hard-freeze compliant: existing function, existing field reads, no new mechanic.

### Suggestion C (FREEZE-VIOLATING — flagged, do not ship in R10) — Lower `BALANCE.recruitMinFoodHeadroomSec` 60 → 20

The feedback's Option C. Tempting one-liner. **Rejected for R10** because:
1. It changes a balance knob without addressing root cause; future plans that read `foodHeadroomSec` would still see the broken metric.
2. Hard-freeze under the spec includes BALANCE-only "no new mechanic" but a 3× threshold reduction is a behavioural shift in the population-growth gate that the user-facing experience changes around.
3. Once Step 1 lands, the existing 60s threshold becomes meaningful and the whole tuning conversation reopens with real data.

Tagged as candidate for v0.10.2 if the *post-Step-1* trace shows the 60s threshold is still too aggressive given real production rates.

---

## Acceptance criteria

1. `node --test test/recruit-food-flow-invariant.test.js` passes (Step 3 new test).
2. `node --test test/*.test.js` full baseline preserved (1646 pass / 0 fail / 2 skip).
3. Playwright re-run of PBB scenario (Step 5): within 80 sim-seconds, `state.metrics.foodProducedPerMin > 0` AND `state.metrics.birthsTotal > 0` (i.e. at least one auto-recruit fired). `populationGrowthBlockedReason` may transiently read "food headroom" but does NOT stay there for the entire run.
4. `state.metrics.recruitTotal` is a finite number (not `undefined`, not `NaN`) at any point in the run.
5. Zero new BALANCE keys, zero new systems, zero new HUD elements.

## Rollback procedure

`git checkout d2a83b5 -- src/simulation/npc/WorkerAISystem.js src/simulation/population/PopulationGrowthSystem.js && rm test/recruit-food-flow-invariant.test.js` reverts cleanly. Note: the `RecruitmentSystem.update` defensive `??= 0` (Step 2 fallback variant) is forward-compatible with the rollback — it just becomes a no-op once the field re-disappears.

---

## Note on dependencies

This plan is the **prerequisite** for any future plan that consumes `foodProducedPerMin`, `foodHeadroomSec`, or `recruitTotal`. R5 PC (recruit-flow-rate-gate), R6 PC (recruit-cooldown pacing, currently dead code per feedback Secondary Finding #4), R8 Iter 4 (recruitTarget cap raise) all built on top of a metric that always reported 0. Landing this plan first means subsequent tuning plans will have ground truth to tune against.
