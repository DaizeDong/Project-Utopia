import { BUILD_COST } from "../../config/balance.js";
import { TILE } from "../../config/constants.js";
import { setTile, getTile, rebuildBuildingStats } from "../../world/grid/Grid.js";
import { toolToTile } from "../../world/grid/TileTypes.js";

export function canAfford(resources, cost) {
  return resources.food >= (cost.food ?? 0) && resources.wood >= (cost.wood ?? 0);
}

export function pay(resources, cost) {
  resources.food = Math.max(0, resources.food - (cost.food ?? 0));
  resources.wood = Math.max(0, resources.wood - (cost.wood ?? 0));
}

export class BuildSystem {
  constructor() {
    this.name = "BuildSystem";
  }

  placeToolAt(state, tool, ix, iz) {
    const newType = toolToTile(tool);
    const oldType = getTile(state.grid, ix, iz);
    if (newType === oldType) return { ok: false, reason: "unchanged" };

    if (oldType === TILE.WATER && newType !== TILE.WATER) {
      return { ok: false, reason: "waterBlocked" };
    }

    const cost = BUILD_COST[tool] ?? { wood: 0, food: 0 };
    if (tool !== "erase" && !canAfford(state.resources, cost)) {
      return { ok: false, reason: "insufficientResource" };
    }

    if (tool !== "erase") pay(state.resources, cost);

    const changed = setTile(state.grid, ix, iz, newType);
    if (!changed) return { ok: false, reason: "unchanged" };

    state.buildings = rebuildBuildingStats(state.grid);
    return { ok: true, tile: newType };
  }
}
