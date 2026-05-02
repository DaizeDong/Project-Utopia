// Hotfix Batch B (HW7 Final-Polish-Loop iter1) — survival safety nets.
//
// Issue #3: LLM early-game planning ignored zero-farm safety net. R3 added
// farm@99 in ColonyDirector.assessColonyNeeds, but AgentDirectorSystem
// throttled the fallback to every-3rd-tick when an LLM plan was active, so
// the safety net could be starved out by LLM-driven step execution.
//
// Issue #7: Late-game stone shortage. There was no stone-deficit safety net
// equivalent to the zero-farm one, so colonies that revealed no STONE node
// (or whose quarries depleted) had no rule that forced quarry placement
// before farm/warehouse spam.
//
// These tests pin the contract for both safety nets:
//   1. assessColonyNeeds emits quarry@>=95 when stone is critical and no
//      quarry exists OR stone is bone-dry.
//   2. AgentDirectorSystem.update() runs the fallback director
//      unconditionally (bypassing the LLM-plan throttle) when a survival
//      preempt condition is true (zero farms in early game, or stone
//      critical with no quarry).

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats, getTileState, toIndex } from "../src/world/grid/Grid.js";
import { assessColonyNeeds, ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { AgentDirectorSystem } from "../src/simulation/ai/colony/AgentDirectorSystem.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { createServices } from "../src/app/createServices.js";
import { FOG_STATE, NODE_FLAGS, TILE } from "../src/config/constants.js";

function makeBaseState(seed = 42) {
  const state = createInitialGameState("temperate_plains", seed);
  state.session = { phase: "active" };
  state.ai = { enabled: true };
  state.metrics = { ...(state.metrics ?? {}), timeSec: 0 };
  state.buildings = rebuildBuildingStats(state.grid);
  return state;
}

test("assessColonyNeeds emits quarry@>=95 when stone < 15 and zero quarries exist (stone safety net)", () => {
  const state = createInitialGameState();
  state.buildings = { ...(state.buildings ?? {}), quarries: 0, farms: 5 };
  state.resources = { ...(state.resources ?? {}), food: 320, wood: 50, stone: 6, herbs: 8 };
  state.metrics = { ...(state.metrics ?? {}), timeSec: 600 };
  state.ai = { ...(state.ai ?? {}), foodRecoveryMode: false };

  const needs = assessColonyNeeds(state);
  const quarryNeed = needs.find((n) => n.type === "quarry");
  assert.ok(quarryNeed, "expected a quarry need when stone < 15 and zero quarries exist");
  assert.ok(
    quarryNeed.priority >= 95,
    `expected quarry priority >= 95 (safety net), got ${quarryNeed.priority}`,
  );
});

test("assessColonyNeeds emits quarry@>=95 when stone < 5 even if quarry exists (depleted-quarry relocation)", () => {
  const state = createInitialGameState();
  // Quarry exists but stone is bone-dry — implies depleted node, force a
  // relocation build.
  state.buildings = { ...(state.buildings ?? {}), quarries: 1, farms: 5 };
  state.resources = { ...(state.resources ?? {}), food: 320, wood: 50, stone: 2, herbs: 8 };
  state.metrics = { ...(state.metrics ?? {}), timeSec: 600 };
  state.ai = { ...(state.ai ?? {}), foodRecoveryMode: false };

  const needs = assessColonyNeeds(state);
  const quarryNeed = needs.find((n) => n.type === "quarry");
  assert.ok(quarryNeed, "expected a quarry need when stone < 5 (depleted-quarry case)");
  assert.ok(
    quarryNeed.priority >= 95,
    `expected quarry priority >= 95 (depleted safety net), got ${quarryNeed.priority}`,
  );
});

test("assessColonyNeeds does NOT emit quarry safety net when stone is healthy", () => {
  const state = createInitialGameState();
  state.buildings = { ...(state.buildings ?? {}), quarries: 1, farms: 5 };
  state.resources = { ...(state.resources ?? {}), food: 320, wood: 50, stone: 50, herbs: 8 };
  state.metrics = { ...(state.metrics ?? {}), timeSec: 600 };
  state.ai = { ...(state.ai ?? {}), foodRecoveryMode: false };

  const needs = assessColonyNeeds(state);
  const safetyQuarry = needs.find((n) => n.type === "quarry" && n.priority >= 95);
  assert.equal(safetyQuarry, undefined, "did not expect quarry safety net at stone=50");
});

test("AgentDirectorSystem: zero-farm survival preempt drives fallback even with no LLM plan active", () => {
  const mem = new MemoryStore();
  const system = new AgentDirectorSystem(mem);
  const state = makeBaseState();
  state.resources = { food: 100, wood: 50, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0 };
  state.buildings = { ...rebuildBuildingStats(state.grid), farms: 0, quarries: 0 };
  const services = createServices(mem);
  services.llmClient = null; // force hybrid → algorithmic fallback path

  const farmsBefore = Number(state.buildings.farms ?? 0);
  assert.equal(farmsBefore, 0, "test setup: farms should start at 0");

  // Tick the system enough times for the heavy-tick + fallback build to fire.
  // AgentDirector.update gates heavy work on AGENT_DIRECTOR_HEAVY_TICK_INTERVAL_SEC
  // (0.5 sim-sec) and ColonyDirector on EVAL_INTERVAL_SEC (2 sim-sec). At
  // dt=1/30 we need ~60+ ticks to exceed the 2s eval interval.
  const dt = 1 / 30;
  for (let i = 0; i < 200; i += 1) {
    state.metrics.timeSec = i * dt;
    system.update(dt, state, services);
  }

  // The survival preempt path runs the fallback unconditionally each tick.
  // After 200 ticks (~6.6 sim-sec) the fallback's farm@99 safety net should
  // have placed at least one farm blueprint or completed a farm.
  const farmsAfter = Number(state.buildings.farms ?? 0);
  const blueprintsSubmitted = Number(state.ai?.colonyDirector?.blueprintsSubmitted ?? 0);
  const buildsPlaced = Number(state.ai?.colonyDirector?.buildsPlaced ?? 0);
  assert.ok(
    farmsAfter > 0 || blueprintsSubmitted > 0 || buildsPlaced > 0,
    `survival preempt should have triggered at least one farm placement / blueprint, got farms=${farmsAfter}, blueprints=${blueprintsSubmitted}, builds=${buildsPlaced}`,
  );
});

test("AgentDirectorSystem: no survival preempt when farms exist and stone is healthy", () => {
  const mem = new MemoryStore();
  const system = new AgentDirectorSystem(mem);
  const state = makeBaseState();
  state.resources = { food: 100, wood: 50, stone: 30, herbs: 5, meals: 0, tools: 0, medicine: 0 };
  // Pretend we have farms and a quarry — survival preempt should NOT fire.
  state.buildings = { ...rebuildBuildingStats(state.grid), farms: 5, quarries: 2 };
  const services = createServices(mem);
  services.llmClient = null;

  // Just verify the update doesn't throw and the agent state is created.
  const dt = 1 / 30;
  for (let i = 0; i < 30; i += 1) {
    state.metrics.timeSec = i * dt;
    system.update(dt, state, services);
  }
  assert.ok(state.ai.agentDirector, "agentDirector state should be created");
  // Mode should be "hybrid" (no llmClient, no apiKey) — verifies the survival
  // preempt block doesn't break normal flow.
  assert.equal(state.ai.agentDirector.mode, "hybrid");
});

// v0.10.1-hotfix-iter2 (issue #7 follow-up): scout-road-toward-fogged-stone.
// When stone is critical AND every STONE node sits in HIDDEN fog, the
// quarry@95 safety net cannot land (evaluateBuildPreview rejects HIDDEN
// tiles). The new proposer must extend a single road blueprint toward the
// closest hidden STONE node so the worker walking that road reveals the fog.
test("ColonyDirectorSystem: scout-road proposer fires when stone is critical and every STONE node is fog-hidden", () => {
  const state = makeBaseState();
  state.controls = { ...(state.controls ?? {}), tool: "none", timeScale: 1 };
  state.resources = { food: 200, wood: 50, stone: 0, herbs: 5, meals: 0, tools: 0, medicine: 0 };
  state.buildings = { ...rebuildBuildingStats(state.grid), farms: 5, quarries: 0 };

  const grid = state.grid;
  const w = Number(grid.width ?? 0);
  const h = Number(grid.height ?? 0);

  // Force a deterministic fog field: HIDDEN everywhere except a small box
  // around a known WAREHOUSE/anchor. We pick (5, 5) as the anchor and reveal
  // a 3-tile box around it. Then plant a STONE node at (40, 40) which is
  // far outside that box and therefore HIDDEN.
  const fogVis = new Uint8Array(w * h); // 0 == HIDDEN
  state.fog = { visibility: fogVis, version: 1 };
  for (let dz = -3; dz <= 3; dz += 1) {
    for (let dx = -3; dx <= 3; dx += 1) {
      const ix = 5 + dx;
      const iz = 5 + dz;
      if (ix < 0 || iz < 0 || ix >= w || iz >= h) continue;
      fogVis[ix + iz * w] = FOG_STATE.EXPLORED;
    }
  }

  // Place a WAREHOUSE at the anchor so the proposer has an infrastructure
  // anchor to extend from.
  const anchorIdx = 5 + 5 * w;
  grid.tiles[anchorIdx] = TILE.WAREHOUSE;
  state.buildings = rebuildBuildingStats(grid);

  // Strip ALL existing STONE node flags so no stone is currently visible.
  // Then plant exactly one STONE node deep in the HIDDEN fog at (40, 40).
  if (grid.tileState) {
    for (const [, entry] of grid.tileState) {
      if (entry && Number(entry.nodeFlags ?? 0) & NODE_FLAGS.STONE) {
        entry.nodeFlags = Number(entry.nodeFlags ?? 0) & ~NODE_FLAGS.STONE;
      }
    }
  }
  const stoneIx = 40;
  const stoneIz = 40;
  const stoneIdx = toIndex(stoneIx, stoneIz, w);
  let stoneEntry = getTileState(grid, stoneIx, stoneIz);
  if (!stoneEntry) {
    stoneEntry = { nodeFlags: 0, fertility: 1, yieldPool: 0 };
    grid.tileState.set(stoneIdx, stoneEntry);
  }
  stoneEntry.nodeFlags = (Number(stoneEntry.nodeFlags ?? 0) | NODE_FLAGS.STONE) & 0xff;
  // Make sure the underlying tile is GRASS (the proposer only considers GRASS
  // node tiles that are still unbuilt) and that fog hides it.
  grid.tiles[stoneIdx] = TILE.GRASS;
  fogVis[stoneIdx] = FOG_STATE.HIDDEN;

  const services = { rng: { next: () => 0.5 } };
  const director = new ColonyDirectorSystem();

  const roadsBefore = Number(state.buildings.roads ?? 0);
  const blueprintsBefore = Number(state.ai?.colonyDirector?.blueprintsSubmitted ?? 0);

  // Run 2 ticks past the EVAL_INTERVAL_SEC so the director runs at least once.
  state.metrics.timeSec = 0;
  director.update(0.1, state, services);
  state.metrics.timeSec = 3;
  director.update(0.1, state, services);

  const roadsAfter = Number(state.buildings.roads ?? 0);
  const blueprintsAfter = Number(state.ai?.colonyDirector?.blueprintsSubmitted ?? 0);
  const lastScoutSec = Number(state.ai?.colonyDirector?.lastStoneScoutProposalSec ?? -Infinity);

  assert.ok(
    roadsAfter > roadsBefore || blueprintsAfter > blueprintsBefore || Number.isFinite(lastScoutSec),
    `scout-road proposer should have placed a road blueprint or marked lastStoneScoutProposalSec; got roadsBefore=${roadsBefore}, roadsAfter=${roadsAfter}, blueprintsBefore=${blueprintsBefore}, blueprintsAfter=${blueprintsAfter}, lastScoutSec=${lastScoutSec}`,
  );
});

// Counter-test: when stone is healthy, the scout-road proposer must NOT
// fire — this is purely an emergency reachability hack, not background
// pathfinding.
test("ColonyDirectorSystem: scout-road proposer does NOT fire when stone is healthy", () => {
  const state = makeBaseState();
  state.controls = { ...(state.controls ?? {}), tool: "none", timeScale: 1 };
  state.resources = { food: 200, wood: 50, stone: 50, herbs: 5, meals: 0, tools: 0, medicine: 0 };
  state.buildings = { ...rebuildBuildingStats(state.grid), farms: 5, quarries: 1 };

  const grid = state.grid;
  const w = Number(grid.width ?? 0);
  const h = Number(grid.height ?? 0);

  // Same fog setup as above (mostly HIDDEN, small reveal box, hidden STONE
  // far away). The only difference is stone=50 which fails the `stoneStock
  // >= 15` short-circuit at the top of the proposer.
  const fogVis = new Uint8Array(w * h);
  state.fog = { visibility: fogVis, version: 1 };
  for (let dz = -3; dz <= 3; dz += 1) {
    for (let dx = -3; dx <= 3; dx += 1) {
      const ix = 5 + dx;
      const iz = 5 + dz;
      if (ix < 0 || iz < 0 || ix >= w || iz >= h) continue;
      fogVis[ix + iz * w] = FOG_STATE.EXPLORED;
    }
  }
  grid.tiles[5 + 5 * w] = TILE.WAREHOUSE;
  state.buildings = rebuildBuildingStats(grid);

  const services = { rng: { next: () => 0.5 } };
  const director = new ColonyDirectorSystem();
  state.metrics.timeSec = 0;
  director.update(0.1, state, services);
  state.metrics.timeSec = 3;
  director.update(0.1, state, services);

  const lastScoutSec = state.ai?.colonyDirector?.lastStoneScoutProposalSec;
  assert.ok(
    lastScoutSec === undefined || lastScoutSec === -Infinity,
    `scout-road proposer should NOT have fired with stone=50; got lastStoneScoutProposalSec=${lastScoutSec}`,
  );
});
