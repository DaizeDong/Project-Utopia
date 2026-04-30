// v0.10.0-b — Worker FSM state-behavior map. Phase 2 of 5 per
// docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md §3.1.
// Each state is a frozen { onEnter, tick, onExit } triple. State bodies port
// v0.9.4 Job tick bodies via JobHelpers.js / WorkerAISystem.js helpers
// (applyHarvestStep, handleDeliver, pickWanderNearby, etc.); phase 0.10.0-d
// dedupes once the legacy Job layer retires. Each delegating state carries
// a "TODO v0.10.0-d" comment listing the Job class to dedupe.
//
// Hook signatures (§3.2): onEnter(worker, state, services),
// tick(worker, state, services, dt), onExit(worker, state, services).

import { clamp } from "../../../app/math.js";
import { BALANCE } from "../../../config/balance.js";
import { ROLE, TILE } from "../../../config/constants.js";
import {
  applyConstructionWork,
  findOrReserveBuilderSite,
  releaseBuilderSite,
} from "../../construction/ConstructionSites.js";
import {
  canAttemptPath,
  clearPath,
  followPath,
  hasActivePath,
  hasPendingPathRequest,
  setTargetAndPath,
} from "../../navigation/Navigation.js";
import { worldToTile } from "../../../world/grid/Grid.js";
import {
  applyHarvestStep,
  chooseWorkerTarget,
  executeMovement,
  setIdleDesired,
  tryAcquirePath,
} from "../jobs/JobHelpers.js";
import {
  _consumeEmergencyRationForJobLayer,
  getWorkerEatRecoveryTarget,
  getWorkerRecoveryPerFoodUnit,
  handleDeliver,
  pickWanderNearby,
} from "../WorkerAISystem.js";
import { findNearestHostile, getRoleHarvestTiles, getRoleProcessConfig } from "./WorkerConditions.js";

/**
 * Frozen 14-entry STATE enum (§3.1). Do not extend without updating the plan
 * + STATE_BEHAVIOR + STATE_TRANSITIONS.
 * @typedef {("IDLE"|"SEEKING_FOOD"|"EATING"|"SEEKING_REST"|"RESTING"|"FIGHTING"|"SEEKING_HARVEST"|"HARVESTING"|"DELIVERING"|"DEPOSITING"|"SEEKING_BUILD"|"BUILDING"|"SEEKING_PROCESS"|"PROCESSING")} WorkerStateName
 */
export const STATE = Object.freeze({
  IDLE: "IDLE",
  SEEKING_FOOD: "SEEKING_FOOD",
  EATING: "EATING",
  SEEKING_REST: "SEEKING_REST",
  RESTING: "RESTING",
  FIGHTING: "FIGHTING",
  SEEKING_HARVEST: "SEEKING_HARVEST",
  HARVESTING: "HARVESTING",
  DELIVERING: "DELIVERING",
  DEPOSITING: "DEPOSITING",
  SEEKING_BUILD: "SEEKING_BUILD",
  BUILDING: "BUILDING",
  SEEKING_PROCESS: "SEEKING_PROCESS",
  PROCESSING: "PROCESSING",
});

/**
 * Per-worker FSM state shape. Phase b extends phase-a's `{state, enteredAtSec}`
 * with `target` (chosen by onEnter; cleared by dispatcher on transition) and
 * `payload` (free-form per-state scratch).
 * @typedef {Object} WorkerFSMState
 * @property {string} state
 * @property {number} enteredAtSec
 * @property {{ix:number,iz:number}|null} [target]
 * @property {Object} [payload]
 */

// Shared helpers (private — inlined to keep state bodies ≤ ~40 LOC each).

function setIntent(worker, label, intent) {
  worker.blackboard ??= {};
  worker.stateLabel = label;
  worker.blackboard.intent = intent;
}

function syncTargetTile(worker) {
  const t = worker.fsm?.target;
  if (!t) return;
  if (!worker.targetTile
      || worker.targetTile.ix !== t.ix
      || worker.targetTile.iz !== t.iz) {
    worker.targetTile = { ix: t.ix, iz: t.iz };
  }
}

function arrived(worker, state) {
  const t = worker.fsm?.target;
  if (!t || !state?.grid) return false;
  const here = worldToTile(Number(worker.x ?? 0), Number(worker.z ?? 0), state.grid);
  return here.ix === t.ix && here.iz === t.iz;
}

// IDLE

const IDLE = Object.freeze({
  onEnter(worker, _state, _services) {
    if (worker.fsm) worker.fsm.target = null;
    setIntent(worker, "Wander", "wander");
  },
  tick(worker, state, services, dt) {
    setIntent(worker, "Wander", "wander");
    // TODO v0.10.0-d: dedupe with retired Job code (JobWander.tick).
    if (!hasActivePath(worker, state)) {
      if (!hasPendingPathRequest(worker, services) && canAttemptPath(worker, state)) {
        const target = pickWanderNearby(worker, state, services);
        if (target) setTargetAndPath(worker, target, state, services);
      }
    }
    executeMovement(worker, state, dt);
  },
  onExit(worker, _state, _services) {
    clearPath(worker);
  },
});

// SEEKING_FOOD

const SEEKING_FOOD = Object.freeze({
  onEnter(worker, state, services) {
    if (!worker.fsm) return;
    if (Number(state?.buildings?.warehouses ?? 0) > 0) {
      const tgt = chooseWorkerTarget(
        worker, state, [TILE.WAREHOUSE], state._workerTargetOccupancy, services,
      );
      if (tgt) { worker.fsm.target = { ix: tgt.ix, iz: tgt.iz }; return; }
    }
    // Fallback: carry-eat in place.
    if (Number(worker?.carry?.food ?? 0) > 0 && state?.grid) {
      const here = worldToTile(Number(worker.x ?? 0), Number(worker.z ?? 0), state.grid);
      worker.fsm.target = { ix: here.ix, iz: here.iz, meta: { carryEat: true } };
      return;
    }
    worker.fsm.target = null;
  },
  tick(worker, state, services, dt) {
    setIntent(worker, "Seek Food", "seek_food");
    syncTargetTile(worker);
    const t = worker.fsm?.target;
    if (!t) { setIdleDesired(worker); return; }
    if (t.meta?.carryEat) { setIdleDesired(worker); return; }
    tryAcquirePath(worker, t, state, services);
    executeMovement(worker, state, dt);
  },
  onExit(worker, _state, _services) {
    clearPath(worker);
  },
});

// EATING

const EATING = Object.freeze({
  onEnter(worker, _state, _services) {
    setIntent(worker, "Eat", "eat");
  },
  // TODO v0.10.0-d: dedupe with retired Job code (JobEat.tick at-warehouse body).
  tick(worker, state, _services, dt) {
    setIntent(worker, "Eat", "eat");
    setIdleDesired(worker);
    const t = worker.fsm?.target;
    const carryEat = Boolean(t?.meta?.carryEat) || Number(state?.buildings?.warehouses ?? 0) <= 0;
    if (carryEat) {
      _consumeEmergencyRationForJobLayer(worker, state, dt, _services);
      return;
    }
    const eatRecoveryTarget = getWorkerEatRecoveryTarget(worker);
    if (Number(worker.hunger ?? 0) >= eatRecoveryTarget) return;
    const recoveryPerFood = getWorkerRecoveryPerFoodUnit(worker);
    const gainCap = Math.max(0, eatRecoveryTarget - Number(worker.hunger ?? 0));
    const desiredFood = Math.min(BALANCE.hungerEatRatePerSecond * dt, gainCap / recoveryPerFood);
    if (Number(state.resources?.meals ?? 0) > 0) {
      const recoveryPerMeal = recoveryPerFood * Number(BALANCE.mealHungerRecoveryMultiplier ?? 2.0);
      const desiredMeals = Math.min(
        BALANCE.hungerEatRatePerSecond * dt,
        Math.max(0, eatRecoveryTarget - Number(worker.hunger ?? 0)) / recoveryPerMeal,
      );
      const eat = Math.min(desiredMeals, state.resources.meals);
      if (eat > 0) {
        state.resources.meals -= eat;
        worker.hunger = clamp(worker.hunger + eat * recoveryPerMeal, 0, 1);
      }
    } else {
      const eat = Math.min(desiredFood, Number(state.resources?.food ?? 0));
      if (eat <= 0) return;
      state.resources.food -= eat;
      worker.hunger = clamp(worker.hunger + eat * recoveryPerFood, 0, 1);
    }
  },
  onExit(worker, _state, _services) {
    clearPath(worker);
  },
});

// SEEKING_REST

const SEEKING_REST = Object.freeze({
  onEnter(worker, state, _services) {
    // Rest in place — pick the worker's own tile as the "rest spot". The
    // legacy v0.9.4 JobRest does the same; later phases may pick a barracks.
    if (!worker.fsm || !state?.grid) return;
    const here = worldToTile(Number(worker.x ?? 0), Number(worker.z ?? 0), state.grid);
    worker.fsm.target = { ix: here.ix, iz: here.iz };
  },
  tick(worker, state, services, dt) {
    setIntent(worker, "Seek Rest", "seek_rest");
    syncTargetTile(worker);
    const t = worker.fsm?.target;
    if (!t) { setIdleDesired(worker); return; }
    tryAcquirePath(worker, t, state, services);
    executeMovement(worker, state, dt);
  },
  onExit(worker, _state, _services) {
    clearPath(worker);
  },
});

// RESTING

const RESTING = Object.freeze({
  onEnter(worker, _state, _services) {
    setIntent(worker, "Rest", "rest");
  },
  // TODO v0.10.0-d: dedupe with retired Job code (JobRest.tick).
  tick(worker, _state, _services, dt) {
    setIntent(worker, "Rest", "rest");
    setIdleDesired(worker);
    const restRecovery = Number(BALANCE.workerRestRecoveryPerSecond ?? 0.08);
    const moraleRecovery = Number(BALANCE.workerMoraleRecoveryPerSecond ?? 0.02);
    worker.rest = clamp(Number(worker.rest ?? 1) + restRecovery * dt, 0, 1);
    worker.morale = clamp(Number(worker.morale ?? 1) + moraleRecovery * dt, 0, 1);
  },
  onExit(_worker, _state, _services) { /* no-op */ },
});

// FIGHTING (port of JobGuardEngage.tick body)

const FIGHTING = Object.freeze({
  onEnter(worker, state, _services) {
    setIntent(worker, "Engage", "guard_engage");
    if (!worker.fsm) return;
    const h = findNearestHostile(worker, state);
    if (h) {
      worker.fsm.target = {
        ix: Math.floor(Number(h.x ?? 0)),
        iz: Math.floor(Number(h.z ?? 0)),
        meta: { entityId: h.id, kind: h.kind ?? h.type },
      };
    }
  },
  // TODO v0.10.0-d: dedupe with retired Job code (JobGuardEngage.engageNearestHostile).
  tick(worker, state, services, dt) {
    setIntent(worker, "Engage", "guard_engage");
    const target = findNearestHostile(worker, state);
    if (!target) { setIdleDesired(worker); return; }
    worker.attackCooldownSec = Math.max(0, Number(worker.attackCooldownSec ?? 0) - dt);
    const targetTile = worldToTile(target.x, target.z, state.grid);
    const meleeReach = Number(BALANCE.meleeReachTiles ?? 1.0);
    const dx = target.x - worker.x; const dz = target.z - worker.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const pathStale = Boolean(worker.path) && worker.pathGridVersion !== state.grid.version;
    const noPath = !hasActivePath(worker, state);
    if ((pathStale || noPath) && canAttemptPath(worker, state)) {
      setTargetAndPath(worker, targetTile, state, services);
    }
    if (hasActivePath(worker, state)) {
      worker.desiredVel = followPath(worker, state, dt).desired;
    } else {
      setIdleDesired(worker);
    }
    if (dist <= meleeReach && Number(worker.attackCooldownSec ?? 0) <= 0
        && Number(target.hp ?? 0) > 0) {
      const dmg = Number(BALANCE.guardAttackDamage ?? 14);
      target.hp = Math.max(0, Number(target.hp ?? 0) - dmg);
      worker.attackCooldownSec = Number(BALANCE.workerAttackCooldownSec ?? 1.6);
      if (target.hp <= 0 && target.alive !== false) {
        target.alive = false;
        target.deathReason = "killed-by-worker";
        target.deathSec = state.metrics.timeSec;
      }
    }
  },
  onExit(worker, _state, _services) {
    clearPath(worker);
  },
});

// SEEKING_HARVEST

const SEEKING_HARVEST = Object.freeze({
  onEnter(worker, state, services) {
    if (!worker.fsm) return;
    const tiles = getRoleHarvestTiles(worker);
    if (tiles.length === 0) { worker.fsm.target = null; return; }
    const tgt = chooseWorkerTarget(
      worker, state, tiles, state._workerTargetOccupancy, services,
    );
    if (!tgt) { worker.fsm.target = null; return; }
    worker.fsm.target = { ix: tgt.ix, iz: tgt.iz };
    // 1:1 binding — claim the tile so other workers don't race to it.
    const reservation = state?._jobReservation;
    const nowSec = Number(state?.metrics?.timeSec ?? 0);
    if (reservation?.tryReserve) {
      reservation.tryReserve(worker.id, tgt.ix, tgt.iz, "harvest", nowSec);
    }
  },
  tick(worker, state, services, dt) {
    setIntent(worker, "Seek Task", "harvest");
    syncTargetTile(worker);
    const t = worker.fsm?.target;
    if (!t) { setIdleDesired(worker); return; }
    tryAcquirePath(worker, t, state, services);
    executeMovement(worker, state, dt);
  },
  onExit(worker, state, _services) {
    // Release the reservation if we leave SEEKING_HARVEST without arriving
    // (e.g. survival preempt). HARVESTING.onEnter re-reserves on arrival.
    if (state?._jobReservation && worker?.id) {
      state._jobReservation.releaseAll(worker.id);
    }
    clearPath(worker);
  },
});

// HARVESTING

const HARVESTING = Object.freeze({
  onEnter(worker, state, _services) {
    setIntent(worker, "Harvest", "harvest");
    const t = worker.fsm?.target;
    if (!t) return;
    const reservation = state?._jobReservation;
    const nowSec = Number(state?.metrics?.timeSec ?? 0);
    if (reservation?.tryReserve) {
      reservation.tryReserve(worker.id, t.ix, t.iz, "harvest", nowSec);
    }
  },
  // TODO v0.10.0-d: dedupe with retired Job code (JobHarvestBase.tick at-target body).
  tick(worker, state, services, dt) {
    setIntent(worker, "Harvest", "harvest");
    setIdleDesired(worker);
    const t = worker.fsm?.target;
    if (!t) return;
    syncTargetTile(worker);
    applyHarvestStep(worker, state, services, dt);
  },
  onExit(worker, state, _services) {
    if (state?._jobReservation && worker?.id) {
      state._jobReservation.releaseAll(worker.id);
    }
  },
});

// DELIVERING

const DELIVERING = Object.freeze({
  onEnter(worker, state, services) {
    if (!worker.fsm) return;
    const tgt = chooseWorkerTarget(
      worker, state, [TILE.WAREHOUSE], state._workerTargetOccupancy, services,
    );
    worker.fsm.target = tgt ? { ix: tgt.ix, iz: tgt.iz } : null;
  },
  tick(worker, state, services, dt) {
    setIntent(worker, "Deliver", "deliver");
    syncTargetTile(worker);
    const t = worker.fsm?.target;
    if (!t) { setIdleDesired(worker); return; }
    tryAcquirePath(worker, t, state, services);
    executeMovement(worker, state, dt);
  },
  onExit(worker, _state, _services) {
    clearPath(worker);
  },
});

// DEPOSITING (port of JobDeliverWarehouse at-warehouse unload body)

const DEPOSITING = Object.freeze({
  onEnter(worker, _state, _services) {
    setIntent(worker, "Deliver", "deliver");
  },
  // TODO v0.10.0-d: dedupe with retired Job code (handleDeliver in WorkerAISystem.js).
  tick(worker, state, services, dt) {
    setIntent(worker, "Deliver", "deliver");
    syncTargetTile(worker);
    // Reuse the legacy at-warehouse unload body. handleDeliver honours
    // warehouse-queue intake caps, isolation penalties, mood multipliers,
    // and resets carryTicks on full unload — yield-equivalence with v0.9.4.
    handleDeliver(worker, state, services, dt);
  },
  onExit(_worker, _state, _services) { /* no-op */ },
});

// SEEKING_BUILD

const SEEKING_BUILD = Object.freeze({
  onEnter(worker, state, _services) {
    if (!worker.fsm) return;
    const site = findOrReserveBuilderSite(state, worker);
    worker.fsm.target = site
      ? { ix: site.ix, iz: site.iz, meta: { siteKey: `${site.ix},${site.iz}` } }
      : null;
  },
  tick(worker, state, services, dt) {
    setIntent(worker, "Seek Construct", "seek_construct");
    syncTargetTile(worker);
    const t = worker.fsm?.target;
    if (!t) { setIdleDesired(worker); return; }
    tryAcquirePath(worker, t, state, services);
    executeMovement(worker, state, dt);
  },
  onExit(worker, state, _services) {
    // Only release the builder claim when leaving without arriving — once at
    // the site BUILDING.onExit handles the post-construction release.
    if (!arrived(worker, state)) releaseBuilderSite(state, worker);
    clearPath(worker);
  },
});

// BUILDING (port of JobBuildSite.tick at-site body)

const BUILDING = Object.freeze({
  onEnter(worker, _state, _services) {
    setIntent(worker, "Construct", "construct");
  },
  // TODO v0.10.0-d: dedupe with retired Job code (JobBuildSite.tick).
  tick(worker, state, _services, dt) {
    setIntent(worker, "Construct", "construct");
    setIdleDesired(worker);
    const t = worker.fsm?.target;
    if (!t) return;
    syncTargetTile(worker);
    const site = findOrReserveBuilderSite(state, worker);
    if (!site) return;
    applyConstructionWork(state, site.ix, site.iz, dt);
    if (worker.debug) worker.debug.lastConstructApplySec = Number(state.metrics?.timeSec ?? 0);
  },
  onExit(worker, state, _services) {
    releaseBuilderSite(state, worker);
  },
});

// SEEKING_PROCESS

const SEEKING_PROCESS = Object.freeze({
  onEnter(worker, state, services) {
    if (!worker.fsm) return;
    const cfg = getRoleProcessConfig(worker);
    if (!cfg) { worker.fsm.target = null; return; }
    const tgt = chooseWorkerTarget(
      worker, state, [cfg.tile], state._workerTargetOccupancy, services,
    );
    worker.fsm.target = tgt ? { ix: tgt.ix, iz: tgt.iz } : null;
  },
  tick(worker, state, services, dt) {
    setIntent(worker, "Seek Process", "process");
    syncTargetTile(worker);
    const t = worker.fsm?.target;
    if (!t) { setIdleDesired(worker); return; }
    tryAcquirePath(worker, t, state, services);
    executeMovement(worker, state, dt);
  },
  onExit(worker, state, _services) {
    if (state?._jobReservation && worker?.id) {
      state._jobReservation.releaseAll(worker.id);
    }
    clearPath(worker);
  },
});

// PROCESSING (stand idle — ProcessingSystem runs the consume+produce cycle)

const PROCESSING = Object.freeze({
  onEnter(worker, _state, _services) {
    setIntent(worker, "Process", "process");
  },
  // TODO v0.10.0-d: dedupe with retired Job code (JobProcessBase.tick at-target body).
  tick(worker, _state, _services, _dt) {
    setIntent(worker, "Process", "process");
    setIdleDesired(worker);
  },
  onExit(_worker, _state, _services) { /* no-op */ },
});

// STATE_BEHAVIOR map

/**
 * Phase-b STATE_BEHAVIOR map — every state has a real onEnter/tick/onExit
 * triple. The dispatcher invokes onEnter on transition into a state, tick
 * on every dispatcher pass, and onExit on transition out.
 *
 * @type {Readonly<Record<string, {onEnter: Function, tick: Function, onExit: Function}>>}
 */
export const STATE_BEHAVIOR = Object.freeze({
  [STATE.IDLE]: IDLE,
  [STATE.SEEKING_FOOD]: SEEKING_FOOD,
  [STATE.EATING]: EATING,
  [STATE.SEEKING_REST]: SEEKING_REST,
  [STATE.RESTING]: RESTING,
  [STATE.FIGHTING]: FIGHTING,
  [STATE.SEEKING_HARVEST]: SEEKING_HARVEST,
  [STATE.HARVESTING]: HARVESTING,
  [STATE.DELIVERING]: DELIVERING,
  [STATE.DEPOSITING]: DEPOSITING,
  [STATE.SEEKING_BUILD]: SEEKING_BUILD,
  [STATE.BUILDING]: BUILDING,
  [STATE.SEEKING_PROCESS]: SEEKING_PROCESS,
  [STATE.PROCESSING]: PROCESSING,
});
