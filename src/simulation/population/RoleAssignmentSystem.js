import { BALANCE } from "../../config/balance.js";
import { ROLE } from "../../config/constants.js";

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
    targetFarmRatio = Math.max(0, Math.min(1, targetFarmRatio + doctrineBias));
    const workerPolicy = state.ai.groupPolicies.get("workers")?.data;
    if (workerPolicy?.intentWeights?.farm && workerPolicy?.intentWeights?.wood) {
      const farmW = Number(workerPolicy.intentWeights.farm);
      const woodW = Number(workerPolicy.intentWeights.wood);
      const sum = farmW + woodW;
      if (sum > 0) {
        targetFarmRatio = farmW / sum;
      }
    }

    const emergency = state.resources.food < BALANCE.foodEmergencyThreshold;
    const effectiveRatio = emergency ? Math.max(targetFarmRatio, 0.82) : targetFarmRatio;
    let farmN = Math.round(n * effectiveRatio);
    farmN = Math.max(0, Math.min(n, farmN));

    for (let i = 0; i < workers.length; i += 1) {
      workers[i].role = i < farmN ? ROLE.FARM : ROLE.WOOD;
    }
  }
}
