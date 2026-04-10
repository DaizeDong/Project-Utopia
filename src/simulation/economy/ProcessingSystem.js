import { TILE, ROLE } from "../../config/constants.js";
import { BALANCE } from "../../config/balance.js";
import { listTilesByType, worldToTile } from "../../world/grid/Grid.js";

export class ProcessingSystem {
  constructor() {
    this.name = "ProcessingSystem";
    // Track per-building processing cooldowns: Map<tileKey, { nextProcessSec }>
    this.buildingTimers = new Map();
  }

  update(dt, state) {
    const nowSec = state.metrics.timeSec ?? 0;

    // Process each building type
    this.#processKitchens(dt, state, nowSec);
    this.#processSmithies(dt, state, nowSec);
    this.#processClinics(dt, state, nowSec);
  }

  #tileKey(ix, iz) {
    return `${ix},${iz}`;
  }

  #hasWorkerAtTile(state, ix, iz, requiredRole) {
    // Check if any alive worker with the required role is within 1 tile Manhattan distance
    for (const agent of state.agents) {
      if (agent.type !== "WORKER" || agent.alive === false) continue;
      if (agent.role !== requiredRole) continue;
      const workerTile = worldToTile(agent.x, agent.z, state.grid);
      const dist = Math.abs(workerTile.ix - ix) + Math.abs(workerTile.iz - iz);
      if (dist <= 1) return true;
    }
    return false;
  }

  #tryProcess(state, nowSec, tileIx, tileIz, cycleSec, inputCheck, inputConsume, outputProduce, weatherMult = 1) {
    const key = this.#tileKey(tileIx, tileIz);
    // Apply tool bonus, night penalty, and weather to cycle time
    const toolMult = Number(state.gameplay?.toolProductionMultiplier ?? 1);
    const isNight = Boolean(state.environment?.isNight);
    const nightPenalty = isNight ? (1 / Number(BALANCE.workerNightProductivityMultiplier ?? 0.6)) : 1;
    const effectiveCycle = (cycleSec * nightPenalty * weatherMult) / toolMult;

    let timer = this.buildingTimers.get(key);
    if (!timer) {
      timer = { nextProcessSec: nowSec + effectiveCycle };
      this.buildingTimers.set(key, timer);
      return false;
    }
    if (nowSec < timer.nextProcessSec) return false;
    if (!inputCheck(state.resources)) return false;

    inputConsume(state.resources);
    outputProduce(state.resources);
    timer.nextProcessSec = nowSec + effectiveCycle;
    state.metrics.processingCycles = (state.metrics.processingCycles ?? 0) + 1;
    return true;
  }

  #processKitchens(dt, state, nowSec) {
    const kitchens = listTilesByType(state.grid, [TILE.KITCHEN]);
    const cycleSec = Number(BALANCE.kitchenCycleSec ?? 3);
    const foodCost = Number(BALANCE.kitchenFoodCost ?? 2);
    const mealOutput = Number(BALANCE.kitchenMealOutput ?? 1);
    // Kitchen is indoor — no weather penalty
    const weatherMult = 1;

    for (const tile of kitchens) {
      if (!this.#hasWorkerAtTile(state, tile.ix, tile.iz, ROLE.COOK)) continue;
      this.#tryProcess(state, nowSec, tile.ix, tile.iz, cycleSec,
        (res) => res.food >= foodCost,
        (res) => { res.food -= foodCost; },
        (res) => { res.meals = (res.meals ?? 0) + mealOutput; },
        weatherMult,
      );
    }
  }

  #processSmithies(dt, state, nowSec) {
    const smithies = listTilesByType(state.grid, [TILE.SMITHY]);
    const cycleSec = Number(BALANCE.smithyCycleSec ?? 8);
    const stoneCost = Number(BALANCE.smithyStoneCost ?? 3);
    const woodCost = Number(BALANCE.smithyWoodCost ?? 2);
    const toolOutput = Number(BALANCE.smithyToolOutput ?? 1);
    // Smithy is outdoor forge — storms slow it, rain slightly
    const weather = state.weather?.current ?? "clear";
    const weatherMult = weather === "storm" ? 1.3 : weather === "rain" ? 1.1 : 1;

    for (const tile of smithies) {
      if (!this.#hasWorkerAtTile(state, tile.ix, tile.iz, ROLE.SMITH)) continue;
      this.#tryProcess(state, nowSec, tile.ix, tile.iz, cycleSec,
        (res) => res.stone >= stoneCost && res.wood >= woodCost,
        (res) => { res.stone -= stoneCost; res.wood -= woodCost; },
        (res) => { res.tools = (res.tools ?? 0) + toolOutput; },
        weatherMult,
      );
    }
  }

  #processClinics(dt, state, nowSec) {
    const clinics = listTilesByType(state.grid, [TILE.CLINIC]);
    const cycleSec = Number(BALANCE.clinicCycleSec ?? 4);
    const herbsCost = Number(BALANCE.clinicHerbsCost ?? 2);
    const medicineOutput = Number(BALANCE.clinicMedicineOutput ?? 1);
    // Clinic benefits from rain (humid herbs), drought slows it
    const weather = state.weather?.current ?? "clear";
    const weatherMult = weather === "rain" ? 0.9 : weather === "drought" ? 1.2 : weather === "storm" ? 1.3 : 1;

    for (const tile of clinics) {
      if (!this.#hasWorkerAtTile(state, tile.ix, tile.iz, ROLE.HERBALIST)) continue;
      this.#tryProcess(state, nowSec, tile.ix, tile.iz, cycleSec,
        (res) => res.herbs >= herbsCost,
        (res) => { res.herbs -= herbsCost; },
        (res) => { res.medicine = (res.medicine ?? 0) + medicineOutput; },
        weatherMult,
      );
    }
  }
}
