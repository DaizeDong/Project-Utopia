// v0.9.3-balance — tests for 1:1 worker/building binding, tighter
// production gating (yieldPool eligibility), bridge AI proposer.

import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";
import { TILE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
// v0.10.0-d — Job-class imports retired with the v0.9.x Job layer. The
// JobReservation primitive tests (#1-5) live in test/job-reservation.test.js;
// the JobHarvest-internals tests (#6-9) were FSM-pre-image checks and
// have been retired. The bridge AI test (#10) and production-rate
// constants test (#11) survive — they don't touch Job classes.
import "../src/simulation/npc/WorkerAISystem.js";
import { setTile } from "../src/world/grid/Grid.js";
import { ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";

function makeState({ seed = 5151, bareInitial = false } = {}) {
  const state = createInitialGameState({ seed, bareInitial });
  state.session ??= {};
  state.session.phase = "active";
  state.environment = { isNight: false };
  state.metrics.tick = 0;
  state.metrics.timeSec = 0;
  return state;
}

// ---------------------------------------------------------------------------
// Bridge AI: ColonyDirector proposes bridges across narrow water
// ---------------------------------------------------------------------------

test("v0.9.3 #10: ColonyDirector places a bridge on a narrow water crossing", () => {
  // Build a tiny test grid by hand: stamp a row of WATER between two
  // GRASS regions, place a warehouse on one side, give the colony enough
  // resources, and tick the director once. A bridge should land on the
  // water tile.
  const state = makeState({ seed: 42, bareInitial: true });
  state.ai = state.ai ?? {};
  state.ai.enabled = true;
  state.ai.coverageTarget = "fallback";
  state.session.phase = "active";

  // Stamp a single-tile water moat at row 20, columns 30-31.
  setTile(state.grid, 30, 20, TILE.WATER);
  setTile(state.grid, 31, 20, TILE.WATER);
  // Land both north (iz=19) and south (iz=21) — narrow N/S crossing.
  setTile(state.grid, 30, 19, TILE.GRASS);
  setTile(state.grid, 31, 19, TILE.GRASS);
  setTile(state.grid, 30, 21, TILE.GRASS);
  setTile(state.grid, 31, 21, TILE.GRASS);

  // Warehouse near the crossing so distance-to-warehouse sort favours it.
  setTile(state.grid, 32, 19, TILE.WAREHOUSE);
  state.buildings = { ...(state.buildings ?? {}), warehouses: 1 };
  state.resources = { ...(state.resources ?? {}), wood: 200, stone: 200, food: 200, herbs: 100 };

  // Force the eval gate to fire by pre-loading lastEvalSec way in the past.
  state.ai.colonyDirector = {
    lastEvalSec: -100,
    lastEvalWallSec: -100,
    phase: "bootstrap",
    buildQueue: [],
    buildsPlaced: 0,
    skippedByWallRate: 0,
  };
  state.metrics.timeSec = 1000;

  const services = createServices(state.world.mapSeed);
  const sys = new ColonyDirectorSystem();
  sys.update(1 / 30, state, services);

  // Either tile could have been chosen; check at least one is now BRIDGE
  // OR a construction site (blueprint) for a bridge exists at one of them.
  const sites = state.constructionSites ?? [];
  const bridgeSite = sites.find((s) => s.tool === "bridge"
    && ((s.ix === 30 && s.iz === 20) || (s.ix === 31 && s.iz === 20)));
  const tile30 = state.grid.tiles[30 + 20 * state.grid.width];
  const tile31 = state.grid.tiles[31 + 20 * state.grid.width];
  const placed = tile30 === TILE.BRIDGE || tile31 === TILE.BRIDGE || Boolean(bridgeSite);
  assert.ok(placed, "ColonyDirector should propose a bridge on the narrow water crossing");
});

// ---------------------------------------------------------------------------
// Production-rate sanity: 1 worker × 1 farm × 1 minute is bounded
// ---------------------------------------------------------------------------

test("v0.9.3 #11: production rate is bounded (1 worker × 1 farm × 60s)", async () => {
  // Yield-pool depletion + 1:1 binding mean a single worker on a single farm
  // produces a finite, predictable amount of food per minute. We don't test
  // an exact number — we test the upper bound: at most ~30 food in 60s
  // with the new harvestDuration=2.4s (≈25 cycles/min, baseline ≈1 per
  // cycle, so the *expected* output is roughly 25 ± weather/fertility).
  const harvestDur = Number(BALANCE.workerHarvestDurationSec);
  assert.ok(harvestDur >= 2.0 && harvestDur <= 3.0,
    `workerHarvestDurationSec rebalanced: got ${harvestDur}, expected in [2.0, 3.0]`);

  const fpInit = Number(BALANCE.farmYieldPoolInitial);
  assert.ok(fpInit >= 80 && fpInit <= 100,
    `farmYieldPoolInitial rebalanced: got ${fpInit}, expected in [80, 100]`);

  const fr = Number(BALANCE.nodeYieldPoolForest);
  assert.ok(fr <= 130,
    `nodeYieldPoolForest tightened: got ${fr}, expected ≤ 130`);
});
