/**
 * ThreatPlanner — Threat-driven plan injection for the colony AI.
 *
 * Mirrors RoadPlanner.js: when state.metrics.combat.activeThreats >= 1, emit
 * "promote a worker to GUARD" steps (and/or wall hints). Pure function — does
 * NOT mutate state.
 *
 * Used by:
 *   - ColonyPlanner.generateFallbackPlan — pre-pends threat steps before
 *     other priorities, mirroring planLogisticsRoadSteps.
 *   - ColonyPlanner.buildPlannerPrompt — surfaces a "## Threat Posture"
 *     section so the LLM can emit equivalent steps.
 *
 * Threat metric source: `state.metrics.combat`. Computed lazily via
 * `computeThreatPosture(state)` so callers don't need a new ECS system —
 * the existing AnimalAISystem populates `state.metrics.combat` per tick.
 */

import { ANIMAL_KIND } from "../../../config/constants.js";
import { BALANCE } from "../../../config/balance.js";

/**
 * Compute the live combat posture from `state.animals` and worker roles.
 * Returns a snapshot suitable for both `state.metrics.combat` and
 * `formatThreatHintForLLM`. Pure read.
 *
 * @param {object} state
 * @returns {{
 *   activeThreats:number,
 *   activeRaiders:number,
 *   activePredators:number,
 *   guardCount:number,
 *   workerCount:number,
 *   nearestThreatDistance:number,
 * }}
 */
export function computeThreatPosture(state) {
  const animals = Array.isArray(state?.animals) ? state.animals : [];
  let activeRaiders = 0;
  let activePredators = 0;
  for (const a of animals) {
    if (!a || a.alive === false) continue;
    if (a.kind !== ANIMAL_KIND.PREDATOR) continue;
    activePredators += 1;
    if (String(a.species ?? "") === "raider_beast") activeRaiders += 1;
  }
  const agents = Array.isArray(state?.agents) ? state.agents : [];
  let guardCount = 0;
  let workerCount = 0;
  for (const w of agents) {
    if (!w || w.alive === false) continue;
    if (w.type !== "WORKER") continue;
    workerCount += 1;
    if (w.role === "GUARD") guardCount += 1;
  }

  // Find nearest threat to any worker (cheap O(W*P)).
  let nearest = Infinity;
  for (const w of agents) {
    if (!w || w.alive === false || w.type !== "WORKER") continue;
    for (const a of animals) {
      if (!a || a.alive === false || a.kind !== ANIMAL_KIND.PREDATOR) continue;
      const dx = a.x - w.x;
      const dz = a.z - w.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearest) nearest = d2;
    }
  }
  const nearestThreatDistance = nearest === Infinity ? -1 : Math.sqrt(nearest);

  return {
    activeThreats: activePredators,
    activeRaiders,
    activePredators,
    guardCount,
    workerCount,
    nearestThreatDistance,
  };
}

/**
 * Default trigger thresholds for `planThreatResponseSteps`.
 *
 * `proximityTiles` is the maximum distance (world units) between any
 * worker and the nearest predator at which we will pre-pend GUARD steps.
 * This prevents a far-off predator from triggering a panic plan-injection
 * during early-game when 1 predator spawns naturally per scenario.
 */
export const THREAT_RESPONSE_TRIGGERS = Object.freeze({
  activeThreatsThreshold: Number(BALANCE.threatActiveThreshold ?? 1),
  guardCap: Number(BALANCE.threatGuardCap ?? 4),
  targetGuardsPerThreat: Number(BALANCE.targetGuardsPerThreat ?? 1),
  proximityTiles: 8,
  // Cap injected steps per plan so threat steps don't crowd out the rest.
  maxStepsPerPlan: 2,
});

/**
 * Top-level helper: read `state.metrics.combat` (or compute it) and, when
 * activeThreats >= threshold, return an ordered list of threat-response
 * steps. Each step is shaped like ColonyPlanner step output:
 *   { type: "promote_guard", priority, reason, role, hint }
 *
 * Returns `[]` when threats don't warrant intervention OR when the colony
 * has no spare workers (workerCount <= 1 — keep at least one farmer).
 *
 * Pure function: does NOT mutate state.
 *
 * @param {object} state
 * @param {object} [opts]
 * @returns {Array<{type:string, priority:string, reason:string, role:string, hint:string}>}
 */
export function planThreatResponseSteps(state, opts = {}) {
  if (!state) return [];
  const triggers = {
    activeThreatsThreshold: opts.activeThreatsThreshold ?? THREAT_RESPONSE_TRIGGERS.activeThreatsThreshold,
    guardCap: opts.guardCap ?? THREAT_RESPONSE_TRIGGERS.guardCap,
    targetGuardsPerThreat: opts.targetGuardsPerThreat ?? THREAT_RESPONSE_TRIGGERS.targetGuardsPerThreat,
    proximityTiles: opts.proximityTiles ?? THREAT_RESPONSE_TRIGGERS.proximityTiles,
    maxStepsPerPlan: opts.maxStepsPerPlan ?? THREAT_RESPONSE_TRIGGERS.maxStepsPerPlan,
  };

  // Always recompute posture here (cheap) so the proximity check has live
  // data even if `state.metrics.combat` was set without distance info.
  const combat = computeThreatPosture(state);
  const activeThreats = Number(combat.activeThreats ?? 0);
  const guardCount = Number(combat.guardCount ?? 0);
  const workerCount = Number(combat.workerCount ?? 0);
  const nearest = Number(combat.nearestThreatDistance ?? -1);

  if (activeThreats < triggers.activeThreatsThreshold) return [];
  if (workerCount <= 1) return [];
  // Proximity gate: a far-off predator is not actually threatening the
  // colony yet — wait until it closes within `proximityTiles` before we
  // start grabbing workers off the economy. This prevents the natural
  // 1-predator-per-scenario spawn from triggering a GUARD-promotion plan
  // on tick 1.
  if (nearest > triggers.proximityTiles) return [];

  // Target = min(threats × per-threat, cap, workerCount-1).
  const desiredGuards = Math.min(
    activeThreats * triggers.targetGuardsPerThreat,
    triggers.guardCap,
    Math.max(0, workerCount - 1),
  );
  const need = Math.max(0, desiredGuards - guardCount);
  if (need <= 0) return [];

  const steps = [];
  const emit = Math.min(need, triggers.maxStepsPerPlan);
  for (let i = 0; i < emit; i += 1) {
    steps.push({
      type: "promote_guard",
      priority: "critical",
      reason: `Threat posture: ${activeThreats} active raider${activeThreats > 1 ? "s" : ""}, ${guardCount} guard${guardCount === 1 ? "" : "s"} on watch — promote one worker to GUARD.`,
      role: "GUARD",
      hint: "guard",
    });
  }
  return steps;
}

/**
 * Format a one-line LLM hint summarising current combat posture so the LLM
 * can prefer GUARD promotions / wall hints over more buildings while
 * threats are active. Returns "" when posture is calm.
 */
export function formatThreatHintForLLM(state) {
  const combat = state?.metrics?.combat ?? computeThreatPosture(state);
  const activeThreats = Number(combat.activeThreats ?? 0);
  if (activeThreats <= 0) return "";
  const raiders = Number(combat.activeRaiders ?? 0);
  const guards = Number(combat.guardCount ?? 0);
  const dist = Number(combat.nearestThreatDistance ?? -1);
  const distStr = dist > 0 ? ` nearest=${dist.toFixed(1)}t` : "";
  const raiderStr = raiders > 0 ? ` (incl. ${raiders} raider-beast)` : "";
  return `Threat posture: ${activeThreats} active predator${activeThreats > 1 ? "s" : ""}${raiderStr}${distStr}, ${guards} guard${guards === 1 ? "" : "s"} on watch. Promote workers to GUARD or build walls before more economy steps.`;
}
