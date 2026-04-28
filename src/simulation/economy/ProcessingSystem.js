import { TILE, ROLE } from "../../config/constants.js";
import { BALANCE } from "../../config/balance.js";
import { listTilesByType, worldToTile } from "../../world/grid/Grid.js";
import { recordResourceFlow } from "./ResourceSystem.js";

export class ProcessingSystem {
  constructor() {
    this.name = "ProcessingSystem";
    // Track per-building processing cooldowns: Map<tileKey, { nextProcessSec }>
    this.buildingTimers = new Map();
    // Reused every tick — length=0 reset avoids GC pressure from new Array.
    this.snapshotBuffer = [];
    // v0.8.3 weather-transition cleanup (Bug E) — track the last weather
    // transition simSec we observed. WeatherSystem stamps
    // state.weather.lastTransitionSec on each weather change; when our
    // observed value lags, we wipe `buildingTimers` so pending cooldowns
    // don't finish at the old weather's effective cycle. Worst case the
    // transition tick costs one missed processing event per active
    // kitchen/smithy/clinic — much smaller than the desync drift it
    // prevents.
    this._lastWeatherSeenSec = -1;
  }

  update(dt, state) {
    const nowSec = state.metrics.timeSec ?? 0;

    // Bug E (weather transition) — wipe stale cooldown timers when weather
    // changed since our last tick. See constructor comment.
    this.#drainWeatherTransition(state);

    // Process each building type
    this.#processKitchens(dt, state, nowSec);
    this.#processSmithies(dt, state, nowSec);
    this.#processClinics(dt, state, nowSec);
    this.#emitSnapshot(state, nowSec);
  }

  #drainWeatherTransition(state) {
    const lastTransition = Number(state?.weather?.lastTransitionSec ?? -1);
    if (!Number.isFinite(lastTransition) || lastTransition < 0) return;
    if (lastTransition <= this._lastWeatherSeenSec) return;
    this._lastWeatherSeenSec = lastTransition;
    // Simple-and-correct: clear all timers so each building rebuilds its
    // cooldown at the new weather's effective rate next tick.
    this.buildingTimers.clear();
  }

  #tileKey(ix, iz) {
    return `${ix},${iz}`;
  }

  #computeEffectiveCycle(state, kind) {
    const toolMult = Number(state.gameplay?.toolProductionMultiplier ?? 1);
    const isNight = Boolean(state.environment?.isNight);
    const nightPenalty = isNight ? (1 / Number(BALANCE.workerNightProductivityMultiplier ?? 0.6)) : 1;
    const weather = state.weather?.current ?? "clear";
    let cycleSec, weatherMult;
    if (kind === "kitchen") {
      cycleSec = Number(BALANCE.kitchenCycleSec ?? 3);
      weatherMult = 1;
    } else if (kind === "smithy") {
      cycleSec = Number(BALANCE.smithyCycleSec ?? 8);
      weatherMult = weather === "storm" ? 1.3 : weather === "rain" ? 1.1 : 1;
    } else {
      cycleSec = Number(BALANCE.clinicCycleSec ?? 4);
      weatherMult = weather === "rain" ? 0.9 : weather === "drought" ? 1.2 : weather === "storm" ? 1.3 : 1;
    }
    return (cycleSec * nightPenalty * weatherMult) / toolMult;
  }

  #emitSnapshot(state, nowSec) {
    this.snapshotBuffer.length = 0;
    const grid = state.grid;
    if (!grid?.tiles) { state.metrics.processing = this.snapshotBuffer; return; }

    const foodCost = Number(BALANCE.kitchenFoodCost ?? 2);
    const stoneCost = Number(BALANCE.smithyStoneCost ?? 3);
    const woodCost = Number(BALANCE.smithyWoodCost ?? 2);
    const herbsCost = Number(BALANCE.clinicHerbsCost ?? 2);
    const kindForTile = {
      [TILE.KITCHEN]: "kitchen",
      [TILE.SMITHY]: "smithy",
      [TILE.CLINIC]: "clinic",
    };
    const roleForKind = {
      kitchen: ROLE.COOK,
      smithy: ROLE.SMITH,
      clinic: ROLE.HERBALIST,
    };

    const { width, height, tiles } = grid;
    for (let iz = 0; iz < height; iz++) {
      for (let ix = 0; ix < width; ix++) {
        const tileType = tiles[ix + iz * width];
        const kind = kindForTile[tileType];
        if (!kind) continue;
        const key = this.#tileKey(ix, iz);
        const timer = this.buildingTimers.get(key);
        const effectiveCycle = this.#computeEffectiveCycle(state, kind);
        const remaining = timer ? (timer.nextProcessSec - nowSec) : effectiveCycle;
        const progress01 = (timer && effectiveCycle > 0)
          ? Math.min(1, Math.max(0, 1 - remaining / effectiveCycle))
          : 0;
        const etaSec = Math.max(0, remaining);
        const workerPresent = this.#hasWorkerAtTile(state, ix, iz, roleForKind[kind]);
        let inputOk;
        if (kind === "kitchen") {
          inputOk = (state.resources?.food ?? 0) >= foodCost;
        } else if (kind === "smithy") {
          inputOk = (state.resources?.stone ?? 0) >= stoneCost && (state.resources?.wood ?? 0) >= woodCost;
        } else {
          inputOk = (state.resources?.herbs ?? 0) >= herbsCost;
        }
        const stalled = !workerPresent || !inputOk;
        const stallReason = !workerPresent
          ? (kind === "kitchen" ? "no cook" : kind === "smithy" ? "no smith" : "no herbalist")
          : (!inputOk ? "input shortage" : null);
        this.snapshotBuffer.push({ kind, ix, iz, progress01, etaSec, workerPresent, stalled, stallReason, inputOk });
      }
    }
    state.metrics.processing = this.snapshotBuffer;
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
      // v0.8.2 Round-5 Wave-2 (01d Step 3): true-source emits — kitchen
      // consumes food and produces meals per cycle. Fires inside the
      // tryProcess callbacks only when a full cycle actually completes.
      this.#tryProcess(state, nowSec, tile.ix, tile.iz, cycleSec,
        (res) => res.food >= foodCost,
        (res) => {
          res.food -= foodCost;
          recordResourceFlow(state, "food", "consumed", foodCost);
        },
        (res) => {
          res.meals = (res.meals ?? 0) + mealOutput;
          recordResourceFlow(state, "meals", "produced", mealOutput);
        },
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
        (res) => {
          res.stone -= stoneCost;
          res.wood -= woodCost;
          recordResourceFlow(state, "stone", "consumed", stoneCost);
          recordResourceFlow(state, "wood", "consumed", woodCost);
        },
        (res) => {
          res.tools = (res.tools ?? 0) + toolOutput;
          recordResourceFlow(state, "tools", "produced", toolOutput);
        },
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
        (res) => {
          res.herbs -= herbsCost;
          recordResourceFlow(state, "herbs", "consumed", herbsCost);
        },
        (res) => {
          res.medicine = (res.medicine ?? 0) + medicineOutput;
          recordResourceFlow(state, "medicine", "produced", medicineOutput);
        },
        weatherMult,
      );
    }
  }
}
