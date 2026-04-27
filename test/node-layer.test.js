import test from "node:test";
import assert from "node:assert/strict";

import {
  MAP_TEMPLATES,
  createInitialGrid,
  getTileState,
  setTileField,
} from "../src/world/grid/Grid.js";
import { seedResourceNodes } from "../src/world/scenarios/ScenarioFactory.js";
import { evaluateBuildPreview } from "../src/simulation/construction/BuildAdvisor.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { BALANCE } from "../src/config/balance.js";
import { NODE_FLAGS, TILE } from "../src/config/constants.js";

function deterministicRng(seed) {
  let s = Number(seed) >>> 0;
  if (!s) s = 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function countNodeFlags(grid) {
  // Count seeded forest/stone/herb nodes on GRASS tiles (the Poisson-disk /
  // cluster-walk / link-seek outputs). Post-review, `seedResourceNodes` also
  // auto-flags pre-existing LUMBER/QUARRY/HERB_GARDEN terrain-gen tiles so the
  // map is internally consistent for rebuild-after-demolish — those are
  // counted separately in `autoFlagged` below, not here.
  let forest = 0;
  let stone = 0;
  let herb = 0;
  let autoFlagged = 0;
  grid.tileState.forEach((entry, idx) => {
    const f = Number(entry?.nodeFlags ?? 0) | 0;
    const type = grid.tiles[idx];
    if (type === TILE.GRASS) {
      if (f & NODE_FLAGS.FOREST) forest += 1;
      if (f & NODE_FLAGS.STONE) stone += 1;
      if (f & NODE_FLAGS.HERB) herb += 1;
    } else if (f !== 0 && (type === TILE.LUMBER || type === TILE.QUARRY || type === TILE.HERB_GARDEN)) {
      autoFlagged += 1;
    }
  });
  return { forest, stone, herb, autoFlagged };
}

// ---------------------------------------------------------------------------
// A — Every map template seeds forest/stone/herb node counts within the
//     BALANCE.*NodeCountRange ranges from spec § 14.
// ---------------------------------------------------------------------------
test("M1a nodes: forest/stone/herb counts are within range for every template", () => {
  const [forestMin, forestMax] = BALANCE.forestNodeCountRange;
  const [stoneMin, stoneMax] = BALANCE.stoneNodeCountRange;
  const [herbMin, herbMax] = BALANCE.herbNodeCountRange;

  for (const tpl of MAP_TEMPLATES) {
    const grid = createInitialGrid({ templateId: tpl.id, seed: 4242 });
    seedResourceNodes(grid, deterministicRng(4242));
    const counts = countNodeFlags(grid);

    // Forest must always hit the target window (Poisson-disk seeding on GRASS).
    assert.ok(
      counts.forest >= forestMin && counts.forest <= forestMax,
      `[${tpl.id}] forest=${counts.forest} out of [${forestMin},${forestMax}]`,
    );
    // Herb seeding has a broad fallback pool, so the count is strict.
    assert.ok(
      counts.herb >= herbMin && counts.herb <= herbMax,
      `[${tpl.id}] herb=${counts.herb} out of [${herbMin},${herbMax}]`,
    );
    // Stone clusters walk 3-6 steps each from N seeds. The lower bound is the
    // seed count (one flagged tile per seed); the upper bound is seeds × 7
    // (seed + up-to-6 walk steps). The spec cites the seed count range.
    const seedLo = stoneMin;
    const seedHi = stoneMax;
    assert.ok(
      counts.stone >= seedLo && counts.stone <= seedHi * 7,
      `[${tpl.id}] stone=${counts.stone} out of plausible cluster range [${seedLo}, ${seedHi * 7}]`,
    );
  }
});

// ---------------------------------------------------------------------------
// B — BuildAdvisor rejects LUMBER on a tile without FOREST flag and accepts
//     with the flag present.
// ---------------------------------------------------------------------------
test("M1a nodes: BuildAdvisor gates LUMBER placement on FOREST flag", () => {
  const grid = createInitialGrid({ templateId: "temperate_plains", seed: 77 });
  // Clear any prior node flags and reset a known grass tile.
  const ix = Math.floor(grid.width / 2);
  const iz = Math.floor(grid.height / 2);
  grid.tiles[ix + iz * grid.width] = TILE.GRASS;
  // Ensure a tileState entry exists without any node flag.
  setTileField(grid, ix, iz, "nodeFlags", 0);
  setTileField(grid, ix, iz, "yieldPool", 0);

  const state = {
    grid,
    resources: { food: 100, wood: 100, stone: 100, herbs: 100 },
    gameplay: { scenario: {} },
    weather: { hazardTiles: [] },
  };

  const reject = evaluateBuildPreview(state, "lumber", ix, iz);
  assert.equal(reject.ok, false);
  assert.equal(reject.reason, "missing_resource_node");

  // Now flag the tile and verify placement succeeds.
  setTileField(grid, ix, iz, "nodeFlags", NODE_FLAGS.FOREST);
  const accept = evaluateBuildPreview(state, "lumber", ix, iz);
  assert.equal(accept.ok, true, `expected accept.ok=true, got reason=${accept.reason}`);
});

// ---------------------------------------------------------------------------
// C — Same gate pattern for QUARRY (STONE) and HERB_GARDEN (HERB).
// ---------------------------------------------------------------------------
test("M1a nodes: BuildAdvisor gates QUARRY/HERB_GARDEN on STONE/HERB flags", () => {
  const grid = createInitialGrid({ templateId: "temperate_plains", seed: 99 });
  const baseState = {
    grid,
    resources: { food: 100, wood: 100, stone: 100, herbs: 100 },
    gameplay: { scenario: {} },
    weather: { hazardTiles: [] },
  };

  // QUARRY gate
  const qx = 10;
  const qz = 10;
  grid.tiles[qx + qz * grid.width] = TILE.GRASS;
  setTileField(grid, qx, qz, "nodeFlags", 0);
  setTileField(grid, qx, qz, "yieldPool", 0);
  const qReject = evaluateBuildPreview(baseState, "quarry", qx, qz);
  assert.equal(qReject.ok, false);
  assert.equal(qReject.reason, "missing_resource_node");
  setTileField(grid, qx, qz, "nodeFlags", NODE_FLAGS.STONE);
  const qAccept = evaluateBuildPreview(baseState, "quarry", qx, qz);
  assert.equal(qAccept.ok, true, `quarry accept expected, got reason=${qAccept.reason}`);

  // HERB_GARDEN gate
  const hx = 14;
  const hz = 14;
  grid.tiles[hx + hz * grid.width] = TILE.GRASS;
  setTileField(grid, hx, hz, "nodeFlags", 0);
  setTileField(grid, hx, hz, "yieldPool", 0);
  const hReject = evaluateBuildPreview(baseState, "herb_garden", hx, hz);
  assert.equal(hReject.ok, false);
  assert.equal(hReject.reason, "missing_resource_node");
  setTileField(grid, hx, hz, "nodeFlags", NODE_FLAGS.HERB);
  const hAccept = evaluateBuildPreview(baseState, "herb_garden", hx, hz);
  assert.equal(hAccept.ok, true, `herb accept expected, got reason=${hAccept.reason}`);
});

// ---------------------------------------------------------------------------
// D — yieldPool deducts on harvest and regenerates when the tile is idle.
// ---------------------------------------------------------------------------
test("M1a nodes: yieldPool deducts on harvest and regenerates over ticks", () => {
  const grid = createInitialGrid({ templateId: "temperate_plains", seed: 101 });
  const ix = 12;
  const iz = 12;
  grid.tiles[ix + iz * grid.width] = TILE.GRASS;
  // Seed a FOREST node with a reduced yieldPool so the regen can move it.
  setTileField(grid, ix, iz, "nodeFlags", NODE_FLAGS.FOREST);
  const startPool = 40;
  setTileField(grid, ix, iz, "yieldPool", startPool);

  // Simulate a single harvest by writing lastHarvestTick + deducting manually
  // (mirrors applyNodeYieldHarvest in WorkerAISystem). This keeps the test
  // focused on the yieldPool math + regen pass without wiring up full worker
  // AI / pathing state.
  const harvestAmount = 5;
  setTileField(grid, ix, iz, "yieldPool", Math.max(0, startPool - harvestAmount));
  setTileField(grid, ix, iz, "lastHarvestTick", 10);
  const afterHarvest = getTileState(grid, ix, iz);
  assert.equal(afterHarvest.yieldPool, startPool - harvestAmount);

  // Now drive WorkerAISystem.update across several ticks with no active
  // workers. The tick advances past lastHarvestTick so the regen pass should
  // add nodeRegenPerTickForest (0.05) per tick until it hits the cap.
  const system = new WorkerAISystem();
  const state = {
    grid,
    agents: [],
    resources: { food: 0, wood: 0, stone: 0, herbs: 0 },
    metrics: { tick: 10, timeSec: 0 },
    ai: { groupPolicies: new Map() },
    environment: { isNight: false },
    weather: { current: "clear", farmProductionMultiplier: 1, lumberProductionMultiplier: 1, hazardTiles: [] },
    gameplay: { scenario: {} },
    fog: {},
  };
  const services = {
    rng: { next: () => 0.5 },
    pathCache: { get: () => null, put: () => {} },
    pathBudget: { tick: -1, usedMs: 0, skipped: 0, maxMs: 3 },
  };

  const regenPerTick = Number(BALANCE.nodeRegenPerTickForest ?? 0);
  assert.ok(regenPerTick > 0, "forest regen rate should be positive");

  const ticksToRun = 20;
  for (let i = 0; i < ticksToRun; i += 1) {
    state.metrics.tick = 11 + i;
    system.update(0.1, state, services);
  }

  const afterRegen = getTileState(grid, ix, iz);
  const expectedAfter = Math.min(
    Number(BALANCE.nodeYieldPoolForest ?? 80),
    (startPool - harvestAmount) + regenPerTick * ticksToRun,
  );
  assert.ok(
    Math.abs(afterRegen.yieldPool - expectedAfter) < 1e-6,
    `expected yieldPool≈${expectedAfter}, got ${afterRegen.yieldPool}`,
  );
  assert.ok(
    afterRegen.yieldPool > (startPool - harvestAmount),
    "yieldPool should have regenerated above the post-harvest level",
  );
});
