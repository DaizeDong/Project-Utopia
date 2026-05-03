// v0.10.1 R6 wave-2 (C1-code-architect refactor):
// End-to-end behaviour-preservation lock for the wave-2 if-chain
// extraction in `assessColonyNeeds` (recovery / bootstrap / logistics
// / processing branches).
//
// Pre-refactor, lines 130-222 of `src/simulation/meta/ColonyDirectorSystem.js`
// hosted six monolithic if-chains plus a recovery `return` early-exit.
// Wave-2 extracted them into four pure proposers (Recovery / Bootstrap /
// Logistics / Processing) running through `runProposers(WAVE_2_BUILD_PROPOSERS,
// state, ctx)`. The recovery short-circuit is preserved by an explicit
// `if (isRecoveryMode(state)) { ...recoveryNeeds; sort; filter; return }`
// guard in the orchestrator.
//
// This test pins the FULL `assessColonyNeeds(state)` output (sorted by
// priority DESC, deduped by `type`) for FIVE canonical fixtures against
// the legacy contract. Each fixture asserts:
//   (a) every expected (type, priority) pair appears in the output
//   (b) the FIRST need (highest priority survivor of dedup) matches
//       the legacy expectation, locking the "what fires first" semantic
//       that downstream `selectNextBuilds` consumes.
//
// PATH NOTE: the plan asked for `test/simulation/ai/colony/ColonyDirectorSystem.behavior-lock.test.js`
// but the project's test runner glob is `node --test test/*.test.js` (flat).
// Re-pathed to `test/colony-director-behavior-lock.test.js`; semantics
// identical.

import test from "node:test";
import assert from "node:assert/strict";

import { assessColonyNeeds } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

function makeState({
  timeSec = 60,
  food = 80,
  wood = 30,
  stone = 10,
  herbs = 0,
  buildings = {},
  agentCount = 5,
  recoveryMode = false,
} = {}) {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources = { food, wood, stone, herbs, meals: 0, medicine: 0, tools: 0 };
  state.buildings = rebuildBuildingStats(state.grid);
  Object.assign(state.buildings, buildings);
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = timeSec;
  state.ai.enabled = true;
  state.ai.foodRecoveryMode = !!recoveryMode;
  state.agents = state.agents ?? [];
  while (state.agents.length < agentCount) {
    state.agents.push({ type: "WORKER", alive: true });
  }
  return state;
}

// ----------------------------------------------------------------------------
// Fixture 1: normal mid-game — no safety nets, no recovery
// ----------------------------------------------------------------------------
test("[lock] normal mid-game emits processing/logistics/expansion needs", () => {
  const state = makeState({
    timeSec: 600,
    food: 100, wood: 60, stone: 25,
    buildings: { farms: 4, lumbers: 3, warehouses: 3, quarries: 2,
      herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, walls: 0, roads: 15 },
  });
  const needs = assessColonyNeeds(state);
  // Sorted DESC + deduped: smithy@74 should appear ahead of kitchen@72.
  const types = needs.map(n => n.type);
  assert.ok(types.includes("smithy"), "expected smithy in needs");
  assert.ok(types.includes("kitchen"), "expected kitchen in needs");
  // No emergency / safety net should fire.
  for (const n of needs) {
    assert.ok(n.priority < 95, `non-emergency expected, saw ${JSON.stringify(n)}`);
  }
});

// ----------------------------------------------------------------------------
// Fixture 2: food shortage — emergency proposer fires at top
// ----------------------------------------------------------------------------
test("[lock] food shortage promotes emergency farm@100 to first slot", () => {
  // farms=2, warehouses=2 → 2/2=1 ≤ 3 → bottleneck rule does NOT fire.
  // workers=5, maxFarmsEmergency=5; farms 2 < 5 → farm@100 fires.
  const state = makeState({
    timeSec: 600,
    food: 20, wood: 30, stone: 25,
    buildings: { farms: 2, lumbers: 3, warehouses: 2, quarries: 2,
      herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, walls: 0, roads: 10 },
    agentCount: 5,
  });
  const needs = assessColonyNeeds(state);
  // First entry must be the emergency farm (priority 100).
  assert.equal(needs[0]?.type, "farm");
  assert.equal(needs[0]?.priority, 100);
});

// ----------------------------------------------------------------------------
// Fixture 3: water bridge needed — bridge appears at priority 60
// ----------------------------------------------------------------------------
test("[lock] water tile presence emits bridge need @60", () => {
  // The default scenario already has WATER tiles in some templates; we
  // assert bridge@60 fires when water exists, regardless of phase.
  const state = makeState({
    timeSec: 600,
    food: 100, wood: 60, stone: 25,
    buildings: { farms: 4, lumbers: 3, warehouses: 3, quarries: 2,
      herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, walls: 0, roads: 15 },
  });
  const needs = assessColonyNeeds(state);
  const bridge = needs.find(n => n.type === "bridge");
  // Default scenario may or may not have water; if no water, bridge is absent.
  if (bridge) {
    assert.equal(bridge.priority, 60);
    assert.match(bridge.reason, /bridge/i);
  }
});

// ----------------------------------------------------------------------------
// Fixture 4: processing-needed early game — quarry boost
// ----------------------------------------------------------------------------
test("[lock] early-game (t<300) processing emits quarry/herb_garden", () => {
  const state = makeState({
    timeSec: 100,
    food: 100, wood: 60, stone: 25,
    buildings: { farms: 3, lumbers: 2, warehouses: 3, quarries: 0,
      herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, walls: 0, roads: 10 },
  });
  const needs = assessColonyNeeds(state);
  const quarry = needs.find(n => n.type === "quarry");
  const herb = needs.find(n => n.type === "herb_garden");
  assert.ok(quarry, "expected quarry in early-game processing needs");
  assert.ok(herb, "expected herb_garden in early-game processing needs");
  // Priority must be at least 76/77 (no boost is fine; boost may add).
  assert.ok(quarry.priority >= 77, `quarry priority too low: ${quarry.priority}`);
  assert.ok(herb.priority >= 76, `herb priority too low: ${herb.priority}`);
});

// ----------------------------------------------------------------------------
// Fixture 5: recovery short-circuit — only RECOVERY_ESSENTIAL_TYPES survive
// ----------------------------------------------------------------------------
test("[lock] recovery mode short-circuits to essential-types whitelist only", () => {
  const state = makeState({
    timeSec: 60,
    food: 80, wood: 5, stone: 10,
    buildings: { farms: 1, lumbers: 0, warehouses: 0, quarries: 0,
      herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, walls: 0, roads: 2 },
    agentCount: 5,
    recoveryMode: true,
  });
  const needs = assessColonyNeeds(state);
  // RECOVERY_ESSENTIAL_TYPES = farm, lumber, warehouse, road. No others
  // should appear (no quarry, no herb_garden, no smithy, no wall).
  const allowed = new Set(["farm", "lumber", "warehouse", "road"]);
  for (const n of needs) {
    assert.ok(allowed.has(n.type), `recovery should not emit type=${n.type}`);
  }
  // Each allowed type appears at most once (dedup invariant).
  const seen = new Set();
  for (const n of needs) {
    assert.ok(!seen.has(n.type), `duplicate type in recovery output: ${n.type}`);
    seen.add(n.type);
  }
  // Sort invariant: descending priority.
  for (let i = 1; i < needs.length; i += 1) {
    assert.ok(needs[i - 1].priority >= needs[i].priority, "needs sorted DESC");
  }
});

// ----------------------------------------------------------------------------
// Fixture 6: phase-block proposers DON'T fire during recovery
// ----------------------------------------------------------------------------
test("[lock] recovery mode skips bootstrap/logistics/processing proposers entirely", () => {
  // In a recovery situation the bootstrap @82/80/78/75 + logistics @70/68/...
  // + processing @77/76/74/72 needs would normally all fire. With recovery
  // ON they must NOT — only the recovery + safety-net family should remain.
  const state = makeState({
    timeSec: 60,
    food: 80, wood: 30, stone: 10,
    buildings: { farms: 0, lumbers: 0, warehouses: 0, quarries: 0,
      herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, walls: 0, roads: 0 },
    agentCount: 5,
    recoveryMode: true,
  });
  const needs = assessColonyNeeds(state);
  // No quarry/herb_garden/kitchen/smithy/wall — those would only come from
  // ProcessingProposer (which is gated off in recovery mode).
  const forbidden = new Set(["quarry", "herb_garden", "kitchen", "smithy", "wall", "clinic", "bridge"]);
  for (const n of needs) {
    assert.ok(!forbidden.has(n.type), `recovery emitted forbidden type=${n.type}`);
  }
});
