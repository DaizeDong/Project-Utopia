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

/**
 * v0.10.1 R5 PC-recruit-flow-rate-gate (PC-1/PC-2) — Forward-looking food
 * runway in seconds, used by both this system and ColonyPlanner's recruit
 * fallback to refuse recruits when the colony cannot sustain the new mouth.
 *
 * Model:
 *   drainRate (food/s) = workersCount * warehouseEatRatePerWorkerPerSecond
 *                        - foodProductionRatePerSec
 *   foodHeadroomSec     = food / max(0.01, drainRate)
 *
 * `foodProductionRatePerSec` is sourced from `state.metrics.foodProducedPerMin`
 * (the smoothed 3-second window already published by ResourceSystem) divided
 * by 60. When that telemetry hasn't been populated yet (early ticks, scenarios
 * that bypass ResourceSystem) we fall back to 0 — the gate is permissive in
 * that bootstrap window because the helper returns Infinity whenever
 * drainRate <= 0 (i.e. we are net-positive).
 *
 * Returns Infinity when drainRate <= 0 (net-positive food economy: gate is
 * always satisfied). Returns the runway in seconds otherwise.
 *
 * @param {object} state
 * @param {number} workersCount  Population to model (current + 1 to test a
 *   prospective recruit).
 * @returns {number} foodHeadroomSec — runway in seconds, or Infinity.
 */
export function computeFoodHeadroomSec(state, workersCount) {
  const food = Number(state?.resources?.food ?? 0);
  const eatPerWorker = Number(BALANCE.warehouseEatRatePerWorkerPerSecond ?? 0.6);
  const producedPerMin = Number(state?.metrics?.foodProducedPerMin ?? 0);
  const productionPerSec = producedPerMin / 60;
  const drainRate = Math.max(0, workersCount) * eatPerWorker - productionPerSec;
  if (drainRate <= 0) return Infinity;
  return food / Math.max(0.01, drainRate);
}

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

    // v0.8.5 Tier 1 B5 / Tier 2 S5: Compute the documented infrastructure
    // cap from docs/systems/05-population-lifecycle.md so the auto-fill
    // pacing scales with built infrastructure (warehouses, farms, kitchens
    // etc.). The player's explicit recruitTarget is the user-facing upper
    // bound (slider in Population Control panel).
    //
    // v0.10.1-iter4 (HW7 hotfix Batch E — Issue #9): the legacy `Math.min(80, ...)`
    // hard ceiling that capped pop at 80 regardless of how many warehouses
    // the player built has been removed. Players reported workers stuck at
    // 16 in late game ("后期 worker 到 16 个就不增长了, 很多地方都缺人")
    // and asked for ALL hard limits gone. The infraCap formula is preserved
    // (it remains a soft, infrastructure-derived cap that grows as the
    // colony builds more support buildings) but is no longer clamped to a
    // global ceiling — keep building warehouses, keep growing.
    const buildings = state?.buildings ?? {};
    const warehousesCount = Number(buildings.warehouses ?? 0);
    const farmsCount = Number(buildings.farms ?? 0);
    const lumbersCount = Number(buildings.lumbers ?? 0);
    const quarriesCount = Number(buildings.quarries ?? 0);
    const kitchensCount = Number(buildings.kitchens ?? 0);
    const smithiesCount = Number(buildings.smithies ?? 0);
    const clinicsCount = Number(buildings.clinics ?? 0);
    const herbGardensCount = Number(buildings.herbGardens ?? 0);
    const infraCap = 12
        + warehousesCount * 3
        + Math.floor(farmsCount * 0.5)
        + Math.floor(lumbersCount * 0.5)
        + quarriesCount * 2
        + kitchensCount * 2
        + smithiesCount * 2
        + clinicsCount * 2
        + herbGardensCount;
    const effectiveCap = Math.min(recruitTargetRaw, infraCap);
    state.metrics.populationInfraCap = infraCap;
    state.metrics.populationEffectiveCap = effectiveCap;

    // v0.10.1 R5 PC-recruit-flow-rate-gate (PC-1/PC-2): forward-looking
    // food-runway gate. We project the colony's drain at workers+queue+1
    // (i.e. "what would the runway be if THIS recruit landed") and refuse
    // to enqueue if that runway is below the configured floor. Mirrored at
    // the spawn branch below and in ColonyPlanner.recruitFallback.
    const recruitMinHeadroomSec = Number(BALANCE.recruitMinFoodHeadroomSec ?? 60);

    // (2) Auto-recruit branch. Top up the queue toward the EFFECTIVE cap if
    // food is safely above the min buffer and we're not already at the cap.
    // Adds at most one per 1Hz tick to keep growth pacing predictable; manual
    // UI / LLM bulk-enqueue paths go through PlanExecutor.
    const totalCurrent = workers.length + recruitQueue;
    if (autoRecruit
        && totalCurrent < effectiveCap
        && food >= recruitMinBuffer
        && recruitQueue < recruitMaxQueue) {
      // PC-1/PC-2 gate: model the runway with the prospective new mouth in
      // the denominator. Skip the enqueue (and surface the reason) if it
      // would drop below the configured headroom floor.
      const projectedHeadroom = computeFoodHeadroomSec(state, workers.length + recruitQueue + 1);
      if (projectedHeadroom < recruitMinHeadroomSec) {
        state.metrics.populationGrowthBlockedReason =
          `food headroom ${projectedHeadroom.toFixed(0)}s < ${recruitMinHeadroomSec}s (auto-fill skipped)`;
        state.metrics.foodHeadroomSec = projectedHeadroom;
      } else {
        // Grow the queue by 1 per second toward the cap; cap at the gap to
        // avoid overshoot when target shrinks.
        const gap = effectiveCap - totalCurrent;
        const add = Math.min(1, gap);
        recruitQueue = Math.min(recruitMaxQueue, recruitQueue + add);
        state.controls.recruitQueue = recruitQueue;
        state.metrics.foodHeadroomSec = projectedHeadroom;
      }
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

    // v0.10.1 R5 PC-recruit-flow-rate-gate (PC-1/PC-2): final flow-rate gate
    // before the spawn fires. Models the colony AFTER this recruit lands
    // (workers.length + 1) so the gate refuses recruits that would tip the
    // runway below the configured floor.
    const projectedHeadroomSec = computeFoodHeadroomSec(state, workers.length + 1);
    if (projectedHeadroomSec < recruitMinHeadroomSec) {
      state.metrics.populationGrowthBlockedReason =
        `food headroom ${projectedHeadroomSec.toFixed(0)}s < ${recruitMinHeadroomSec}s`;
      state.metrics.foodHeadroomSec = projectedHeadroomSec;
      return;
    }
    state.metrics.foodHeadroomSec = projectedHeadroomSec;

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

// v0.10.1 HW7 Final-Polish-Loop Round 1 wave-2 (C1-code-architect) —
// debt-pop-2: `__devForceSpawnWorkers` (dev-only stress helper) was moved
// out of this production simulation module to `src/dev/forceSpawn.js`.
// This re-export shim keeps the existing import path stable for
// `src/app/GameApp.js` and `test/long-run-api-shim.test.js`.
export { __devForceSpawnWorkers } from "../../dev/forceSpawn.js";
