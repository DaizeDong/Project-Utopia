import { rebuildBuildingStats, countTilesByType, listTilesByType, worldToTile } from "../../world/grid/Grid.js";
import { TILE } from "../../config/constants.js";
import { pushWarning } from "../../app/warnings.js";
import { BALANCE } from "../../config/balance.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";

// v0.8.2 Round-5 Wave-2 (01c-ui + 01d-mechanics-content): sliding-window
// resource-flow snapshot. Systems (ProcessingSystem kitchen/farm/spoilage,
// MortalitySystem medicine heal) call `recordResourceFlow(state, resource,
// kind, amount)` as true-source emitters. ResourceSystem then folds in a
// net-delta fallback for `food` consumption (worker eating happens in
// WorkerAISystem which is freeze-locked) and flushes per-min metrics every
// RESOURCE_FLOW_WINDOW_SEC seconds so HUDController's #foodRateBreakdown
// can display "(prod +X / cons -Y / spoil -Z)".
export const RESOURCE_FLOW_WINDOW_SEC = 3;

const TRACKED_FLOW_RESOURCES = ["food", "wood", "stone", "herbs", "meals", "medicine", "tools"];

function ensureResourceFlowState(state) {
  if (!state.metrics) state.metrics = {};
  if (!state._resourceFlowAccum) {
    const accum = {};
    for (const r of TRACKED_FLOW_RESOURCES) {
      accum[r] = { produced: 0, consumed: 0, spoiled: 0 };
    }
    state._resourceFlowAccum = accum;
  }
  if (!Number.isFinite(state._resourceFlowWindowSec)) state._resourceFlowWindowSec = 0;
  if (!state._resourceFlowLastSnapshot) {
    state._resourceFlowLastSnapshot = {
      food: Number(state.resources?.food ?? 0),
      wood: Number(state.resources?.wood ?? 0),
      stone: Number(state.resources?.stone ?? 0),
      herbs: Number(state.resources?.herbs ?? 0),
      meals: Number(state.resources?.meals ?? 0),
      medicine: Number(state.resources?.medicine ?? 0),
      tools: Number(state.resources?.tools ?? 0),
    };
  }
  return state._resourceFlowAccum;
}

/**
 * v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Step 3) — per-tile production
 * telemetry. WorkerAISystem's farm/lumber/quarry/herb harvest paths call
 * `recordProductionEntry(state, ix, iz, kind, lastYield, idleReason)` on the
 * harvest completion tick; InspectorPanel then reads
 * `state.metrics.production.byTile.get("ix,iz")` to render a "Last Yield" /
 * "Idle Reason" line for FARM/LUMBER/QUARRY/HERB_GARDEN/WAREHOUSE tiles.
 *
 * Map shape (also documented in Stage B summary §3 Wave-2 locked-against-
 * rewrite list):
 *   state.metrics.production = {
 *     byTile: Map<"ix,iz", { kind, lastYield, lastTickSec, idleReason|null }>,
 *     lastUpdatedSec: number,
 *   }
 *
 * The Map instance is created lazily ONCE per state and reused across ticks
 * (no per-tick re-allocation) to keep GC pressure flat on the 96×72 grid.
 *
 * @param {object} state - Game state root.
 * @param {number} ix - Tile column.
 * @param {number} iz - Tile row.
 * @param {"farm"|"lumber"|"quarry"|"herb_garden"|"warehouse"} kind
 * @param {number} lastYield - Carry units credited on this completion tick.
 * @param {string|null} idleReason - Optional reason ("depleted node",
 *   "fallow soil", "no worker") set when the tile produced 0; pass null for
 *   normal harvests.
 */
export function recordProductionEntry(state, ix, iz, kind, lastYield, idleReason = null) {
  if (!state) return;
  if (!Number.isFinite(ix) || !Number.isFinite(iz)) return;
  if (!state.metrics) state.metrics = {};
  let prod = state.metrics.production;
  if (!prod || !(prod.byTile instanceof Map)) {
    prod = { byTile: new Map(), lastUpdatedSec: 0 };
    state.metrics.production = prod;
  }
  const key = `${ix},${iz}`;
  const tickSec = Number(state.metrics.timeSec ?? 0);
  // Reuse existing entry if present (avoid per-call object alloc on hot path).
  let entry = prod.byTile.get(key);
  if (!entry) {
    entry = { kind, lastYield: 0, lastTickSec: 0, idleReason: null };
    prod.byTile.set(key, entry);
  }
  entry.kind = kind;
  entry.lastYield = Number(lastYield ?? 0);
  entry.lastTickSec = tickSec;
  entry.idleReason = idleReason ?? null;
  prod.lastUpdatedSec = tickSec;
}

/**
 * True-source resource flow emitter. Called by ProcessingSystem (farm
 * harvest, kitchen consumption, spoilage) and MortalitySystem (medicine
 * heal) so HUDController can render a breakdown. Safe to call with 0 or
 * negative amounts (clamped to 0).
 * @param {object} state - Game state root.
 * @param {"food"|"wood"|"stone"|"herbs"|"meals"|"medicine"|"tools"} resource
 * @param {"produced"|"consumed"|"spoiled"} kind
 * @param {number} amount - Non-negative quantity to record.
 */
export function recordResourceFlow(state, resource, kind, amount) {
  const qty = Math.max(0, Number(amount) || 0);
  if (qty <= 0) return;
  if (!TRACKED_FLOW_RESOURCES.includes(resource)) return;
  if (kind !== "produced" && kind !== "consumed" && kind !== "spoiled") return;
  const accum = ensureResourceFlowState(state);
  accum[resource][kind] = Number(accum[resource][kind] ?? 0) + qty;
}

function manhattan(a, b) {
  return Math.abs(a.ix - b.ix) + Math.abs(a.iz - b.iz);
}

function nearestDistance(tile, candidates) {
  let best = Infinity;
  for (const candidate of candidates) {
    const distance = manhattan(tile, candidate);
    if (distance < best) best = distance;
    if (best <= 0) break;
  }
  return best;
}

function tileKey(tile) {
  return `${tile.ix},${tile.iz}`;
}

function rebuildLogisticsMetrics(state) {
  const warehouses = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  const worksites = listTilesByType(state.grid, [TILE.FARM, TILE.LUMBER]);
  const softRadius = Number(BALANCE.worksiteCoverageSoftRadius ?? 10);
  const hardRadius = Number(BALANCE.worksiteCoverageHardRadius ?? 16);
  const softCapacity = Number(BALANCE.warehouseSoftCapacity ?? 3);
  const warehouseLoadByKey = {};
  let carryingWorkers = 0;
  let strandedCarryWorkers = 0;
  let totalCarryInTransit = 0;
  let totalDepotDistance = 0;
  let distanceSamples = 0;

  for (const worker of state.agents) {
    if (worker.type !== "WORKER" || worker.alive === false) continue;
    const carryTotal = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0);
    if (carryTotal <= 0) continue;
    carryingWorkers += 1;
    totalCarryInTransit += carryTotal;
    const current = worldToTile(worker.x, worker.z, state.grid);
    const depotDistance = nearestDistance(current, warehouses);
    if (!Number.isFinite(depotDistance)) {
      strandedCarryWorkers += 1;
    } else {
      totalDepotDistance += depotDistance;
      distanceSamples += 1;
    }
    if (worker.targetTile && state.grid.tiles[worker.targetTile.ix + worker.targetTile.iz * state.grid.width] === TILE.WAREHOUSE) {
      const key = tileKey(worker.targetTile);
      warehouseLoadByKey[key] = Number(warehouseLoadByKey[key] ?? 0) + 1;
    }
  }

  let stretchedWorksites = 0;
  let isolatedWorksites = 0;
  for (const site of worksites) {
    const depotDistance = nearestDistance(site, warehouses);
    if (!Number.isFinite(depotDistance)) {
      isolatedWorksites += 1;
      continue;
    }
    if (depotDistance > hardRadius) isolatedWorksites += 1;
    else if (depotDistance > softRadius) stretchedWorksites += 1;
  }

  let busiestWarehouseLoad = 0;
  for (const load of Object.values(warehouseLoadByKey)) {
    if (Number(load) > busiestWarehouseLoad) busiestWarehouseLoad = Number(load);
  }
  const overloadedWarehouses = Object.values(warehouseLoadByKey).filter((load) => Number(load) > softCapacity).length;
  const avgDepotDistance = distanceSamples > 0 ? Number((totalDepotDistance / distanceSamples).toFixed(2)) : 0;

  let summary = "Logistics: idle";
  if (warehouses.length <= 0) {
    summary = "Logistics: no warehouse anchors online.";
  } else if (carryingWorkers > 0 || stretchedWorksites > 0 || isolatedWorksites > 0 || overloadedWarehouses > 0) {
    summary = `Logistics: carriers ${carryingWorkers}, avg depot dist ${avgDepotDistance.toFixed(1)}, overloaded depots ${overloadedWarehouses}, stretched worksites ${stretchedWorksites}, isolated worksites ${isolatedWorksites}`;
  } else {
    summary = `Logistics: ${warehouses.length} depots online, no active carry bottleneck.`;
  }

  // Count traffic density: workers sharing tiles
  let trafficSamples = 0;
  const tileCounts = new Map();
  for (const a of state.agents) {
    if (a.type !== "WORKER" || a.alive === false) continue;
    const key = `${Math.floor(a.x)},${Math.floor(a.z)}`;
    tileCounts.set(key, (tileCounts.get(key) ?? 0) + 1);
  }
  for (const count of tileCounts.values()) {
    if (count >= 2) trafficSamples += count;
  }

  state.metrics.logistics = {
    carryingWorkers,
    totalCarryInTransit: Number(totalCarryInTransit.toFixed(2)),
    avgDepotDistance,
    strandedCarryWorkers,
    overloadedWarehouses,
    busiestWarehouseLoad,
    stretchedWorksites,
    isolatedWorksites,
    warehouseLoadByKey,
    trafficSamples,
    summary,
  };
  state.debug.logistics = state.metrics.logistics;
}

// v0.8.0 Phase 2 M2: producer-density risk scoring around warehouses.
// Per spec § 3: high resource density around a warehouse probabilistically
// ignites WAREHOUSE_FIRE or VERMIN_SWARM events. Because per-building stocks
// are not tracked in this codebase, we approximate "stored resources in radius"
// by counting producer/storage tiles in radius × an average stock constant.
const DENSITY_PRODUCER_TYPES = [
  TILE.FARM,
  TILE.LUMBER,
  TILE.QUARRY,
  TILE.HERB_GARDEN,
  TILE.WAREHOUSE,
  TILE.KITCHEN,
  TILE.SMITHY,
  TILE.CLINIC,
];
function rebuildWarehouseDensity(state) {
  const warehouses = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  const radius = Number(BALANCE.warehouseDensityRadius ?? 6);
  const threshold = Number(BALANCE.warehouseDensityRiskThreshold ?? 400);
  const avgStock = Number(BALANCE.warehouseDensityAvgStockPerTile ?? 50);
  const producers = listTilesByType(state.grid, DENSITY_PRODUCER_TYPES);

  const byKey = {};
  const hotWarehouses = [];
  let peak = 0;

  for (const wh of warehouses) {
    let producerTiles = 0;
    for (const producer of producers) {
      if (manhattan(wh, producer) <= radius) producerTiles += 1;
    }
    const score = producerTiles * avgStock;
    const key = tileKey(wh);
    byKey[key] = score;
    if (score > peak) peak = score;
    if (score >= threshold) hotWarehouses.push(key);
  }

  state.metrics.warehouseDensity = {
    byKey,
    peak,
    hotWarehouses,
    threshold,
    radius,
  };
  if (state.debug) state.debug.warehouseDensity = state.metrics.warehouseDensity;
}

export class ResourceSystem {
  constructor() {
    this.name = "ResourceSystem";
    this.lastGridVersion = -1;
    this.nextLogisticsSampleSec = -Infinity;
  }

  update(dt, state) {
    // v0.8.2 Round-5 Wave-2 (01c+01d): initialize the resource-flow accum
    // BEFORE any guards so producers (ProcessingSystem) and MortalitySystem
    // medicine-heal can write their emits in the same tick even when the
    // ResourceSystem sits late in SYSTEM_ORDER.
    ensureResourceFlowState(state);

    state.resources.food = Number.isFinite(state.resources.food) ? Math.max(0, state.resources.food) : 0;
    state.resources.wood = Number.isFinite(state.resources.wood) ? Math.max(0, state.resources.wood) : 0;
    state.resources.stone = Number.isFinite(state.resources.stone) ? Math.max(0, state.resources.stone) : 0;
    state.resources.herbs = Number.isFinite(state.resources.herbs) ? Math.max(0, state.resources.herbs) : 0;
    state.resources.meals = Number.isFinite(state.resources.meals) ? Math.max(0, state.resources.meals) : 0;
    state.resources.medicine = Number.isFinite(state.resources.medicine) ? Math.max(0, state.resources.medicine) : 0;
    state.resources.tools = Number.isFinite(state.resources.tools) ? Math.max(0, state.resources.tools) : 0;
    const stepSec = Math.max(0, Number(dt) || 0);
    state.metrics.resourceEmptySec ??= { food: 0, wood: 0 };
    state.metrics.resourceEmptySec.food = state.resources.food <= 0
      ? Number(state.metrics.resourceEmptySec.food ?? 0) + stepSec
      : 0;
    state.metrics.resourceEmptySec.wood = state.resources.wood <= 0
      ? Number(state.metrics.resourceEmptySec.wood ?? 0) + stepSec
      : 0;

    // Food shortage event
    const foodThreshold = Number(BALANCE.foodEmergencyThreshold ?? 14);
    const prevFoodShortage = Boolean(state._foodShortage);
    state._foodShortage = state.resources.food < foodThreshold;
    if (state._foodShortage && !prevFoodShortage) {
      emitEvent(state, EVENT_TYPES.FOOD_SHORTAGE, { resource: "food", food: state.resources.food, threshold: foodThreshold });
    }
    if (!state._foodShortage && prevFoodShortage && state.resources.food > foodThreshold * 3) {
      emitEvent(state, EVENT_TYPES.RESOURCE_SURPLUS, { resource: "food", amount: state.resources.food });
    }

    // Wood shortage/surplus events
    const woodThreshold = Number(BALANCE.woodEmergencyThreshold ?? 10);
    const prevWoodShortage = Boolean(state._woodShortage);
    state._woodShortage = state.resources.wood < woodThreshold;
    if (state._woodShortage && !prevWoodShortage) {
      emitEvent(state, EVENT_TYPES.FOOD_SHORTAGE, { resource: "wood", wood: state.resources.wood, threshold: woodThreshold });
    }
    if (!state._woodShortage && prevWoodShortage && state.resources.wood > woodThreshold * 3) {
      emitEvent(state, EVENT_TYPES.RESOURCE_SURPLUS, { resource: "wood", amount: state.resources.wood });
    }

    // Resource depletion events (any resource hits 0)
    for (const res of ["food", "wood", "stone", "herbs"]) {
      const key = `_${res}Depleted`;
      const val = state.resources[res] ?? 0;
      if (val <= 0 && !state[key]) {
        state[key] = true;
        emitEvent(state, EVENT_TYPES.RESOURCE_DEPLETED, { resource: res });
      } else if (val > 5) {
        state[key] = false;
      }
    }

    // Tool production multiplier (colony-wide harvest speed buff)
    const toolCount = Math.min(Number(state.resources.tools ?? 0), Number(BALANCE.toolMaxEffective ?? 3));
    const toolBonus = toolCount * Number(BALANCE.toolHarvestSpeedBonus ?? 0.15);
    state.gameplay = state.gameplay ?? {};
    state.gameplay.toolProductionMultiplier = 1 + toolBonus;
    const gridChanged = this.lastGridVersion !== state.grid.version;

    if (gridChanged) {
      const prevBuildings = state.buildings ? { ...state.buildings } : null;
      state.buildings = rebuildBuildingStats(state.grid);
      if (prevBuildings) {
        this.#detectObjectiveRegressions(prevBuildings, state.buildings, state);
        this.#emitBuildingDestroyedDiffs(prevBuildings, state.buildings, state);
      }
      if (state.debug) {
        const roads = countTilesByType(state.grid, [TILE.ROAD]);
        const farms = countTilesByType(state.grid, [TILE.FARM]);
        const lumbers = countTilesByType(state.grid, [TILE.LUMBER]);
        const warehouses = countTilesByType(state.grid, [TILE.WAREHOUSE]);
        const walls = countTilesByType(state.grid, [TILE.WALL]);
        const water = countTilesByType(state.grid, [TILE.WATER]);
        const grass = countTilesByType(state.grid, [TILE.GRASS]);
        const ruins = countTilesByType(state.grid, [TILE.RUINS]);
        const passable = roads + farms + lumbers + warehouses + grass + ruins;
        state.debug.roadCount = roads;
        state.debug.gridStats = {
          roads,
          farms,
          lumbers,
          warehouses,
          walls,
          water,
          grass,
          ruins,
          emptyBaseTiles: state.grid.emptyBaseTiles ?? 0,
          passableRatio: passable / state.grid.tiles.length,
        };
      }
      this.lastGridVersion = state.grid.version;
    }

    const nowSec = Number(state.metrics.timeSec ?? 0);
    if (gridChanged || nowSec >= this.nextLogisticsSampleSec) {
      rebuildLogisticsMetrics(state);
      rebuildWarehouseDensity(state);
      this.nextLogisticsSampleSec = nowSec + 0.4;
    }

    if (!Number.isFinite(state.resources.food) || !Number.isFinite(state.resources.wood)
      || !Number.isFinite(state.resources.stone) || !Number.isFinite(state.resources.herbs)
      || !Number.isFinite(state.resources.meals) || !Number.isFinite(state.resources.medicine)
      || !Number.isFinite(state.resources.tools)) {
      pushWarning(state, "Resource value became invalid and was reset", "error", this.name);
      state.resources.food = Math.max(0, state.resources.food || 0);
      state.resources.wood = Math.max(0, state.resources.wood || 0);
      state.resources.stone = Math.max(0, state.resources.stone || 0);
      state.resources.herbs = Math.max(0, state.resources.herbs || 0);
      state.resources.meals = Math.max(0, state.resources.meals || 0);
      state.resources.medicine = Math.max(0, state.resources.medicine || 0);
      state.resources.tools = Math.max(0, state.resources.tools || 0);
    }

    // v0.8.2 Round-5 Wave-2 (01c-ui + 01d-mechanics-content): flush the
    // resource-flow accumulator every RESOURCE_FLOW_WINDOW_SEC (3s) and
    // project per-min metrics for HUD consumption. Worker food eating
    // lives in WorkerAISystem (freeze-locked), so we fold any residual
    // net-negative food delta (not explained by recorded consumption +
    // spoilage) into consumption — this is the "delta fallback" from
    // plan 01c Step 1.
    state._resourceFlowWindowSec = Number(state._resourceFlowWindowSec ?? 0) + stepSec;
    const windowSec = Number(state._resourceFlowWindowSec ?? 0);
    if (windowSec >= RESOURCE_FLOW_WINDOW_SEC) {
      const accum = state._resourceFlowAccum;
      const prev = state._resourceFlowLastSnapshot;
      const cur = state.resources;
      // Food net-delta fallback: emitted sources (farm produced, kitchen
      // consumed, spoilage) may not fully account for worker eating.
      const explainedFood = Number(accum.food.produced ?? 0)
        - Number(accum.food.consumed ?? 0)
        - Number(accum.food.spoiled ?? 0);
      const actualFoodDelta = Number(cur.food ?? 0) - Number(prev.food ?? 0);
      const unexplained = actualFoodDelta - explainedFood;
      if (unexplained < 0) {
        accum.food.consumed = Number(accum.food.consumed ?? 0) + Math.abs(unexplained);
      }
      // Flush per-min metrics (× 60/windowSec). Guard against division
      // by zero even though we gate on >= RESOURCE_FLOW_WINDOW_SEC.
      const scale = windowSec > 0 ? 60 / windowSec : 0;
      state.metrics.foodProducedPerMin = Number((Number(accum.food.produced ?? 0) * scale).toFixed(2));
      state.metrics.foodConsumedPerMin = Number((Number(accum.food.consumed ?? 0) * scale).toFixed(2));
      state.metrics.foodSpoiledPerMin = Number((Number(accum.food.spoiled ?? 0) * scale).toFixed(2));
      // Wood / stone / herbs / meals / medicine / tools: future hooks. We
      // project net-delta in /min terms so HUDController's existing rate
      // badges receive a consistent signal (keeps the breakdown format
      // ready for downstream extensions without changing this wave's UI).
      for (const r of ["wood", "stone", "herbs", "meals", "medicine", "tools"]) {
        const prod = Number(accum[r]?.produced ?? 0);
        const cons = Number(accum[r]?.consumed ?? 0);
        state.metrics[`${r}ProducedPerMin`] = Number((prod * scale).toFixed(2));
        state.metrics[`${r}ConsumedPerMin`] = Number((cons * scale).toFixed(2));
      }
      // Reset accumulators + snapshot for the next window.
      for (const r of TRACKED_FLOW_RESOURCES) {
        accum[r].produced = 0;
        accum[r].consumed = 0;
        accum[r].spoiled = 0;
      }
      state._resourceFlowLastSnapshot = {
        food: Number(cur.food ?? 0),
        wood: Number(cur.wood ?? 0),
        stone: Number(cur.stone ?? 0),
        herbs: Number(cur.herbs ?? 0),
        meals: Number(cur.meals ?? 0),
        medicine: Number(cur.medicine ?? 0),
        tools: Number(cur.tools ?? 0),
      };
      state._resourceFlowWindowSec = 0;
    }

    // v0.8.2 Round-5b Wave-1 (01a Step 1) — Autopilot food-crisis detector.
    // Emits FOOD_CRISIS_DETECTED when food=0 + autopilot enabled + at least
    // one starvation death in the last 30 seconds. ColonyDirectorSystem
    // listens and clamps speed to 0 so the player gets an honest "I failed"
    // signal instead of a silent 60-second collapse. 5 s cooldown prevents
    // repeat emits within a single crisis. benchmarkMode bypass keeps
    // long-horizon-bench.mjs deterministic (headless harness never pauses).
    this.#emitFoodCrisisIfNeeded(state);
  }

  #emitFoodCrisisIfNeeded(state) {
    if (state.benchmarkMode === true) return;
    const foodStock = Number(state.resources?.food ?? 0);
    if (foodStock > 0) return;
    // Autopilot flag lives under state.ai.enabled in this codebase.
    const autopilotOn = Boolean(state.ai?.enabled);
    if (!autopilotOn) return;
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    // Cooldown stored on state.ai — keep all autopilot-crisis fields adjacent.
    state.ai ??= {};
    const lastEmit = Number(state.ai._lastCrisisEmitSec ?? -999);
    if ((nowSec - lastEmit) < 5) return;
    // Count starvation deaths in last 30 s from the event log.
    const log = state.events?.log ?? [];
    let deathsLast30s = 0;
    const cutoff = nowSec - 30;
    for (let i = log.length - 1; i >= 0; i -= 1) {
      const ev = log[i];
      if (!ev || typeof ev.t !== "number") continue;
      if (ev.t < cutoff) break;
      if (ev.type === EVENT_TYPES.WORKER_STARVED) deathsLast30s += 1;
    }
    if (deathsLast30s < 1) return;
    // Count starving workers (hunger below seek threshold).
    let workersStarving = 0;
    const starveThreshold = Number(BALANCE.workerHungerSeekThreshold ?? 0.18);
    for (const agent of state.agents ?? []) {
      if (agent?.type === "WORKER" && agent.alive !== false
          && Number(agent.hunger ?? 1) < starveThreshold) {
        workersStarving += 1;
      }
    }
    state.ai._lastCrisisEmitSec = nowSec;
    emitEvent(state, EVENT_TYPES.FOOD_CRISIS_DETECTED, {
      deathsLast30s,
      foodStock: 0,
      workersStarving,
      ts: nowSec,
    });
  }

  // v0.8.2 Round-5b (02c-speedrunner Step 4) — Emit BUILDING_DESTROYED for each
  // building category that lost ≥1 copy between grid rebuilds. Cause is inferred
  // from recent active events (wildfire > flood > raid > decay fallback).
  #emitBuildingDestroyedDiffs(prev, curr, state) {
    const categories = [
      ["warehouses", "warehouse"],
      ["farms", "farm"],
      ["lumbers", "lumber_camp"],
      ["walls", "wall"],
      ["kitchens", "kitchen"],
      ["smithies", "smithy"],
      ["clinics", "clinic"],
      ["quarries", "quarry"],
      ["herbGardens", "herb_garden"],
    ];
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const recentCutoff = nowSec - 30;
    const log = state.events?.log ?? [];
    let cause = "decay";
    for (let i = log.length - 1; i >= 0; i--) {
      const ev = log[i];
      if (!ev || Number(ev.t ?? 0) < recentCutoff) break;
      if (ev.type === "wildfire_spread" || ev.detail?.cause === "wildfire") { cause = "wildfire"; break; }
      if (ev.type === "flood" || ev.detail?.cause === "flood") { cause = "flood"; break; }
      if (ev.type === "raid_attack" || ev.detail?.cause === "raid") { cause = "raid"; break; }
    }
    for (const [pluralKey, kind] of categories) {
      const prevCount = Number(prev?.[pluralKey] ?? 0);
      const newCount = Number(curr?.[pluralKey] ?? 0);
      const delta = prevCount - newCount;
      if (delta < 1) continue;
      emitEvent(state, EVENT_TYPES.BUILDING_DESTROYED, { kind, prevCount, newCount, delta, cause });
    }
  }

  // v0.8.2 Round-5b (02a-rimworld-veteran Step 3) — Detect when scenario-tracked
  // building counts drop between grid rebuilds and emit OBJECTIVE_REGRESSED with
  // a cause inferred from recent BUILDING_DESTROYED events in the event log.
  #detectObjectiveRegressions(prev, curr, state) {
    const tracked = [
      ["warehouses", "warehouse"],
      ["farms", "farm"],
      ["lumbers", "lumber_camp"],
      ["walls", "wall"],
      ["kitchens", "kitchen"],
    ];
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const windowSec = Number(BALANCE.scenarioObjectiveRegressionWindowSec ?? 8);
    const log = state.events?.log ?? [];
    for (const [pluralKey, category] of tracked) {
      const from = Number(prev?.[pluralKey] ?? 0);
      const to = Number(curr?.[pluralKey] ?? 0);
      const delta = from - to;
      if (delta < 1) continue;
      let cause = "unknown";
      for (let i = log.length - 1; i >= 0; i--) {
        const ev = log[i];
        if (nowSec - Number(ev.t ?? 0) > windowSec) break;
        if (ev.type !== "building_destroyed") continue;
        const detail = ev.detail ?? {};
        if (detail.cause === "wildfire") { cause = "wildfire"; break; }
        if (detail.tool === "erase") { cause = "demolish"; break; }
      }
      emitEvent(state, EVENT_TYPES.OBJECTIVE_REGRESSED, {
        category,
        pluralKey,
        from,
        to,
        delta,
        cause,
      });
    }
  }
}
