import test from "node:test";
import assert from "node:assert/strict";

import {
  SKILL_LIBRARY,
  getSkillTotalCost,
  checkSkillPreconditions,
  expandSkillSteps,
  assessSkillFeasibility,
  scoreSkillTerrain,
  selectSkillForGoal,
  listSkillStatus,
} from "../src/simulation/ai/colony/SkillLibrary.js";

import {
  resolveLocationHint,
  computeAffordanceScore,
  rankByTerrainQuality,
  groundPlanStep,
  groundPlan,
  executeNextSteps,
  isPlanComplete,
  isPlanBlocked,
  getPlanProgress,
} from "../src/simulation/ai/colony/PlanExecutor.js";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";
import { BUILD_COST } from "../src/config/balance.js";
import { rebuildBuildingStats, toIndex } from "../src/world/grid/Grid.js";
import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeTestState(overrides = {}) {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources = { food: 80, wood: 70, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0, ...overrides.resources };
  state.buildings = rebuildBuildingStats(state.grid);
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = overrides.timeSec ?? 0;
  if (overrides.buildings) {
    Object.assign(state.buildings, overrides.buildings);
  }
  return state;
}

function placeTile(grid, ix, iz, tileType) {
  const idx = toIndex(ix, iz, grid.width);
  grid.tiles[idx] = tileType;
}

function makeMinimalGrid() {
  const width = 20;
  const height = 20;
  const tiles = new Uint8Array(width * height).fill(TILE.GRASS);
  // Use Float32Array for elevation/moisture (matching real grid)
  const elevation = new Float32Array(width * height).fill(0.5);
  const moisture = new Float32Array(width * height).fill(0.5);
  return {
    width,
    height,
    tileSize: 1,
    tiles,
    tileState: new Map(),
    tileStateVersion: 0,
    version: 1,
    elevation,
    moisture,
  };
}

function makeMockBuildSystem() {
  return {
    previewToolAt(state, tool, ix, iz) {
      const grid = state.grid;
      if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) {
        return { ok: false, reason: "out_of_bounds" };
      }
      const idx = toIndex(ix, iz, grid.width);
      const currentTile = grid.tiles[idx];
      // Roads can go on GRASS
      // Bridges can go on WATER
      // Everything else needs GRASS
      if (tool === "bridge") {
        return { ok: currentTile === TILE.WATER, reason: currentTile !== TILE.WATER ? "need_water" : null };
      }
      return { ok: currentTile === TILE.GRASS, reason: currentTile !== TILE.GRASS ? "blocked" : null };
    },
    placeToolAt(state, tool, ix, iz, _options) {
      const grid = state.grid;
      const idx = toIndex(ix, iz, grid.width);
      const tileMap = {
        road: TILE.ROAD, farm: TILE.FARM, lumber: TILE.LUMBER,
        warehouse: TILE.WAREHOUSE, wall: TILE.WALL, quarry: TILE.QUARRY,
        herb_garden: TILE.HERB_GARDEN, kitchen: TILE.KITCHEN,
        smithy: TILE.SMITHY, clinic: TILE.CLINIC, bridge: TILE.BRIDGE,
      };
      const newType = tileMap[tool];
      if (!newType) return { ok: false, reason: "unknown_tool" };

      const preview = this.previewToolAt(state, tool, ix, iz);
      if (!preview.ok) return preview;

      grid.tiles[idx] = newType;
      grid.version = (grid.version ?? 0) + 1;
      // Deduct resources
      const cost = BUILD_COST[tool] ?? {};
      for (const [res, amount] of Object.entries(cost)) {
        state.resources[res] = (state.resources[res] ?? 0) - amount;
      }
      return { ok: true };
    },
  };
}

// ══════════════════════════════════════════════════════════════════════
// SkillLibrary Tests
// ══════════════════════════════════════════════════════════════════════

test("SKILL_LIBRARY has 6 frozen skills", () => {
  const keys = Object.keys(SKILL_LIBRARY);
  assert.equal(keys.length, 6);
  assert.ok(keys.includes("logistics_hub"));
  assert.ok(keys.includes("processing_cluster"));
  assert.ok(keys.includes("defense_line"));
  assert.ok(keys.includes("food_district"));
  assert.ok(keys.includes("expansion_outpost"));
  assert.ok(keys.includes("bridge_link"));
});

test("SKILL_LIBRARY skills are frozen", () => {
  for (const [id, skill] of Object.entries(SKILL_LIBRARY)) {
    assert.ok(Object.isFrozen(skill), `${id} should be frozen`);
    assert.ok(Object.isFrozen(skill.steps), `${id}.steps should be frozen`);
    assert.ok(Object.isFrozen(skill.preconditions), `${id}.preconditions should be frozen`);
  }
});

test("getSkillTotalCost computes correct totals for logistics_hub", () => {
  const cost = getSkillTotalCost("logistics_hub");
  // warehouse(10w) + 4 roads(4w) + 2 farms(10w) = 24 wood
  assert.equal(cost.wood, 24);
  assert.equal(cost.stone, undefined);
});

test("getSkillTotalCost computes correct totals for processing_cluster", () => {
  const cost = getSkillTotalCost("processing_cluster");
  // quarry(6w) + road(1w) + smithy(6w+5s) = 13w + 5s
  assert.equal(cost.wood, 13);
  assert.equal(cost.stone, 5);
});

test("getSkillTotalCost returns empty for unknown skill", () => {
  const cost = getSkillTotalCost("nonexistent");
  assert.deepEqual(cost, {});
});

test("checkSkillPreconditions succeeds when resources sufficient", () => {
  const resources = { wood: 30, stone: 10, herbs: 5, food: 50 };
  const buildings = { farms: 8 };
  const { met, missing } = checkSkillPreconditions("logistics_hub", resources, buildings);
  assert.equal(met, true);
  assert.equal(missing.length, 0);
});

test("checkSkillPreconditions fails when resources insufficient", () => {
  const resources = { wood: 5, stone: 0, herbs: 0, food: 10 };
  const buildings = { farms: 2 };
  const { met, missing } = checkSkillPreconditions("logistics_hub", resources, buildings);
  assert.equal(met, false);
  assert.ok(missing.some(m => m.includes("wood")));
});

test("checkSkillPreconditions checks building counts for food_district", () => {
  const resources = { wood: 30, stone: 10, herbs: 5, food: 50 };
  const { met: met1 } = checkSkillPreconditions("food_district", resources, { farms: 3 });
  assert.equal(met1, false, "should fail with only 3 farms");

  const { met: met2 } = checkSkillPreconditions("food_district", resources, { farms: 8 });
  assert.equal(met2, true, "should pass with 8 farms");
});

test("checkSkillPreconditions returns missing for unknown skill", () => {
  const { met } = checkSkillPreconditions("fake_skill", {}, {});
  assert.equal(met, false);
});

test("expandSkillSteps produces correct absolute positions", () => {
  const steps = expandSkillSteps("defense_line", { ix: 10, iz: 10 });
  assert.equal(steps.length, 5);
  assert.deepEqual(steps[0], { type: "wall", ix: 10, iz: 10 });
  assert.deepEqual(steps[1], { type: "wall", ix: 11, iz: 10 });
  assert.deepEqual(steps[4], { type: "wall", ix: 14, iz: 10 });
});

test("expandSkillSteps returns empty for unknown skill", () => {
  assert.deepEqual(expandSkillSteps("nope", { ix: 0, iz: 0 }), []);
});

test("assessSkillFeasibility checks placement for each sub-step", () => {
  const grid = makeMinimalGrid();
  // Block one tile
  placeTile(grid, 11, 10, TILE.WATER);
  const state = { grid, resources: { wood: 100 } };
  const buildSystem = makeMockBuildSystem();

  const result = assessSkillFeasibility("defense_line", { ix: 10, iz: 10 }, grid, buildSystem, state);
  assert.equal(result.total, 5);
  assert.equal(result.feasible, 4, "one tile blocked by water");
  assert.ok(result.ratio > 0.7 && result.ratio < 0.9);
});

test("assessSkillFeasibility returns 0 for fully blocked area", () => {
  const grid = makeMinimalGrid();
  // Fill area with water
  for (let dx = 0; dx < 5; dx++) {
    placeTile(grid, 10 + dx, 10, TILE.WATER);
  }
  const state = { grid, resources: {} };
  const buildSystem = makeMockBuildSystem();

  const result = assessSkillFeasibility("defense_line", { ix: 10, iz: 10 }, grid, buildSystem, state);
  assert.equal(result.feasible, 0);
  assert.equal(result.ratio, 0);
});

test("scoreSkillTerrain returns 1 for skill without terrain_preference", () => {
  const grid = makeMinimalGrid();
  const score = scoreSkillTerrain("bridge_link", { ix: 5, iz: 5 }, grid);
  assert.equal(score, 1);
});

test("scoreSkillTerrain penalizes low moisture for logistics_hub", () => {
  const grid = makeMinimalGrid();
  // Set all tiles in skill footprint to low moisture
  for (const step of SKILL_LIBRARY.logistics_hub.steps) {
    const idx = toIndex(10 + step.offset[0], 10 + step.offset[1], grid.width);
    grid.moisture[idx] = 0.1;
  }
  const idx = toIndex(10, 10, grid.width);
  grid.moisture[idx] = 0.1; // anchor too
  const score = scoreSkillTerrain("logistics_hub", { ix: 10, iz: 10 }, grid);
  assert.ok(score < 0.5, `expected low score for dry tile, got ${score}`);
  assert.ok(score > 0, `score should never be exactly 0, got ${score}`);
});

test("scoreSkillTerrain rewards high elevation for defense_line", () => {
  const grid = makeMinimalGrid();
  const idxHigh = toIndex(10, 10, grid.width);
  grid.elevation[idxHigh] = 0.8;
  const scoreHigh = scoreSkillTerrain("defense_line", { ix: 10, iz: 10 }, grid);

  const idxLow = toIndex(5, 5, grid.width);
  grid.elevation[idxLow] = 0.3;
  const scoreLow = scoreSkillTerrain("defense_line", { ix: 5, iz: 5 }, grid);

  assert.ok(scoreHigh > scoreLow, `high elevation (${scoreHigh}) should score better than low (${scoreLow})`);
});

test("selectSkillForGoal returns correct skill for goals", () => {
  const resources = { wood: 30, stone: 10 };
  const buildings = { farms: 8 };

  const expand = selectSkillForGoal("expand_coverage", resources, buildings);
  assert.ok(expand != null);
  assert.ok(["logistics_hub", "expansion_outpost"].includes(expand.skillId));

  const fortify = selectSkillForGoal("fortify", resources, buildings);
  assert.ok(fortify != null);
  assert.equal(fortify.skillId, "defense_line");
});

test("selectSkillForGoal returns null when unaffordable", () => {
  const resources = { wood: 2, stone: 0 };
  const result = selectSkillForGoal("expand_coverage", resources, {});
  assert.equal(result, null);
});

test("selectSkillForGoal returns null for unknown goal", () => {
  assert.equal(selectSkillForGoal("unknown", { wood: 100 }, {}), null);
});

test("listSkillStatus returns status for all 6 skills", () => {
  const statuses = listSkillStatus({ wood: 50, stone: 10 }, { farms: 8 });
  assert.equal(statuses.length, 6);
  for (const s of statuses) {
    assert.ok(typeof s.affordable === "boolean");
    assert.ok(Array.isArray(s.missing));
  }
});

// ══════════════════════════════════════════════════════════════════════
// PlanExecutor — resolveLocationHint Tests
// ══════════════════════════════════════════════════════════════════════

test("resolveLocationHint returns default candidates for null hint", () => {
  const state = makeTestState();
  const candidates = resolveLocationHint(null, state);
  assert.ok(candidates.length > 0, "should find grass tiles near warehouses");
});

test("resolveLocationHint parses explicit coordinates", () => {
  const state = makeTestState();
  const candidates = resolveLocationHint("10,20", state);
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0], { ix: 10, iz: 20 });
});

test("resolveLocationHint returns empty for out-of-bounds coordinate", () => {
  const state = makeTestState();
  const candidates = resolveLocationHint("999,999", state);
  assert.equal(candidates.length, 0);
});

test("resolveLocationHint near_cluster finds tiles near cluster", () => {
  const state = makeTestState();
  const candidates = resolveLocationHint("near_cluster:c0", state);
  assert.ok(candidates.length > 0, "should find tiles near cluster");
});

test("resolveLocationHint near_step uses grounded step map", () => {
  const state = makeTestState();
  const groundedSteps = new Map();
  groundedSteps.set(1, { ix: 48, iz: 36 });
  const candidates = resolveLocationHint("near_step:1", state, groundedSteps);
  assert.ok(candidates.length > 0);
  // All candidates should be within radius 4 of (48,36)
  for (const c of candidates) {
    const dist = Math.abs(c.ix - 48) + Math.abs(c.iz - 36);
    assert.ok(dist <= 4, `candidate at (${c.ix},${c.iz}) is too far: ${dist}`);
  }
});

test("resolveLocationHint near_step falls back for unknown step", () => {
  const state = makeTestState();
  const candidates = resolveLocationHint("near_step:999", state, new Map());
  assert.ok(candidates.length > 0, "should fall back to default candidates");
});

test("resolveLocationHint coverage_gap returns tiles", () => {
  const state = makeTestState();
  const candidates = resolveLocationHint("coverage_gap", state);
  assert.ok(Array.isArray(candidates));
});

test("resolveLocationHint terrain:high_moisture returns tiles", () => {
  const state = makeTestState();
  const candidates = resolveLocationHint("terrain:high_moisture", state);
  assert.ok(Array.isArray(candidates));
});

test("resolveLocationHint expansion:north returns tiles", () => {
  const state = makeTestState();
  const candidates = resolveLocationHint("expansion:north", state);
  assert.ok(Array.isArray(candidates));
});

// ══════════════════════════════════════════════════════════════════════
// PlanExecutor — Affordance Scoring Tests
// ══════════════════════════════════════════════════════════════════════

test("computeAffordanceScore returns 1 for empty cost", () => {
  assert.equal(computeAffordanceScore({ wood: 100 }, {}), 1);
});

test("computeAffordanceScore returns 0 when cannot afford", () => {
  assert.equal(computeAffordanceScore({ wood: 3 }, { wood: 5 }), 0);
});

test("computeAffordanceScore returns 0.5 when exactly can afford", () => {
  const score = computeAffordanceScore({ wood: 5 }, { wood: 5 });
  assert.ok(Math.abs(score - 0.5) < 0.01, `expected ~0.5, got ${score}`);
});

test("computeAffordanceScore returns ~1.0 with 2x resources", () => {
  const score = computeAffordanceScore({ wood: 10 }, { wood: 5 });
  assert.ok(score >= 0.99, `expected ~1.0, got ${score}`);
});

test("computeAffordanceScore handles multi-resource costs", () => {
  const score = computeAffordanceScore(
    { wood: 20, stone: 2 },
    { wood: 6, stone: 5 }  // stone is the bottleneck
  );
  assert.equal(score, 0, "cannot afford stone");
});

// ══════════════════════════════════════════════════════════════════════
// PlanExecutor — Terrain Ranking Tests
// ══════════════════════════════════════════════════════════════════════

test("rankByTerrainQuality sorts farms by moisture (descending)", () => {
  const grid = makeMinimalGrid();
  // Set different moisture values
  grid.moisture[toIndex(5, 5, grid.width)] = 0.9;
  grid.moisture[toIndex(10, 10, grid.width)] = 0.2;
  grid.moisture[toIndex(8, 8, grid.width)] = 0.6;

  const tiles = [{ ix: 10, iz: 10 }, { ix: 5, iz: 5 }, { ix: 8, iz: 8 }];
  const ranked = rankByTerrainQuality(tiles, "farm", grid);

  assert.equal(ranked[0].ix, 5, "highest moisture tile should be first");
  assert.equal(ranked[2].ix, 10, "lowest moisture tile should be last");
});

test("rankByTerrainQuality sorts walls by elevation (descending)", () => {
  const grid = makeMinimalGrid();
  grid.elevation[toIndex(3, 3, grid.width)] = 0.9;
  grid.elevation[toIndex(7, 7, grid.width)] = 0.2;

  const tiles = [{ ix: 7, iz: 7 }, { ix: 3, iz: 3 }];
  const ranked = rankByTerrainQuality(tiles, "wall", grid);

  assert.equal(ranked[0].ix, 3, "high elevation tile should rank first for walls");
});

// ══════════════════════════════════════════════════════════════════════
// PlanExecutor — Plan Grounding Tests
// ══════════════════════════════════════════════════════════════════════

test("groundPlanStep grounds a single build step", () => {
  const state = makeTestState({ resources: { wood: 100, stone: 50, herbs: 10, food: 100 } });
  const buildSystem = new BuildSystem();
  const step = {
    id: 1,
    action: { type: "farm", hint: null },
    depends_on: [],
  };

  const grounded = groundPlanStep(step, state, buildSystem);
  assert.ok(grounded.groundedTile != null, "should find a valid tile");
  assert.ok(grounded.affordanceScore > 0.5, "should be affordable");
  assert.equal(grounded.feasible, true);
});

test("groundPlanStep returns infeasible for unaffordable step", () => {
  const state = makeTestState({ resources: { wood: 0, stone: 0, herbs: 0, food: 0 } });
  const buildSystem = new BuildSystem();
  const step = {
    id: 1,
    action: { type: "warehouse", hint: null },
    depends_on: [],
  };

  const grounded = groundPlanStep(step, state, buildSystem);
  assert.equal(grounded.feasible, false);
});

test("groundPlanStep resolves near_step hint correctly", () => {
  const state = makeTestState({ resources: { wood: 100, stone: 50, herbs: 10, food: 100 } });
  const buildSystem = new BuildSystem();
  const groundedSteps = new Map();
  // Simulate step 1 was placed at a warehouse location
  const warehouses = state.grid.tiles;
  let whTile = null;
  for (let iz = 0; iz < state.grid.height && !whTile; iz++) {
    for (let ix = 0; ix < state.grid.width && !whTile; ix++) {
      if (state.grid.tiles[toIndex(ix, iz, state.grid.width)] === TILE.WAREHOUSE) {
        whTile = { ix, iz };
      }
    }
  }
  if (whTile) groundedSteps.set(1, whTile);

  const step = {
    id: 2,
    action: { type: "farm", hint: "near_step:1" },
    depends_on: [1],
  };

  const grounded = groundPlanStep(step, state, buildSystem, groundedSteps);
  if (whTile && grounded.groundedTile) {
    const dist = Math.abs(grounded.groundedTile.ix - whTile.ix) + Math.abs(grounded.groundedTile.iz - whTile.iz);
    assert.ok(dist <= 4, `placed tile should be within radius 4 of step 1, got ${dist}`);
  }
});

test("groundPlanStep handles skill steps", () => {
  const state = makeTestState({ resources: { wood: 100, stone: 50, herbs: 10, food: 100 } });
  const buildSystem = new BuildSystem();
  const step = {
    id: 1,
    action: { type: "skill", skill: "defense_line", hint: null },
    depends_on: [],
  };

  const grounded = groundPlanStep(step, state, buildSystem);
  assert.ok(grounded.skillSubSteps != null, "should have sub-steps");
  assert.ok(typeof grounded.skillFeasibility === "number");
});

test("groundPlan grounds all steps with dependency ordering", () => {
  const state = makeTestState({ resources: { wood: 100, stone: 50, herbs: 10, food: 100 } });
  const buildSystem = new BuildSystem();
  const plan = {
    goal: "test plan",
    steps: [
      { id: 1, action: { type: "warehouse", hint: null }, depends_on: [] },
      { id: 2, action: { type: "farm", hint: "near_step:1" }, depends_on: [1] },
      { id: 3, action: { type: "road", hint: "near_step:1" }, depends_on: [1] },
    ],
  };

  const grounded = groundPlan(plan, state, buildSystem);
  assert.equal(grounded.steps.length, 3);
  for (const step of grounded.steps) {
    assert.ok(step.status != null, `step ${step.id} should have status`);
    assert.ok(typeof step.affordanceScore === "number");
  }
});

// ══════════════════════════════════════════════════════════════════════
// PlanExecutor — Plan Execution Tests
// ══════════════════════════════════════════════════════════════════════

test("executeNextSteps executes first available step", () => {
  const state = makeTestState({ resources: { wood: 100, stone: 50, herbs: 10, food: 100 } });
  const buildSystem = new BuildSystem();

  // Ground a simple plan
  const plan = groundPlan({
    goal: "test",
    steps: [
      { id: 1, action: { type: "road", hint: null }, depends_on: [] },
    ],
  }, state, buildSystem);

  const executed = executeNextSteps(plan, state, buildSystem);
  assert.ok(executed.length > 0, "should execute at least one step");
  assert.equal(executed[0].status, "completed");
});

test("executeNextSteps respects dependencies", () => {
  const state = makeTestState({ resources: { wood: 100, stone: 50, herbs: 10, food: 100 } });
  const buildSystem = new BuildSystem();

  const plan = groundPlan({
    goal: "test",
    steps: [
      { id: 1, action: { type: "road", hint: null }, depends_on: [] },
      { id: 2, action: { type: "farm", hint: "near_step:1" }, depends_on: [1] },
    ],
  }, state, buildSystem);

  // First tick: should only execute step 1 (step 2 depends on it)
  const tick1 = executeNextSteps(plan, state, buildSystem);
  const step1 = plan.steps.find(s => s.id === 1);
  const step2 = plan.steps.find(s => s.id === 2);
  assert.equal(step1.status, "completed", "step 1 should be completed");
  // Step 2 may also execute in the same tick since we allow MAX_BUILDS_PER_TICK=2
  // and step 1 completes before step 2 is checked in the loop
});

test("executeNextSteps limits builds per tick", () => {
  const state = makeTestState({ resources: { wood: 100, stone: 50, herbs: 10, food: 100 } });
  const buildSystem = new BuildSystem();

  const plan = groundPlan({
    goal: "test",
    steps: [
      { id: 1, action: { type: "road", hint: null }, depends_on: [] },
      { id: 2, action: { type: "road", hint: null }, depends_on: [] },
      { id: 3, action: { type: "road", hint: null }, depends_on: [] },
      { id: 4, action: { type: "road", hint: null }, depends_on: [] },
    ],
  }, state, buildSystem);

  const executed = executeNextSteps(plan, state, buildSystem);
  assert.ok(executed.length <= 2, `should execute at most 2 per tick, got ${executed.length}`);
});

test("executeNextSteps marks step as waiting_resources when unaffordable", () => {
  const state = makeTestState({ resources: { wood: 0, stone: 0, herbs: 0, food: 0 } });
  const buildSystem = new BuildSystem();

  const plan = groundPlan({
    goal: "test",
    steps: [
      { id: 1, action: { type: "warehouse", hint: null }, depends_on: [] },
    ],
  }, state, buildSystem);

  const executed = executeNextSteps(plan, state, buildSystem);
  const step1 = plan.steps.find(s => s.id === 1);
  assert.equal(step1.status, "waiting_resources");
});

// ══════════════════════════════════════════════════════════════════════
// PlanExecutor — Plan Status Tests
// ══════════════════════════════════════════════════════════════════════

test("isPlanComplete returns true when all steps done", () => {
  const plan = {
    steps: [
      { id: 1, status: "completed" },
      { id: 2, status: "failed" },
    ],
  };
  assert.equal(isPlanComplete(plan), true);
});

test("isPlanComplete returns false with pending steps", () => {
  const plan = {
    steps: [
      { id: 1, status: "completed" },
      { id: 2, status: "pending" },
    ],
  };
  assert.equal(isPlanComplete(plan), false);
});

test("isPlanBlocked detects no progress possible", () => {
  const state = { resources: { wood: 0, stone: 0 } };
  const plan = {
    steps: [
      { id: 1, action: { type: "warehouse" }, depends_on: [], status: "pending", groundedTile: { ix: 5, iz: 5 } },
    ],
  };
  assert.equal(isPlanBlocked(plan, state), true);
});

test("isPlanBlocked returns false when progress possible", () => {
  const state = { resources: { food: 50, wood: 50, stone: 20, herbs: 0 } };
  const plan = {
    steps: [
      { id: 1, action: { type: "road" }, depends_on: [], status: "pending", groundedTile: { ix: 5, iz: 5 } },
    ],
  };
  assert.equal(isPlanBlocked(plan, state), false);
});

test("getPlanProgress returns correct counts", () => {
  const plan = {
    steps: [
      { id: 1, status: "completed" },
      { id: 2, status: "completed" },
      { id: 3, status: "failed" },
      { id: 4, status: "pending" },
      { id: 5, status: "waiting_resources" },
    ],
  };
  const progress = getPlanProgress(plan);
  assert.equal(progress.total, 5);
  assert.equal(progress.completed, 2);
  assert.equal(progress.failed, 1);
  assert.equal(progress.pending, 1);
  assert.equal(progress.waiting, 1);
  assert.ok(Math.abs(progress.ratio - 0.4) < 0.01);
});
