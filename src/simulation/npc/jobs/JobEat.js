// v0.9.0-c — JobEat: hunger-driven Job. canTake gates on hunger below the
// seek threshold AND food available somewhere. score = 0.95 at hunger=0.10,
// collapses to 0 above the seek threshold. Tick body: walk to warehouse,
// delegate to handleEat. When unreachable / no warehouse, falls through
// to consumeEmergencyRation.

import { clamp } from "../../../app/math.js";
import { BALANCE } from "../../../config/balance.js";
import { TILE } from "../../../config/constants.js";
import { listTilesByType } from "../../../world/grid/Grid.js";
import {
  _consumeEmergencyRationForJobLayer,
  handleEat,
} from "../WorkerAISystem.js";
import {
  arrivedAtTarget,
  chooseWorkerTarget,
  executeMovement,
  releaseReservation,
  tryAcquirePath,
} from "./JobHelpers.js";
import { Job } from "./Job.js";

function hasFood(worker, state) {
  const wh = Number(state?.resources?.food ?? 0) + Number(state?.resources?.meals ?? 0);
  const carry = Number(worker?.carry?.food ?? 0);
  return wh > 0 || carry > 0;
}

// v0.9.0-d (audit F12 structural fix, symmetric with JobDeliverWarehouse) —
// true iff every WAREHOUSE tile is currently blacklisted for this worker.
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

export class JobEat extends Job {
  static id = "eat";
  static priority = 80;

  canTake(worker, state, services) {
    const seek = Number(BALANCE.workerHungerSeekThreshold ?? 0.18);
    if (Number(worker?.hunger ?? 1) >= seek) return false;
    if (!hasFood(worker, state)) return false;
    // v0.9.0-d (audit F12 structural fix) — if every warehouse is
    // blacklisted, the Job has no actionable warehouse target. The
    // emergency-ration carry-eat path still recovers hunger, but it lives
    // on JobWander.tick equivalently and lets the worker move in parallel
    // (which may un-stick reachability when walls are partially blocking).
    // Declare ineligible so the scheduler picks JobWander rather than
    // pinning the worker on a known-unreachable warehouse.
    if (Number(state?.buildings?.warehouses ?? 0) > 0
        && allWarehousesBlacklisted(worker, state, services)) {
      return false;
    }
    return true;
  }

  findTarget(worker, state, services) {
    if (Number(state?.buildings?.warehouses ?? 0) > 0) {
      const w = chooseWorkerTarget(
        worker, state, [TILE.WAREHOUSE], state._workerTargetOccupancy, services,
      );
      if (w) return w;
    }
    if (state?.grid && Number(worker?.carry?.food ?? 0) > 0) {
      return { ix: Number(worker.x ?? 0) | 0, iz: Number(worker.z ?? 0) | 0, meta: { carryEat: true } };
    }
    return null;
  }

  score(worker, _state, _services, target) {
    if (!target) return 0;
    const seek = Number(BALANCE.workerHungerSeekThreshold ?? 0.18);
    const hunger = Number(worker?.hunger ?? 1);
    if (hunger >= seek) return 0;
    return clamp(1.05 - hunger, 0, 0.95);
  }

  tick(worker, state, services, dt) {
    worker.blackboard ??= {};
    const target = worker.currentJob?.target ?? null;
    const carryEat = Boolean(target?.meta?.carryEat);
    if (carryEat || Number(state?.buildings?.warehouses ?? 0) <= 0) {
      worker.stateLabel = "Eat";
      worker.blackboard.intent = "eat";
      _consumeEmergencyRationForJobLayer(worker, state, dt, services);
      return;
    }
    // v0.9.0-d (audit F3+F4) — if the chosen warehouse target is blacklisted
    // (path-fail loop) and the colony stockpile has food, draw from it
    // directly instead of pinning the worker in seek_food. Mirrors the
    // legacy handleWander → consumeEmergencyRation carry-bypass.
    const blacklist = services?.pathFailBlacklist;
    if (target && blacklist?.isBlacklisted) {
      const nowSec = Number(state?.metrics?.timeSec ?? 0);
      const isBlacklisted = blacklist.isBlacklisted(
        worker.id, target.ix, target.iz, TILE.WAREHOUSE, nowSec,
      );
      if (isBlacklisted && Number(state?.resources?.food ?? 0) > 0) {
        worker.stateLabel = "Eat";
        worker.blackboard.intent = "eat";
        _consumeEmergencyRationForJobLayer(worker, state, dt, services);
        return;
      }
    }
    if (!worker.targetTile
        || worker.targetTile.ix !== target.ix
        || worker.targetTile.iz !== target.iz) {
      worker.targetTile = { ix: target.ix, iz: target.iz };
    }
    if (!arrivedAtTarget(worker, state, target, [TILE.WAREHOUSE])) {
      worker.blackboard.intent = "seek_food";
      worker.stateLabel = "Seek Food";
      tryAcquirePath(worker, target, state, services);
      executeMovement(worker, state, dt);
      return;
    }
    worker.blackboard.intent = "eat";
    worker.stateLabel = "Eat";
    // TODO v0.9.0-d: dedupe with handleEat after legacy retired.
    handleEat(worker, state, services, dt);
  }

  isComplete(worker, _state, _services) {
    const target = Number(BALANCE.workerEatRecoveryTarget ?? 0.68);
    return Number(worker?.hunger ?? 0) >= target;
  }

  onAbandon(worker, state, _services) {
    releaseReservation(worker, state);
  }
}
