// v0.10.0-b — Worker FSM state-behavior map. Phase 2 of 5 per
// docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md §3.1.
// Each state is a frozen { onEnter, tick, onExit } triple. State bodies port
// v0.9.4 Job tick bodies via WorkerAISystem.js helpers (applyHarvestStep,
// handleDeliver, pickWanderNearby, etc.). v0.10.0-d retired the Job layer
// itself; the helpers live in WorkerAISystem.js / WorkerHelpers.js and are
// the only consumers.
//
// Hook signatures (§3.2): onEnter(worker, state, services),
// tick(worker, state, services, dt), onExit(worker, state, services).

import { clamp } from "../../../app/math.js";
import { BALANCE } from "../../../config/balance.js";
import { ROLE, TILE } from "../../../config/constants.js";
import { recordResourceFlow } from "../../economy/ResourceSystem.js";
import {
  applyConstructionWork,
  findOrReserveBuilderSite,
  getBuildStandTile,
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
// v0.10.0-d — Job layer retired. WorkerAISystem helpers imported directly;
// composite movement + reservation helpers (executeMovement, tryAcquirePath)
// live in WorkerHelpers.js (sibling).
import { executeMovement, tryAcquirePath } from "./WorkerHelpers.js";
import {
  applyHarvestStep,
  chooseWorkerTarget,
  handleDeliver,
  pickFogEdgeTileNear,
  pickWanderNearby,
  setIdleDesired,
} from "../WorkerAISystem.js";
import { findNearestHostile, getRoleHarvestTiles, getRoleProcessConfig } from "./WorkerConditions.js";

/**
 * Frozen 12-entry STATE enum (§3.1). Do not extend without updating the plan
 * + STATE_BEHAVIOR + STATE_TRANSITIONS.
 * @typedef {("IDLE"|"SEEKING_REST"|"RESTING"|"FIGHTING"|"SEEKING_HARVEST"|"HARVESTING"|"DELIVERING"|"DEPOSITING"|"SEEKING_BUILD"|"BUILDING"|"SEEKING_PROCESS"|"PROCESSING")} WorkerStateName
 */
export const STATE = Object.freeze({
  IDLE: "IDLE",
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

// v0.10.0-e — single-source-of-truth display label. State bodies no longer
// write `worker.stateLabel`; the dispatcher (WorkerFSM.tickWorker — a thin
// facade over PriorityFSM.tick) reads DISPLAY_LABEL[fsm.state] post-tick
// and writes it once. The setIntent
// helper still writes `worker.blackboard.intent` because the intent string
// (`"seek_food"`, `"harvest"`, …) carries semantics distinct from the
// display label (e.g. SEEKING_HARVEST → label "Seek Task" vs intent
// "harvest"). Centralising both writes in the dispatcher would mean
// hard-coding "harvest" alongside "Seek Task" in DISPLAY_LABEL — but
// EntityFocusPanel's search/grouping logic uses both fields independently,
// so we keep `intent` per-state (still single-write per state body) and
// hoist the label up to the dispatcher.
function setIntent(worker, _label, intent) {
  worker.blackboard ??= {};
  worker.blackboard.intent = intent;
}

/**
 * Display labels keyed by FSM state name. The dispatcher
 * (WorkerFSM.tickWorker — thin facade over PriorityFSM.tick) reads from
 * this map post-tick to set `worker.stateLabel`. Keep in sync with
 * STATE_BEHAVIOR; new states added
 * to STATE must add a label here too. Labels match the per-state-body
 * strings used pre-v0.10.0-e for back-compat with EntityFocusPanel /
 * inspector / chronicle search logic.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DISPLAY_LABEL = Object.freeze({
  IDLE: "Wander",
  SEEKING_REST: "Seek Rest",
  RESTING: "Rest",
  FIGHTING: "Engage",
  SEEKING_HARVEST: "Seek Task",
  HARVESTING: "Harvest",
  DELIVERING: "Deliver",
  DEPOSITING: "Deliver",
  SEEKING_BUILD: "Seek Construct",
  BUILDING: "Construct",
  SEEKING_PROCESS: "Seek Process",
  PROCESSING: "Process",
});

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
  // R6 PG-bridge-and-water — water-blueprint adjacent arrival. SEEKING_BUILD
  // sets `payload.adjacentArrival = true` + `payload.siteIx/siteIz` when the
  // construction site is on an impassable tile (canonical case: bridge on
  // WATER) and the worker's stand-on target is a 4-neighbour land tile.
  // Strict equality on the stand-on target is the normal arrival predicate;
  // the adjacent-arrival branch additionally accepts Manhattan ≤ 1 from the
  // ACTUAL site coordinate so a BUILDER standing on the shore counts as
  // "at" the water blueprint and BUILDING.tick can apply work. Other states
  // (SEEKING_HARVEST/DELIVERING/SEEKING_PROCESS) never set the flag, so
  // their strict-equality semantics are unchanged.
  if (here.ix === t.ix && here.iz === t.iz) return true;
  const payload = worker.fsm?.payload;
  if (payload?.adjacentArrival === true
      && Number.isFinite(payload.siteIx)
      && Number.isFinite(payload.siteIz)) {
    const dx = Math.abs(here.ix - payload.siteIx);
    const dz = Math.abs(here.iz - payload.siteIz);
    if (dx + dz <= 1) return true;
  }
  return false;
}

// IDLE

// v0.10.0-c — wander-refresh constants ported from JobWander.js so the
// FSM IDLE state cycles wander targets at the same cadence as the v0.9.4
// Job-layer (without these, pickWanderNearby's 10% null-return left
// workers standing still for the full SEEKING-stuck timeout, which
// surfaced as a 4-stuck regression in scenario A bare-init).
const WANDER_REFRESH_BASE_SEC = 1.4;
const WANDER_REFRESH_JITTER_SEC = 1.2;

const IDLE = Object.freeze({
  onEnter(worker, _state, _services) {
    if (worker.fsm) worker.fsm.target = null;
    setIntent(worker, "Wander", "wander");
  },
  tick(worker, state, services, dt) {
    setIntent(worker, "Wander", "wander");
    worker.blackboard ??= {};
    const blackboard = worker.blackboard;
    const nowSec = Number(state?.metrics?.timeSec ?? 0);
    const nextWanderRefreshSec = Number(blackboard.nextWanderRefreshSec ?? -Infinity);
    const stalePath = Boolean(worker.path) && worker.pathGridVersion !== state.grid?.version;
    if (!hasActivePath(worker, state) || stalePath || nowSec >= nextWanderRefreshSec) {
      if (!hasPendingPathRequest(worker, services) && canAttemptPath(worker, state)) {
        clearPath(worker);
        // R13 Plan-R13-fog-aware-build (#5+#7) — fog-edge bias. When the
        // autopilot has flagged `state.ai.scoutNeeded` (no buildable
        // visible terrain) ALWAYS try the fog-edge picker first; otherwise
        // try it stochastically per `BALANCE.workerExploreFogEdgeBiasWeight`.
        // Falls back to the standard wander picker when no fog edge is
        // within scan radius (e.g. fully-revealed colony interior).
        const wantExplore = state?.ai?.scoutNeeded === true
          || ((services?.rng?.next ? services.rng.next() : 0)
              < Number(BALANCE.workerExploreFogEdgeBiasWeight ?? 0));
        let target = wantExplore ? pickFogEdgeTileNear(worker, state, services) : null;
        if (!target) target = pickWanderNearby(worker, state, services);
        if (target && setTargetAndPath(worker, target, state, services)) {
          blackboard.nextWanderRefreshSec = nowSec
            + WANDER_REFRESH_BASE_SEC
            + (services?.rng?.next ? services.rng.next() : 0.5) * WANDER_REFRESH_JITTER_SEC;
        }
      }
    }
    executeMovement(worker, state, dt);
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
      // PCC R10 — split GUARD vs non-GUARD damage so role identity holds.
      // Non-GUARDs still engage (R5 PB intent) but with lower DPS so a
      // saboteur breach is no longer "tap to delete" by a passing FARM.
      const isGuard = worker.role === "GUARD";
      const dmg = isGuard
        ? Number(BALANCE.guardAttackDamage ?? 14)
        : Number(BALANCE.workerAttackDamage ?? 10);
      target.hp = Math.max(0, Number(target.hp ?? 0) - dmg);
      worker.attackCooldownSec = isGuard
        ? Number(BALANCE.workerAttackCooldownSec ?? 1.6)
        : Number(BALANCE.workerNonGuardAttackCooldownSec ?? 2.2);
      if (target.hp <= 0 && target.alive !== false) {
        target.alive = false;
        target.deathReason = "killed-by-worker";
        target.deathSec = state.metrics.timeSec;
        // R13 Plan-R13-wildlife-hunt (P1) Step c — wildlife hunt food reward.
        // When the worker downs an ANIMAL (predator), drop N food: into the
        // killer's carry first (up to capacity), overflow into the colony
        // food stockpile. Counted as a 'food/produced/wildlife-hunt' flow so
        // the hunt loop has positive economic feedback alongside the
        // existing hostilesSlain metric.
        if (target.type === "ANIMAL" && target.kind === "PREDATOR") {
          const reward = Number(BALANCE.wildlifeHuntFoodReward ?? 0);
          if (reward > 0) {
            // Carry soft-cap mirrors WorkerConditions.isCarryFull
            // (workerDeliverThreshold × 2). Above the cap we overflow into
            // state.resources.food directly so the kill never silently drops
            // food on the ground.
            const cap = Number(BALANCE.workerDeliverThreshold ?? 2.5) * 2;
            worker.carry ??= { food: 0, wood: 0, stone: 0, herbs: 0 };
            const carryFood = Number(worker.carry.food ?? 0);
            const intoCarry = Math.max(0, Math.min(reward, cap - carryFood));
            const overflow = reward - intoCarry;
            if (intoCarry > 0) worker.carry.food = carryFood + intoCarry;
            if (overflow > 0) {
              state.resources ??= {};
              state.resources.food = Number(state.resources.food ?? 0) + overflow;
            }
            recordResourceFlow(state, "food", "produced", reward);
          }
        }
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
      // PX R9 B1 — honor the boolean. A `false` result means another worker
      // already holds this tile; null the target so the dispatcher's
      // `fsmTargetNull` transition (priority 7 in SEEKING_HARVEST_TRANSITIONS,
      // WorkerTransitions.js:109) routes us back to IDLE for re-pick next tick.
      const claimed = reservation.tryReserve(worker.id, tgt.ix, tgt.iz, "harvest", nowSec);
      if (!claimed) {
        worker.fsm.target = null;
        return;
      }
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
    // v0.10.0-c — do NOT clearPath. The path was used to arrive at the
    // harvest target; HARVESTING then stays on the same tile. Clearing it
    // would zero pathLen and the trace metric would flag the worker as
    // "stuck" while it's actually doing useful work. Mirrors v0.9.4
    // JobHarvestBase.tick which never clears path on arrival.
  },
});

// HARVESTING

const HARVESTING = Object.freeze({
  // v0.10.0-d — onEnter recovers the harvest target from worker.targetTile
  // (set by SEEKING_HARVEST.tick via syncTargetTile). The dispatcher resets
  // worker.fsm.target on every transition, so HARVESTING needs to lift
  // the tile back into worker.fsm.target before its tick body looks at it.
  onEnter(worker, state, _services) {
    setIntent(worker, "Harvest", "harvest");
    if (!worker.fsm) return;
    if (worker.targetTile) {
      worker.fsm.target = { ix: worker.targetTile.ix, iz: worker.targetTile.iz };
    }
    const t = worker.fsm.target;
    if (!t) return;
    const reservation = state?._jobReservation;
    const nowSec = Number(state?.metrics?.timeSec ?? 0);
    if (reservation?.tryReserve) {
      // PX R9 B1 — honor the boolean on arrival too. If the target tile is
      // already claimed by a different worker, abandon: null the target so
      // HARVESTING.tick's `if (!t) return;` short-circuits and the dispatcher's
      // priority-8 yieldPoolDriedUp / IDLE catch-all routes us back to IDLE.
      const claimed = reservation.tryReserve(worker.id, t.ix, t.iz, "harvest", nowSec);
      if (!claimed) {
        worker.fsm.target = null;
        return;
      }
    }
  },
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
  onExit(_worker, _state, _services) {
    // v0.10.0-c — do NOT clearPath. DEPOSITING tick uses worker.targetTile,
    // and clearing the path would flag the worker as "stuck" by the trace
    // metric while it's actually doing useful work at the warehouse.
  },
});

// DEPOSITING (port of JobDeliverWarehouse at-warehouse unload body)

const DEPOSITING = Object.freeze({
  // v0.10.0-d — Lift target from worker.targetTile so handleDeliver has a
  // valid warehouse coordinate to unload at (the dispatcher resets
  // fsm.target on every transition).
  onEnter(worker, _state, _services) {
    setIntent(worker, "Deliver", "deliver");
    if (worker.fsm && worker.targetTile) {
      worker.fsm.target = { ix: worker.targetTile.ix, iz: worker.targetTile.iz };
    }
  },
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
    if (!site) { worker.fsm.target = null; return; }
    // R6 PG-bridge-and-water — split the navigation target ("stand-on tile")
    // from the construction target ("site tile"). For land sites the two
    // coincide. For water sites (bridge blueprint on TILE.WATER) the
    // stand-on tile is a 4-neighbour land tile and the BUILDER applies work
    // from there via the Manhattan ≤ 1 arrival predicate + BUILDING.tick's
    // payload.siteIx/siteIz lookup. If no shore tile exists (orphan
    // mid-ocean blueprint), fall back to the site tile so the OLD failure
    // mode (A* returns null, builder loops) is preserved — the planner
    // should have prevented mid-ocean placement in the first place.
    const stand = getBuildStandTile(state.grid, site) ?? { ix: site.ix, iz: site.iz };
    const adjacent = stand.ix !== site.ix || stand.iz !== site.iz;
    worker.fsm.target = {
      ix: stand.ix,
      iz: stand.iz,
      meta: { siteKey: `${site.ix},${site.iz}` },
    };
    worker.fsm.payload = {
      siteIx: site.ix,
      siteIz: site.iz,
      adjacentArrival: adjacent,
    };
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
    // R5 PA-worker-fsm-task-release Step 1 — release the builder claim on
    // ANY non-arrival exit (fsmTargetNull / fsmTargetGone / pathFailedRecently
    // / SURVIVAL_REST preempt / COMBAT_PREEMPT). Without this, a BUILDER who
    // bounces back to IDLE because findOrReserveBuilderSite returned null
    // can leak the only-this-tick scout reservation, and another BUILDER
    // sitting on a stale builderId entry causes IDLE → SEEKING_BUILD →
    // IDLE oscillation (the user-reported "BUILDER stuck in Wander while
    // red blueprints sit unbuilt"). On successful arrival, BUILDING.onExit
    // owns the release; we deliberately skip here so the BUILDING state
    // body keeps the reservation while applying construction work.
    if (!arrived(worker, state)) releaseBuilderSite(state, worker);
    // v0.10.0-c — do NOT clearPath. BUILDING tick stays at the site; the
    // arrival path persisting is the same shape as v0.9.4 JobBuildSite.
  },
});

// BUILDING (port of JobBuildSite.tick at-site body)

const BUILDING = Object.freeze({
  // v0.10.0-d — onEnter re-resolves the site target. The dispatcher
  // resets fsm.target on every transition (deliberate — see PriorityFSM
  // _enterState, invoked through the WorkerFSM facade), but BUILDING's tick
  // body needs a target to apply work.
  // Re-fetching via findOrReserveBuilderSite is idempotent (the site
  // already holds builderId from SEEKING_BUILD.onEnter; this returns the
  // same site).
  onEnter(worker, state, _services) {
    setIntent(worker, "Construct", "construct");
    if (!worker.fsm) return;
    const site = findOrReserveBuilderSite(state, worker);
    if (!site) return;
    // R6 PG-bridge-and-water — re-derive stand-on tile + adjacent flag.
    // PriorityFSM._enterState wipes payload on every transition, so the
    // SEEKING_BUILD payload doesn't survive into BUILDING; rebuild it here
    // so the dispatcher's BUILDING tick body + transition `when()` clauses
    // (which call arrived(worker, state)) keep seeing the correct flag.
    const stand = getBuildStandTile(state.grid, site) ?? { ix: site.ix, iz: site.iz };
    const adjacent = stand.ix !== site.ix || stand.iz !== site.iz;
    worker.fsm.target = {
      ix: stand.ix,
      iz: stand.iz,
      meta: { siteKey: `${site.ix},${site.iz}` },
    };
    worker.fsm.payload = {
      siteIx: site.ix,
      siteIz: site.iz,
      adjacentArrival: adjacent,
    };
  },
  tick(worker, state, _services, dt) {
    setIntent(worker, "Construct", "construct");
    setIdleDesired(worker);
    const t = worker.fsm?.target;
    if (!t) return;
    syncTargetTile(worker);
    const site = findOrReserveBuilderSite(state, worker);
    if (!site) return;
    // R6 PG-bridge-and-water — only apply work if the BUILDER is on the
    // site tile (land case) OR within Manhattan ≤ 1 of it (water-blueprint
    // shore case). Otherwise the worker would silently build the bridge
    // while still walking — visible as "construction completes from across
    // the map". The arrived() helper already encodes both branches.
    if (!arrived(worker, state)) return;
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
    // v0.10.0-c — do NOT clearPath. PROCESSING tick stays at the building.
  },
});

// PROCESSING (stand idle — ProcessingSystem runs the consume+produce cycle)

const PROCESSING = Object.freeze({
  onEnter(worker, _state, _services) {
    setIntent(worker, "Process", "process");
  },
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
