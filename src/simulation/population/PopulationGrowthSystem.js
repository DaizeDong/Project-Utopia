// v0.8.4 Phase 11 (Agent D) — Recruitment system. Replaces the legacy
// auto-reproduction loop with explicit, food-cost recruitment. The player
// (UI) and the AI (LLM/rules) both push intents into
// `state.controls.recruitQueue`; this system drains the queue gated by
// `recruitFoodCost`, `recruitCooldownSec`, and warehouse availability.
//
// Public API:
//   - class RecruitmentSystem      (canonical name)
//   - export PopulationGrowthSystem (alias for back-compat — GameApp /
//     SimHarness imports the legacy name and we don't want to churn unrelated
//     callsites)
//   - export MIN_FOOD_FOR_GROWTH   (mirrors BALANCE.recruitMinFoodBuffer
//     for ColonyPerceiver / WorldSummary which still read this constant)
//
// Behaviour:
//   1. Cooldown ticks down each frame (regardless of 1Hz check cadence).
//   2. At 1Hz, when warehouses exist and autoRecruit is on, the queue is
//      topped up toward `recruitTarget` if food >= recruitMinFoodBuffer.
//   3. When queue > 0 AND cooldownSec <= 0 AND food >= recruitFoodCost, a
//      single worker spawns at a seeded-random warehouse, food is debited,
//      and the cooldown resets to recruitCooldownSec.
//   4. Recruits do NOT carry parents (lineage.parents = []) — they "arrive"
//      from the colony's recruit pool, not are born to in-game agents.
//   5. Both `WORKER_BORN` and `VISITOR_ARRIVED` events fire (back-compat
//      with EventPanel/Telemetry which still listen on the legacy beat).
//   6. `state.metrics.birthsTotal` AND `state.metrics.recruitTotal` are
//      both incremented (survival score + new metric).

import { BALANCE } from "../../config/balance.js";
import { TILE } from "../../config/constants.js";
import { createWorker } from "../../entities/EntityFactory.js";
import { listTilesByType, tileToWorld } from "../../world/grid/Grid.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";

const CHECK_INTERVAL_SEC = 1.0;
const MEMORY_RECENT_LIMIT = 6;
const MEMORY_HISTORY_LIMIT = 24;

// v0.8.4 Phase 11 (Agent D) — Re-exported for ColonyPerceiver / WorldSummary
// which still gate growth-related copy on this constant. Tracks
// BALANCE.recruitMinFoodBuffer.
export const MIN_FOOD_FOR_GROWTH = Number(BALANCE.recruitMinFoodBuffer ?? 80);

function pushMemoryLine(agent, line, key, nowSec, type = "event") {
  agent.memory ??= { recentEvents: [], dangerTiles: [] };
  if (!Array.isArray(agent.memory.recentEvents)) agent.memory.recentEvents = [];
  if (!Array.isArray(agent.memory.history)) agent.memory.history = [];
  if (!(agent.memory.recentKeys instanceof Map)) agent.memory.recentKeys = new Map();
  if (agent.memory.recentKeys.has(key)) return false;

  agent.memory.recentKeys.set(key, nowSec);
  agent.memory.recentEvents.unshift(line);
  agent.memory.recentEvents = agent.memory.recentEvents.slice(0, MEMORY_RECENT_LIMIT);
  if (!agent.memory.history.some((entry) => entry?.key === key)) {
    agent.memory.history.unshift({
      simSec: Number(nowSec ?? 0),
      type,
      label: String(line ?? ""),
      key: String(key ?? ""),
    });
    agent.memory.history = agent.memory.history.slice(0, MEMORY_HISTORY_LIMIT);
  }
  return true;
}

export class RecruitmentSystem {
  constructor() {
    this.name = "RecruitmentSystem";
    // First check fires immediately on a forced 0-timer (the test suite sets
    // `_timer = 0` then ticks dt=1 to cross the threshold). Default to 0 so
    // the first frame after construction does meaningful work.
    this._timer = 0;
  }

  update(dt, state, services = null) {
    if (!state) return;
    state.controls ??= {};
    state.metrics ??= {};

    // (1) Cooldown ticks down every frame regardless of 1Hz cadence so the
    // recruit cap honors wall-clock pacing rather than tick rate.
    const dtNum = Math.max(0, Number(dt) || 0);
    state.controls.recruitCooldownSec = Math.max(
      0,
      Number(state.controls.recruitCooldownSec ?? 0) - dtNum,
    );

    // 1Hz cadence for the queue-fill / spawn loop.
    this._timer = Number(this._timer ?? 0) - dtNum;
    if (this._timer > 0) return;
    this._timer = CHECK_INTERVAL_SEC;

    const workers = state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);
    const warehouses = listTilesByType(state.grid, [TILE.WAREHOUSE]);
    if (warehouses.length === 0) return;

    // v0.8.0 Phase 4 silent-failure C1: seeded RNG is required so benchmark
    // runs stay reproducible. services.rng.next is the deterministic source;
    // fall back to Math.random only when no services are threaded.
    const rngNext = typeof services?.rng?.next === "function"
      ? () => services.rng.next()
      : Math.random;

    const food = Number(state.resources?.food ?? 0);
    const recruitFoodCost = Number(BALANCE.recruitFoodCost ?? 25);
    const recruitMinBuffer = Number(BALANCE.recruitMinFoodBuffer ?? 80);
    const recruitMaxQueue = Number(BALANCE.recruitMaxQueueSize ?? 12);
    const recruitCooldownSecRef = Number(BALANCE.recruitCooldownSec ?? 30);
    const recruitTargetRaw = Math.max(0, Number(state.controls.recruitTarget ?? 0) | 0);
    let recruitQueue = Math.max(0, Number(state.controls.recruitQueue ?? 0) | 0);
    const autoRecruit = state.controls.autoRecruit !== false;

    // v0.8.5 Tier 1 B5 / Tier 2 S5: Re-enforce the documented infrastructure
    // cap from docs/systems/05-population-lifecycle.md. Code (pre-v0.8.5) used
    // only state.controls.recruitTarget, which let the player/LLM set a high
    // recruit target and outgrow infrastructure. Compute the cap inline so
    // the auto-fill never advances past it. The player's explicit
    // recruitTarget remains an upper bound (so dropping the slider still
    // works), but the colony cannot be auto-grown beyond what the buildings
    // support.
    const buildings = state?.buildings ?? {};
    const warehousesCount = Number(buildings.warehouses ?? 0);
    const farmsCount = Number(buildings.farms ?? 0);
    const lumbersCount = Number(buildings.lumbers ?? 0);
    const quarriesCount = Number(buildings.quarries ?? 0);
    const kitchensCount = Number(buildings.kitchens ?? 0);
    const smithiesCount = Number(buildings.smithies ?? 0);
    const clinicsCount = Number(buildings.clinics ?? 0);
    const herbGardensCount = Number(buildings.herbGardens ?? 0);
    const infraCap = Math.min(
      80,
      12
        + warehousesCount * 3
        + Math.floor(farmsCount * 0.5)
        + Math.floor(lumbersCount * 0.5)
        + quarriesCount * 2
        + kitchensCount * 2
        + smithiesCount * 2
        + clinicsCount * 2
        + herbGardensCount,
    );
    const effectiveCap = Math.min(recruitTargetRaw, infraCap);
    state.metrics.populationInfraCap = infraCap;
    state.metrics.populationEffectiveCap = effectiveCap;

    // (2) Auto-recruit branch. Top up the queue toward the EFFECTIVE cap if
    // food is safely above the min buffer and we're not already at the cap.
    // Adds at most one per 1Hz tick to keep growth pacing predictable; manual
    // UI / LLM bulk-enqueue paths go through PlanExecutor.
    const totalCurrent = workers.length + recruitQueue;
    if (autoRecruit
        && totalCurrent < effectiveCap
        && food >= recruitMinBuffer
        && recruitQueue < recruitMaxQueue) {
      // Grow the queue by 1 per second toward the cap; cap at the gap to
      // avoid overshoot when target shrinks.
      const gap = effectiveCap - totalCurrent;
      const add = Math.min(1, gap);
      recruitQueue = Math.min(recruitMaxQueue, recruitQueue + add);
      state.controls.recruitQueue = recruitQueue;
    }

    // (3) Spawn branch — drain one queue entry per tick when the gates open.
    // v0.8.4 Round 2 polish: spawn now also respects `recruitMinFoodBuffer`.
    // Previously a queue built up at food >= 50 would keep firing all the way
    // down to food = 25, draining the colony into a starvation spiral. The
    // double gate keeps spawn pressure on the same buffer the auto-fill uses.
    if (recruitQueue <= 0) return;
    const cooldown = Number(state.controls.recruitCooldownSec ?? 0);
    if (cooldown > 0) return;
    if (food < recruitFoodCost) {
      state.metrics.populationGrowthBlockedReason = "food below recruit cost";
      return;
    }
    if (food < recruitMinBuffer) {
      state.metrics.populationGrowthBlockedReason = "food below recruit buffer";
      return;
    }

    // Pick a deterministic warehouse for placement.
    const wh = warehouses[Math.floor(rngNext() * warehouses.length)];
    const pos = tileToWorld(wh.ix, wh.iz, state.grid);
    const newWorker = createWorker(pos.x, pos.z, rngNext);
    state.agents.push(newWorker);
    state.resources.food = Math.max(0, food - recruitFoodCost);
    state.controls.recruitQueue = Math.max(0, recruitQueue - 1);
    state.controls.recruitCooldownSec = recruitCooldownSecRef;

    // Survival score uses birthsTotal. Phase 11 also tracks recruitTotal so
    // analytics can split organic births from explicit recruits (zero
    // organic births in v0.8.4+, but the API stays stable for replays).
    state.metrics.birthsTotal = Number(state.metrics.birthsTotal ?? 0) + 1;
    state.metrics.recruitTotal = Number(state.metrics.recruitTotal ?? 0) + 1;
    state.metrics.lastBirthGameSec = Number(state.metrics.timeSec ?? 0);
    state.metrics.populationGrowthBlockedReason = "";

    // Recruits do NOT carry parents — they're hired, not born.
    newWorker.lineage ??= { parents: [], children: [], deathSec: -1 };
    newWorker.lineage.parents = [];

    // Legacy event (downstream listeners — EventPanel/Telemetry — already
    // consume VISITOR_ARRIVED with reason="recruited"). Bumped reason so
    // listeners that want to differentiate from organic births can branch.
    emitEvent(state, EVENT_TYPES.VISITOR_ARRIVED, {
      entityId: newWorker.id,
      entityName: newWorker.displayName ?? newWorker.id,
      reason: "recruited",
    });
    emitEvent(state, EVENT_TYPES.WORKER_BORN, {
      entityId: newWorker.id,
      entityName: newWorker.displayName ?? newWorker.id,
      parentNames: [],
      lineageParentIds: [],
      reason: "recruited",
    });

    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const newbornName = newWorker.displayName ?? newWorker.id;
    const recruitLine = `[${nowSec.toFixed(0)}s] ${newbornName} was recruited to the colony`;
    pushMemoryLine(newWorker, recruitLine, `recruit:${newWorker.id}`, nowSec, "birth");

    // Mirror to objective log + debug eventTrace for the storyteller strip.
    if (state.gameplay) {
      if (!Array.isArray(state.gameplay.objectiveLog)) state.gameplay.objectiveLog = [];
      state.gameplay.objectiveLog.unshift(recruitLine);
      state.gameplay.objectiveLog = state.gameplay.objectiveLog.slice(0, 24);
    }
    if (state.debug) {
      if (!Array.isArray(state.debug.eventTrace)) state.debug.eventTrace = [];
      state.debug.eventTrace.unshift(recruitLine);
      state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
    }
  }
}

// v0.8.4 Phase 11 (Agent D) — back-compat alias. GameApp.createSystems and
// the SimHarness import the legacy `PopulationGrowthSystem` symbol; expose
// the new class under that name so the rest of the call graph keeps working
// without touching unrelated files.
export { RecruitmentSystem as PopulationGrowthSystem };

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
