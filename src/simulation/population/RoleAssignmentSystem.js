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

    // Count existing building types
    const quarryCount = Number(state.buildings?.quarries ?? 0);
    const kitchenCount = Number(state.buildings?.kitchens ?? 0);
    const smithyCount = Number(state.buildings?.smithies ?? 0);
    const herbGardenCount = Number(state.buildings?.herbGardens ?? 0);
    const clinicCount = Number(state.buildings?.clinics ?? 0);
    const lumberCount = Number(state.buildings?.lumbers ?? 0);

    // Reserve minimum slots for FARM (2) and WOOD (1 if lumber tiles exist)
    const farmMin = Math.min(2, n);
    const woodMin = (lumberCount > 0) ? Math.min(1, n - farmMin) : 0;
    const reserved = farmMin + woodMin;

    // Allocate specialist roles from remaining pool (capped at 1 per type for gathering,
    // 1 per processing building type)
    let specialistBudget = Math.max(0, n - reserved);

    const cookSlots = (kitchenCount > 0 && specialistBudget > 0) ? 1 : 0;
    specialistBudget -= cookSlots;

    const smithSlots = (smithyCount > 0 && specialistBudget > 0) ? 1 : 0;
    specialistBudget -= smithSlots;

    const herbalistSlots = (clinicCount > 0 && specialistBudget > 0) ? 1 : 0;
    specialistBudget -= herbalistSlots;

    const stoneSlots = Math.min(quarryCount > 0 ? 1 : 0, specialistBudget);
    specialistBudget -= stoneSlots;

    const herbsSlots = Math.min(herbGardenCount > 0 ? 1 : 0, specialistBudget);
    specialistBudget -= herbsSlots;

    // HAUL role: assign 1 hauler when there are multiple warehouses and enough workers
    const warehouseCount = Number(state.buildings?.warehouses ?? 0);
    const haulSlots = (warehouseCount >= 1 && n >= 10 && specialistBudget > 0) ? 1 : 0;
    specialistBudget -= haulSlots;

    // Distribute remaining between FARM and WOOD using targetFarmRatio
    const remaining = farmMin + woodMin + specialistBudget;
    const emergency = state.resources.food < BALANCE.foodEmergencyThreshold;
    let effectiveRatio = emergency ? Math.max(targetFarmRatio, 0.82) : targetFarmRatio;

    // Dynamic resource balance: shift ratio when food/wood are imbalanced
    if (!emergency) {
      const food = state.resources.food ?? 0;
      const wood = state.resources.wood ?? 0;
      if (food > wood * 1.8 && wood < 50) {
        effectiveRatio = Math.max(0.25, effectiveRatio - 0.20); // shift to more wood workers
      } else if (wood > food * 1.8 && food < 40) {
        effectiveRatio = Math.min(0.85, effectiveRatio + 0.15); // shift to more farm workers
      }
    }
    let totalFarm = Math.round(remaining * effectiveRatio);
    totalFarm = Math.max(farmMin, Math.min(remaining, totalFarm));
    if (remaining - totalFarm < woodMin) {
      totalFarm = Math.max(farmMin, remaining - woodMin);
    }
    let totalWood = remaining - totalFarm;

    // Assign roles in order
    let idx = 0;
    for (let i = 0; i < totalFarm && idx < n; i += 1) workers[idx++].role = ROLE.FARM;
    for (let i = 0; i < totalWood && idx < n; i += 1) workers[idx++].role = ROLE.WOOD;
    for (let i = 0; i < stoneSlots && idx < n; i += 1) workers[idx++].role = ROLE.STONE;
    for (let i = 0; i < herbsSlots && idx < n; i += 1) workers[idx++].role = ROLE.HERBS;
    for (let i = 0; i < cookSlots && idx < n; i += 1) workers[idx++].role = ROLE.COOK;
    for (let i = 0; i < smithSlots && idx < n; i += 1) workers[idx++].role = ROLE.SMITH;
    for (let i = 0; i < herbalistSlots && idx < n; i += 1) workers[idx++].role = ROLE.HERBALIST;
    for (let i = 0; i < haulSlots && idx < n; i += 1) workers[idx++].role = ROLE.HAUL;
    // Any leftover workers get FARM
    while (idx < n) workers[idx++].role = ROLE.FARM;
  }
}
