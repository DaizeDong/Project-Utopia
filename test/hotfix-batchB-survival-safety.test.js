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
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";
import { assessColonyNeeds } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { AgentDirectorSystem } from "../src/simulation/ai/colony/AgentDirectorSystem.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { createServices } from "../src/app/createServices.js";

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
