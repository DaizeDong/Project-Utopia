// v0.9.0-c — JobGuardEngage: combat preempt at priority 100. canTake gates
// on `worker.role === GUARD` AND any active hostile (PREDATOR or SABOTEUR)
// within `BALANCE.guardAggroRadius`. tick delegates to handleGuardCombat.
// The legacy GUARD short-circuit at the top of WorkerAISystem.update is
// gated on `!FEATURE_FLAGS.USE_JOB_LAYER` so flag-ON routes GUARDs through
// JobScheduler.

import { BALANCE } from "../../../config/balance.js";
import { ANIMAL_KIND, ROLE, VISITOR_KIND } from "../../../config/constants.js";
import { handleGuardCombat } from "../WorkerAISystem.js";
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
    // TODO v0.9.0-d: dedupe with handleGuardCombat after legacy retired.
    const engaged = handleGuardCombat(worker, state, services, dt);
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
