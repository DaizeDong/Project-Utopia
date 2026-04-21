import {
  canAfford,
  evaluateBuildPreview,
  explainBuildReason,
  refund,
  spend,
  summarizeBuildPreview,
} from "./BuildAdvisor.js";
import { setTile, rebuildBuildingStats } from "../../world/grid/Grid.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";

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

  previewToolAt(state, tool, ix, iz, services = null) {
    return evaluateBuildPreview(state, tool, ix, iz, services);
  }

  placeToolAt(state, tool, ix, iz, options = {}) {
    this.#ensureHistory(state);
    // Thread services through so ruin-salvage RNG stays seeded (silent-failure C2).
    const preview = this.previewToolAt(state, tool, ix, iz, options.services ?? null);
    if (!preview.ok) return preview;

    if (tool !== "erase") spend(state.resources, preview.cost);
    // Apply demolition recycling refund BEFORE setTile writes GRASS. M1c covers
    // wood+stone (+food/herbs if ever non-zero). Any positive component triggers
    // both the refund and the DEMOLITION_RECYCLED emit downstream.
    const hasDemoRefund = tool === "erase" && (
      (preview.refund?.food ?? 0) > 0
      || (preview.refund?.wood ?? 0) > 0
      || (preview.refund?.stone ?? 0) > 0
      || (preview.refund?.herbs ?? 0) > 0
    );
    if (hasDemoRefund) {
      refund(state.resources, preview.refund);
    }

    const changed = setTile(state.grid, ix, iz, preview.newType);
    if (!changed) {
      if (tool !== "erase") refund(state.resources, preview.cost);
      if (hasDemoRefund) {
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
    const eventType = tool === "erase" ? EVENT_TYPES.BUILDING_DESTROYED : EVENT_TYPES.BUILDING_PLACED;
    emitEvent(state, eventType, { tool, ix, iz, oldType: preview.oldType, newType: preview.newType });
    // Phase 3 M1c: emit DEMOLITION_RECYCLED when erase produced a non-zero refund.
    // Payload is { ix, iz, refund: { wood, stone } } per spec. Extras (food/herbs)
    // are included when non-zero so downstream listeners get the full picture.
    if (tool === "erase" && hasDemoRefund) {
      const refundPayload = {
        wood: preview.refund?.wood ?? 0,
        stone: preview.refund?.stone ?? 0,
      };
      if ((preview.refund?.food ?? 0) > 0) refundPayload.food = preview.refund.food;
      if ((preview.refund?.herbs ?? 0) > 0) refundPayload.herbs = preview.refund.herbs;
      emitEvent(state, EVENT_TYPES.DEMOLITION_RECYCLED, {
        ix,
        iz,
        refund: refundPayload,
        oldType: preview.oldType,
      });
    }
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
    if (entry.tool === "erase" && (
      (entry.refund?.food ?? 0) > 0
      || (entry.refund?.wood ?? 0) > 0
      || (entry.refund?.stone ?? 0) > 0
      || (entry.refund?.herbs ?? 0) > 0
    )) spend(state.resources, entry.refund);

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

    const entryHasRefund = entry.tool === "erase" && (
      (entry.refund?.food ?? 0) > 0
      || (entry.refund?.wood ?? 0) > 0
      || (entry.refund?.stone ?? 0) > 0
      || (entry.refund?.herbs ?? 0) > 0
    );
    if (entry.tool !== "erase") spend(state.resources, entry.cost ?? {});
    if (entryHasRefund) refund(state.resources, entry.refund);
    const changed = setTile(state.grid, entry.ix, entry.iz, entry.newType);
    if (!changed) {
      if (entry.tool !== "erase") refund(state.resources, entry.cost ?? {});
      if (entryHasRefund) spend(state.resources, entry.refund);
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
