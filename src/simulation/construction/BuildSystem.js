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

export function explainBuildReason(reason) {
  if (reason === "unchanged") return "Target tile is unchanged.";
  if (reason === "waterBlocked") return "Cannot build on water tile.";
  if (reason === "insufficientResource") return "Insufficient resources.";
  return "Build action failed.";
}

export class BuildSystem {
  constructor() {
    this.name = "BuildSystem";
  }

  previewToolAt(state, tool, ix, iz) {
    const newType = toolToTile(tool);
    const oldType = getTile(state.grid, ix, iz);
    const cost = BUILD_COST[tool] ?? { wood: 0, food: 0 };
    if (newType === oldType) {
      return { ok: false, reason: "unchanged", oldType, newType, cost };
    }
    if (oldType === TILE.WATER && newType !== TILE.WATER) {
      return { ok: false, reason: "waterBlocked", oldType, newType, cost };
    }
    if (tool !== "erase" && !canAfford(state.resources, cost)) {
      return { ok: false, reason: "insufficientResource", oldType, newType, cost };
    }
    return { ok: true, reason: "", oldType, newType, cost };
  }

  placeToolAt(state, tool, ix, iz) {
    const preview = this.previewToolAt(state, tool, ix, iz);
    if (!preview.ok) return preview;

    if (tool !== "erase") pay(state.resources, preview.cost);

    const changed = setTile(state.grid, ix, iz, preview.newType);
    if (!changed) return { ok: false, reason: "unchanged", oldType: preview.oldType, newType: preview.newType, cost: preview.cost };

    state.buildings = rebuildBuildingStats(state.grid);
    return { ok: true, reason: "", oldType: preview.oldType, newType: preview.newType, cost: preview.cost };
  }
}
