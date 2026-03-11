export function evaluateRunOutcomeState(state) {
  const objectiveCount = Array.isArray(state.gameplay?.objectives) ? state.gameplay.objectives.length : 0;
  const objectiveIndex = Number(state.gameplay?.objectiveIndex ?? 0);
  if (objectiveCount > 0 && objectiveIndex >= objectiveCount) {
    return {
      outcome: "win",
      reason: "All objectives completed. Colony is stable.",
      actionMessage: "Victory achieved. You can restart or reset.",
      actionKind: "success",
    };
  }

  const workers = Number(
    state.metrics?.populationStats?.workers
      ?? state.agents?.filter((agent) => agent.type === "WORKER" && agent.alive !== false).length
      ?? 0,
  );
  const food = Number(state.resources?.food ?? 0);
  const wood = Number(state.resources?.wood ?? 0);
  const prosperity = Number(state.gameplay?.prosperity ?? 0);
  const threat = Number(state.gameplay?.threat ?? 0);

  let reason = "";
  if (workers <= 0) {
    reason = "All workers are gone.";
  } else if (food <= 0 && wood <= 0) {
    reason = "Both food and wood reached zero.";
  } else if (prosperity <= 8 && threat >= 92) {
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
