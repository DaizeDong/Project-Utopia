import {
  canAfford,
  evaluateBuildPreview,
  explainBuildReason,
  refund,
  spend,
  summarizeBuildPreview,
} from "./BuildAdvisor.js";
import { setTile } from "../../world/grid/Grid.js";
import { TILE } from "../../config/constants.js";
import { BALANCE } from "../../config/balance.js";
import { onTileMutated } from "../lifecycle/TileMutationHooks.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";
import {
  pushConstructionSite,
  spliceConstructionSite,
  setConstructionOverlay,
  clearConstructionOverlay,
  getConstructionOverlay,
  getBuildWorkSec,
  getDemolishWorkSec,
} from "./ConstructionSites.js";

// v0.8.4 building-construction (Agent A) — set of tile types that count
// as "built structures" for the demolish blueprint path. RUINS is also
// demolishable but routed separately so we can charge the lower
// demolishWorkSec.ruins duration. GRASS / WATER cannot be demolished.
const BUILT_STRUCTURE_TILES = new Set([
  TILE.FARM,
  TILE.LUMBER,
  TILE.WAREHOUSE,
  TILE.WALL,
  TILE.QUARRY,
  TILE.HERB_GARDEN,
  TILE.KITCHEN,
  TILE.SMITHY,
  TILE.CLINIC,
  TILE.BRIDGE,
  TILE.ROAD,
  TILE.GATE,
]);

function isBuiltStructure(tile) {
  return BUILT_STRUCTURE_TILES.has(tile);
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

  previewToolAt(state, tool, ix, iz, services = null) {
    return evaluateBuildPreview(state, tool, ix, iz, services);
  }

  /**
   * Place a build/erase tool at (ix, iz). v0.8.4 default behaviour is the
   * **blueprint** path — resources are spent up front, a construction
   * overlay lands on tileState, and a BUILDER worker drives completion via
   * ConstructionSystem. Pass `options.instant: true` to keep the legacy
   * "tile mutates immediately" semantics (used by tests and editor tooling).
   *
   * Returns the canonical preview shape augmented with `phase`:
   *   - "complete"          — tile mutated this call (instant path)
   *   - "blueprint"         — overlay placed; tile NOT mutated
   *   - "blueprint-cancel"  — erase routed to cancel an existing blueprint
   */
  placeToolAt(state, tool, ix, iz, options = {}) {
    this.#ensureHistory(state);

    // v0.8.4 (Agent A) — erase-on-blueprint short-circuits to cancelBlueprint
    // before the preview runs. The overlay carries the cost we already spent
    // at placement time, so the cancel path refunds it without going through
    // evaluateBuildPreview (which would otherwise see the underlying GRASS
    // and reject the erase as "no built structure").
    if (tool === "erase" && options.instant !== true) {
      const overlay = getConstructionOverlay(state, ix, iz);
      if (overlay) {
        return this.cancelBlueprint(state, ix, iz, options);
      }
    }

    // Thread services through so ruin-salvage RNG stays seeded (silent-failure C2).
    const preview = this.previewToolAt(state, tool, ix, iz, options.services ?? null);
    if (!preview.ok) return { ...preview, phase: "" };

    // v0.8.4 (Agent A) — Blueprint mode (default in production). The tile
    // does NOT mutate; we charge the cost, write a tileState.construction
    // overlay, and push to state.constructionSites. ConstructionSystem
    // applies completion once a BUILDER's labour fills workTotalSec.
    if (options.instant !== true) {
      return this.#placeBlueprint(state, tool, ix, iz, preview, options);
    }

    // ---- Instant / legacy path (tests, editor tooling) ------------------

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
        phase: "",
      };
    }

    onTileMutated(state, ix, iz, preview.oldType, preview.newType);
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
        owner: options.owner ?? "player",
        reason: options.reason ?? "",
      });
    }
    const owner = options.owner ?? "player";
    const reason = options.reason ?? "";
    this.onAction?.({ kind: "build", tool, ix, iz, oldType: preview.oldType, newType: preview.newType, owner, reason });
    const eventType = tool === "erase" ? EVENT_TYPES.BUILDING_DESTROYED : EVENT_TYPES.BUILDING_PLACED;
    emitEvent(state, eventType, {
      tool, ix, iz,
      oldType: preview.oldType,
      newType: preview.newType,
      owner, reason,
      phase: "complete",
    });
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
      owner,
      ownerReason: reason,
      phase: "complete",
    };
  }

  /**
   * v0.8.4 (Agent A) — write a construction-site blueprint overlay onto
   * tileState and push the index entry. Resources are spent up front so
   * the player commits (and cancel can refund). The tile does NOT mutate;
   * ConstructionSystem completes on the next tick where workAppliedSec
   * crosses workTotalSec.
   */
  #placeBlueprint(state, tool, ix, iz, preview, options) {
    const owner = options.owner ?? "player";
    const reason = options.reason ?? "";
    state.constructionSites ??= [];

    if (getConstructionOverlay(state, ix, iz)) {
      return {
        ok: false,
        reason: "already_under_construction",
        reasonText: "Tile already has a construction in progress.",
        oldType: preview.oldType,
        newType: preview.newType,
        cost: preview.cost,
        refund: preview.refund,
        phase: "",
      };
    }

    const isErase = tool === "erase";
    if (isErase) {
      if (!isBuiltStructure(preview.oldType) && preview.oldType !== TILE.RUINS) {
        return {
          ok: false,
          reason: "not_demolishable",
          reasonText: "Only built structures or ruins can be demolished.",
          oldType: preview.oldType,
          newType: preview.newType,
          cost: preview.cost,
          refund: preview.refund,
          phase: "",
        };
      }
      // Charge BALANCE.demolishToolCost up front (default 1 wood). Salvage
      // refund lands on COMPLETION via ConstructionSystem (overlay.refund).
      const demoCost = BALANCE.demolishToolCost ?? { wood: 1 };
      if (!canAfford(state.resources, demoCost)) {
        return {
          ok: false,
          reason: "insufficientResource",
          reasonText: "Not enough resources to commission a demolish.",
          oldType: preview.oldType,
          newType: preview.newType,
          cost: demoCost,
          refund: preview.refund,
          phase: "",
        };
      }
      spend(state.resources, demoCost);

      const overlay = {
        kind: "demolish",
        tool: "erase",
        targetTile: Number(preview.newType ?? TILE.GRASS) | 0,
        originalTile: Number(preview.oldType ?? TILE.GRASS) | 0,
        workTotalSec: getDemolishWorkSec(preview.oldType),
        workAppliedSec: 0,
        builderId: null,
        startedAt: Number(state?.metrics?.timeSec ?? 0),
        cost: { ...demoCost },
        refund: { ...(preview.refund ?? {}) },
        owner,
        cancelable: true,
      };
      setConstructionOverlay(state, ix, iz, overlay);
      pushConstructionSite(state, {
        ix,
        iz,
        kind: overlay.kind,
        tool: overlay.tool,
        builderId: null,
        workAppliedSec: 0,
        workTotalSec: overlay.workTotalSec,
      });

      this.onAction?.({ kind: "build", tool, ix, iz, oldType: preview.oldType, newType: preview.newType, owner, reason });
      emitEvent(state, EVENT_TYPES.BUILDING_PLACED, {
        tool,
        ix,
        iz,
        oldType: preview.oldType,
        newType: preview.newType,
        owner,
        reason,
        phase: "blueprint",
      });

      return {
        ...preview,
        ok: true,
        reason: "",
        reasonText: "",
        message: summarizeBuildPreview(preview),
        owner,
        ownerReason: reason,
        cost: demoCost,
        refund: { ...(preview.refund ?? {}) },
        phase: "blueprint",
      };
    }

    // Build blueprint path — spend the full preview cost so the player can't
    // queue infinite blueprints they can't afford to finish.
    if (!canAfford(state.resources, preview.cost)) {
      return {
        ok: false,
        reason: "insufficientResource",
        reasonText: explainBuildReason("insufficientResource"),
        oldType: preview.oldType,
        newType: preview.newType,
        cost: preview.cost,
        refund: preview.refund,
        phase: "",
      };
    }
    spend(state.resources, preview.cost);

    const overlay = {
      kind: "build",
      tool,
      targetTile: Number(preview.newType ?? TILE.GRASS) | 0,
      originalTile: Number(preview.oldType ?? TILE.GRASS) | 0,
      workTotalSec: getBuildWorkSec(tool),
      workAppliedSec: 0,
      builderId: null,
      startedAt: Number(state?.metrics?.timeSec ?? 0),
      cost: { ...(preview.cost ?? {}) },
      refund: { ...(preview.refund ?? {}) },
      owner,
      cancelable: true,
    };
    setConstructionOverlay(state, ix, iz, overlay);
    pushConstructionSite(state, {
      ix,
      iz,
      kind: overlay.kind,
      tool: overlay.tool,
      builderId: null,
      workAppliedSec: 0,
      workTotalSec: overlay.workTotalSec,
    });

    this.onAction?.({ kind: "build", tool, ix, iz, oldType: preview.oldType, newType: preview.newType, owner, reason });
    emitEvent(state, EVENT_TYPES.BUILDING_PLACED, {
      tool,
      ix,
      iz,
      oldType: preview.oldType,
      newType: preview.newType,
      owner,
      reason,
      phase: "blueprint",
    });

    return {
      ...preview,
      ok: true,
      reason: "",
      reasonText: "",
      message: summarizeBuildPreview(preview),
      owner,
      ownerReason: reason,
      phase: "blueprint",
    };
  }

  /**
   * v0.8.4 (Agent A) — cancel a pending construction blueprint, refunding
   * the cost recorded on the overlay and clearing both the overlay and
   * the index entry. Emits BUILDING_DESTROYED with phase="blueprint-cancel".
   */
  cancelBlueprint(state, ix, iz, options = {}) {
    const overlay = getConstructionOverlay(state, ix, iz);
    if (!overlay) {
      return {
        ok: false,
        reason: "no_blueprint",
        reasonText: "No construction blueprint at that tile.",
        phase: "",
      };
    }
    if (overlay.cancelable === false) {
      return {
        ok: false,
        reason: "blueprint_locked",
        reasonText: "This blueprint cannot be canceled.",
        phase: "",
      };
    }
    const cost = overlay.cost ?? {};
    const owner = options.owner ?? "player";
    refund(state.resources, cost);
    clearConstructionOverlay(state, ix, iz);
    spliceConstructionSite(state, ix, iz);

    // v0.8.6 Tier 1 F1: cleanup cascade — cancelling a blueprint MUST also
    // release the JobReservation and invalidate any agent path/target that
    // pointed at the now-removed site. Without this BUILDERs walked toward
    // the ghost tile until the 30s `cleanupStale` window finally released
    // them. Mirrors the cleanup in TileMutationHooks step 3 but kicks in at
    // cancel-time instead of waiting for a tile mutation.
    if (state._jobReservation && typeof state._jobReservation.releaseTile === "function") {
      state._jobReservation.releaseTile(ix, iz);
    }
    const agents = Array.isArray(state.agents) ? state.agents : [];
    for (const agent of agents) {
      if (!agent || agent.alive === false) continue;
      if (agent.targetTile?.ix === ix && agent.targetTile?.iz === iz) {
        agent.targetTile = null;
        agent.path = null;
        agent.pathIndex = 0;
        agent.pathGridVersion = -1;
        if (agent.desiredVel) {
          agent.desiredVel.x = 0;
          agent.desiredVel.z = 0;
        } else {
          agent.desiredVel = { x: 0, z: 0 };
        }
      }
      // Also clear builder-site reservation if this site was their assigned
      // builder slot.
      if (agent.blackboard?.builderSite?.ix === ix && agent.blackboard?.builderSite?.iz === iz) {
        agent.blackboard.builderSite = null;
      }
    }

    emitEvent(state, EVENT_TYPES.BUILDING_DESTROYED, {
      tool: overlay.kind === "demolish" ? "erase" : (overlay.tool ?? ""),
      ix,
      iz,
      oldType: overlay.originalTile ?? TILE.GRASS,
      newType: overlay.originalTile ?? TILE.GRASS,
      owner,
      reason: options.reason ?? "blueprint-cancel",
      phase: "blueprint-cancel",
    });

    return {
      ok: true,
      reason: "",
      reasonText: "",
      ix,
      iz,
      oldType: overlay.originalTile ?? TILE.GRASS,
      newType: overlay.originalTile ?? TILE.GRASS,
      cost,
      refund: cost,
      owner,
      phase: "blueprint-cancel",
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

    onTileMutated(state, entry.ix, entry.iz, entry.newType, entry.oldType);
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

    onTileMutated(state, entry.ix, entry.iz, entry.oldType, entry.newType);
    state.controls.undoStack.push(entry);
    this.#syncHistoryFlags(state);
    this.onAction?.({ kind: "redo", tool: entry.tool, ix: entry.ix, iz: entry.iz, oldType: entry.oldType, newType: entry.newType });
    return { ok: true, ...entry };
  }
}
