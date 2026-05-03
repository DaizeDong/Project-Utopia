import { BALANCE } from "../config/balance.js";

// v0.8.0 Phase 4 — Survival Mode.
// The "win" outcome has been retired. Runs continue until the colony is
// wiped (no remaining agents) or the collapse spiral fires. Outcomes here
// return one of { outcome: "loss", ... } | null. Callers map "in progress"
// to session.outcome === "none".

// v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 7) — devTier bucket. Pure
// function on the gameplay.devIndex scalar so GameStateOverlay's finale
// title can branch on a stable enum without re-deriving thresholds at the
// render site. Buckets match the plan's 4-band split (low/mid/high/elite).
//
// This function intentionally returns a string and accepts ANY input so the
// outcome schema stays additive (Risk #3 — no break to existing
// snapshot/Object.keys consumers; new field, no rewrite).
export function deriveDevTier(devIndex) {
  const v = Number(devIndex);
  if (!Number.isFinite(v)) return "low";
  if (v < 25) return "low";
  if (v < 50) return "mid";
  if (v < 75) return "high";
  return "elite";
}

export function evaluateRunOutcomeState(state) {
  const workers = Number(
    state.metrics?.populationStats?.workers
      ?? state.agents?.filter((agent) => agent.type === "WORKER" && agent.alive !== false).length
      ?? 0,
  );

  // Colony-wiped is the authoritative loss condition in survival mode.
  // v0.8.0 Phase 4 iteration M4: only WORKER agents count — animals and
  // visitors surviving alone do not save the colony.
  if (workers <= 0) {
    return {
      outcome: "loss",
      reason: "Colony wiped — no surviving colonists.",
      actionMessage: "Run ended: the colony was wiped out.",
      actionKind: "error",
      // v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 7) — devTier additive
      // field. Read by GameStateOverlay finale ceremony to branch the title.
      devTier: deriveDevTier(state?.gameplay?.devIndex),
    };
  }

  const food = Number(state.resources?.food ?? 0);
  const wood = Number(state.resources?.wood ?? 0);
  const prosperity = Number(state.gameplay?.prosperity ?? 0);
  const threat = Number(state.gameplay?.threat ?? 0);
  const carryInTransit = Number(state.metrics?.logistics?.totalCarryInTransit ?? 0);
  const carryingWorkers = Number(state.metrics?.logistics?.carryingWorkers ?? 0);
  const simTime = Number(state.metrics?.simTimeSec ?? 0);

  let reason = "";
  if (
    food <= 0
    && wood <= 0
    && carryingWorkers <= 0
    && carryInTransit <= Number(BALANCE.resourceCollapseCarryGrace ?? 0.5)
  ) {
    reason = "Both food and wood reached zero with no supply still in transit.";
  } else if (
    simTime >= Number(BALANCE.lossGracePeriodSec ?? 90)
    && prosperity <= 8
    && threat >= 92
  ) {
    reason = "Colony collapsed under low prosperity and extreme threat.";
  }
  if (!reason) return null;

  return {
    outcome: "loss",
    reason,
    actionMessage: `Run ended: ${reason}`,
    actionKind: "error",
    // v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 7) — devTier additive field.
    devTier: deriveDevTier(state?.gameplay?.devIndex),
  };
}

/**
 * R9 PV §5.3 — Plan-Cascade-Mitigation Step 4. Pure helper invoked by
 * GameApp#evaluateRunOutcome to prepend a famine chronicle entry when the
 * end-of-run death distribution is starvation-dominated. Mutates
 * `state.gameplay.objectiveLog` in place; idempotent via the head-prefix
 * check ("Famine —") so repeated invocations don't multiply the entry.
 * Returns true if an entry was added.
 */
export function maybeRecordFamineChronicle(state) {
  try {
    const reasons = state?.metrics?.deathsByReason ?? {};
    const starvationDeaths = Number(reasons.starvation ?? 0);
    const totalDeaths = Number(state?.metrics?.deathsTotal ?? 0);
    if (totalDeaths < 1 || starvationDeaths < 0.5 * totalDeaths) return false;
    state.gameplay ??= {};
    if (!Array.isArray(state.gameplay.objectiveLog)) state.gameplay.objectiveLog = [];
    const log = state.gameplay.objectiveLog;
    const head = String(log[0] ?? "");
    if (head.includes("Famine —")) return false;
    const t = Number(state?.metrics?.timeSec ?? 0).toFixed(1);
    log.unshift(`[${t}s] Famine — every colonist hungry, no reserves (${starvationDeaths}/${totalDeaths} deaths from starvation).`);
    state.gameplay.objectiveLog = log.slice(0, 24);
    return true;
  } catch {
    return false;
  }
}
