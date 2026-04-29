import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { RaidEscalatorSystem, computeRaidEscalation } from "../src/simulation/meta/RaidEscalatorSystem.js";
import { BALANCE } from "../src/config/balance.js";

// ---------------------------------------------------------------------------
// Case 1 — devIndexSmoothed = 0 ⇒ raidEscalation.tier = 0.
// ---------------------------------------------------------------------------
test("RaidEscalator: DI=0 yields tier 0 and baseline interval/intensity", () => {
  const state = createInitialGameState({ seed: 101 });
  const services = createServices(state.world.mapSeed);
  state.gameplay.devIndexSmoothed = 0;

  const sys = new RaidEscalatorSystem();
  sys.update(1 / 30, state, services);

  const esc = state.gameplay.raidEscalation;
  assert.equal(esc.tier, 0, "tier should be 0 at DI=0");
  assert.equal(esc.intervalTicks, Number(BALANCE.raidIntervalBaseTicks),
    "intervalTicks should equal base at tier 0");
  assert.equal(esc.intensityMultiplier, 1, "intensity multiplier should be 1× at tier 0");
  assert.equal(esc.devIndexSample, 0);
});

// ---------------------------------------------------------------------------
// Case 2 — devIndexSmoothed = 30 ⇒ tier 3 (v0.8.5 log curve).
// Pre-v0.8.5 used floor(DI/15) = floor(2) = 2; v0.8.5 S1 shifted to
// floor(2.5 × log2(1 + DI/15)) = floor(3.96) = 3 to soften late-game tiers.
// ---------------------------------------------------------------------------
test("RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)", () => {
  const state = createInitialGameState({ seed: 102 });
  const services = createServices(state.world.mapSeed);
  state.gameplay.devIndexSmoothed = 30;

  const sys = new RaidEscalatorSystem();
  sys.update(1 / 30, state, services);

  const esc = state.gameplay.raidEscalation;
  assert.equal(esc.tier, 3, `expected tier 3 at DI=30 (log-curve), got ${esc.tier}`);
  const expectedInterval = Math.max(
    Number(BALANCE.raidIntervalMinTicks),
    Number(BALANCE.raidIntervalBaseTicks) - 3 * Number(BALANCE.raidIntervalReductionPerTier),
  );
  assert.equal(esc.intervalTicks, expectedInterval);
  // DI=30 is below the fortified-plateau threshold (60), so the intensity
  // is just the linear tier × intensityPerTier.
  assert.ok(Math.abs(esc.intensityMultiplier - (1 + 3 * Number(BALANCE.raidIntensityPerTier))) < 1e-9);
  assert.equal(esc.devIndexSample, 30);
});

// ---------------------------------------------------------------------------
// Case 3 — large devIndexSmoothed values are capped at raidTierMax so the
// tier never runs away past the balance ceiling. Uses DI = 500 (well beyond
// the natural [0, 100] range) to guarantee the cap activates regardless of
// devIndexPerRaidTier tuning.
// ---------------------------------------------------------------------------
test("RaidEscalator: DI=500 caps tier at raidTierMax (and DI=100 stays ≤ cap)", () => {
  const state = createInitialGameState({ seed: 103 });
  const services = createServices(state.world.mapSeed);
  const sys = new RaidEscalatorSystem();

  // Case 3a — DI=100 (natural upper bound): tier must not exceed the cap.
  state.gameplay.devIndexSmoothed = 100;
  sys.update(1 / 30, state, services);
  assert.ok(state.gameplay.raidEscalation.tier <= Number(BALANCE.raidTierMax),
    `tier must never exceed raidTierMax at DI=100, got ${state.gameplay.raidEscalation.tier}`);

  // Case 3b — DI=500 (well beyond natural range): tier must be exactly the cap.
  state.gameplay.devIndexSmoothed = 500;
  sys.update(1 / 30, state, services);
  assert.equal(state.gameplay.raidEscalation.tier, Number(BALANCE.raidTierMax),
    `expected tier to cap at raidTierMax (${BALANCE.raidTierMax}) at DI=500, got ${state.gameplay.raidEscalation.tier}`);
});

// ---------------------------------------------------------------------------
// Case 4 — intervalTicks decreases monotonically as tier rises.
// ---------------------------------------------------------------------------
test("RaidEscalator: intervalTicks decreases monotonically with tier", () => {
  const samples = [];
  // Walk tier 0 → raidTierMax via DI steps.
  const perTier = Number(BALANCE.devIndexPerRaidTier);
  for (let t = 0; t <= Number(BALANCE.raidTierMax); t += 1) {
    const bundle = computeRaidEscalation(t * perTier);
    samples.push({ tier: t, interval: bundle.intervalTicks });
  }
  // Interval non-increasing + floor at raidIntervalMinTicks.
  for (let i = 1; i < samples.length; i += 1) {
    assert.ok(samples[i].interval <= samples[i - 1].interval,
      `interval should not increase: tier ${samples[i - 1].tier}=${samples[i - 1].interval} → tier ${samples[i].tier}=${samples[i].interval}`);
    assert.ok(samples[i].interval >= Number(BALANCE.raidIntervalMinTicks),
      `interval should never drop below raidIntervalMinTicks`);
  }
  // And strictly decrease for at least the first few steps (before the floor).
  assert.ok(samples[1].interval < samples[0].interval,
    "interval must strictly drop between tier 0 and tier 1");
});

// ---------------------------------------------------------------------------
// Case 5 — intensityMultiplier increases monotonically with tier.
// ---------------------------------------------------------------------------
test("RaidEscalator: intensityMultiplier increases monotonically with tier", () => {
  const perTier = Number(BALANCE.devIndexPerRaidTier);
  let prev = -Infinity;
  for (let t = 0; t <= Number(BALANCE.raidTierMax); t += 1) {
    const bundle = computeRaidEscalation(t * perTier);
    assert.ok(bundle.intensityMultiplier >= prev,
      `intensityMultiplier should not decrease: tier ${t - 1}=${prev} → tier ${t}=${bundle.intensityMultiplier}`);
    prev = bundle.intensityMultiplier;
  }
  // Tier-0 baseline is exactly 1×.
  assert.equal(computeRaidEscalation(0).intensityMultiplier, 1);
  // Tier-max is strictly > 1.
  assert.ok(
    computeRaidEscalation(Number(BALANCE.raidTierMax) * perTier).intensityMultiplier > 1,
  );
});

// ---------------------------------------------------------------------------
// Case 6 — missing state.gameplay.devIndexSmoothed falls back to tier 0.
// Covers tests that construct partial state without running DevIndexSystem.
// ---------------------------------------------------------------------------
test("RaidEscalator: missing devIndexSmoothed defaults to tier 0", () => {
  const state = createInitialGameState({ seed: 104 });
  const services = createServices(state.world.mapSeed);
  // Simulate a test that never ran DevIndexSystem: strip the field.
  delete state.gameplay.devIndexSmoothed;

  const sys = new RaidEscalatorSystem();
  assert.doesNotThrow(() => sys.update(1 / 30, state, services));

  const esc = state.gameplay.raidEscalation;
  assert.equal(esc.tier, 0);
  assert.equal(esc.intensityMultiplier, 1);
  assert.equal(esc.intervalTicks, Number(BALANCE.raidIntervalBaseTicks));
  assert.equal(esc.devIndexSample, 0);
});

// ---------------------------------------------------------------------------
// Case 7 — pure helper matches class behaviour so WorldEventSystem can rely
// on a frozen math contract.
// ---------------------------------------------------------------------------
test("RaidEscalator: pure computeRaidEscalation matches class update", () => {
  const state = createInitialGameState({ seed: 105 });
  const services = createServices(state.world.mapSeed);
  const sys = new RaidEscalatorSystem();

  for (const di of [0, 7, 15, 29, 45, 80, 150]) {
    state.gameplay.devIndexSmoothed = di;
    sys.update(1 / 30, state, services);
    const pure = computeRaidEscalation(di);
    const live = state.gameplay.raidEscalation;
    assert.equal(live.tier, pure.tier, `tier mismatch at DI=${di}`);
    assert.equal(live.intervalTicks, pure.intervalTicks, `intervalTicks mismatch at DI=${di}`);
    assert.equal(live.intensityMultiplier, pure.intensityMultiplier, `intensityMultiplier mismatch at DI=${di}`);
  }
});
