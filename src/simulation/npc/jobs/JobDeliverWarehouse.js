// v0.9.0-c — JobDeliverWarehouse: deposit carry into the nearest reachable
// WAREHOUSE. canTake gates on `worker.carry` non-empty AND
// `state.buildings.warehouses > 0`. Score is dominated by carry-fullness so
// the scheduler preempts a harvest Job once carry hits the deliver cap.
// tick walks to warehouse and delegates to legacy handleDeliver so the
// warehouse-queue / road isolation / mood / spoilage-reset semantics stay
// in one place.

import { clamp } from "../../../app/math.js";
import { BALANCE } from "../../../config/balance.js";
import { ROLE, TILE } from "../../../config/constants.js";
import { listTilesByType } from "../../../world/grid/Grid.js";
import { handleDeliver } from "../WorkerAISystem.js";
import {
  arrivedAtTarget,
  chooseWorkerTarget,
  executeMovement,
  markBlacklist,
  releaseReservation,
  tryAcquirePath,
} from "./JobHelpers.js";
import { Job } from "./Job.js";

function carryTotal(worker) {
  const c = worker?.carry ?? {};
  return Number(c.food ?? 0) + Number(c.wood ?? 0) + Number(c.stone ?? 0) + Number(c.herbs ?? 0);
}

// v0.9.0-d (audit F12 structural fix) — true iff every WAREHOUSE tile in the
// grid is currently blacklisted for this worker. When that is the case the
// Job declares itself ineligible (canTake → false) so the scheduler picks
// the next-best Job (JobWander, or JobEat's emergency carry-eat path) rather
// than pinning the worker on an unreachable target. Mirrors the architectural
// promise A1 made: target-finding fused with eligibility.
function allWarehousesBlacklisted(worker, state, services) {
  const blacklist = services?.pathFailBlacklist;
  if (!blacklist?.isBlacklisted || !state?.grid) return false;
  const tiles = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  if (tiles.length === 0) return false;
  const nowSec = Number(state?.metrics?.timeSec ?? 0);
  for (const t of tiles) {
    if (!blacklist.isBlacklisted(worker.id, t.ix, t.iz, TILE.WAREHOUSE, nowSec)) return false;
  }
  return true;
}

export class JobDeliverWarehouse extends Job {
  static id = "deliver_warehouse";
  static priority = 20;

  canTake(worker, state, services) {
    if (Number(state?.buildings?.warehouses ?? 0) <= 0) return false;
    if (carryTotal(worker) <= 0) return false;
    // v0.9.0-d (audit F12 structural fix) — if every warehouse tile is on
    // this worker's path-fail blacklist, declare the Job ineligible. The
    // scheduler then picks JobWander, retiring the legacy F12 limbo where
    // the worker idled with neither a deliver path nor a wander path.
    if (allWarehousesBlacklisted(worker, state, services)) return false;
    return true;
  }

  findTarget(worker, state, services) {
    const target = chooseWorkerTarget(
      worker, state, [TILE.WAREHOUSE], state._workerTargetOccupancy, services,
    );
    if (!target) return null;
    // v0.9.0-d (audit F12) — if the only candidate is on the path-fail
    // blacklist, treat as no reachable target so JobScheduler falls
    // through to JobWander rather than pinning the worker indefinitely
    // in deliver. Mirrors the legacy deliverStuckReplan branch retired
    // in WorkerAISystem.update.
    const blacklist = services?.pathFailBlacklist;
    if (blacklist?.isBlacklisted) {
      const nowSec = Number(state?.metrics?.timeSec ?? 0);
      if (blacklist.isBlacklisted(worker.id, target.ix, target.iz, TILE.WAREHOUSE, nowSec)) {
        return null;
      }
    }
    return target;
  }

  score(worker, _state, _services, target) {
    if (!target) return 0;
    const total = carryTotal(worker);
    const dthr = Number(BALANCE.workerDeliverThreshold ?? 1.6);
    const fullFactor = Math.min(1, total / (dthr * 2));
    const role = String(worker?.role ?? "").toUpperCase();
    const haulBonus = role === ROLE.HAUL ? 0.05 : 0;
    return clamp(0.4 + fullFactor * 0.5 + haulBonus, 0.4, 0.95);
  }

  tick(worker, state, services, dt) {
    worker.blackboard ??= {};
    const target = worker.currentJob?.target ?? worker.targetTile ?? null;
    if (!target) { executeMovement(worker, state, dt); return; }
    if (!worker.targetTile
        || worker.targetTile.ix !== target.ix
        || worker.targetTile.iz !== target.iz) {
      worker.targetTile = { ix: target.ix, iz: target.iz };
    }
    if (!arrivedAtTarget(worker, state, target, [TILE.WAREHOUSE])) {
      worker.blackboard.intent = "deliver";
      worker.stateLabel = "Deliver";
      // v0.9.0-d (audit F12 replacement) — if no successful path has been
      // acquired in the last ~2s of this Job tenure, proactively blacklist
      // the target so JobScheduler picks JobWander next tick. Mirrors the
      // legacy deliverStuckReplan branch retired from WorkerAISystem.update.
      // Without it, scenario E workers idle on the same tile for tens of
      // seconds while the path-fail roundtrip eventually marks the blacklist
      // through the worker pool. Bound the staleness against the Job start
      // time (currentJob.startSec) when no successful path has ever been
      // recorded, so a fresh worker isn't immediately stuck.
      const nowSec = Number(state.metrics?.timeSec ?? 0);
      const startSec = Number(worker.currentJob?.startSec ?? nowSec);
      const lastPathSec = Number(worker.blackboard?.lastSuccessfulPathSec ?? startSec);
      const stuckSec = nowSec - Math.max(lastPathSec, startSec);
      if (stuckSec > 2.0) {
        markBlacklist(worker, target, state, services);
        return;
      }
      tryAcquirePath(worker, target, state, services);
      executeMovement(worker, state, dt);
      return;
    }
    worker.blackboard.intent = "deliver";
    worker.stateLabel = "Deliver";
    // TODO v0.9.0-d: dedupe with handleDeliver after legacy retired.
    handleDeliver(worker, state, services, dt);
  }

  isComplete(worker, _state, _services) {
    return carryTotal(worker) <= 1e-4;
  }

  onAbandon(worker, state, _services) {
    releaseReservation(worker, state);
  }
}
