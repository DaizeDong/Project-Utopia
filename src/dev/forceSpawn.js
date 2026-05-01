// v0.10.1 HW7 Final-Polish-Loop Round 1 wave-2 (C1-code-architect) —
// debt-pop-2 cleanup: relocated from
// `src/simulation/population/PopulationGrowthSystem.js:243-332` (R0
// 1f1eea5). The helper is dev-only and bypasses food cost / cooldown /
// queue gates, so it should not live alongside production simulation
// code. The original module retains a `re-export` shim so call sites
// (`src/app/GameApp.js`, `test/long-run-api-shim.test.js`) require zero
// changes.
//
// Behaviour and signature are preserved verbatim — the worker spawn
// logic, infraCap honouring, fallback-tile path, devStressSpawnTotal
// counter, and isStressWorker tag all match the previous implementation.

import { TILE } from "../config/constants.js";
import { createWorker } from "../entities/EntityFactory.js";
import { listTilesByType, randomPassableTile, tileToWorld } from "../world/grid/Grid.js";

/**
 * v0.10.1 HW7 Final-Polish-Loop Round 0 (B1 action-items-auditor).
 *
 * Dev-only stress helper for the in-browser `__utopiaLongRun.devStressSpawn`
 * shim. Fast-fills the colony's worker count up to `targetCount` by spawning
 * additional workers with the food-cost / cooldown / queue gates BYPASSED,
 * so a Tier-A perf reviewer can reproduce the 75-100 worker stutter scenario
 * from a Playwright session without spinning up `scripts/long-run-support.mjs`.
 *
 * Behaviour:
 *   - If the live worker count already meets/exceeds `targetCount`, this is a
 *     no-op (returns `{ spawned: 0, total: <current>, fallbackTilesUsed: 0 }`).
 *   - Otherwise spawns `(targetCount - current)` workers, anchored to a
 *     warehouse when one exists (matches `RecruitmentSystem.update`'s spawn
 *     branch), else falls back to a seeded-random GRASS tile via
 *     `randomPassableTile`. Counts of fallback spawns are returned.
 *   - Honours the **infrastructure cap** (`state.metrics.populationInfraCap`,
 *     when set by the recruit system). Bypassing the cap would require a
 *     freeze-violating "ignore infrastructure" path; instead, the helper
 *     returns honestly so callers see the cap.
 *   - Increments a SEPARATE `state.metrics.devStressSpawnTotal` counter so
 *     analytics stays clean (does NOT bump `recruitTotal` / `birthsTotal`).
 *
 * @warning Dev-only. Bypasses food cost; downstream economy assumptions
 * (food-buffered growth pacing, infraCap recruit gating) may be perturbed
 * in long-running simulations. Exposed via the `__utopiaLongRun` global
 * which is itself an opt-in dev surface.
 *
 * @param {object} state          The live game state.
 * @param {number} targetCount    Desired total worker count (clamped to [0, 500]).
 * @param {() => number} [rng]    Seeded RNG; falls back to Math.random.
 * @returns {{spawned: number, total: number, fallbackTilesUsed: number}}
 */
export function __devForceSpawnWorkers(state, targetCount, rng) {
  if (!state || !Array.isArray(state.agents)) {
    return { spawned: 0, total: 0, fallbackTilesUsed: 0 };
  }
  state.metrics ??= {};
  const target = Math.max(0, Math.min(500, Math.floor(Number(targetCount) || 0)));
  const rngNext = typeof rng === "function" ? rng : Math.random;

  const liveWorkers = state.agents.filter(
    (a) => a && a.type === "WORKER" && a.alive !== false,
  );
  const current = liveWorkers.length;
  if (current >= target) {
    return { spawned: 0, total: current, fallbackTilesUsed: 0 };
  }

  // Honour infraCap — same field RecruitmentSystem writes after each tick.
  // If unset (helper called pre-tick), skip the cap entirely.
  const infraCap = Number(state.metrics.populationInfraCap ?? 0);
  const cappedTarget = infraCap > 0 ? Math.min(target, infraCap) : target;
  if (current >= cappedTarget) {
    return { spawned: 0, total: current, fallbackTilesUsed: 0 };
  }

  const warehouses = state.grid
    ? listTilesByType(state.grid, [TILE.WAREHOUSE])
    : [];
  let spawned = 0;
  let fallbackTilesUsed = 0;
  const wantedSpawns = cappedTarget - current;

  for (let i = 0; i < wantedSpawns; i += 1) {
    let pos;
    if (warehouses.length > 0) {
      const wh = warehouses[Math.floor(rngNext() * warehouses.length)];
      pos = tileToWorld(wh.ix, wh.iz, state.grid);
    } else {
      // No warehouse — fall back to a seeded passable tile.
      const tile = state.grid ? randomPassableTile(state.grid, rngNext) : null;
      if (!tile) break;
      pos = tileToWorld(tile.ix, tile.iz, state.grid);
      fallbackTilesUsed += 1;
    }
    const newWorker = createWorker(pos.x, pos.z, rngNext);
    newWorker.lineage ??= { parents: [], children: [], deathSec: -1 };
    newWorker.lineage.parents = [];
    // Tag the spawn so downstream telemetry / debug overlays can distinguish
    // a stress-injected worker from an organically recruited one.
    newWorker.isStressWorker = true;
    state.agents.push(newWorker);
    spawned += 1;
  }

  state.metrics.devStressSpawnTotal =
    Number(state.metrics.devStressSpawnTotal ?? 0) + spawned;

  return { spawned, total: current + spawned, fallbackTilesUsed };
}
