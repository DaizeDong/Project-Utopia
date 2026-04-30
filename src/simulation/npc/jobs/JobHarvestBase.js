// v0.9.0-b — Shared base for the four harvest Jobs (Farm/Lumber/Quarry/Herb).
// Sibling classes override the static config fields below; the canTake/
// findTarget/score/tick/isComplete/onAbandon flow is identical.
//
// Per the brief, scoring constants live inline (no new BALANCE.* knobs).

import { clamp } from "../../../app/math.js";
import { BALANCE } from "../../../config/balance.js";
import { ROLE, TILE } from "../../../config/constants.js";
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

// v0.9.3-balance — when the utility-best tile is reserved by another worker
// under 1:1 binding, walk the full candidate list (cheap; ≤ a few dozen
// per scenario) and pick the highest-score tile that's not reserved by a
// different worker, not blacklisted, and not yield-pool-empty.
function pickUnreservedFallback(worker, state, targetTileTypes, services) {
  const grid = state?.grid;
  if (!grid) return null;
  const reservation = state._jobReservation;
  const blacklist = services?.pathFailBlacklist;
  const nowSec = Number(state?.metrics?.timeSec ?? 0);
  const tiles = listTilesByType(grid, targetTileTypes);
  const here = worldToTile(Number(worker?.x ?? 0), Number(worker?.z ?? 0), grid);
  let best = null;
  let bestScore = -Infinity;
  for (const t of tiles) {
    if (reservation?.getOccupant) {
      const occ = reservation.getOccupant(t.ix, t.iz);
      if (occ && occ !== worker.id) continue;
    }
    if (blacklist?.isBlacklisted) {
      const tt = grid.tiles[t.ix + t.iz * grid.width];
      if (blacklist.isBlacklisted(worker.id, t.ix, t.iz, tt, nowSec)) continue;
    }
    if (grid.tileState && targetTileTypes[0] !== TILE.FARM) {
      const ts = grid.tileState.get(t.ix + t.iz * grid.width);
      if (Number(ts?.yieldPool ?? 0) <= 0) continue;
    }
    const dist = manhattan(t, here);
    // Inverse-distance score so the closest unreserved tile wins.
    const score = -dist;
    if (score > bestScore) {
      bestScore = score;
      best = { ix: t.ix, iz: t.iz };
    }
  }
  return best;
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
    // v0.9.3-balance — eligibility is now narrower:
    //   1) at least one tile of this type must have yieldPool > 0 (an
    //      exhausted forest is functionally an idle building and should
    //      drop out of the eligible Job list so JobWander wins, exposing
    //      the depletion to the player rather than wasting worker time).
    //   2) at least one tile must NOT be reserved by another worker (1:1
    //      binding — if every tile of this type is already bound, this
    //      Job is full and the next worker should pick something else).
    //   3) at least one tile must not be path-fail blacklisted for this
    //      worker (legacy v0.9.0-d guard).
    //
    // Test compatibility: when state.grid is missing (minimal-state unit
    // tests), trust the building count and skip the per-tile gate. The
    // grid-aware gates only fire in real simulation states.
    if (!state?.grid) return true;
    const tiles = listTilesByType(state.grid, ctor.targetTileTypes);
    if (tiles.length <= 0) return false;
    const blacklist = services?.pathFailBlacklist;
    const reservation = state?._jobReservation;
    const nowSec = Number(state?.metrics?.timeSec ?? 0);
    let anyEligible = false;
    for (const t of tiles) {
      const tt = state.grid.tiles[t.ix + t.iz * state.grid.width];
      if (blacklist?.isBlacklisted
          && blacklist.isBlacklisted(worker.id, t.ix, t.iz, tt, nowSec)) continue;
      // 1:1 binding: skip tiles reserved by a *different* worker. Tiles
      // reserved by this same worker remain eligible (sticky targeting).
      if (reservation?.getOccupant) {
        const occ = reservation.getOccupant(t.ix, t.iz);
        if (occ && occ !== worker.id) continue;
      }
      // Yield-pool gate (FOREST/HERB regen; STONE finite). FARM is gated
      // separately because it has its own fertility/fallow rules — keep
      // FARM eligible whenever the building exists so the existing
      // fallow-recovery / fertility logic stays in charge there.
      if (ctor.targetTileTypes[0] !== undefined && state.grid.tileState) {
        const ts = state.grid.tileState.get(t.ix + t.iz * state.grid.width);
        const tileType = ctor.targetTileTypes[0];
        // FARM tiles use TileStateSystem._updateSoil to refill yieldPool;
        // a fallow farm is briefly empty but auto-recovers, so we treat
        // any FARM as eligible regardless of pool depth. Other production
        // tiles must have a positive yieldPool to be productive.
        if (tileType !== TILE.FARM) {
          const pool = Number(ts?.yieldPool ?? 0);
          if (pool <= 0) continue;
        }
      }
      anyEligible = true;
      break;
    }
    return anyEligible;
  }

  findTarget(worker, state, services) {
    const ctor = this.constructor;
    const blacklist = services?.pathFailBlacklist;
    const reservation = state?._jobReservation;
    const nowSec = Number(state?.metrics?.timeSec ?? 0);
    // v0.9.0-d — sticky targeting within the Job. If the worker already has
    // a valid harvest target (matching tile-type, not blacklisted, and not
    // reserved-by-someone-else thanks to v0.9.3), reuse it.
    const existing = worker.currentJob?.target ?? worker.targetTile ?? null;
    if (existing && state?.grid) {
      const tileAt = state.grid.tiles[existing.ix + existing.iz * state.grid.width];
      if (ctor.targetTileTypes.includes(tileAt)) {
        const blacklisted = blacklist?.isBlacklisted
          ? blacklist.isBlacklisted(worker.id, existing.ix, existing.iz, tileAt, nowSec)
          : false;
        const reservedByOther = reservation?.getOccupant
          && reservation.getOccupant(existing.ix, existing.iz)
          && reservation.getOccupant(existing.ix, existing.iz) !== worker.id;
        if (!blacklisted && !reservedByOther) {
          return { ix: existing.ix, iz: existing.iz };
        }
      }
    }
    const target = chooseWorkerTarget(
      worker, state, ctor.targetTileTypes,
      state._workerTargetOccupancy, services,
    );
    // v0.9.0-d (audit F12 structural fix) — chooseWorkerTarget may return a
    // blacklisted tile as its "best fallback" when every candidate is
    // blacklisted. Treat that as no target so the scheduler picks
    // JobWander rather than retrying a known-unreachable tile each tick.
    if (target && blacklist?.isBlacklisted) {
      const tt = state.grid.tiles[target.ix + target.iz * state.grid.width];
      if (blacklist.isBlacklisted(worker.id, target.ix, target.iz, tt, nowSec)) {
        return null;
      }
    }
    // v0.9.3-balance — if chooseWorkerTarget's best pick is reserved by
    // another worker, walk the candidate list and pick the highest-score
    // non-reserved tile of the same type. The score-time -2.0 reservation
    // penalty means an unreserved tile beats any reserved one even if
    // distance is unfavourable, so a single linear scan is enough.
    if (target && reservation?.getOccupant) {
      const occ = reservation.getOccupant(target.ix, target.iz);
      if (occ && occ !== worker.id) {
        const fallback = pickUnreservedFallback(
          worker, state, ctor.targetTileTypes, services,
        );
        return fallback;
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
    // v0.9.3-balance — atomic 1:1 claim on arrival. If another worker
    // sneaked in (raced this tile and arrived first), abandon this Job;
    // the scheduler will re-pick next tick (most likely JobWander, then
    // a different harvest tile when one frees up).
    const reservation = state._jobReservation;
    const nowSec = Number(state?.metrics?.timeSec ?? 0);
    if (reservation?.tryReserve) {
      const ok = reservation.tryReserve(worker.id, target.ix, target.iz, ctor.intentLabel, nowSec);
      if (!ok) {
        // Lost the race — drop this target and let JobScheduler re-pick.
        worker.currentJob = null;
        worker.targetTile = null;
        worker.stateLabel = ctor.seekLabel;
        return;
      }
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
