import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { emitEvent, EVENT_TYPES, initEventBus } from "../src/simulation/meta/GameEventBus.js";

// v0.8.2 Round-5b Wave-1 (01a Step 1 + Step 2) — autopilot food-crisis
// auto-pause contract. When food=0 + autopilot on + ≥1 starvation death in
// the last 30s, ResourceSystem emits FOOD_CRISIS_DETECTED. GameApp then
// clamps the colony and raises state.ai.pausedByCrisis.

function freshState() {
  const state = createInitialGameState();
  initEventBus(state);
  state.metrics ??= {};
  state.metrics.timeSec = 100; // arbitrary positive "now"
  return state;
}

test("food-crisis: food=0 + autopilot on + starvation death → FOOD_CRISIS_DETECTED emitted", () => {
  const state = freshState();
  state.resources.food = 0;
  state.ai.enabled = true;
  // Push a synthetic starvation death inside the 30s window.
  emitEvent(state, EVENT_TYPES.WORKER_STARVED, { reason: "starvation" });
  const sys = new ResourceSystem();
  sys.update(1 / 30, state);
  const found = state.events.log.find((e) => e.type === EVENT_TYPES.FOOD_CRISIS_DETECTED);
  assert.ok(found, "FOOD_CRISIS_DETECTED must be emitted when food=0 + autopilot on + starvation");
  assert.equal(found.detail.foodStock, 0);
  assert.ok(found.detail.deathsLast30s >= 1);
});

test("food-crisis: benchmarkMode bypass prevents emit (headless determinism)", () => {
  const state = freshState();
  state.resources.food = 0;
  state.ai.enabled = true;
  state.benchmarkMode = true;
  emitEvent(state, EVENT_TYPES.WORKER_STARVED, { reason: "starvation" });
  const sys = new ResourceSystem();
  sys.update(1 / 30, state);
  const found = state.events.log.find((e) => e.type === EVENT_TYPES.FOOD_CRISIS_DETECTED);
  assert.ok(!found, "benchmarkMode=true must bypass the crisis emit");
});

test("food-crisis: food>0 → no emit", () => {
  const state = freshState();
  state.resources.food = 50;
  state.ai.enabled = true;
  emitEvent(state, EVENT_TYPES.WORKER_STARVED, { reason: "starvation" });
  const sys = new ResourceSystem();
  sys.update(1 / 30, state);
  const found = state.events.log.find((e) => e.type === EVENT_TYPES.FOOD_CRISIS_DETECTED);
  assert.ok(!found, "food>0 must not trigger a crisis emit");
});

test("food-crisis: autopilot off → no emit", () => {
  const state = freshState();
  state.resources.food = 0;
  state.ai.enabled = false;
  emitEvent(state, EVENT_TYPES.WORKER_STARVED, { reason: "starvation" });
  const sys = new ResourceSystem();
  sys.update(1 / 30, state);
  const found = state.events.log.find((e) => e.type === EVENT_TYPES.FOOD_CRISIS_DETECTED);
  assert.ok(!found, "autopilot off must not trigger crisis emit");
});

test("food-crisis: no starvation deaths in last 30s → no emit", () => {
  const state = freshState();
  state.resources.food = 0;
  state.ai.enabled = true;
  // No WORKER_STARVED events.
  const sys = new ResourceSystem();
  sys.update(1 / 30, state);
  const found = state.events.log.find((e) => e.type === EVENT_TYPES.FOOD_CRISIS_DETECTED);
  assert.ok(!found, "no deaths → no crisis emit");
});

test("food-crisis: 5s cooldown suppresses duplicate emits", () => {
  const state = freshState();
  state.resources.food = 0;
  state.ai.enabled = true;
  emitEvent(state, EVENT_TYPES.WORKER_STARVED, { reason: "starvation" });
  const sys = new ResourceSystem();
  sys.update(1 / 30, state);
  const first = state.events.log.filter((e) => e.type === EVENT_TYPES.FOOD_CRISIS_DETECTED);
  assert.equal(first.length, 1, "first call emits exactly one crisis");
  // Advance time only 2 s (< 5 s cooldown) and re-run.
  state.metrics.timeSec += 2;
  sys.update(1 / 30, state);
  const second = state.events.log.filter((e) => e.type === EVENT_TYPES.FOOD_CRISIS_DETECTED);
  assert.equal(second.length, 1, "cooldown must keep emit count at 1 within 5 s");
});

test("food-precrisis: low runway emits before any starvation death", () => {
  const state = freshState();
  state.resources.food = 4;
  state.ai.enabled = true;
  state.metrics.foodProducedPerMin = 0;
  state.metrics.foodConsumedPerMin = 18;
  state.metrics.starvationRiskCount = 0;

  const sys = new ResourceSystem();
  sys.update(1 / 30, state);

  const pre = state.events.log.find((e) => e.type === EVENT_TYPES.FOOD_PRECRISIS_DETECTED);
  const crisis = state.events.log.find((e) => e.type === EVENT_TYPES.FOOD_CRISIS_DETECTED);
  assert.ok(pre, "FOOD_PRECRISIS_DETECTED should warn on unsafe runway");
  assert.ok(!crisis, "pre-crisis must not require or imply starvation deaths");
  // Use tolerance: warehouse spoilage may reduce food by a tiny amount within a single tick
  assert.ok(Math.abs(pre.detail.foodStock - 4) < 0.05, `foodStock should be ~4, got ${pre.detail.foodStock}`);
});
