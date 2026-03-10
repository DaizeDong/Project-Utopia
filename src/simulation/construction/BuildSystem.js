import {
  canAfford,
  evaluateBuildPreview,
  explainBuildReason,
  refund,
  spend,
  summarizeBuildPreview,
} from "./BuildAdvisor.js";
import { setTile, rebuildBuildingStats } from "../../world/grid/Grid.js";

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
    return evaluateBuildPreview(state, tool, ix, iz);
  }

  placeToolAt(state, tool, ix, iz, options = {}) {
    this.#ensureHistory(state);
    const preview = this.previewToolAt(state, tool, ix, iz);
    if (!preview.ok) return preview;

    if (tool !== "erase") spend(state.resources, preview.cost);
    if (tool === "erase" && ((preview.refund?.food ?? 0) || (preview.refund?.wood ?? 0))) {
      refund(state.resources, preview.refund);
    }

    const changed = setTile(state.grid, ix, iz, preview.newType);
    if (!changed) {
      if (tool !== "erase") refund(state.resources, preview.cost);
      if (tool === "erase" && ((preview.refund?.food ?? 0) || (preview.refund?.wood ?? 0))) {
        spend(state.resources, preview.refund);
      }
      return {
        ok: false,
        reason: "unchanged",
        reasonText: explainBuildReason("unchanged"),
        oldType: preview.oldType,
        newType: preview.newType,
        cost: preview.cost,
        refund: preview.refund,
      };
    }

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
        refund: preview.refund,
        summary: preview.summary,
      });
    }
    this.onAction?.({ kind: "build", tool, ix, iz, oldType: preview.oldType, newType: preview.newType });
    return {
      ...preview,
      ok: true,
      reason: "",
      reasonText: "",
      message: summarizeBuildPreview(preview),
    };
  }

  undo(state) {
    this.#ensureHistory(state);
    if (state.controls.undoStack.length === 0) return { ok: false, reason: "emptyHistory" };

    const entry = state.controls.undoStack.pop();
    if (entry.tool === "erase" && !canAfford(state.resources, entry.refund ?? {})) {
      state.controls.undoStack.push(entry);
      this.#syncHistoryFlags(state);
      return {
        ok: false,
        reason: "insufficientResource",
        reasonText: "Undo failed because the demolition salvage has already been spent.",
      };
    }

    const changed = setTile(state.grid, entry.ix, entry.iz, entry.oldType);
    if (!changed) {
      this.#syncHistoryFlags(state);
      return { ok: false, reason: "unchanged" };
    }

    if (entry.tool !== "erase") refund(state.resources, entry.cost ?? {});
    if (entry.tool === "erase" && ((entry.refund?.food ?? 0) || (entry.refund?.wood ?? 0))) spend(state.resources, entry.refund);

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
    const preview = evaluateBuildPreview(state, entry.tool, entry.ix, entry.iz);
    if (!preview.ok) {
      state.controls.redoStack.push(entry);
      this.#syncHistoryFlags(state);
      return {
        ok: false,
        reason: preview.reason || "unchanged",
        reasonText: preview.reasonText || explainBuildReason(preview.reason),
      };
    }

    if (entry.tool !== "erase") spend(state.resources, entry.cost ?? {});
    if (entry.tool === "erase" && ((entry.refund?.food ?? 0) || (entry.refund?.wood ?? 0))) refund(state.resources, entry.refund);
    const changed = setTile(state.grid, entry.ix, entry.iz, entry.newType);
    if (!changed) {
      if (entry.tool !== "erase") refund(state.resources, entry.cost ?? {});
      if (entry.tool === "erase" && ((entry.refund?.food ?? 0) || (entry.refund?.wood ?? 0))) spend(state.resources, entry.refund);
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
