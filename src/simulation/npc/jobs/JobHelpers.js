// v0.9.0-b — Shared movement + tile primitives for the Job-layer.
//
// Per the v0.9.0-b brief: import + re-export the existing helpers from
// WorkerAISystem.js (now exported from there) rather than physically move
// them. Phase d will move once the legacy handlers retire.
//
// Re-exports: chooseWorkerTarget, isAtTargetTile, setIdleDesired,
// applyHarvestStep, pickWanderNearby.
// Locally defined: executeMovement, arrivedAtTarget, tryAcquirePath,
// releaseReservation, markBlacklist.

import {
  canAttemptPath,
  followPath,
  hasActivePath,
  hasPendingPathRequest,
  setTargetAndPath,
} from "../../navigation/Navigation.js";
import { getTile } from "../../../world/grid/Grid.js";
import {
  isAtTargetTile as _isAtTargetTile,
  setIdleDesired as _setIdleDesired,
} from "../WorkerAISystem.js";

export {
  applyHarvestStep,
  chooseWorkerTarget,
  isAtTargetTile,
  pickWanderNearby,
  setIdleDesired,
} from "../WorkerAISystem.js";

/** Composite: drive the worker along its active path or idle if none. */
export function executeMovement(worker, state, dt) {
  if (hasActivePath(worker, state)) {
    const step = followPath(worker, state, dt);
    worker.desiredVel = step.desired;
    if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
  } else {
    _setIdleDesired(worker);
  }
}

/**
 * At-target predicate with optional tile-type sanity check (defends against
 * mid-harvest tile mutation: wildfire, demolish).
 */
export function arrivedAtTarget(worker, state, target = null, tileTypes = null) {
  if (target && (worker.targetTile?.ix !== target.ix || worker.targetTile?.iz !== target.iz)) {
    return false;
  }
  if (!_isAtTargetTile(worker, state)) return false;
  if (Array.isArray(tileTypes) && tileTypes.length > 0) {
    const tile = getTile(state.grid, worker.targetTile.ix, worker.targetTile.iz);
    if (!tileTypes.includes(tile)) return false;
  }
  return true;
}

/**
 * Attempt to acquire a path to `target`. setTargetAndPath already integrates
 * with services.pathFailBlacklist on failure (v0.8.13). Returns true iff a
 * path was acquired.
 */
export function tryAcquirePath(worker, target, state, services) {
  if (!target) return false;
  if (hasPendingPathRequest(worker, services)) return false;
  if (!canAttemptPath(worker, state)) return false;
  return setTargetAndPath(worker, target, state, services);
}

/** Release every JobReservation entry held by this worker. */
export function releaseReservation(worker, state) {
  if (!state?._jobReservation || !worker?.id) return;
  state._jobReservation.releaseAll(worker.id);
}

/** Convenience wrapper around services.pathFailBlacklist.mark. */
export function markBlacklist(worker, target, state, services) {
  if (!services?.pathFailBlacklist?.mark || !worker?.id || !target) return;
  const tileType = state?.grid ? getTile(state.grid, target.ix, target.iz) : 0;
  const nowSec = Number(state?.metrics?.timeSec ?? 0);
  services.pathFailBlacklist.mark(worker.id, target.ix, target.iz, tileType, nowSec);
}
