// v0.9.0-b — Shared base for the four harvest Jobs (Farm/Lumber/Quarry/Herb).
// Sibling classes override the static config fields below; the canTake/
// findTarget/score/tick/isComplete/onAbandon flow is identical.
//
// Per the brief, scoring constants live inline (no new BALANCE.* knobs).

import { clamp } from "../../../app/math.js";
import { BALANCE } from "../../../config/balance.js";
import { ROLE } from "../../../config/constants.js";
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
    return carryTotal(worker) < carryCap;
  }

  findTarget(worker, state, services) {
    return chooseWorkerTarget(
      worker, state, this.constructor.targetTileTypes,
      state._workerTargetOccupancy, services,
    );
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
    const here = { ix: Number(worker?.x ?? 0), iz: Number(worker?.z ?? 0) };
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
