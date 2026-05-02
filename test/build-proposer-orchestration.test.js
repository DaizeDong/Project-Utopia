// v0.10.1 R5 wave-1 (C1-build-proposer refactor):
// Behaviour-preservation lock for the C1 wave-1 extraction.
//
// Pre-refactor, lines 96-161 of `src/simulation/meta/ColonyDirectorSystem.js`
// hosted four priority-95+ "safety net" if-blocks. The wave-1 refactor
// extracts those blocks into `BuildProposer` instances and orchestrates
// them via `runProposers(DEFAULT_BUILD_PROPOSERS, state, ctx)`. The
// downstream branches in `assessColonyNeeds` (recovery / bootstrap /
// logistics / processing / fortification / expansion / continuous) are
// unchanged.
//
// This test pins the *safety-net subset* of `assessColonyNeeds`'s output
// for SIX canonical state configurations against the byte-identical
// expected output replayed from the legacy if-block contracts. Future
// wave-2 changes that move proposers into the recovery branch (or
// elsewhere) MUST update both the legacy contract here and the snapshot
// in lockstep.
//
// Each fixture entry has:
//   - name: human-readable scenario id.
//   - input: subset of state to override on top of `createInitialGameState`.
//   - expectedSafetyNet: array of {type, priority, reason} that the four
//     wave-1 proposers MUST emit for this state, in registration order.
//
// We assert that:
//   (a) Every record in `expectedSafetyNet` appears verbatim in the output.
//   (b) No spurious safety-net record sneaks in (count match).
//
// NOTE on order:
//   `assessColonyNeeds` ends with a `needs.sort((a,b) => b.priority - a.priority)`
//   followed by a `seen Set` dedup that keeps the highest-priority record per
//   `type`. So the FINAL output order is determined by sort+dedup, not by the
//   proposer registration order. We rely on `build-proposer-interface.test.js`
//   for proposer registration order; here we only validate the SET of safety-
//   net records that survive sort+dedup.

import test from "node:test";
import assert from "node:assert/strict";

import { assessColonyNeeds } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

// -----------------------------------------------------------------------------
// State helpers
// -----------------------------------------------------------------------------

function makeState({
  timeSec = 0,
  food = 80,
  wood = 30,
  stone = 10,
  herbs = 0,
  buildings = {},
  agentCount = 5,
} = {}) {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources = {
    food, wood, stone, herbs,
    meals: 0, medicine: 0, tools: 0,
  };
  state.buildings = rebuildBuildingStats(state.grid);
  Object.assign(state.buildings, buildings);
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = timeSec;
  state.ai.enabled = true;
  // Make sure recovery mode is OFF so the safety-net section is observable
  // (recovery branch returns early and filters everything to the recovery
  // whitelist; we test recovery interaction separately).
  state.ai.foodRecoveryMode = false;
  // Force enough agents to satisfy "workers" computation in assessColonyNeeds.
  state.agents = state.agents ?? [];
  while (state.agents.length < agentCount) {
    state.agents.push({ type: "WORKER", alive: true });
  }
  return state;
}

// Helper: filter `needs` down to records that COULD have come from the
// wave-1 safety-net section (priority >= 95 AND reason matches one of the
// four legacy patterns). The downstream branches in assessColonyNeeds
// never emit priority >= 95, so this filter is exact.
function safetyNetSubset(needs) {
  const SAFETY_REASONS = [
    /zero-farm safety net/,
    /zero-lumber safety net/,
    /safety net: stone deficit/,
    /emergency: food logistics bottleneck/,
    /emergency food shortage/,
    /emergency: need more warehouses/,
    /emergency wood shortage/,
  ];
  return needs.filter((n) =>
    typeof n.reason === "string"
    && SAFETY_REASONS.some((re) => re.test(n.reason)),
  );
}

// -----------------------------------------------------------------------------
// Six canonical fixtures — replays of the legacy if-block contracts.
// -----------------------------------------------------------------------------
//
// Legacy contract (parent commit d08a60f, ColonyDirectorSystem.js:101-161):
//
//   maxFarmsEmergency = max(5, workers)
//
//   1. ZeroFarm:   farms===0 && timeSec<180 → push farm@99
//                  reason: "bootstrap: zero-farm safety net"
//
//   2. ZeroLumber: lumbers===0 && timeSec<240 → push lumber@95
//                  reason: "bootstrap: zero-lumber safety net (analog to zero-farm @99)"
//
//   3. ZeroQuarry: (quarries===0 && stone<15) || stone<5 → push quarry@95
//                  reason: "safety net: stone deficit"
//
//   4. EmergencyShortage:
//      4a. food<30 && farms>=3 && warehouses>0 && farms/warehouses>3
//          → push warehouse@100  reason: "emergency: food logistics bottleneck"
//      4b. else if food<30 && farms<maxFarmsEmergency
//          → push farm@100       reason: "emergency food shortage"
//      4c. else if food<30 && warehouses<floor(workers/5)+2
//          → push warehouse@100  reason: "emergency: need more warehouses"
//      4d. wood<15 && lumbers<6
//          → push lumber@95      reason: "emergency wood shortage"

const FIXTURES = [
  {
    name: "cold-start (t=0, no buildings, default resources)",
    input: {
      timeSec: 0,
      food: 80, wood: 30, stone: 10,
      buildings: { farms: 0, lumbers: 0, warehouses: 0, quarries: 0 },
      agentCount: 5,
    },
    expectedSafetyNet: [
      { type: "farm",   priority: 99, reason: "bootstrap: zero-farm safety net" },
      { type: "lumber", priority: 95, reason: "bootstrap: zero-lumber safety net (analog to zero-farm @99)" },
      { type: "quarry", priority: 95, reason: "safety net: stone deficit" },
      // food=80 → no emergency food rule fires; wood=30 → no emergency lumber.
    ],
  },
  {
    name: "early-game with one farm placed (t=60, farms=1)",
    input: {
      timeSec: 60,
      food: 80, wood: 30, stone: 20,
      buildings: { farms: 1, lumbers: 0, warehouses: 1, quarries: 1 },
    },
    expectedSafetyNet: [
      // ZeroFarm: farms=1 → silent
      { type: "lumber", priority: 95, reason: "bootstrap: zero-lumber safety net (analog to zero-farm @99)" },
      // ZeroQuarry: quarries=1 AND stone=20 → silent
      // Emergency: food=80 → no food rule; wood=30 → no wood rule
    ],
  },
  {
    name: "mid-game (t=600, no safety nets active)",
    input: {
      timeSec: 600,
      food: 100, wood: 60, stone: 25,
      buildings: { farms: 4, lumbers: 3, warehouses: 2, quarries: 2 },
    },
    expectedSafetyNet: [
      // All four proposers silent.
    ],
  },
  {
    name: "food-bottleneck mid-game (food=20, farms=8, warehouses=2)",
    input: {
      timeSec: 600,
      food: 20, wood: 30, stone: 25,
      buildings: { farms: 8, lumbers: 3, warehouses: 2, quarries: 2 },
      agentCount: 5,
    },
    expectedSafetyNet: [
      // ZeroFarm/Lumber/Quarry silent.
      // Emergency 4a: food=20<30, farms=8>=3, warehouses=2>0, 8/2=4>3 → fires.
      { type: "warehouse", priority: 100, reason: "emergency: food logistics bottleneck" },
    ],
  },
  {
    name: "stone-deficit late-game (stone=2 with quarries=3)",
    input: {
      timeSec: 600,
      food: 100, wood: 50, stone: 2,
      buildings: { farms: 5, lumbers: 3, warehouses: 3, quarries: 3 },
    },
    expectedSafetyNet: [
      // ZeroQuarry 2nd sub-rule: stone=2<5 → fires regardless of quarries.
      { type: "quarry", priority: 95, reason: "safety net: stone deficit" },
    ],
  },
  {
    name: "compound emergency (food=20, wood=5, lumbers=1)",
    // NOTE: food must stay strictly above the recovery-mode workerFloor
    // (max(12, workers*0.32) = 12 for workers=5) — otherwise
    // isFoodRunwayUnsafe(state) flips on, the recovery branch returns
    // early, and the safety-net subset gets filtered through the
    // RECOVERY_ESSENTIAL_TYPES whitelist + dedupe (which would drop
    // quarry and one lumber). We test recovery interaction separately
    // in colony-director.test.js. Here we want non-recovery behaviour.
    input: {
      timeSec: 60,
      food: 20, wood: 5, stone: 10,
      // farms=2 < maxFarmsEmergency=5; warehouses=1; farms/warehouse=2 ≤ 3 → 4a silent, 4b fires.
      // wood=5<15 + lumbers=1<6 → 4d fires.
      buildings: { farms: 2, lumbers: 1, warehouses: 1, quarries: 0 },
      agentCount: 5,
    },
    expectedSafetyNet: [
      // ZeroFarm: farms=2 → silent
      // ZeroLumber: lumbers=1 → silent
      { type: "quarry", priority: 95, reason: "safety net: stone deficit" },
      { type: "farm",   priority: 100, reason: "emergency food shortage" },
      { type: "lumber", priority: 95,  reason: "emergency wood shortage" },
    ],
  },
];

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

for (const fixture of FIXTURES) {
  test(`safety-net behaviour preserved: ${fixture.name}`, () => {
    const state = makeState(fixture.input);
    const needs = assessColonyNeeds(state);
    const observed = safetyNetSubset(needs);

    // (a) Each expected record appears at least once in the observed
    //     safety-net subset, with identical type/priority/reason.
    for (const expected of fixture.expectedSafetyNet) {
      const match = observed.find((n) =>
        n.type === expected.type
        && n.priority === expected.priority
        && n.reason === expected.reason,
      );
      assert.ok(
        match,
        `[${fixture.name}] missing expected safety-net record `
        + `${JSON.stringify(expected)}; observed: `
        + `${JSON.stringify(observed.map((n) => ({ t: n.type, p: n.priority, r: n.reason })))}`,
      );
    }

    // (b) No spurious safety-net records: observed.length must equal
    //     expectedSafetyNet.length.
    const observedSerial = observed.map((n) => `${n.type}@${n.priority}|${n.reason}`);
    assert.equal(
      observed.length, fixture.expectedSafetyNet.length,
      `[${fixture.name}] spurious safety-net record(s) present; `
      + `observed: ${JSON.stringify(observedSerial)}; expected count `
      + `${fixture.expectedSafetyNet.length}`,
    );
  });
}

// Bonus invariant: when both ZeroFarm@99 and Emergency food-shortage@100
// fire for the same `farm` type, the dedup at the end of assessColonyNeeds
// keeps the higher-priority record (@100). This pins the pre-existing
// dedup behaviour — the wave-1 refactor must not change which record
// survives.
test("dedup pins highest-priority survivor across proposers + downstream branches", () => {
  // farms=0, food=20 (under emergency threshold but above recovery floor),
  // workers=12 (default initial state). Both ZeroFarm@99 and Emergency
  // food-shortage @100 push a `farm` record.
  const state = makeState({
    timeSec: 60,
    food: 20, wood: 30, stone: 20,
    buildings: { farms: 0, lumbers: 1, warehouses: 1, quarries: 1 },
  });
  const needs = assessColonyNeeds(state);
  const farm = needs.find((n) => n.type === "farm");
  assert.ok(farm, "expected a farm record after dedup");
  assert.equal(
    farm.priority, 100,
    `dedup must keep the higher-priority farm@100 (emergency) over farm@99 (zero-farm safety net); got ${JSON.stringify(farm)}`,
  );
});
