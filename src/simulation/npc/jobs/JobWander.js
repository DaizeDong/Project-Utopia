// v0.9.0-a — JobWander: the terminal floor.
//
// Always eligible (canTake returns true), score = 0.05 — every other Job
// is expected to beat it. In phase 0.9.0-a it is the *only* Job registered
// in JobRegistry; later phases (b/c) will append harvest/deliver/eat/...
//
// Decision recorded: handleWander in WorkerAISystem.js is too coupled to the
// legacy dispatch (autoBuild attempt, emergencyRation gate, fog-frontier
// retarget cadence, blackboard.nextWanderRefreshSec, isPathStuck checks)
// to extract cleanly without touching the existing handlers. Per the brief,
// the simpler thing is to reproduce the minimum "follow path / pick a wander
// destination" loop here. Both paths (legacy handleWander vs JobWander.tick)
// run the same `pickWanderNearby` (which is now exported from WorkerAISystem)
// so wander-destination distribution stays identical when the flag is flipped.
//
// Behaviour: while FEATURE_FLAGS.USE_JOB_LAYER is OFF (phase-a default),
// this code path is dormant. Phase 0.9.0-d flips the flag and retires the
// legacy handler.

import { randomPassableTile, worldToTile } from "../../../world/grid/Grid.js";
import {
  canAttemptPath,
  clearPath,
  followPath,
  hasActivePath,
  hasPendingPathRequest,
  isPathStuck,
  setTargetAndPath,
} from "../../navigation/Navigation.js";
import { pickWanderNearby } from "../WorkerAISystem.js";
import { Job } from "./Job.js";

const WANDER_REFRESH_BASE_SEC = 0.9;
const WANDER_REFRESH_JITTER_SEC = 0.7;

function isAtTargetTile(worker, state) {
  if (!worker.targetTile || !state?.grid) return false;
  const here = worldToTile(worker.x, worker.z, state.grid);
  return here.ix === worker.targetTile.ix && here.iz === worker.targetTile.iz;
}

function setIdleDesired(worker) {
  worker.desiredVel = { x: 0, z: 0 };
}

export class JobWander extends Job {
  static id = "wander";
  static priority = 0;

  // eslint-disable-next-line no-unused-vars
  canTake(worker, state, services) {
    return true; // terminal floor — always eligible
  }

  findTarget(worker, state, services) {
    // pickWanderNearby returns {ix, iz} | null. null means "no nearby
    // candidate within retry budget" → fall back to randomPassableTile
    // for full-map random.
    const tile = pickWanderNearby(worker, state, services);
    if (tile) return tile;
    if (!state?.grid || !services?.rng) return null;
    return randomPassableTile(state.grid, () => services.rng.next());
  }

  // eslint-disable-next-line no-unused-vars
  score(worker, state, services, target) {
    return 0.05; // every other Job beats wander
  }

  tick(worker, state, services, dt) {
    worker.blackboard ??= {};
    worker.blackboard.intent = "wander";
    worker.stateLabel = "Wander";

    const blackboard = worker.blackboard;
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const nextWanderRefreshSec = Number(blackboard.nextWanderRefreshSec ?? -Infinity);
    const stalePath = Boolean(worker.path) && worker.pathGridVersion !== state.grid.version;
    const pathStuck = isPathStuck(worker, state, 2.3);

    if (!hasActivePath(worker, state) || pathStuck) {
      const driftedFromTarget = worker.targetTile ? !isAtTargetTile(worker, state) : true;
      const shouldRetarget = stalePath
        || driftedFromTarget
        || nowSec >= nextWanderRefreshSec
        || pathStuck;
      if (shouldRetarget && !hasPendingPathRequest(worker, services) && canAttemptPath(worker, state)) {
        clearPath(worker);
        const target = this.findTarget(worker, state, services);
        if (target && setTargetAndPath(worker, target, state, services)) {
          blackboard.nextWanderRefreshSec = nowSec
            + WANDER_REFRESH_BASE_SEC
            + services.rng.next() * WANDER_REFRESH_JITTER_SEC;
        }
      }
    }

    if (hasActivePath(worker, state)) {
      worker.desiredVel = followPath(worker, state, dt).desired;
    } else {
      setIdleDesired(worker);
    }
  }

  // eslint-disable-next-line no-unused-vars
  isComplete(worker, state, services) {
    return false; // wander is open-ended; scheduler re-picks each tick
  }

  // eslint-disable-next-line no-unused-vars
  onAbandon(worker, state, services) {
    // No persistent reservation/state to clean up.
  }
}
