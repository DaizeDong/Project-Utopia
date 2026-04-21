import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import {
  collectEconomySnapshot,
  scorePopulation,
  scoreEconomy,
  scoreInfrastructure,
  scoreProduction,
  scoreDefense,
  scoreResilience,
  scoreAllDims,
} from "../src/simulation/telemetry/EconomyTelemetry.js";
import { createWorker } from "../src/entities/EntityFactory.js";
import { TILE, ENTITY_TYPE } from "../src/config/constants.js";

// ---------------------------------------------------------------------------
// Case 1 — Overshooting a dim target saturates at 100, does not exceed.
// ---------------------------------------------------------------------------
test("Saturation: 500 food (2.5× target) saturates economy at 100, does not exceed", () => {
  const state = createInitialGameState({ seed: 500 });
  state.resources.food = 500;
  state.resources.wood = 500;
  state.resources.stone = 500;
  const snapshot = collectEconomySnapshot(state);
  const econScore = scoreEconomy(snapshot);
  assert.ok(econScore <= 100, `econ dim must not exceed 100, got ${econScore}`);
  assert.ok(econScore >= 99, `with all resources at 2.5× target, econ should saturate near 100, got ${econScore}`);
});

test("Saturation: 500 agents (far above target) saturates population at 100", () => {
  const state = createInitialGameState({ seed: 501 });
  // Purge existing agents so we only count fresh workers.
  state.agents = [];
  for (let i = 0; i < 500; i += 1) state.agents.push(createWorker(0, 0));
  const snapshot = collectEconomySnapshot(state);
  const popScore = scorePopulation(snapshot);
  assert.equal(popScore, 100, `500 agents should saturate at exactly 100, got ${popScore}`);
});

test("Saturation: massive wall count saturates defense at 100", () => {
  const state = createInitialGameState({ seed: 502 });
  for (let i = 0; i < state.grid.tiles.length; i += 1) {
    if (state.grid.tiles[i] === TILE.GRASS) state.grid.tiles[i] = TILE.WALL;
  }
  const snapshot = collectEconomySnapshot(state);
  const defScore = scoreDefense(snapshot);
  assert.equal(defScore, 100, `massive walls should saturate defense at 100, got ${defScore}`);
});

test("Saturation: all dims stay at or below 100 simultaneously under extreme inputs", () => {
  const state = createInitialGameState({ seed: 503 });
  state.resources.food = 99999;
  state.resources.wood = 99999;
  state.resources.stone = 99999;
  for (let i = 0; i < 500; i += 1) state.agents.push(createWorker(0, 0));
  for (let i = 0; i < state.grid.tiles.length; i += 1) {
    const t = state.grid.tiles[i];
    if (t === TILE.GRASS) state.grid.tiles[i] = TILE.WALL;
  }
  const dims = scoreAllDims(collectEconomySnapshot(state));
  for (const [k, v] of Object.entries(dims)) {
    assert.ok(v <= 100, `dim ${k} exceeded 100 under extreme input: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Case 2 — Zero inputs floor dims at 0, not negative.
// ---------------------------------------------------------------------------
test("Floor: zero inputs produce dims at 0, never negative", () => {
  const state = createInitialGameState({ seed: 600 });
  // Strip everything: no agents, no resources, no buildings, no workers.
  state.agents = [];
  state.resources.food = 0;
  state.resources.wood = 0;
  state.resources.stone = 0;
  for (let i = 0; i < state.grid.tiles.length; i += 1) state.grid.tiles[i] = TILE.GRASS;
  const snapshot = collectEconomySnapshot(state);
  const dims = scoreAllDims(snapshot);
  for (const [k, v] of Object.entries(dims)) {
    assert.ok(v >= 0, `dim ${k} went negative: ${v}`);
    if (k !== "resilience") {
      // resilience starts at 100 (no distress when there are no workers).
      assert.equal(v, 0, `dim ${k} should floor at 0, got ${v}`);
    }
  }
});

test("Floor: negative or malformed inputs clamp to 0", () => {
  const state = createInitialGameState({ seed: 601 });
  state.resources.food = -1000;
  state.resources.wood = -1000;
  state.resources.stone = -1000;
  state.agents = [];
  const dims = scoreAllDims(collectEconomySnapshot(state));
  assert.ok(dims.economy >= 0, `economy must clamp to 0 on negative resources: ${dims.economy}`);
  assert.ok(dims.population >= 0, `population must clamp to 0: ${dims.population}`);
});
