import { rebuildBuildingStats, countTilesByType, listTilesByType, worldToTile } from "../../world/grid/Grid.js";
import { TILE } from "../../config/constants.js";
import { pushWarning } from "../../app/warnings.js";
import { BALANCE } from "../../config/balance.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";

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

  update(_dt, state) {
    state.resources.food = Number.isFinite(state.resources.food) ? Math.max(0, state.resources.food) : 0;
    state.resources.wood = Number.isFinite(state.resources.wood) ? Math.max(0, state.resources.wood) : 0;
    state.resources.stone = Number.isFinite(state.resources.stone) ? Math.max(0, state.resources.stone) : 0;
    state.resources.herbs = Number.isFinite(state.resources.herbs) ? Math.max(0, state.resources.herbs) : 0;
    state.resources.meals = Number.isFinite(state.resources.meals) ? Math.max(0, state.resources.meals) : 0;
    state.resources.medicine = Number.isFinite(state.resources.medicine) ? Math.max(0, state.resources.medicine) : 0;
    state.resources.tools = Number.isFinite(state.resources.tools) ? Math.max(0, state.resources.tools) : 0;

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
      state.buildings = rebuildBuildingStats(state.grid);
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
  }
}
