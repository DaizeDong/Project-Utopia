// v0.9.0-c — Shared base for the three process Jobs (Kitchen/Smithy/Clinic),
// mirroring the JobHarvestBase pattern from phase b. Subclasses override
// the static config fields; canTake/findTarget/score/tick/isComplete flow
// is identical.
//
// Worker behaviour: walk to the building tile and stay idle. ProcessingSystem
// (next system in tick) detects the role-fit worker within 1 manhattan and
// runs the consume+produce cycle. JobProcess does NOT mutate resources
// itself — yield equivalence with handleProcess is guaranteed because
// production happens entirely inside ProcessingSystem.

import { clamp } from "../../../app/math.js";
import { ROLE } from "../../../config/constants.js";
import { handleProcess } from "../WorkerAISystem.js";
import {
  arrivedAtTarget,
  chooseWorkerTarget,
  executeMovement,
  releaseReservation,
  tryAcquirePath,
} from "./JobHelpers.js";
import { Job } from "./Job.js";

function manhattan(a, b) {
  return Math.abs(Number(a?.ix ?? 0) - Number(b?.ix ?? 0))
    + Math.abs(Number(a?.iz ?? 0) - Number(b?.iz ?? 0));
}

export class JobProcessBase extends Job {
  static id = "process_base";
  static priority = 15;
  static targetTileTypes = [];
  static intentLabel = "process";
  static stateLabel = "Process";
  static seekLabel = "Seek Process";
  static buildingCountKey = "kitchens";
  static role = ROLE.COOK;
  // Inputs the building consumes per cycle. Each entry: { resource, min }.
  // canTake collapses when any input is below its min so the worker
  // doesn't stand idle at a starved building (ProcessingSystem also
  // stalls; this just prevents scheduler thrash).
  static inputs = [];
  // Output stockpile pulled by score: empty → score 1.0, full → score 0.2.
  static output = "meals";
  static outputSoftTarget = 8;

  canTake(worker, state, _services) {
    const ctor = this.constructor;
    if (Number(state?.buildings?.[ctor.buildingCountKey] ?? 0) <= 0) return false;
    if (String(worker?.role ?? "").toUpperCase() !== ctor.role) return false;
    for (const inp of ctor.inputs) {
      if (Number(state?.resources?.[inp.resource] ?? 0) < Number(inp.min ?? 0)) return false;
    }
    return true;
  }

  findTarget(worker, state, services) {
    return chooseWorkerTarget(
      worker, state, this.constructor.targetTileTypes,
      state._workerTargetOccupancy, services,
    );
  }

  score(worker, state, _services, target) {
    if (!target) return 0;
    const ctor = this.constructor;
    if (String(worker?.role ?? "").toUpperCase() !== ctor.role) return 0;
    const stockpile = Number(state?.resources?.[ctor.output] ?? 0);
    const soft = Math.max(1, Number(ctor.outputSoftTarget ?? 8));
    const pressure = clamp(1 - stockpile / soft, 0.2, 1.0);
    const here = { ix: Number(worker?.x ?? 0), iz: Number(worker?.z ?? 0) };
    const distFactor = 1 / (1 + manhattan(target, here) * 0.05);
    return clamp(pressure * distFactor * 0.9, 0, 0.9);
  }

  tick(worker, state, services, dt) {
    const ctor = this.constructor;
    worker.blackboard ??= {};
    const target = worker.currentJob?.target ?? worker.targetTile ?? null;
    if (!target) { executeMovement(worker, state, dt); return; }
    if (!worker.targetTile
        || worker.targetTile.ix !== target.ix
        || worker.targetTile.iz !== target.iz) {
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
    // TODO v0.9.0-d: dedupe with handleProcess after legacy retired.
    handleProcess(worker, state, services, dt);
  }

  isComplete(_worker, _state, _services) { return false; }

  onAbandon(worker, state, _services) {
    releaseReservation(worker, state);
  }
}
