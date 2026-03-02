import { rebuildBuildingStats, countTilesByType } from "../../world/grid/Grid.js";
import { TILE } from "../../config/constants.js";
import { pushWarning } from "../../app/warnings.js";

export class ResourceSystem {
  constructor() {
    this.name = "ResourceSystem";
    this.lastGridVersion = -1;
  }

  update(_dt, state) {
    state.resources.food = Number.isFinite(state.resources.food) ? Math.max(0, state.resources.food) : 0;
    state.resources.wood = Number.isFinite(state.resources.wood) ? Math.max(0, state.resources.wood) : 0;

    if (this.lastGridVersion !== state.grid.version) {
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

    if (!Number.isFinite(state.resources.food) || !Number.isFinite(state.resources.wood)) {
      pushWarning(state, "Resource value became invalid and was reset", "error", this.name);
      state.resources.food = Math.max(0, state.resources.food || 0);
      state.resources.wood = Math.max(0, state.resources.wood || 0);
    }
  }
}
