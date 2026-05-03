// PT-invasion-pressure (R8) — invariant tests for the three-step raid
// pressure restore: (a) eventDirectorWeights.banditRaid revert from
// R6 PJ-followup over-correction, (b) raidIntervalReductionPerTier bump,
// (c) RaidEscalatorSystem injecting tier-driven SABOTEUR visitors when
// self-firing a banditRaid at tier ≥ raidEscalatorTierSaboteurThreshold.
//
// Plan: assignments/homework7/Final-Polish-Loop/Round8/Plans/PT-invasion-pressure.md

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { RaidEscalatorSystem, computeRaidEscalation } from "../src/simulation/meta/RaidEscalatorSystem.js";
import { BALANCE } from "../src/config/balance.js";
import { ENTITY_TYPE, VISITOR_KIND } from "../src/config/constants.js";

// ---------------------------------------------------------------------------
// Test 1 — locks the R6 → R8 weight revert. PT god-mode harness measured
// 5 raids in 30 sim-min vs target ~9; restoring banditRaid 0.18 → 0.30 is
// the headline fix and must not be silently reverted by a future pass.
// ---------------------------------------------------------------------------
test("PT-R8: BALANCE.eventDirectorWeights.banditRaid restored to 0.30", () => {
  assert.equal(BALANCE.eventDirectorWeights.banditRaid, 0.30,
    "banditRaid weight must be 0.30 (R8 revert of R6 PJ-followup over-correction)");
  assert.equal(BALANCE.eventDirectorWeights.animalMigration, 0.34,
    "animalMigration weight must be 0.34 (partial offset for the +0.12 raid bump)");
  // Net total drifts to 1.12 (was 1.06): bandit +0.12, migration -0.06.
  // Locks the deliberate share shift (raid 17% → 27% of total weight).
  const sum = Object.values(BALANCE.eventDirectorWeights)
    .reduce((acc, v) => acc + v, 0);
  assert.ok(Math.abs(sum - 1.12) < 1e-9,
    `eventDirectorWeights sum should be 1.12 after R8 (was 1.06), got ${sum}`);
});

// ---------------------------------------------------------------------------
// Test 2 — locks raidIntervalReductionPerTier bump 300 → 450 + the new
// saboteur-injection knobs. tier 6 ⇒ max(600, 3600 - 6×450) = 900 ticks
// (30 sim-sec) vs prior 1800 (60s).
// ---------------------------------------------------------------------------
test("PT-R8: raidIntervalReductionPerTier=450 + saboteur knobs present", () => {
  assert.equal(BALANCE.raidIntervalReductionPerTier, 450,
    "raidIntervalReductionPerTier must be 450 (R8 cadence bump)");
  assert.equal(BALANCE.raidEscalatorTierSaboteurThreshold, 5,
    "raidEscalatorTierSaboteurThreshold must be 5");
  assert.equal(BALANCE.raidEscalatorTierSaboteurMax, 6,
    "raidEscalatorTierSaboteurMax must be 6");
  // Verify tier 6 cadence resolves to 900 ticks (30 sim-sec at 30Hz).
  const tier = 6;
  const intervalAtTier6 = Math.max(
    Number(BALANCE.raidIntervalMinTicks),
    Number(BALANCE.raidIntervalBaseTicks) - tier * Number(BALANCE.raidIntervalReductionPerTier),
  );
  assert.equal(intervalAtTier6, 900,
    `tier 6 interval should be 900 ticks (30 sim-sec), got ${intervalAtTier6}`);
});

// ---------------------------------------------------------------------------
// Helper — pick a devIndexSmoothed value that, after the v0.8.5 log-curve in
// computeRaidEscalation, yields exactly `targetTier`. The fallback scheduler
// reads the bundle that update() writes from devIndexSmoothed, so we must
// drive the input rather than overwrite the output.
// ---------------------------------------------------------------------------
function pickDIForTier(targetTier) {
  // Coarse sweep — pick the first integer DI that maps to targetTier via
  // computeRaidEscalation (matches the live formula exactly).
  for (let di = 0; di < 200; di += 1) {
    if (computeRaidEscalation(di).tier === targetTier) return di;
  }
  throw new Error(`no DI in [0,200) maps to tier ${targetTier}`);
}

// ---------------------------------------------------------------------------
// Helper — wire a state through the fallback-scheduler floors so the
// banditRaid self-fire reliably triggers at the desired tier, then drive
// RaidEscalatorSystem and return the count of newly-spawned saboteurs.
// ---------------------------------------------------------------------------
function runFallbackAtTier(seed, targetTier) {
  const state = createInitialGameState({ seed });
  const services = createServices(state.world.mapSeed);

  // Drive the live tier via devIndexSmoothed — update() recomputes the
  // bundle from this on every call, so anything we write to raidEscalation
  // directly would be clobbered.
  state.gameplay.devIndexSmoothed = pickDIForTier(targetTier);
  state.gameplay.lastRaidTick = -9999;

  // Pass the four floors: timeSec ≥ graceSec, alive ≥ popFloor, food ≥ foodFloor,
  // tick advanced past intervalTicks, and no queued/active raid.
  state.metrics ??= {};
  state.metrics.tick = 1_000_000;     // far past any intervalTicks
  state.metrics.timeSec = Number(BALANCE.raidFallbackGraceSec ?? 90) + 60;
  state.resources ??= {};
  state.resources.food = Number(BALANCE.raidFallbackFoodFloor ?? 30) + 100;
  state.events ??= { queue: [], active: [] };
  state.events.queue ??= [];
  state.events.active ??= [];

  // Spawn enough live agents to clear popFloor (default 10).
  const popFloor = Number(BALANCE.raidFallbackPopFloor ?? 10);
  state.agents ??= [];
  while (state.agents.filter((a) => a && a.alive !== false).length < popFloor) {
    state.agents.push({ id: `pad-${state.agents.length}`, type: ENTITY_TYPE.WORKER, alive: true });
  }

  const saboteursBefore = state.agents.filter(
    (a) => a && a.type === ENTITY_TYPE.VISITOR && a.kind === VISITOR_KIND.SABOTEUR,
  ).length;

  const sys = new RaidEscalatorSystem();
  sys.update(1 / 30, state, services);

  // Sanity-check: the live tier matches what we asked for (catches future
  // perTier retunes that would silently invalidate this test's setup).
  assert.equal(state.gameplay.raidEscalation.tier, targetTier,
    `live tier should match targetTier (${targetTier}) after pickDIForTier; got ${state.gameplay.raidEscalation.tier}`);

  const saboteursAfter = state.agents.filter(
    (a) => a && a.type === ENTITY_TYPE.VISITOR && a.kind === VISITOR_KIND.SABOTEUR,
  ).length;
  return { state, services, spawned: saboteursAfter - saboteursBefore };
}

// ---------------------------------------------------------------------------
// Test 3 — tier 5 self-fire spawns exactly 1 saboteur (= 5 - 5 + 1).
// ---------------------------------------------------------------------------
test("PT-R8: RaidEscalator self-fire at tier 5 spawns 1 saboteur", () => {
  const { spawned } = runFallbackAtTier(2026501, 5);
  assert.equal(spawned, 1,
    `tier 5 self-fire should spawn (tier - threshold + 1) = 1 saboteur, got ${spawned}`);
});

// ---------------------------------------------------------------------------
// Test 4 — tier 6 self-fire spawns exactly 2 saboteurs (= 6 - 5 + 1).
// ---------------------------------------------------------------------------
test("PT-R8: RaidEscalator self-fire at tier 6 spawns 2 saboteurs", () => {
  const { spawned } = runFallbackAtTier(2026502, 6);
  assert.equal(spawned, 2,
    `tier 6 self-fire should spawn (tier - threshold + 1) = 2 saboteurs, got ${spawned}`);
});

// ---------------------------------------------------------------------------
// Test 5 — tier 4 (below threshold) spawns 0 saboteurs. Confirms the
// threshold gate, not just count math.
// ---------------------------------------------------------------------------
test("PT-R8: RaidEscalator self-fire at tier 4 spawns 0 saboteurs", () => {
  const { spawned } = runFallbackAtTier(2026503, 4);
  assert.equal(spawned, 0,
    `tier 4 (< threshold 5) should spawn 0 saboteurs, got ${spawned}`);
});
