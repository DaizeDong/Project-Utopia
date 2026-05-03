# Plan-PEE-goal-attribution — Recognise Warehouse-on-Depot Completion + Fix "First Extra" Toast Misnomer

**Plan ID:** Plan-PEE-goal-attribution
**Source feedback:** `assignments/homework7/Final-Polish-Loop/Round10/Feedbacks/PEE-holistic-rank.md`
**Track:** code (scenario / objective tracker; toast string)
**Priority:** P1 (single biggest holistic-fun killer per PEE's "most frustrating moment"; gates the slide-arrest narrative R10 is pursuing)
**Freeze policy:** hard
**Rollback anchor:** `d2a83b5`
**Estimated scope:** ~40 LOC across 2 files (1 prod, 1 test)

---

## Problem statement (one paragraph)

PEE's blind playthrough hit the canonical "told me what to do but not when I'd done it" wall: the briefing reads *"clear a path back, then rebuild the east warehouse,"* the player places a warehouse at (53,36) on the literal east-ruined-depot tile, the toast confirms "Warehouse at (53,36) creates the first delivery anchor for the colony," the structure completes — and 70 sim-seconds later `state.scenario.frontier.connectedRoutes = 0/1`, `readyDepots = 0/1`, `unreadyDepots = ['east ruined depot']`. The objective tracker never dequeued the depot from `unreadyDepots` despite the on-tile blueprint completing. Compounding: the action toast then announces *"First extra Warehouse raised"* — calling the player's *only* warehouse the "extra" one, gaslighting them into thinking a phantom warehouse already exists. This plan adds the dequeue hook on warehouse-blueprint-completion-on-depot-tile, rewrites the toast to be unambiguous, and tests the round-trip.

## Hard-freeze posture

NO new tile / role / building / mood / mechanic / audio / UI panel. Touch only:
- One blueprint-completion hook in the existing scenario / objective tracker file (the hook fires on existing event; we add the dequeue logic, not the event).
- One toast string change in the existing toast emitter for the warehouse-completion case.
- One test fixture exercising the round-trip.

No new event types, no new objective categories, no new HUD pill (PEE Suggestion #3 mentions a "Frontier 0/2" pill — that IS a new HUD element and is therefore explicitly out-of-scope for this hard-freeze plan; see Suggestion C below).

---

## Atomic steps

### Step 1 — Locate the scenario / objective tracker

**Action:** Find the file that owns `state.scenario.frontier.unreadyDepots` and `connectedRoutes`. Likely candidates per CLAUDE.md's directory layout:
- `src/world/scenarios/` (scenario-specific objective definitions)
- `src/simulation/meta/` (meta-progression / scenario-tracking system)
- `src/state/scenario.js` (state shape)

Use `Grep "unreadyDepots"` then `Grep "frontier.*connectedRoutes"` to find:
1. The shape definition (where the `unreadyDepots` array is initialised with `['east ruined depot']`).
2. The reader (where the array is consumed — likely the Storyteller / HUD / Best-Runs board).
3. The (currently MISSING) writer that should dequeue when a warehouse completes on the depot tile.

The writer is the bug surface — it doesn't exist or is wired to the wrong event. Identify the canonical "blueprint completed" event that fires when worker-driven construction (v0.8.4 Phase 11) finishes — likely `BlueprintCompletedEvent` or a system in `src/simulation/construction/`.

### Step 2 — Add the dequeue hook on blueprint-completion-on-depot-tile

**Strategy:** Subscribe the scenario tracker to the existing blueprint-completion event. On each completion, check if `event.tileType === TILE.WAREHOUSE` AND `(event.x, event.z)` matches a tile in `state.scenario.frontier.unreadyDepots[i].tile`. If yes, splice it out of `unreadyDepots`, push a corresponding entry into `readyDepots`, and increment `connectedRoutes` if the route to colony centre is connected.

**File:** the scenario tracker file located in Step 1 (most likely `src/simulation/meta/ScenarioObjectiveSystem.js` or similar — name will resolve in Step 1).

**Add (sketch — exact field names per Step 1's locator output):**

```js
// PEE R10: dequeue depot when warehouse blueprint completes on its tile.
function onBlueprintCompleted(event, state) {
  if (event.tileType !== TILE.WAREHOUSE) return;
  const frontier = state?.scenario?.frontier;
  if (!frontier?.unreadyDepots?.length) return;

  for (let i = frontier.unreadyDepots.length - 1; i >= 0; i--) {
    const depot = frontier.unreadyDepots[i];
    // depot.tile is { x, z } per scenario-init shape (verify in Step 1)
    if (depot.tile?.x === event.x && depot.tile?.z === event.z) {
      frontier.unreadyDepots.splice(i, 1);
      frontier.readyDepots = frontier.readyDepots ?? [];
      frontier.readyDepots.push(depot);
      // connectedRoutes counts depots reachable by road; if the depot has road
      // connectivity to the colony anchor, increment. Reuse existing reachability.
      if (isRoadConnected(state, depot.tile, state.scenario.colonyAnchor)) {
        frontier.connectedRoutes = (frontier.connectedRoutes ?? 0) + 1;
      }
      break;
    }
  }
}
```

Subscribe `onBlueprintCompleted` to whatever event-bus channel the construction-completion events fire on. The v0.8.4 Phase 11 added the worker-driven construction pipeline — the completion event already exists, we are just adding a listener.

If `state.scenario.colonyAnchor` doesn't exist as a field, fall back to `state.colony.centerTile` or the first warehouse position — match the convention used elsewhere in the scenario tracker.

### Step 3 — Rewrite the misleading "first extra Warehouse" toast

**Action:** Grep `"first extra Warehouse"` in `src/` to find the toast emission site (likely in the toast-emitter or in the warehouse-completion handler).

**Before** (paraphrased):
```js
emitToast(`First extra Warehouse raised: The logistics net has a second anchor`);
```

**After:**
```js
// PEE R10: toast must reflect actual scenario-goal recognition state, not
// imply a phantom prior warehouse.
const isFirstWarehouse = (state?.metrics?.warehousesBuiltTotal ?? 0) <= 1;
const isOnDepot = wasBuiltOnUnreadyDepot(event, state); // helper added in Step 2

let message;
if (isOnDepot && isFirstWarehouse) {
  message = `First Warehouse covers east depot — frontier route 1/1 ✓`;
} else if (isOnDepot) {
  message = `Warehouse covers east depot — frontier route ✓`;
} else if (isFirstWarehouse) {
  message = `First Warehouse raised: delivery anchor established`;
} else {
  message = `Warehouse raised: extra logistics anchor`;
}
emitToast(message);
```

The "first extra" string is gone in all branches. The on-depot recognition is now narrated in the toast itself — closing the cause→effect loop PEE called out as the holistic-fun killer.

If the depot orientation isn't always "east" (other scenarios use other directions), pull the depot label from the matched `depot.label` field (e.g. `depot.label = "east ruined depot"` → strip "ruined" for a cleaner toast: `Warehouse covers east depot ✓`).

### Step 4 — Add a round-trip test

**File:** Create `test/scenario-frontier-depot-dequeue.test.js` (new test file is permitted under hard-freeze).

Test flow:
1. Build a minimal harness state with `state.scenario.frontier.unreadyDepots = [{ tile: { x: 53, z: 36 }, label: "east ruined depot" }]`.
2. Fire the blueprint-completion event for `tileType: TILE.WAREHOUSE, x: 53, z: 36`.
3. Assert `state.scenario.frontier.unreadyDepots.length === 0`.
4. Assert `state.scenario.frontier.readyDepots.length === 1`.
5. Assert `state.scenario.frontier.connectedRoutes >= 0` (1 if road-connected, 0 if not — depends on fixture; just confirm field updates).
6. Negative-control: blueprint completion at a non-depot tile leaves `unreadyDepots` unchanged.
7. Toast assertion: capture the emitted toast string and assert it matches `/Warehouse covers east depot/` AND does NOT match `/first extra/`.

### Step 5 — Run the suite and confirm green

`node --test test/*.test.js` — baseline preserved. Existing scenario / objective tests must stay green; if any test asserted the old "first extra" toast, update.

### Step 6 — Manual Playwright re-verification (matches PEE methodology)

Re-run PEE's exact scenario: cold-start at `localhost:19090/`, Temperate Plains / Broken Frontier, default seed. Place warehouse at the east-ruined-depot tile per the briefing. Within 5 sim-seconds of blueprint completion, expect the toast to read `Warehouse covers east depot ✓` (or similar) AND `state.scenario.frontier.unreadyDepots` to be empty AND `connectedRoutes` to read `1/1` (or `0/1` with road-connectivity pending — but NOT stuck at `0/1` with the depot still in `unreadyDepots`).

---

## Suggestions (≥2, ≥1 not freeze-violating)

### Suggestion A (in-freeze, RECOMMENDED) — Steps 1–6 as written

Single missing event subscription + toast string rewrite + test. No new mechanic, no new HUD. Closes the "told me what to do but not when I'd done it" loop using existing event infrastructure (the blueprint-completion event already fires; nothing was listening on the scenario-tracker side for the on-depot match).

### Suggestion B (in-freeze, MINIMAL VARIANT) — Step 3 only (toast fix), defer Step 2 to v0.10.2

If the scenario-tracker subscription is judged too invasive (it adds a new event listener into a system file that may have its own update-order constraints), ship Step 3 alone: rewrite the toast to drop "first extra" and add unambiguous wording ("First Warehouse covers east depot — frontier route 1/1 ✓"). Even if `unreadyDepots` still doesn't dequeue server-side, the toast at least confirms to the player that the scenario goal was recognized at the moment of completion. The internal state desync remains a latent bug but the player-facing experience is materially less frustrating.

This is the lower-risk variant that addresses ~70% of PEE's "most frustrating moment" without touching the objective-tracker subscription graph.

### Suggestion C (FREEZE-VIOLATING — flagged, do not ship in R10) — Add the "Frontier 0/2 ✕ depot ✕ route" HUD pill

PEE's Suggestion #3 — a top-banner pill that promotes scenario-goal completion next to the run timer. **NEW HUD element = freeze violation.** Tagged for v0.10.2. Without this pill, the toast (Step 3) and the dequeue (Step 2) are the only feedback channels — sufficient for R10, but PEE's "promote scenario-goal completion to chrome" point is the next-round polish.

### Suggestion D (FREEZE-VIOLATING — flagged, do not ship in R10) — Cyan ring on scenario-goal tiles

PEE's Suggestion #1 — a 1-tile cyan ring on the literal east-ruined-depot ruin tile so the player knows where to build. **NEW renderer overlay = freeze violation.** Tagged for v0.10.2. Without it, the briefing's text label is the only positional cue; this plan can't fix that under hard-freeze.

---

## Acceptance criteria

1. `node --test test/scenario-frontier-depot-dequeue.test.js` passes all assertions (Step 4).
2. `node --test test/*.test.js` baseline preserved (note any toast-text-assertion flips).
3. Manual repro (Step 6): warehouse on east-ruined-depot tile dequeues the depot from `unreadyDepots` AND emits a toast that does NOT contain "first extra."
4. PEE's "most frustrating moment" is removed: the player no longer sees `unreadyDepots: ['east ruined depot']` 70 seconds after building a warehouse on that exact tile.
5. No new HUD elements, no new event types, no new TILE ids, no new BALANCE keys (the `TRAFFIC_AMORTIZATION` from PDD is unrelated; this plan touches no constants).

## Rollback procedure

`git checkout d2a83b5 -- <scenario-tracker-file> <toast-emitter-file> && rm test/scenario-frontier-depot-dequeue.test.js` reverts cleanly. Exact filenames resolved in Step 1.
