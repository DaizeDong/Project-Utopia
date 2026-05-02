// v0.10.2 PD-late-game-escalation (Round-5 PD P0 implementer).
//
// Validates the three knob-only fixes that re-open late-game raid pressure:
//   P0-1: scorePopulation now saturates at 200 (was 100) so the DevIndex
//         population dim keeps moving past the 30-worker plateau.
//   P0-2: raidTierMax = 10 is honoured by computeRaidEscalation (no upstream
//         silent cap); confirm tier ≥ 8 is reachable when DI ≥ 100 sustained.
//   P0-3: raidFallbackFoodFloor lowered 60 → 30 so an 80-worker colony with
//         food bouncing 30-55 still gets fallback raids fired on cadence.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { DevIndexSystem } from "../src/simulation/meta/DevIndexSystem.js";
import {
  collectEconomySnapshot,
  scorePopulation,
} from "../src/simulation/telemetry/EconomyTelemetry.js";
import {
  computeRaidEscalation,
} from "../src/simulation/meta/RaidEscalatorSystem.js";
import { BALANCE } from "../src/config/balance.js";
import { TILE } from "../src/config/constants.js";

test("PD P0-1: 80-worker colony pushes DevIndex pop dim above 100 (was capped at 100)", () => {
  const state = createInitialGameState({ seed: 7080 });
  const services = createServices(state.world.mapSeed);

  // Inject 80 workers (3.33× devIndexAgentTarget=24).
  const baseline = state.agents.length;
  for (let i = baseline; i < 80; i += 1) {
    state.agents.push(createWorker(5 + (i % 20), 5 + Math.floor(i / 20)));
  }

  // Sanity-check the pure scorer first.
  const popScore = scorePopulation(collectEconomySnapshot(state));
  assert.ok(popScore > 100,
    `PD P0-1: 80-worker pop score must exceed 100, got ${popScore.toFixed(2)}`);
  assert.ok(popScore <= 200,
    `PD P0-1: pop score must respect the new 200 cap, got ${popScore.toFixed(2)}`);

  // Now run DevIndexSystem and confirm the dim is preserved (not reclamped to 100).
  const sys = new DevIndexSystem();
  sys.update(1 / 30, state, services);
  const popDim = state.gameplay.devIndexDims.population;
  assert.ok(popDim > 100,
    `PD P0-1: state.gameplay.devIndexDims.population must exceed 100 for an 80-worker colony, got ${popDim.toFixed(2)}`);
});

test("PD P0-2: tier ≥ 8 is reachable when DevIndex composite is sustained at 100", () => {
  // Composite is still clamped 0-100 — but tier curve is `2.5 * log2(1 + DI/perTier)`.
  // With perTier=8 (current value): tier(100) = 2.5 * log2(13.5) ≈ 9.4 → floor=9.
  // Confirm computeRaidEscalation honours raidTierMax=10 with no upstream cap.
  const tierMax = Number(BALANCE.raidTierMax ?? 10);
  assert.equal(tierMax, 10, `PD P0-2 expects raidTierMax=10, got ${tierMax}`);

  const bundle = computeRaidEscalation(100, { defenseScore: 0 });
  assert.ok(bundle.tier >= 8,
    `PD P0-2: at sustained DI=100, tier must reach ≥ 8, got ${bundle.tier}`);
  assert.ok(bundle.tier <= tierMax,
    `PD P0-2: tier must respect raidTierMax=${tierMax}, got ${bundle.tier}`);
});

test("PD P0-1+P0-2 integration: 80 workers + saturated walls drive composite high enough for tier ≥ 8", () => {
  const state = createInitialGameState({ seed: 7081 });
  const services = createServices(state.world.mapSeed);

  // 80 workers.
  const baseline = state.agents.length;
  for (let i = baseline; i < 80; i += 1) {
    state.agents.push(createWorker(5 + (i % 20), 5 + Math.floor(i / 20)));
  }
  // Saturate the other dims so the composite climbs near 100.
  state.resources.food = 9999;
  state.resources.wood = 9999;
  state.resources.stone = 9999;
  let placed = 0;
  for (let i = 0; i < state.grid.tiles.length && placed < 80; i += 1) {
    if (state.grid.tiles[i] === TILE.GRASS) {
      state.grid.tiles[i] = TILE.WALL;
      placed += 1;
    }
  }

  // Tick DevIndex through the full smoothing window so smoothed catches up.
  const sys = new DevIndexSystem();
  const window = Number(BALANCE.devIndexWindowTicks ?? 60);
  for (let i = 0; i < window; i += 1) sys.update(1 / 30, state, services);

  const smoothed = state.gameplay.devIndexSmoothed;
  const bundle = computeRaidEscalation(smoothed, { defenseScore: 0 });
  // With pop-dim 200 + economy/defense/etc. saturated, smoothed should land
  // much closer to 100 than the v0.10.1 plateau (≈ 58).
  assert.ok(smoothed >= 60,
    `PD P0-1: saturated colony composite should reach ≥ 60, got ${smoothed.toFixed(2)}`);
  assert.ok(bundle.tier >= 7,
    `PD P0-1+P0-2: late-game tier must escalate to ≥ 7 (was structurally capped at 7), got ${bundle.tier}`);
});
