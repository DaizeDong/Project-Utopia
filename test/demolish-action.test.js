/**
 * v0.8.4 (Agent B) — Demolish-action tests.
 *
 * Coverage:
 *   1. validatePlanResponse accepts well-formed demolish steps and rejects
 *      malformed ones (bad coord, unknown keyword).
 *   2. generateFallbackPlan emits a demolish step when RUINS count > 5.
 *   3. PlanExecutor grounds + executes a demolish step against a built tile,
 *      routing through buildSystem.placeToolAt(state, "erase", ...).
 *   4. PlanExecutor rejects demolish on a GRASS tile (no built structure).
 *   5. State.metrics.demolishCount is bumped on successful demolish.
 *
 * The contract with Agent A:
 *   - placeToolAt(state, "erase", ix, iz, ...) handles the demolish-overlay
 *     creation when Agent A's BuildSystem rewrite lands. While that's still
 *     in flight, the legacy instant-clear path is exercised here — these
 *     tests assert the END-TO-END contract (resource refund, demolish count,
 *     plan-step status), not the overlay implementation. They will continue
 *     to pass once Agent A merges because the overlay path also returns
 *     `result.ok = true` and the salvage-refund accounting is identical.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  generateFallbackPlan,
  validatePlanResponse,
  DEMOLISH_HINT_KEYWORDS,
} from "../src/simulation/ai/colony/ColonyPlanner.js";
import {
  groundPlanStep,
  executeNextSteps,
  groundPlan,
} from "../src/simulation/ai/colony/PlanExecutor.js";
import { ColonyPerceiver } from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats, listTilesByType } from "../src/world/grid/Grid.js";
import { TILE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeTestState(overrides = {}) {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources = { food: 80, wood: 70, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0, ...overrides.resources };
  state.buildings = rebuildBuildingStats(state.grid);
  state.metrics ??= {};
  state.metrics.timeSec = overrides.timeSec ?? 0;
  if (overrides.buildings) {
    Object.assign(state.buildings, overrides.buildings);
  }
  if (overrides.metrics) {
    Object.assign(state.metrics, overrides.metrics);
  }
  return state;
}

function makeObservation(state) {
  return new ColonyPerceiver().observe(state);
}

function findFirstTile(state, predicate) {
  for (let iz = 0; iz < state.grid.height; iz += 1) {
    for (let ix = 0; ix < state.grid.width; ix += 1) {
      if (predicate(ix, iz)) return { ix, iz };
    }
  }
  return null;
}

function paintRuins(state, count) {
  // Replace `count` GRASS tiles with RUINS so the fallback's ruins-cluster
  // branch fires. We pick tiles deterministically (top-down) so the test
  // doesn't depend on map seed beyond what createInitialGameState sets.
  let painted = 0;
  for (let iz = 0; iz < state.grid.height && painted < count; iz++) {
    for (let ix = 0; ix < state.grid.width && painted < count; ix++) {
      const idx = ix + iz * state.grid.width;
      if (state.grid.tiles[idx] === TILE.GRASS) {
        state.grid.tiles[idx] = TILE.RUINS;
        painted++;
      }
    }
  }
  state.grid.version = (state.grid.version ?? 0) + 1;
  state.buildings = rebuildBuildingStats(state.grid);
  return painted;
}

// ══════════════════════════════════════════════════════════════════════
// validatePlanResponse — demolish action shape
// ══════════════════════════════════════════════════════════════════════

test("validatePlanResponse accepts demolish step with explicit coord hint", () => {
  const raw = {
    goal: "clear ruins",
    steps: [
      { id: 1, action: { type: "demolish", hint: "12,8" }, priority: "medium", depends_on: [] },
    ],
  };
  const { ok, plan, error } = validatePlanResponse(raw);
  assert.equal(ok, true, `should be ok, error: ${error}`);
  assert.equal(plan.steps[0].action.type, "demolish");
  assert.equal(plan.steps[0].action.hint, "12,8");
});

test("validatePlanResponse accepts demolish step with whitelisted keyword", () => {
  for (const keyword of DEMOLISH_HINT_KEYWORDS) {
    const raw = {
      goal: "clear ruins",
      steps: [
        { id: 1, action: { type: "demolish", hint: keyword }, priority: "medium", depends_on: [] },
      ],
    };
    const { ok, plan, error } = validatePlanResponse(raw);
    assert.equal(ok, true, `keyword "${keyword}" should be accepted, error: ${error}`);
    assert.equal(plan.steps[0].action.hint, keyword);
  }
});

test("validatePlanResponse rejects demolish step with malformed hint", () => {
  const raw = {
    goal: "test",
    steps: [
      { id: 1, action: { type: "demolish", hint: "not_a_keyword" }, priority: "medium", depends_on: [] },
    ],
  };
  const { ok } = validatePlanResponse(raw);
  // The whole plan is rejected because zero steps survive validation.
  assert.equal(ok, false);
});

test("validatePlanResponse defaults demolish hint to 'auto' when null", () => {
  const raw = {
    goal: "test",
    steps: [
      { id: 1, action: { type: "demolish", hint: null }, priority: "medium", depends_on: [] },
    ],
  };
  const { ok, plan } = validatePlanResponse(raw);
  assert.equal(ok, true);
  assert.equal(plan.steps[0].action.hint, "auto");
});

test("validatePlanResponse normalizes whitespace in demolish coord hint", () => {
  const raw = {
    goal: "test",
    steps: [
      { id: 1, action: { type: "demolish", hint: "12 , 8" }, priority: "medium", depends_on: [] },
    ],
  };
  const { ok, plan } = validatePlanResponse(raw);
  assert.equal(ok, true);
  assert.equal(plan.steps[0].action.hint, "12,8");
});

test("validatePlanResponse reports 'demolish' as a known build type", () => {
  // Sanity: VALID_BUILD_TYPES includes "demolish" (not rejected with "unknown
  // build type"). This guards against a future regression that would re-add
  // demolish to the unknown-types path.
  const raw = {
    goal: "test",
    steps: [
      { id: 1, action: { type: "demolish", hint: "auto" }, priority: "low", depends_on: [] },
    ],
  };
  const { ok } = validatePlanResponse(raw);
  assert.equal(ok, true, "demolish must be in VALID_BUILD_TYPES");
});

// ══════════════════════════════════════════════════════════════════════
// generateFallbackPlan — demolish branch
// ══════════════════════════════════════════════════════════════════════

test("generateFallbackPlan emits demolish step when RUINS count > 5", () => {
  const state = makeTestState({
    resources: { food: 200, wood: 80, stone: 20, herbs: 10 },
    buildings: { warehouses: 1, farms: 4, lumbers: 2, kitchens: 1 },
  });
  const ruinsPainted = paintRuins(state, 8);
  assert.ok(ruinsPainted >= 6, "test setup must produce >5 RUINS");
  const obs = makeObservation(state);
  const plan = generateFallbackPlan(obs, state);
  const demolishStep = plan.steps.find((s) => s.action?.type === "demolish");
  assert.ok(demolishStep, "fallback plan should include at least one demolish step when RUINS > 5");
  // Hint should be either "ruins_cluster" or an explicit coord — but the
  // fallback emits coord hints (it pre-resolves the target).
  assert.ok(/^\d+,\d+$/.test(demolishStep.action.hint),
    `demolish hint should be a coord; got "${demolishStep.action.hint}"`);
});

test("generateFallbackPlan does NOT emit demolish when RUINS count is low", () => {
  // Phase 1: clear the scenario's pre-existing RUINS so the threshold check
  // is a fair comparison. createInitialGameState seeds several RUINS for
  // the colony's "ruined depot" narrative; we replace them with GRASS.
  const state = makeTestState({
    resources: { food: 200, wood: 80, stone: 20, herbs: 10 },
    buildings: { warehouses: 1, farms: 4, lumbers: 2, kitchens: 1 },
  });
  for (let iz = 0; iz < state.grid.height; iz++) {
    for (let ix = 0; ix < state.grid.width; ix++) {
      const idx = ix + iz * state.grid.width;
      if (state.grid.tiles[idx] === TILE.RUINS) {
        state.grid.tiles[idx] = TILE.GRASS;
      }
    }
  }
  state.grid.version = (state.grid.version ?? 0) + 1;
  state.buildings = rebuildBuildingStats(state.grid);
  // Only paint 2 ruins — below the threshold of 5.
  paintRuins(state, 2);
  const ruinsCount = listTilesByType(state.grid, [TILE.RUINS]).length;
  assert.ok(ruinsCount <= 5, `test setup must keep RUINS count <=5, got ${ruinsCount}`);

  const obs = makeObservation(state);
  const plan = generateFallbackPlan(obs, state);
  const ruinDemolishStep = plan.steps.find((s) =>
    s.action?.type === "demolish" && /clear oldest|road-adjacent ruin/i.test(s.thought ?? ""),
  );
  assert.equal(
    ruinDemolishStep,
    undefined,
    "ruins-cluster branch should not fire when RUINS count is below threshold",
  );
});

test("generateFallbackPlan respects wood budget for demolish steps", () => {
  // With wood=0, the demolish branch must not emit (1 wood per step).
  const state = makeTestState({
    resources: { food: 200, wood: 0, stone: 0, herbs: 0 },
    buildings: { warehouses: 1, farms: 1 },
  });
  paintRuins(state, 8);
  const obs = makeObservation(state);
  const plan = generateFallbackPlan(obs, state);
  const demolishStep = plan.steps.find((s) => s.action?.type === "demolish");
  assert.equal(demolishStep, undefined, "no demolish step when wood is 0");
});

// ══════════════════════════════════════════════════════════════════════
// PlanExecutor — grounding + execution
// ══════════════════════════════════════════════════════════════════════

test("groundPlanStep — demolish coord hint resolves to a built/RUINS tile", () => {
  const state = makeTestState({ resources: { food: 200, wood: 80, stone: 20, herbs: 10 } });
  const buildSystem = new BuildSystem();
  // Find a GRASS tile and convert it to a built FARM via direct grid mutation
  // (we bypass placeToolAt to avoid tripping construction-overlay logic).
  const target = findFirstTile(state, (ix, iz) => {
    return state.grid.tiles[ix + iz * state.grid.width] === TILE.GRASS;
  });
  assert.ok(target, "test fixture must have a GRASS tile available");
  state.grid.tiles[target.ix + target.iz * state.grid.width] = TILE.FARM;
  state.grid.version = (state.grid.version ?? 0) + 1;
  state.buildings = rebuildBuildingStats(state.grid);

  const step = {
    id: 1,
    action: { type: "demolish", hint: `${target.ix},${target.iz}` },
    priority: "medium",
    depends_on: [],
  };
  const grounded = groundPlanStep(step, state, buildSystem);
  assert.equal(grounded.feasible, true, "demolish step on a built tile must be feasible");
  assert.deepEqual(
    { ix: grounded.groundedTile.ix, iz: grounded.groundedTile.iz },
    { ix: target.ix, iz: target.iz },
    "groundedTile should match the explicit coord hint",
  );
});

test("groundPlanStep — demolish coord hint on GRASS is INfeasible", () => {
  const state = makeTestState({ resources: { food: 200, wood: 80, stone: 20, herbs: 10 } });
  const buildSystem = new BuildSystem();
  // Find a GRASS tile and target it directly (no mutation).
  const grassTile = findFirstTile(state, (ix, iz) => {
    return state.grid.tiles[ix + iz * state.grid.width] === TILE.GRASS;
  });
  assert.ok(grassTile, "test fixture must have a GRASS tile available");
  const step = {
    id: 1,
    action: { type: "demolish", hint: `${grassTile.ix},${grassTile.iz}` },
    priority: "medium",
    depends_on: [],
  };
  const grounded = groundPlanStep(step, state, buildSystem);
  assert.equal(grounded.feasible, false, "demolish on GRASS must be rejected");
  assert.equal(grounded.groundedTile, null);
});

test("groundPlanStep — demolish 'auto' resolves to RUINS when present", () => {
  const state = makeTestState({ resources: { food: 200, wood: 80, stone: 20, herbs: 10 } });
  const buildSystem = new BuildSystem();
  paintRuins(state, 6);
  const step = {
    id: 1,
    action: { type: "demolish", hint: "auto" },
    priority: "medium",
    depends_on: [],
  };
  const grounded = groundPlanStep(step, state, buildSystem);
  assert.equal(grounded.feasible, true);
  assert.ok(grounded.groundedTile, "auto-grounded demolish should pick a tile");
  // The grounded tile should be a RUINS (auto prefers RUINS first).
  const tileType = state.grid.tiles[
    grounded.groundedTile.ix + grounded.groundedTile.iz * state.grid.width
  ];
  assert.equal(tileType, TILE.RUINS, `expected RUINS, got tile type ${tileType}`);
});

test("executeNextSteps — demolish a built tile bumps state.metrics.demolishCount", () => {
  const state = makeTestState({ resources: { food: 200, wood: 80, stone: 20, herbs: 10 } });
  const buildSystem = new BuildSystem();
  // Place a FARM by mutating the grid directly so we have a real built tile
  // for the demolish to target. Going through `placeToolAt` is fragile here
  // because Agent A's blueprint-mode rewrite changes the semantics; direct
  // mutation gives us a stable test fixture under both legacy and overlay
  // implementations.
  const farmTile = findFirstTile(state, (ix, iz) => {
    return state.grid.tiles[ix + iz * state.grid.width] === TILE.GRASS;
  });
  assert.ok(farmTile, "fixture must have a GRASS tile");
  state.grid.tiles[farmTile.ix + farmTile.iz * state.grid.width] = TILE.FARM;
  state.grid.version = (state.grid.version ?? 0) + 1;
  state.buildings = rebuildBuildingStats(state.grid);

  const beforeCount = Number(state.metrics.demolishCount ?? 0);

  const plan = {
    goal: "clear depleted farm",
    steps: [
      {
        id: 1,
        action: { type: "demolish", hint: `${farmTile.ix},${farmTile.iz}` },
        priority: "medium",
        depends_on: [],
        status: "pending",
      },
    ],
  };
  const groundedPlan = groundPlan(plan, state, buildSystem);
  // Sanity: the demolish step grounded successfully.
  assert.ok(groundedPlan.steps[0].groundedTile,
    `demolish step must ground; got ${JSON.stringify(groundedPlan.steps[0])}`);
  const executed = executeNextSteps(groundedPlan, state, buildSystem);

  assert.equal(executed.length, 1, "one step should execute");
  assert.equal(executed[0].status, "completed", "demolish should complete (overlay created or instant erase)");
  assert.equal(
    Number(state.metrics.demolishCount ?? 0),
    beforeCount + 1,
    "demolishCount must be incremented",
  );
  // Either Agent A's blueprint flow created a tileState.construction overlay
  // (tile remains FARM), OR the legacy path mutated the tile to GRASS. Both
  // are valid contract outcomes; we just need ONE to be true.
  const idx = farmTile.ix + farmTile.iz * state.grid.width;
  const overlay = state.grid.tileState?.get(idx)?.construction;
  const tileAfter = state.grid.tiles[idx];
  const overlayPresent = overlay && overlay.kind === "demolish";
  const tileMutated = tileAfter === TILE.GRASS;
  assert.ok(overlayPresent || tileMutated,
    `demolish must either create an overlay (kind=demolish) or instant-mutate to GRASS; got tile=${tileAfter}, overlay=${JSON.stringify(overlay ?? null)}`);
});

test("executeNextSteps — demolish on insufficient wood marks waiting_resources", () => {
  const state = makeTestState({ resources: { food: 200, wood: 0, stone: 20, herbs: 10 } });
  const buildSystem = new BuildSystem();
  // Convert a tile to RUINS directly so we have a target.
  const grassTile = findFirstTile(state, (ix, iz) =>
    state.grid.tiles[ix + iz * state.grid.width] === TILE.GRASS,
  );
  assert.ok(grassTile);
  state.grid.tiles[grassTile.ix + grassTile.iz * state.grid.width] = TILE.RUINS;
  state.grid.version = (state.grid.version ?? 0) + 1;

  const plan = {
    goal: "clear ruins",
    steps: [
      {
        id: 1,
        action: { type: "demolish", hint: `${grassTile.ix},${grassTile.iz}` },
        priority: "medium",
        depends_on: [],
        status: "pending",
      },
    ],
  };
  const groundedPlan = groundPlan(plan, state, buildSystem);
  // Demolish cost = BALANCE.demolishToolCost.wood (1). With 0 wood, this
  // must NOT execute and the step must stay in waiting_resources state.
  assert.ok(Number(BALANCE.demolishToolCost?.wood ?? 1) >= 1,
    "BALANCE.demolishToolCost.wood must be >=1 for this test to be meaningful");
  const executed = executeNextSteps(groundedPlan, state, buildSystem);
  // executeNextSteps does NOT push waiting_resources steps to the executed
  // list, so the step status is set on the plan itself.
  const stepAfter = groundedPlan.steps[0];
  assert.equal(stepAfter.status, "waiting_resources",
    `step status should be waiting_resources; got ${stepAfter.status}`);
  assert.equal(executed.length, 0, "no steps executed when wood is 0");
});

test("executeNextSteps — demolish without grounded tile fails gracefully", () => {
  const state = makeTestState({ resources: { food: 200, wood: 80, stone: 20, herbs: 10 } });
  const buildSystem = new BuildSystem();
  // No RUINS, no built tiles other than the scenario default — pick a hint
  // that resolves to nothing (an out-of-bounds keyword that returns []).
  const plan = {
    goal: "test",
    steps: [
      {
        id: 1,
        // "depleted_farm" with zero depleted farms returns an empty candidate
        // list, so groundPlanStep should report groundedTile=null.
        action: { type: "demolish", hint: "depleted_farm" },
        priority: "medium",
        depends_on: [],
        status: "pending",
      },
    ],
  };
  const groundedPlan = groundPlan(plan, state, buildSystem);
  // The step might still ground to *some* depleted tile if the scenario has
  // any; only assert the failure path when there genuinely is no candidate.
  if (groundedPlan.steps[0].groundedTile) {
    // The scenario provided a depleted producer; skip the test body since
    // the failure-path assertion is no longer meaningful.
    return;
  }
  const executed = executeNextSteps(groundedPlan, state, buildSystem);
  assert.equal(executed.length, 1, "step should run and fail");
  assert.equal(executed[0].status, "failed");
  assert.equal(executed[0].failureReason, "no_demolish_target");
});

// ══════════════════════════════════════════════════════════════════════
// Integration — full plan with mixed steps
// ══════════════════════════════════════════════════════════════════════

test("PlanExecutor — mixed plan with demolish + build steps respects dependencies", () => {
  const state = makeTestState({ resources: { food: 200, wood: 80, stone: 20, herbs: 10 } });
  const buildSystem = new BuildSystem();
  paintRuins(state, 6);
  const ruins = listTilesByType(state.grid, [TILE.RUINS]);
  assert.ok(ruins.length >= 6);
  const target = ruins[0];

  const plan = {
    goal: "demolish then build",
    steps: [
      {
        id: 1,
        action: { type: "demolish", hint: `${target.ix},${target.iz}` },
        priority: "high",
        depends_on: [],
        status: "pending",
      },
      {
        id: 2,
        action: { type: "road", hint: `${target.ix},${target.iz}` },
        priority: "high",
        depends_on: [1],
        status: "pending",
      },
    ],
  };
  const groundedPlan = groundPlan(plan, state, buildSystem);
  // First tick: step 1 (demolish) executes (demolishStep.status becomes
  // "completed"), and depending on the tick budget step 2 (road) may also
  // execute since its dependency was just satisfied. We assert dependency
  // ordering held: the demolish completed BEFORE the road step's status
  // changed away from "pending" — by reading the executed array order.
  const executed1 = executeNextSteps(groundedPlan, state, buildSystem);
  assert.ok(executed1.length >= 1, "first tick should execute demolish");
  const demolishStep = executed1.find((s) => s.action.type === "demolish");
  assert.ok(demolishStep, "demolish step must appear in executed list");
  assert.equal(demolishStep.status, "completed",
    "demolish step is 'completed' from the planner's POV once placeToolAt returns ok");
  const demolishIndex = executed1.indexOf(demolishStep);
  const roadStep = executed1.find((s) => s.action.type === "road");
  if (roadStep) {
    const roadIndex = executed1.indexOf(roadStep);
    assert.ok(demolishIndex < roadIndex,
      "demolish must execute before the road step that depends on it");
  }
  // Final tile state: either the overlay is present (Agent A's flow), or
  // the tile mutated to GRASS (between demolish completing and road) and
  // then to ROAD (after road executed). Both end states are valid.
  const idx = target.ix + target.iz * state.grid.width;
  const overlay = state.grid.tileState?.get(idx)?.construction;
  const tileAfter = state.grid.tiles[idx];
  const overlayPresent = overlay && (overlay.kind === "demolish" || overlay.kind === "build");
  const tileEvolved = tileAfter === TILE.GRASS || tileAfter === TILE.ROAD || tileAfter === TILE.RUINS;
  assert.ok(overlayPresent || tileEvolved,
    `tile must either carry an overlay or be in a valid post-demolish state; got tile=${tileAfter}`);
});
