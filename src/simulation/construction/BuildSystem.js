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
  constructor(options = {}) {
    this.name = "BuildSystem";
    this.maxHistory = 600;
    this.onAction = options.onAction ?? null;
  }

  #ensureHistory(state) {
    state.controls.undoStack ??= [];
    state.controls.redoStack ??= [];
    state.controls.canUndo = state.controls.undoStack.length > 0;
    state.controls.canRedo = state.controls.redoStack.length > 0;
  }

  #syncHistoryFlags(state) {
    state.controls.canUndo = (state.controls.undoStack?.length ?? 0) > 0;
    state.controls.canRedo = (state.controls.redoStack?.length ?? 0) > 0;
  }

  #recordHistory(state, entry) {
    this.#ensureHistory(state);
    state.controls.undoStack.push(entry);
    if (state.controls.undoStack.length > this.maxHistory) {
      state.controls.undoStack = state.controls.undoStack.slice(-this.maxHistory);
    }
    state.controls.redoStack = [];
    this.#syncHistoryFlags(state);
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

  placeToolAt(state, tool, ix, iz, options = {}) {
    this.#ensureHistory(state);
    const preview = this.previewToolAt(state, tool, ix, iz);
    if (!preview.ok) return preview;

    if (tool !== "erase") pay(state.resources, preview.cost);

    const changed = setTile(state.grid, ix, iz, preview.newType);
    if (!changed) return { ok: false, reason: "unchanged", oldType: preview.oldType, newType: preview.newType, cost: preview.cost };

    state.buildings = rebuildBuildingStats(state.grid);
    if (options.recordHistory !== false) {
      this.#recordHistory(state, {
        kind: "build",
        tool,
        ix,
        iz,
        oldType: preview.oldType,
        newType: preview.newType,
        cost: preview.cost,
      });
    }
    this.onAction?.({ kind: "build", tool, ix, iz, oldType: preview.oldType, newType: preview.newType });
    return { ok: true, reason: "", oldType: preview.oldType, newType: preview.newType, cost: preview.cost, tool, ix, iz };
  }

  undo(state) {
    this.#ensureHistory(state);
    if (state.controls.undoStack.length === 0) return { ok: false, reason: "emptyHistory" };

    const entry = state.controls.undoStack.pop();
    const changed = setTile(state.grid, entry.ix, entry.iz, entry.oldType);
    if (!changed) {
      this.#syncHistoryFlags(state);
      return { ok: false, reason: "unchanged" };
    }

    if (entry.tool !== "erase") {
      state.resources.food += entry.cost?.food ?? 0;
      state.resources.wood += entry.cost?.wood ?? 0;
    }

    state.buildings = rebuildBuildingStats(state.grid);
    state.controls.redoStack.push(entry);
    this.#syncHistoryFlags(state);
    this.onAction?.({ kind: "undo", tool: entry.tool, ix: entry.ix, iz: entry.iz, oldType: entry.oldType, newType: entry.newType });
    return { ok: true, ...entry };
  }

  redo(state) {
    this.#ensureHistory(state);
    if (state.controls.redoStack.length === 0) return { ok: false, reason: "emptyHistory" };

    const entry = state.controls.redoStack.pop();
    if (entry.tool !== "erase" && !canAfford(state.resources, entry.cost ?? {})) {
      state.controls.redoStack.push(entry);
      this.#syncHistoryFlags(state);
      return { ok: false, reason: "insufficientResource" };
    }

    if (entry.tool !== "erase") pay(state.resources, entry.cost ?? {});
    const changed = setTile(state.grid, entry.ix, entry.iz, entry.newType);
    if (!changed) {
      this.#syncHistoryFlags(state);
      return { ok: false, reason: "unchanged" };
    }

    state.buildings = rebuildBuildingStats(state.grid);
    state.controls.undoStack.push(entry);
    this.#syncHistoryFlags(state);
    this.onAction?.({ kind: "redo", tool: entry.tool, ix: entry.ix, iz: entry.iz, oldType: entry.oldType, newType: entry.newType });
    return { ok: true, ...entry };
  }
}
