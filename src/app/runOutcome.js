import { BALANCE } from "../config/balance.js";

// v0.8.0 Phase 4 — Survival Mode.
// The "win" outcome has been retired. Runs continue until the colony is
// wiped (no remaining agents) or the collapse spiral fires. Outcomes here
// return one of { outcome: "loss", ... } | null. Callers map "in progress"
// to session.outcome === "none".
export function evaluateRunOutcomeState(state) {
  const aliveAgents = Array.isArray(state.agents)
    ? state.agents.filter((agent) => agent && agent.alive !== false).length
    : 0;
  const workers = Number(
    state.metrics?.populationStats?.workers
      ?? state.agents?.filter((agent) => agent.type === "WORKER" && agent.alive !== false).length
      ?? 0,
  );

  // Colony-wiped is the authoritative loss condition in survival mode.
  if (aliveAgents <= 0) {
    return {
      outcome: "loss",
      reason: "Colony wiped — no surviving colonists.",
      actionMessage: "Run ended: the colony was wiped out.",
      actionKind: "error",
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
  if (workers <= 0) {
    reason = "All workers are gone.";
  } else if (
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
  };
}
