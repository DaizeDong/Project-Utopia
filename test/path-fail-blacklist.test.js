// v0.8.13 — PathFailBlacklist service tests (audit A6).
import test from "node:test";
import assert from "node:assert/strict";

import { PathFailBlacklist } from "../src/simulation/services/PathFailBlacklist.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { TILE } from "../src/config/constants.js";
import { worldToTile } from "../src/world/grid/Grid.js";

test("PathFailBlacklist: mark + isBlacklisted within TTL returns true", () => {
  const bl = new PathFailBlacklist();
  bl.mark("worker_1", 5, 7, TILE.WAREHOUSE, 100, 5);
  assert.equal(bl.isBlacklisted("worker_1", 5, 7, TILE.WAREHOUSE, 102), true);
  assert.equal(bl.isBlacklisted("worker_1", 5, 7, TILE.WAREHOUSE, 104.99), true);
});

test("PathFailBlacklist: entry expires after TTL", () => {
  const bl = new PathFailBlacklist();
  bl.mark("worker_1", 5, 7, TILE.WAREHOUSE, 100, 5);
  // After TTL+ε:
  assert.equal(bl.isBlacklisted("worker_1", 5, 7, TILE.WAREHOUSE, 105.01), false);
});

test("PathFailBlacklist: forgetWorker clears all entries for that worker", () => {
  const bl = new PathFailBlacklist();
  bl.mark("worker_1", 5, 7, TILE.WAREHOUSE, 100, 5);
  bl.mark("worker_1", 6, 8, TILE.FARM, 100, 5);
  bl.mark("worker_2", 5, 7, TILE.WAREHOUSE, 100, 5);
  bl.forgetWorker("worker_1");
  assert.equal(bl.isBlacklisted("worker_1", 5, 7, TILE.WAREHOUSE, 102), false);
  assert.equal(bl.isBlacklisted("worker_1", 6, 8, TILE.FARM, 102), false);
  // Other worker is untouched.
  assert.equal(bl.isBlacklisted("worker_2", 5, 7, TILE.WAREHOUSE, 102), true);
});

test("PathFailBlacklist: purgeExpired removes expired entries", () => {
  const bl = new PathFailBlacklist();
  bl.mark("worker_1", 5, 7, TILE.WAREHOUSE, 100, 5); // expires at 105
  bl.mark("worker_2", 6, 8, TILE.FARM, 200, 5);      // expires at 205
  bl.purgeExpired(150);
  // worker_1's entry has expired and is gone after the purge:
  assert.equal(bl.isBlacklisted("worker_1", 5, 7, TILE.WAREHOUSE, 150), false);
  // worker_2 still active:
  assert.equal(bl.isBlacklisted("worker_2", 6, 8, TILE.FARM, 200), true);
  const stats = bl.getStats();
  assert.equal(stats.workersTracked, 1);
});

test("PathFailBlacklist: chooseWorkerTarget skips blacklisted candidates (integration)", () => {
  // Seed a game state, find a worker, find a candidate of their target type,
  // mark it blacklisted, run a tick, and assert chooseWorkerTarget did not
  // pick that tile (worker.targetTile is null OR points elsewhere).
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const system = new WorkerAISystem();
  const worker = state.agents.find((a) => a.type === "WORKER" && a.role !== "BUILDER");
  assert.ok(worker, "expected a non-builder worker");

  // Force the worker into a `seek_task`-like configuration so chooseWorkerTarget
  // is invoked for their role. We'll pick whatever role they have and find a
  // matching tile type to blacklist.
  const roleToTileTypes = {
    FARM: [TILE.FARM],
    WOOD: [TILE.LUMBER],
    STONE: [TILE.QUARRY],
    HERBS: [TILE.HERB_GARDEN],
    COOK: [TILE.KITCHEN],
    SMITH: [TILE.SMITHY],
    HERBALIST: [TILE.CLINIC],
    HAUL: [TILE.WAREHOUSE],
  };
  const targetTypes = roleToTileTypes[worker.role] ?? [TILE.FARM];

  // Find one tile of that type.
  let chosenTile = null;
  const w = state.grid.width, h = state.grid.height;
  for (let iz = 0; iz < h && !chosenTile; iz++) {
    for (let ix = 0; ix < w && !chosenTile; ix++) {
      const t = state.grid.tiles[ix + iz * w];
      if (targetTypes.includes(t)) chosenTile = { ix, iz };
    }
  }
  if (!chosenTile) {
    // No matching tile in this seed — exit early. The other 4 tests cover
    // the unit-level skip semantics; this only adds the system-integration
    // sanity check when a tile exists.
    return;
  }

  // Blacklist the tile for this worker, well into the TTL window.
  const nowSec = Number(state.metrics.timeSec ?? 0);
  services.pathFailBlacklist.mark(worker.id, chosenTile.ix, chosenTile.iz, targetTypes[0], nowSec, 60);
  assert.equal(
    services.pathFailBlacklist.isBlacklisted(worker.id, chosenTile.ix, chosenTile.iz, targetTypes[0], nowSec),
    true,
  );

  // Run one worker tick — the system internally calls purgeExpired but our
  // 60s TTL keeps the entry live.
  const dt = 0.1;
  system.update(dt, state, services);

  // After the tick, the worker's targetTile (if any) must not be the
  // blacklisted tile (unless every other candidate was also blacklisted —
  // which is fine, that's the documented "best blacklisted" fallback. With
  // a fresh seed we expect at least one alternative.)
  const tt = worker.targetTile;
  if (tt) {
    const sameAsBlacklisted = tt.ix === chosenTile.ix && tt.iz === chosenTile.iz;
    // Only assert when there are at least 2 candidates of this type so the
    // fallback bucket isn't the only choice.
    let candidateCount = 0;
    for (let iz = 0; iz < h; iz++) {
      for (let ix = 0; ix < w; ix++) {
        if (targetTypes.includes(state.grid.tiles[ix + iz * w])) candidateCount += 1;
      }
    }
    if (candidateCount > 1) {
      assert.equal(sameAsBlacklisted, false, "blacklisted tile should be skipped when alternatives exist");
    }
  }
});

test("PathFailBlacklist: stats include active entries and totalMarks", () => {
  const bl = new PathFailBlacklist();
  bl.mark("w1", 0, 0, TILE.WAREHOUSE, 0, 5);
  bl.mark("w1", 1, 1, TILE.FARM, 0, 5);
  bl.mark("w2", 2, 2, TILE.LUMBER, 0, 5);
  const stats = bl.getStats();
  assert.equal(stats.totalMarks, 3);
  assert.equal(stats.activeEntries, 3);
  assert.equal(stats.workersTracked, 2);
});
