// v0.9.0-c — JobGuardEngage: combat preempt at priority 100. canTake gates
// on `worker.role === GUARD` AND any active hostile (PREDATOR or SABOTEUR)
// within `BALANCE.guardAggroRadius`. v0.9.0-e — body inlined; legacy
// handleGuardCombat deleted from WorkerAISystem.js.

import { BALANCE } from "../../../config/balance.js";
import { ANIMAL_KIND, ROLE, VISITOR_KIND } from "../../../config/constants.js";
import {
  canAttemptPath,
  followPath,
  hasActivePath,
  setTargetAndPath,
} from "../../navigation/Navigation.js";
import { worldToTile } from "../../../world/grid/Grid.js";
import { setIdleDesired } from "./JobHelpers.js";
import { Job } from "./Job.js";

function findNearestHostile(worker, state) {
  const animals = Array.isArray(state?.animals) ? state.animals : [];
  const agents = Array.isArray(state?.agents) ? state.agents : [];
  const aggroRadius = Number(BALANCE.guardAggroRadius ?? 6);
  const aggro2 = aggroRadius * aggroRadius;
  let target = null;
  let bestD2 = Infinity;
  for (const a of animals) {
    if (!a || a.alive === false || a.kind !== ANIMAL_KIND.PREDATOR) continue;
    const dx = a.x - worker.x; const dz = a.z - worker.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= aggro2 && d2 < bestD2) { bestD2 = d2; target = a; }
  }
  for (const v of agents) {
    if (!v || v.alive === false || v.type !== "VISITOR" || v.kind !== VISITOR_KIND.SABOTEUR) continue;
    const dx = v.x - worker.x; const dz = v.z - worker.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= aggro2 && d2 < bestD2) { bestD2 = d2; target = v; }
  }
  return target;
}

export class JobGuardEngage extends Job {
  static id = "guard_engage";
  static priority = 100;

  canTake(worker, state, _services) {
    if (String(worker?.role ?? "").toUpperCase() !== ROLE.GUARD) return false;
    return findNearestHostile(worker, state) != null;
  }

  findTarget(worker, state, _services) {
    const h = findNearestHostile(worker, state);
    if (!h) return null;
    return {
      ix: Math.floor(Number(h.x ?? 0)),
      iz: Math.floor(Number(h.z ?? 0)),
      meta: { entityId: h.id, kind: h.kind ?? h.type },
    };
  }

  score(worker, _state, _services, target) {
    if (!target) return 0;
    if (String(worker?.role ?? "").toUpperCase() !== ROLE.GUARD) return 0;
    return 0.95;
  }

  tick(worker, state, services, dt) {
    worker.blackboard ??= {};
    // v0.9.0-e — inlined from former handleGuardCombat. Re-scan for the
    // nearest hostile (predator OR saboteur) within aggro radius and pursue
    // / melee. Path-fail dwell after 1.5s flips back to "guard_idle" so the
    // scheduler picks the next-best Job (wander/eat/rest) on the following
    // tick rather than burning the slot doing nothing.
    const engaged = engageNearestHostile(worker, state, services, dt);
    if (!engaged) {
      worker.blackboard.intent = "guard_idle";
      worker.stateLabel = "Watch";
    }
  }

  isComplete(worker, state, _services) {
    return findNearestHostile(worker, state) == null;
  }

  onAbandon(_worker, _state, _services) { /* ephemeral target */ }
}

// v0.9.0-e — inlined body of the former WorkerAISystem.handleGuardCombat.
// Returns true when a hostile was acquired and engaged (caller marks intent
// guard_engage); false when the worker should idle / fall through to a
// non-combat Job. Internal contract: writes worker.{desiredVel, attackCooldownSec,
// debug.lastIntent, debug.lastIntentReason, stateLabel, blackboard.intent,
// blackboard.guardPathFailDwellSec} and may flip target.alive when hp<=0.
function engageNearestHostile(worker, state, services, dt) {
  const animals = Array.isArray(state?.animals) ? state.animals : [];
  const agents = Array.isArray(state?.agents) ? state.agents : [];

  const aggroRadius = Number(BALANCE.guardAggroRadius ?? 4);
  const aggro2 = aggroRadius * aggroRadius;
  let target = null;
  let bestD2 = Infinity;
  for (const a of animals) {
    if (!a || a.alive === false) continue;
    if (a.kind !== ANIMAL_KIND.PREDATOR) continue;
    const dx = a.x - worker.x;
    const dz = a.z - worker.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= aggro2 && d2 < bestD2) {
      bestD2 = d2;
      target = a;
    }
  }
  // v0.8.5 Tier 2 S3 — saboteur engagement. GUARDs chase active SABOTEUR
  // visitors within aggro range so the colony has a counter beyond walls.
  for (const v of agents) {
    if (!v || v.alive === false) continue;
    if (v.type !== "VISITOR") continue;
    if (v.kind !== VISITOR_KIND.SABOTEUR) continue;
    const dx = v.x - worker.x;
    const dz = v.z - worker.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= aggro2 && d2 < bestD2) {
      bestD2 = d2;
      target = v;
    }
  }
  if (!target) return false;

  worker.attackCooldownSec = Math.max(0, Number(worker.attackCooldownSec ?? 0) - dt);
  worker.debug ??= {};
  worker.debug.lastIntent = "guard_engage";
  worker.debug.lastIntentReason = `GUARD engaging ${target.species ?? "predator"} at d=${Math.sqrt(bestD2).toFixed(2)}`;
  worker.stateLabel = "Engage";
  worker.blackboard ??= {};
  worker.blackboard.intent = "guard_engage";

  const targetTile = worldToTile(target.x, target.z, state.grid);
  const meleeReach = Number(BALANCE.meleeReachTiles ?? 1.0);

  // Refresh path if stale or absent.
  const pathStale = Boolean(worker.path) && worker.pathGridVersion !== state.grid.version;
  const noPath = !hasActivePath(worker, state);
  if ((pathStale || noPath) && canAttemptPath(worker, state)) {
    setTargetAndPath(worker, targetTile, state, services);
  }
  if (hasActivePath(worker, state)) {
    const step = followPath(worker, state, dt);
    worker.desiredVel = step.desired;
    worker.blackboard.guardPathFailDwellSec = 0;
  } else {
    // v0.8.6 Tier 2 CB-H1 — GUARD path-fail fallback. After 1.5s without a
    // successful path, flip back to non-engaged so the scheduler picks
    // wander / next Job. v0.8.7.1 P11 clamp upper bound.
    const dwell = Math.min(5, Number(worker.blackboard.guardPathFailDwellSec ?? 0) + dt);
    worker.blackboard.guardPathFailDwellSec = dwell;
    if (dwell >= 1.5) {
      setIdleDesired(worker);
      worker.debug.lastIntentReason = `GUARD path-fail dwell=${dwell.toFixed(1)}s`;
      return false;
    }
    setIdleDesired(worker);
  }

  // Melee hit when within reach.
  const dist = Math.sqrt(bestD2);
  if (dist <= meleeReach && Number(worker.attackCooldownSec ?? 0) <= 0
      && Number(target.hp ?? 0) > 0) {
    const dmg = Number(BALANCE.guardAttackDamage ?? 14);
    target.hp = Math.max(0, Number(target.hp ?? 0) - dmg);
    worker.attackCooldownSec = Number(BALANCE.workerAttackCooldownSec ?? 1.6);
    target.memory ??= { recentEvents: [] };
    target.memory.recentEvents ??= [];
    target.memory.recentEvents.unshift("guard-hit");
    target.memory.recentEvents.length = Math.min(target.memory.recentEvents.length, 6);
    if (target.hp <= 0 && target.alive !== false) {
      target.alive = false;
      target.deathReason = "killed-by-worker";
      target.deathSec = state.metrics.timeSec;
    }
  }
  return true;
}
