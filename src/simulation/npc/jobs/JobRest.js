// v0.9.0-c — JobRest: rest-in-place recovery. canTake gates on
// `worker.rest < workerRestSeekThreshold`. score collapses above threshold
// (so a rested worker never picks Rest). isComplete fires at
// `workerRestRecoverThreshold`. v0.9.0-e — body inlined; legacy handleRest
// deleted from WorkerAISystem.js.

import { clamp } from "../../../app/math.js";
import { BALANCE } from "../../../config/balance.js";
import { setIdleDesired } from "./JobHelpers.js";
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

  tick(worker, state, _services, dt) {
    worker.blackboard ??= {};
    worker.blackboard.intent = "rest";
    worker.stateLabel = "Rest";
    // v0.9.0-e — inlined from former handleRest. Workers rest in place;
    // recover rest+morale and update progress for duration tracking.
    setIdleDesired(worker);
    const restRecovery = Number(BALANCE.workerRestRecoveryPerSecond ?? 0.08);
    const moraleRecovery = Number(BALANCE.workerMoraleRecoveryPerSecond ?? 0.02);
    worker.rest = clamp(Number(worker.rest ?? 1) + restRecovery * dt, 0, 1);
    worker.morale = clamp(Number(worker.morale ?? 1) + moraleRecovery * dt, 0, 1);
    worker.progress = clamp(Number(worker.rest ?? 0), 0, 1);
    worker.workRemaining = Math.max(
      0,
      Number(BALANCE.workerRestRecoverThreshold ?? 0.6) - Number(worker.rest ?? 0),
    );
  }

  isComplete(worker, _state, _services) {
    return Number(worker?.rest ?? 0) >= Number(BALANCE.workerRestRecoverThreshold ?? 0.5);
  }

  onAbandon(_worker, _state, _services) { /* no reservation */ }
}
