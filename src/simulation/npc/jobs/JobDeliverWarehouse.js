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
import { handleDeliver } from "../WorkerAISystem.js";
import {
  arrivedAtTarget,
  chooseWorkerTarget,
  executeMovement,
  releaseReservation,
  tryAcquirePath,
} from "./JobHelpers.js";
import { Job } from "./Job.js";

function carryTotal(worker) {
  const c = worker?.carry ?? {};
  return Number(c.food ?? 0) + Number(c.wood ?? 0) + Number(c.stone ?? 0) + Number(c.herbs ?? 0);
}

export class JobDeliverWarehouse extends Job {
  static id = "deliver_warehouse";
  static priority = 20;

  canTake(worker, state, _services) {
    if (Number(state?.buildings?.warehouses ?? 0) <= 0) return false;
    return carryTotal(worker) > 0;
  }

  findTarget(worker, state, services) {
    return chooseWorkerTarget(
      worker, state, [TILE.WAREHOUSE], state._workerTargetOccupancy, services,
    );
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
