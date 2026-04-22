import { BALANCE } from "../../config/balance.js";
import { ROLE } from "../../config/constants.js";


function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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

    // Dynamic resource balance: proportionally shift ratio toward the deficit resource
    if (!emergency) {
      const food = state.resources.food ?? 0;
      const wood = state.resources.wood ?? 0;
      const total = food + wood;
      if (total > 0) {
        // Current food share vs target (0.5 = balanced)
        const foodShare = food / total;
        // Shift away from the surplus: if foodShare > 0.5, reduce farm ratio
        const imbalance = (foodShare - 0.5) * 0.4; // scale factor
        effectiveRatio = clamp(effectiveRatio - imbalance, 0.25, 0.85);
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
