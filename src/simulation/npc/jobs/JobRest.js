// v0.9.0-c — JobRest: rest-in-place recovery. canTake gates on
// `worker.rest < workerRestSeekThreshold`. score collapses above threshold
// (so a rested worker never picks Rest). isComplete fires at
// `workerRestRecoverThreshold`. tick delegates to handleRest.

import { clamp } from "../../../app/math.js";
import { BALANCE } from "../../../config/balance.js";
import { handleRest } from "../WorkerAISystem.js";
import { Job } from "./Job.js";

export class JobRest extends Job {
  static id = "rest";
  static priority = 70;

  canTake(worker, _state, _services) {
    const seek = Number(BALANCE.workerRestSeekThreshold ?? 0.2);
    return Number(worker?.rest ?? 1) < seek;
  }

  findTarget(worker, state, _services) {
    if (!state?.grid) return null;
    return { ix: Number(worker?.x ?? 0) | 0, iz: Number(worker?.z ?? 0) | 0 };
  }

  score(worker, _state, _services, target) {
    if (!target) return 0;
    const seek = Number(BALANCE.workerRestSeekThreshold ?? 0.2);
    const rest = Number(worker?.rest ?? 1);
    if (rest >= seek) return 0;
    return clamp(1.05 - rest, 0, 0.95);
  }

  tick(worker, state, services, dt) {
    worker.blackboard ??= {};
    worker.blackboard.intent = "rest";
    worker.stateLabel = "Rest";
    handleRest(worker, state, services, dt);
  }

  isComplete(worker, _state, _services) {
    return Number(worker?.rest ?? 0) >= Number(BALANCE.workerRestRecoverThreshold ?? 0.5);
  }

  onAbandon(_worker, _state, _services) { /* no reservation */ }
}
