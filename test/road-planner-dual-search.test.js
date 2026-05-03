// PDD R10 (Plan-PDD-smart-pathing) — dual-search road planning + multi-tile
// bridge proposer. Validates that:
//   1. `planRoadConnections` produces a path (land or bridge) regardless of
//      whether the destination is reachable by land alone.
//   2. When a short bridge crossing exists alongside a long land detour, the
//      planner emits at least one `bridge`-typed step (the dual-search picked
//      the bridge variant on TCO).
//   3. `BridgeProposer.proposeBridgesForReachability` now identifies multi-
//      tile shoreline-pair crossings (the old 1-tile pinch-point scan would
//      have produced zero candidates here).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  planRoadConnections,
  roadPlansToSteps,
} from "../src/simulation/ai/colony/RoadPlanner.js";
import { proposeBridgesForReachability } from "../src/simulation/ai/colony/proposers/BridgeProposer.js";
import { RoadNetwork } from "../src/simulation/navigation/RoadNetwork.js";
import { TILE } from "../src/config/constants.js";

function makeGrid(width, height, tileMap = {}) {
  const tiles = new Uint8Array(width * height).fill(TILE.GRASS);
  for (const [key, val] of Object.entries(tileMap)) {
    const [ix, iz] = key.split(",").map(Number);
    tiles[ix + iz * width] = val;
  }
  return { width, height, tiles, tileSize: 1, version: 1 };
}

describe("PDD R10 dual-search — planRoadConnections picks bridge when amortized score is lower", () => {
  it("plans a bridge path across a 3-tile water gap when no land detour exists", () => {
    // 9x1 grid: WAREHOUSE at (0,0), WATER at (3..5), FARM at (8,0).
    // No land detour possible (1-row grid), so dual-search MUST pick the
    // bridge variant; pathLand should be null.
    const grid = makeGrid(9, 1, {
      "0,0": TILE.WAREHOUSE,
      "3,0": TILE.WATER,
      "4,0": TILE.WATER,
      "5,0": TILE.WATER,
      "8,0": TILE.FARM,
    });
    const net = new RoadNetwork();
    const plans = planRoadConnections(grid, net);
    assert.ok(plans.length > 0, "expected at least one plan");
    const steps = roadPlansToSteps(plans, 20);
    const bridgeSteps = steps.filter((s) => s.type === "bridge");
    assert.ok(bridgeSteps.length >= 3,
      `expected ≥3 bridge steps for the 3-tile water gap, got ${bridgeSteps.length}: ${steps.map(s => `${s.type}@(${s.ix},${s.iz})`).join(",")}`);
  });

  it("prefers a 1-tile bridge shortcut over a long land detour", () => {
    // 7x5 grid:
    //   row 0: . . . . . . .
    //   row 1: . . . . . . .
    //   row 2: W g g . g g F     (warehouse at (0,2), farm at (6,2), WATER at (3,2))
    //   row 3: . . . . . . .
    //   row 4: . . . . . . .
    // Both routes reach the farm:
    //   - bridge: 1 water step + 5 grass steps = build cost 4 + 5 = 9
    //   - land detour: route around via row 0 or row 4 = 7+ grass steps = build cost 7+
    // With BRIDGE_STEP_COST=2.0 the bridge path beats the detour in raw A*,
    // and dual-search confirms it on TCO. Expect at least one bridge step.
    const grid = makeGrid(7, 5, {
      "0,2": TILE.WAREHOUSE,
      "6,2": TILE.FARM,
      "3,2": TILE.WATER,
    });
    const net = new RoadNetwork();
    const plans = planRoadConnections(grid, net);
    assert.ok(plans.length > 0, "expected at least one plan");
    const steps = roadPlansToSteps(plans, 20);
    const bridgeSteps = steps.filter((s) => s.type === "bridge");
    assert.ok(bridgeSteps.length >= 1,
      `expected ≥1 bridge step (1-tile bridge shortcut), got ${bridgeSteps.length}: ${steps.map(s => `${s.type}@(${s.ix},${s.iz})`).join(",")}`);
  });
});

describe("PDD R10 multi-tile BridgeProposer — finds shoreline-pair crossings", () => {
  it("queues a bridge for a 3-tile strait between two shores", () => {
    // 12x5 grid with a 3-tile-wide vertical strait at x=4..6 between two
    // land masses. Warehouse on the west bank (1,2). Old 1-tile pinch
    // scan would find ZERO candidates because no water tile has land on
    // BOTH N AND S OR BOTH E AND W (the strait is 3-wide everywhere).
    // The new shoreline-pair scan should find the (3,2)↔(7,2) pair and
    // queue (4,2) as the first water tile of the crossing.
    const grid = makeGrid(12, 5, {
      "1,2": TILE.WAREHOUSE,
    });
    // Carve a 3-tile-wide strait from x=4 to x=6 across all rows.
    for (let z = 0; z < 5; z += 1) {
      grid.tiles[4 + z * 12] = TILE.WATER;
      grid.tiles[5 + z * 12] = TILE.WATER;
      grid.tiles[6 + z * 12] = TILE.WATER;
    }

    // Capture the placement attempt instead of executing it. This lets us
    // verify the proposer FOUND a candidate without needing the full
    // BuildSystem wired up.
    const placeCalls = [];
    const fakeBuildSystem = {
      previewToolAt: (_state, _tool, ix, iz) => {
        placeCalls.push({ phase: "preview", ix, iz });
        return { ok: true };
      },
      placeToolAt: (_state, _tool, ix, iz) => {
        placeCalls.push({ phase: "place", ix, iz });
        // Return ok:false so we don't trigger the rebuildBuildingStats path
        // (which expects a fully-formed grid with elevation/moisture). The
        // proposer will continue to the next candidate, which is fine — we
        // just want to confirm at least one water tile was offered.
        return { ok: false };
      },
    };
    const state = {
      grid,
      resources: { food: 100, wood: 100, stone: 100, herbs: 100 },
      metrics: { timeSec: 100 }, // > 30 so throttle doesn't fire
    };
    const director = { lastBridgeProposalSec: -1000 };

    proposeBridgesForReachability(state, fakeBuildSystem, director);
    const previewedWaterTiles = placeCalls.filter((c) => c.phase === "preview");
    assert.ok(previewedWaterTiles.length >= 1,
      `expected ≥1 preview call on a water tile of the 3-wide strait, got ${previewedWaterTiles.length}`);
    // All offered tiles should be WATER (the proposer should never offer land).
    for (const call of previewedWaterTiles) {
      const t = grid.tiles[call.ix + call.iz * 12];
      assert.equal(t, TILE.WATER,
        `proposer offered non-water tile at (${call.ix},${call.iz}) — type ${t}`);
    }
  });

  it("does not propose when no shoreline pairs exist (all-land grid)", () => {
    const grid = makeGrid(8, 8, {
      "1,1": TILE.WAREHOUSE,
    });
    const placeCalls = [];
    const fakeBuildSystem = {
      previewToolAt: (_state, _tool, ix, iz) => {
        placeCalls.push({ ix, iz });
        return { ok: true };
      },
      placeToolAt: () => ({ ok: false }),
    };
    const state = {
      grid,
      resources: { food: 100, wood: 100, stone: 100, herbs: 100 },
      metrics: { timeSec: 100 },
    };
    const director = { lastBridgeProposalSec: -1000 };

    const placed = proposeBridgesForReachability(state, fakeBuildSystem, director);
    assert.equal(placed, 0);
    assert.equal(placeCalls.length, 0, "no preview calls expected on all-land grid");
  });
});
