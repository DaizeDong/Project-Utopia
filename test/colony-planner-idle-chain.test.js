import test from "node:test";
import assert from "node:assert/strict";

import {
  generateFallbackPlan,
} from "../src/simulation/ai/colony/ColonyPlanner.js";
import { ColonyPerceiver } from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

// v0.8.2 Round-5 Wave-1 (01b Step 5 + 02a Step 4/5) — ColonyPlanner fallback
// additions:
//   (a) Priority 3.75 "idle processing chain": kitchen exists but COOK=0
//       and food >= fallbackIdleChainThreshold → reassign_role step.
//   (b) Priority 3.5 Kitchen gate relaxed to stone>=2 + pop>=12 critical.
//   (c) Priority 1 food-crisis substitutes kitchen for the second farm when
//       pop>=12 and zero kitchens.

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

test("Priority 3.75 idle-chain: kitchen=1 + COOK=0 + food>=15 → reassign_role step (01b)", () => {
  const state = makeTestState({
    resources: { food: 40, wood: 30, stone: 4, herbs: 2 },
    buildings: { kitchens: 1, warehouses: 1, farms: 3, lumbers: 1 },
    metrics: { roleCounts: { COOK: 0, FARM: 10, WOOD: 2 } },
  });
  const plan = generateFallbackPlan(makeObservation(state), state);
  const reassign = plan.steps.find((s) => s.action?.type === "reassign_role" && s.action.role === "COOK");
  assert.ok(reassign, "plan must include a reassign_role step targeting COOK when pipeline is idle");
});

test("Priority 3.75 idle-chain: kitchen=1 + COOK=1 (already assigned) → NO reassign_role", () => {
  const state = makeTestState({
    resources: { food: 40, wood: 30, stone: 4, herbs: 2 },
    buildings: { kitchens: 1, warehouses: 1, farms: 3, lumbers: 1 },
    metrics: { roleCounts: { COOK: 1, FARM: 9, WOOD: 2 } },
  });
  const plan = generateFallbackPlan(makeObservation(state), state);
  const reassign = plan.steps.find((s) => s.action?.type === "reassign_role" && s.action.role === "COOK");
  assert.ok(!reassign, "no reassign_role expected when a cook already exists");
});

test("Priority 3.5 Kitchen gate: pop>=12 forces priority='critical' (02a Step 4)", () => {
  const state = makeTestState({
    resources: { food: 20, wood: 20, stone: 4, herbs: 2 },
    buildings: { kitchens: 0, warehouses: 1, farms: 3, lumbers: 1 },
    metrics: { roleCounts: {} },
  });
  // setWorkerCount-inline: pad to 12.
  while (state.agents.filter((a) => a.type === "WORKER").length < 12) {
    const src = state.agents.find((a) => a.type === "WORKER");
    state.agents.push({ ...src, id: `${src.id}-pad-${state.agents.length}` });
  }
  const plan = generateFallbackPlan(makeObservation(state), state);
  const kitchenStep = plan.steps.find((s) => s.action?.type === "kitchen");
  assert.ok(kitchenStep, "plan must include a kitchen step when pop>=12 and kitchens=0");
  assert.equal(
    kitchenStep.priority,
    "critical",
    "pop>=12 should promote the kitchen step to critical priority",
  );
});

test("Priority 3.5 Kitchen gate: stone>=2 triggers (02a Step 4)", () => {
  // Build a state where stone is exactly 2 — old gate (stone>=3) would skip.
  const state = makeTestState({
    resources: { food: 20, wood: 20, stone: 2, herbs: 2 },
    buildings: { kitchens: 0, warehouses: 1, farms: 3, lumbers: 1 },
    metrics: { roleCounts: {} },
  });
  const plan = generateFallbackPlan(makeObservation(state), state);
  const kitchenStep = plan.steps.find((s) => s.action?.type === "kitchen");
  assert.ok(kitchenStep, "stone>=2 should be enough to trigger kitchen under the relaxed gate");
});

// v0.8.2 Round-5b Wave-1 (01b Step 5) — low-pop idle-chain threshold.
// pop<6 lowers the food bar from 15 → 6 so the feedback loop fires at the
// low population where food is drained faster than produced.

test("Priority 3.75 idle-chain low-pop: pop=4 + kitchen + COOK=0 + food=6 → reassign_role (01b Step 5)", () => {
  const state = makeTestState({
    resources: { food: 6, wood: 30, stone: 4, herbs: 2 },
    buildings: { kitchens: 1, warehouses: 1, farms: 3, lumbers: 1 },
    metrics: { roleCounts: { COOK: 0, FARM: 3, WOOD: 1 } },
  });
  // Pad workers to exactly 4.
  while (state.agents.filter((a) => a.type === "WORKER").length > 4) {
    const idx = state.agents.findIndex((a) => a.type === "WORKER");
    state.agents.splice(idx, 1);
  }
  const plan = generateFallbackPlan(makeObservation(state), state);
  const reassign = plan.steps.find((s) => s.action?.type === "reassign_role" && s.action.role === "COOK");
  assert.ok(reassign, "low-pop (n<6) should use lower food threshold (6) for idle-chain trigger");
});

// v0.8.2 Round-7 02c — COOK deadlock root fix: the food-threshold gate has
// been removed for COOK. Previously food=5 (below lowPopThreshold=6) blocked
// the reassign_role step, producing the chicken-egg deadlock: Kitchen exists
// → no COOK → no meals → food stays low → threshold never met → COOK never
// assigned. Correct behaviour: kitchen present + COOK=0 always emits
// reassign_role, regardless of food level.
test("Priority 3.75 idle-chain low-pop: pop=4 + food=5 + kitchen=1 + COOK=0 → reassign_role (deadlock fix Round-7)", () => {
  const state = makeTestState({
    resources: { food: 5, wood: 30, stone: 4, herbs: 2 },
    buildings: { kitchens: 1, warehouses: 1, farms: 3, lumbers: 1 },
    metrics: { roleCounts: { COOK: 0, FARM: 3, WOOD: 1 } },
  });
  while (state.agents.filter((a) => a.type === "WORKER").length > 4) {
    const idx = state.agents.findIndex((a) => a.type === "WORKER");
    state.agents.splice(idx, 1);
  }
  const plan = generateFallbackPlan(makeObservation(state), state);
  const reassign = plan.steps.find((s) => s.action?.type === "reassign_role" && s.action.role === "COOK");
  // Root fix: kitchen=1 + COOK=0 must always produce a reassign_role step.
  // The old food-gate (food >= lowPopThreshold) caused the deadlock and is now removed.
  assert.ok(reassign, "kitchen=1 + COOK=0 must always emit reassign_role regardless of food level (deadlock fix)");
});
