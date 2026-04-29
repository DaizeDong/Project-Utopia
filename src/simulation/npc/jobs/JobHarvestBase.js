// v0.9.0-b — Shared base for the four harvest Jobs (Farm/Lumber/Quarry/Herb).
// Sibling classes override the static config fields below; the canTake/
// findTarget/score/tick/isComplete/onAbandon flow is identical.
//
// Per the brief, scoring constants live inline (no new BALANCE.* knobs).

import { clamp } from "../../../app/math.js";
import { BALANCE } from "../../../config/balance.js";
import { ROLE } from "../../../config/constants.js";
import { listTilesByType, worldToTile } from "../../../world/grid/Grid.js";
import {
  applyHarvestStep,
  arrivedAtTarget,
  chooseWorkerTarget,
  executeMovement,
  releaseReservation,
  tryAcquirePath,
} from "./JobHelpers.js";
import { Job } from "./Job.js";

// Soft "carry full" trigger. Phase c will replace with a JobDeliverWarehouse
// pressure check; for now isComplete fires here so the scheduler re-picks.
const CARRY_FULL_FACTOR = 2.0;

function carryTotal(worker) {
  const c = worker?.carry ?? {};
  return Number(c.food ?? 0) + Number(c.wood ?? 0) + Number(c.stone ?? 0) + Number(c.herbs ?? 0);
}

function manhattan(a, b) {
  return Math.abs(Number(a?.ix ?? 0) - Number(b?.ix ?? 0))
    + Math.abs(Number(a?.iz ?? 0) - Number(b?.iz ?? 0));
}

export class JobHarvestBase extends Job {
  // Subclasses override these statics:
  static id = "harvest_base";
  static priority = 10;
  static targetTileTypes = [];
  static produces = "food";
  static intentLabel = "harvest";
  static stateLabel = "Harvest";
  static seekLabel = "Seek Task";
  static buildingCountKey = "farms";
  static roleFit = { [ROLE.HAUL]: 0.5, default: 0.1 };
  static pressureResource = "food";
  static pressureSoftTarget = 18;

  canTake(worker, state, services) {
    const ctor = this.constructor;
    if (Number(state?.buildings?.[ctor.buildingCountKey] ?? 0) <= 0) return false;
    const carryCap = Number(BALANCE.workerDeliverThreshold ?? 1.6) * CARRY_FULL_FACTOR;
    if (carryTotal(worker) >= carryCap) return false;
    // v0.9.0-d (audit F12 structural fix, symmetric with JobDeliverWarehouse) —
    // if every target tile of this harvest type is on the worker's path-fail
    // blacklist, declare the Job ineligible. Without this, a stranded WOOD
    // worker can loop on unreachable lumber forever; instead the scheduler
    // falls through to JobWander (or another Job).
    const blacklist = services?.pathFailBlacklist;
    if (blacklist?.isBlacklisted && state?.grid) {
      const tiles = listTilesByType(state.grid, ctor.targetTileTypes);
      if (tiles.length > 0) {
        const nowSec = Number(state?.metrics?.timeSec ?? 0);
        let anyUsable = false;
        for (const t of tiles) {
          const tt = state.grid.tiles[t.ix + t.iz * state.grid.width];
          if (!blacklist.isBlacklisted(worker.id, t.ix, t.iz, tt, nowSec)) {
            anyUsable = true;
            break;
          }
        }
        if (!anyUsable) return false;
      }
    }
    return true;
  }

  findTarget(worker, state, services) {
    const ctor = this.constructor;
    const blacklist = services?.pathFailBlacklist;
    const nowSec = Number(state?.metrics?.timeSec ?? 0);
    // v0.9.0-d — sticky targeting within the Job. If the worker already has
    // a valid harvest target (matching tile-type, not blacklisted), reuse it
    // so we don't re-pick a different tile every tick. This mirrors the
    // legacy maybeRetarget behaviour and keeps a worker committed to the
    // tile they're already standing on / walking toward.
    const existing = worker.currentJob?.target ?? worker.targetTile ?? null;
    if (existing && state?.grid) {
      const tileAt = state.grid.tiles[existing.ix + existing.iz * state.grid.width];
      if (ctor.targetTileTypes.includes(tileAt)) {
        const blacklisted = blacklist?.isBlacklisted
          ? blacklist.isBlacklisted(worker.id, existing.ix, existing.iz, tileAt, nowSec)
          : false;
        if (!blacklisted) return { ix: existing.ix, iz: existing.iz };
      }
    }
    const target = chooseWorkerTarget(
      worker, state, ctor.targetTileTypes,
      state._workerTargetOccupancy, services,
    );
    // v0.9.0-d (audit F12 structural fix) — chooseWorkerTarget may return a
    // blacklisted tile as its "best fallback" when every candidate is
    // blacklisted (the harvest semantic of "keep trying the only farm"). For
    // the Job-layer eligibility model, treat that as no target so the
    // scheduler picks JobWander rather than retrying a known-unreachable
    // tile each tick. Mirrors JobDeliverWarehouse's blacklist guard.
    if (target && blacklist?.isBlacklisted) {
      const tt = state.grid.tiles[target.ix + target.iz * state.grid.width];
      if (blacklist.isBlacklisted(worker.id, target.ix, target.iz, tt, nowSec)) {
        return null;
      }
    }
    return target;
  }

  score(worker, state, services, target) {
    if (!target) return 0;
    const ctor = this.constructor;
    const role = String(worker?.role ?? "").toUpperCase();
    const roleFit = Number(ctor.roleFit?.[role] ?? ctor.roleFit?.default ?? 0.1);
    const stockpile = Number(state?.resources?.[ctor.pressureResource] ?? 0);
    const soft = Math.max(1, Number(ctor.pressureSoftTarget ?? 18));
    // Pressure ∈ [0.1, 1.0]: stocked colony still harvests a bit.
    const pressure = clamp(1 - stockpile / soft, 0.1, 1.0);
    // v0.9.0-d bugfix — distance must be computed in tile coordinates.
    // Pre-fix the score formula used `worker.x/.z` (world space) as if
    // they were tile indices, producing a >50× underestimate of distFactor
    // and dropping a worker-on-farm score from ~0.085 to ~0.0165 (less
    // than the JobWander floor of 0.05 — workers refused to harvest).
    const here = state?.grid
      ? worldToTile(Number(worker?.x ?? 0), Number(worker?.z ?? 0), state.grid)
      : { ix: 0, iz: 0 };
    const distFactor = 1 / (1 + manhattan(target, here) * 0.05);
    return clamp(roleFit * pressure * distFactor * 0.85, 0, 1);
  }

  tick(worker, state, services, dt) {
    const ctor = this.constructor;
    worker.blackboard ??= {};
    const target = worker.currentJob?.target ?? worker.targetTile ?? null;
    if (!target) {
      executeMovement(worker, state, dt);
      return;
    }
    if (
      !worker.targetTile
      || worker.targetTile.ix !== target.ix
      || worker.targetTile.iz !== target.iz
    ) {
      worker.targetTile = { ix: target.ix, iz: target.iz };
    }
    if (!arrivedAtTarget(worker, state, target, ctor.targetTileTypes)) {
      worker.blackboard.intent = ctor.intentLabel;
      worker.stateLabel = ctor.seekLabel;
      tryAcquirePath(worker, target, state, services);
      executeMovement(worker, state, dt);
      return;
    }
    worker.blackboard.intent = ctor.intentLabel;
    worker.stateLabel = ctor.stateLabel;
    applyHarvestStep(worker, state, services, dt, ctor.targetTileTypes[0], ctor.produces);
  }

  isComplete(worker, state, services) {
    const carryCap = Number(BALANCE.workerDeliverThreshold ?? 1.6) * CARRY_FULL_FACTOR;
    return carryTotal(worker) >= carryCap;
  }

  onAbandon(worker, state, services) {
    releaseReservation(worker, state);
  }
}
