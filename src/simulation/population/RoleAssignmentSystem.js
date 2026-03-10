import { BALANCE } from "../../config/balance.js";
import { ROLE } from "../../config/constants.js";
import { getDoctrineAdjustedTargets } from "../meta/ProgressionSystem.js";
import { getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function ratioFromDemand(farmDemand, woodDemand) {
  const total = Number(farmDemand ?? 0) + Number(woodDemand ?? 0);
  if (total <= 0) return null;
  return clamp(
    Number(farmDemand ?? 0) / total,
    BALANCE.objectiveFarmRatioMin,
    BALANCE.objectiveFarmRatioMax,
  );
}

function getObjectiveFarmRatio(state) {
  const objective = state.gameplay?.objectives?.[state.gameplay.objectiveIndex] ?? null;
  if (!objective || objective.completed) return null;

  const runtime = getScenarioRuntime(state);
  const targets = getDoctrineAdjustedTargets(state, runtime);
  if (objective.id === "logistics-1") {
    const farmGap = Math.max(0, targets.logistics.farms - runtime.counts.farms);
    const lumberGap = Math.max(0, targets.logistics.lumbers - runtime.counts.lumbers);
    return ratioFromDemand(farmGap * 14, lumberGap * 14);
  }

  if (objective.id === "stockpile-1") {
    const foodGap = Math.max(0, targets.stockpile.food - Number(state.resources.food ?? 0));
    const woodGap = Math.max(0, targets.stockpile.wood - Number(state.resources.wood ?? 0));
    return ratioFromDemand(foodGap, woodGap);
  }

  if (objective.id === "stability-1") {
    const foodPressure = Math.max(0, BALANCE.foodEmergencyThreshold - Number(state.resources.food ?? 0)) * 2.5;
    const prosperityPressure = Math.max(0, targets.stability.prosperity - Number(state.gameplay.prosperity ?? 0)) * 1.6;
    const wallGap = Math.max(0, targets.stability.walls - runtime.counts.walls) * 10;
    const threatPressure = Math.max(0, Number(state.gameplay.threat ?? 0) - targets.stability.threat) * 0.8;
    return ratioFromDemand(foodPressure + prosperityPressure, wallGap + threatPressure);
  }

  return null;
}

export class RoleAssignmentSystem {
  constructor() {
    this.name = "RoleAssignmentSystem";
    this.timer = 0;
  }

  update(dt, state) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = BALANCE.managerIntervalSec;

    const workers = state.agents.filter((a) => a.type === "WORKER");
    const n = workers.length;
    if (n === 0) return;

    let targetFarmRatio = state.controls.farmRatio;
    const doctrineBias = Number(state.gameplay?.modifiers?.farmBias ?? 0);
    targetFarmRatio = clamp(targetFarmRatio + doctrineBias, 0, 1);
    const workerPolicy = state.ai.groupPolicies.get("workers")?.data;
    if (workerPolicy?.intentWeights?.farm && workerPolicy?.intentWeights?.wood) {
      const farmW = Number(workerPolicy.intentWeights.farm);
      const woodW = Number(workerPolicy.intentWeights.wood);
      const sum = farmW + woodW;
      if (sum > 0) {
        targetFarmRatio = farmW / sum;
      }
    }

    const objectiveFarmRatio = getObjectiveFarmRatio(state);
    if (objectiveFarmRatio !== null) {
      const influence = clamp(BALANCE.objectiveRoleBiasWeight, 0, 1);
      targetFarmRatio = targetFarmRatio * (1 - influence) + objectiveFarmRatio * influence;
    }
    targetFarmRatio = clamp(targetFarmRatio, BALANCE.objectiveFarmRatioMin, BALANCE.objectiveFarmRatioMax);

    const emergency = state.resources.food < BALANCE.foodEmergencyThreshold;
    const effectiveRatio = emergency ? Math.max(targetFarmRatio, 0.82) : targetFarmRatio;
    let farmN = Math.round(n * effectiveRatio);
    farmN = Math.max(0, Math.min(n, farmN));

    for (let i = 0; i < workers.length; i += 1) {
      workers[i].role = i < farmN ? ROLE.FARM : ROLE.WOOD;
    }
  }
}
