import { rebuildBuildingStats, countTilesByType, listTilesByType, worldToTile } from "../../world/grid/Grid.js";
import { TILE } from "../../config/constants.js";
import { pushWarning } from "../../app/warnings.js";
import { BALANCE } from "../../config/balance.js";

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
    summary,
  };
  state.debug.logistics = state.metrics.logistics;
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
      this.nextLogisticsSampleSec = nowSec + 0.4;
    }

    if (!Number.isFinite(state.resources.food) || !Number.isFinite(state.resources.wood)) {
      pushWarning(state, "Resource value became invalid and was reset", "error", this.name);
      state.resources.food = Math.max(0, state.resources.food || 0);
      state.resources.wood = Math.max(0, state.resources.wood || 0);
    }
  }
}
