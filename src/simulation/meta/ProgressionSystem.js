import { createWorker } from "../../entities/EntityFactory.js";
import { randomPassableTile, tileToWorld } from "../../world/grid/Grid.js";
import { getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";

const DOCTRINE_PRESETS = Object.freeze({
  balanced: {
    id: "balanced",
    name: "Balanced Council",
    farmYield: 1.0,
    lumberYield: 1.0,
    tradeYield: 1.0,
    sabotageResistance: 1.0,
    threatDamp: 1.0,
    farmBias: 0,
  },
  agrarian: {
    id: "agrarian",
    name: "Agrarian Commune",
    farmYield: 1.2,
    lumberYield: 0.92,
    tradeYield: 0.95,
    sabotageResistance: 0.95,
    threatDamp: 0.96,
    farmBias: 0.14,
  },
  industry: {
    id: "industry",
    name: "Industrial Guild",
    farmYield: 0.9,
    lumberYield: 1.22,
    tradeYield: 1.05,
    sabotageResistance: 0.97,
    threatDamp: 1.02,
    farmBias: -0.14,
  },
  fortress: {
    id: "fortress",
    name: "Fortress Doctrine",
    farmYield: 0.94,
    lumberYield: 1.0,
    tradeYield: 0.9,
    sabotageResistance: 1.22,
    threatDamp: 0.85,
    farmBias: 0.07,
  },
  trade: {
    id: "trade",
    name: "Mercantile League",
    farmYield: 0.96,
    lumberYield: 0.96,
    tradeYield: 1.26,
    sabotageResistance: 0.93,
    threatDamp: 1.06,
    farmBias: 0,
  },
});

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function logObjective(state, text) {
  const msg = `[${state.metrics.timeSec.toFixed(1)}s] ${text}`;
  state.gameplay.objectiveLog.unshift(msg);
  state.gameplay.objectiveLog = state.gameplay.objectiveLog.slice(0, 24);
}

function applyObjectiveReward(state, objective) {
  if (objective.id === "logistics-1") {
    state.resources.food += 18;
    state.resources.wood += 18;
  } else if (objective.id === "stockpile-1") {
    for (let i = 0; i < 4; i += 1) {
      const tile = randomPassableTile(state.grid);
      const p = tileToWorld(tile.ix, tile.iz, state.grid);
      state.agents.push(createWorker(p.x, p.z));
    }
  } else if (objective.id === "stability-1") {
    for (const key of Object.keys(state.gameplay.modifiers)) {
      state.gameplay.modifiers[key] *= 1.08;
    }
  }
}

function updateObjectiveProgress(state, dt) {
  const objectives = state.gameplay.objectives;
  const idx = state.gameplay.objectiveIndex;
  if (idx >= objectives.length) return;
  const objective = objectives[idx];
  if (objective.completed) {
    state.gameplay.objectiveIndex += 1;
    return;
  }

  if (objective.id === "logistics-1") {
    const runtime = getScenarioRuntime(state);
    const routeP = runtime.routes.length > 0 ? runtime.connectedRoutes / runtime.routes.length : 1;
    const depotP = runtime.depots.length > 0 ? runtime.readyDepots / runtime.depots.length : 1;
    const wP = clamp(runtime.counts.warehouses / Math.max(1, runtime.logisticsTargets.warehouses), 0, 1);
    const fP = clamp(runtime.counts.farms / Math.max(1, runtime.logisticsTargets.farms), 0, 1);
    const lP = clamp(runtime.counts.lumbers / Math.max(1, runtime.logisticsTargets.lumbers), 0, 1);
    const rP = clamp(runtime.counts.roads / Math.max(1, runtime.logisticsTargets.roads), 0, 1);
    const wallTarget = Math.max(0, Number(runtime.logisticsTargets.walls ?? 0));
    const wallP = wallTarget > 0 ? clamp(runtime.counts.walls / wallTarget, 0, 1) : 1;
    objective.progress = Number((Math.min(routeP, depotP, wP, fP, lP, rP, wallP) * 100).toFixed(1));

    const missingRoute = runtime.routes.find((route) => !route.connected);
    const missingDepot = runtime.depots.find((depot) => !depot.ready);
    state.gameplay.objectiveHint = missingRoute
      ? missingRoute.hint
      : missingDepot
        ? missingDepot.hint
        : runtime.scenario?.hintCopy?.afterRoutes
          ?? `Expand to ${runtime.logisticsTargets.warehouses} warehouses, ${runtime.logisticsTargets.farms} farms, ${runtime.logisticsTargets.lumbers} lumbers, and ${runtime.logisticsTargets.roads} roads.`;

    if (routeP >= 1 && depotP >= 1 && wP >= 1 && fP >= 1 && lP >= 1 && rP >= 1 && wallP >= 1) {
      objective.completed = true;
      logObjective(state, `Objective complete: ${objective.title}`);
      applyObjectiveReward(state, objective);
      state.gameplay.objectiveIndex += 1;
      state.gameplay.objectiveHint = runtime.scenario?.hintCopy?.afterLogistics ?? "Starter logistics online. Refill the stockpile.";
      state.controls.actionMessage = `Objective complete: ${objective.title}`;
      state.controls.actionKind = "success";
    }
    return;
  }

  if (objective.id === "stockpile-1") {
    const runtime = getScenarioRuntime(state);
    const foodP = clamp(state.resources.food / Math.max(1, runtime.stockpileTargets.food), 0, 1);
    const woodP = clamp(state.resources.wood / Math.max(1, runtime.stockpileTargets.wood), 0, 1);
    objective.progress = Number((Math.min(foodP, woodP) * 100).toFixed(1));
    state.gameplay.objectiveHint = runtime.scenario?.hintCopy?.afterLogistics
      ?? `Grow reserves to ${runtime.stockpileTargets.food} food and ${runtime.stockpileTargets.wood} wood.`;
    if (foodP >= 1 && woodP >= 1) {
      objective.completed = true;
      logObjective(state, `Objective complete: ${objective.title}`);
      applyObjectiveReward(state, objective);
      state.gameplay.objectiveIndex += 1;
      state.gameplay.objectiveHint = runtime.scenario?.hintCopy?.afterStockpile ?? "Fortify the colony and hold stability under pressure.";
      state.controls.actionMessage = `Objective complete: ${objective.title}`;
      state.controls.actionKind = "success";
    }
    return;
  }

  if (objective.id === "stability-1") {
    const runtime = getScenarioRuntime(state);
    const target = runtime.stabilityTargets;
    const wallsReady = runtime.counts.walls >= target.walls;
    const stable = wallsReady && state.gameplay.prosperity >= target.prosperity && state.gameplay.threat <= target.threat;
    if (stable) {
      state.gameplay.objectiveHoldSec += dt;
    } else {
      state.gameplay.objectiveHoldSec = Math.max(0, state.gameplay.objectiveHoldSec - dt * 0.6);
    }
    const wallP = clamp(runtime.counts.walls / Math.max(1, target.walls), 0, 1);
    const holdP = clamp(state.gameplay.objectiveHoldSec / Math.max(1, target.holdSec), 0, 1);
    objective.progress = Number((Math.min(wallP, holdP) * 100).toFixed(1));
    state.gameplay.objectiveHint = !wallsReady
      ? `Build ${target.walls} walls to secure the current scenario.`
      : `Hold prosperity >= ${target.prosperity} and threat <= ${target.threat} for ${target.holdSec} seconds.`;
    if (state.gameplay.objectiveHoldSec >= target.holdSec && wallsReady) {
      objective.completed = true;
      logObjective(state, `Objective complete: ${objective.title}`);
      applyObjectiveReward(state, objective);
      state.gameplay.objectiveIndex += 1;
      state.gameplay.objectiveHint = runtime.scenario?.hintCopy?.completed ?? "All objectives completed.";
      state.controls.actionMessage = `Objective complete: ${objective.title}`;
      state.controls.actionKind = "success";
    }
  }
}

function computeProsperity(state) {
  const resScore = clamp((state.resources.food + state.resources.wood) / 300, 0, 1) * 45;
  const infraScore = clamp((state.buildings.warehouses * 3 + state.buildings.farms + state.buildings.lumbers) / 30, 0, 1) * 32;
  const weatherPenalty = state.weather.current === "storm" ? 10 : state.weather.current === "drought" ? 8 : 0;
  const eventPenalty = state.events.active.length * 2.6;
  return clamp(resScore + infraScore - weatherPenalty - eventPenalty + 18, 0, 100);
}

function computeThreat(state) {
  const predators = state.animals.filter((a) => a.kind === "PREDATOR").length;
  const sabotageEvents = state.events.active.filter((e) => e.type === "sabotage").length;
  const lowFoodPenalty = state.resources.food < 25 ? (25 - state.resources.food) * 0.8 : 0;
  const wallMitigation = clamp(state.buildings.walls / 120, 0, 1) * 18;
  const chaos = clamp(state.debug.boids?.avgNeighbors ?? 0, 0, 4) * 6;
  return clamp(18 + predators * 2.5 + sabotageEvents * 7 + lowFoodPenalty + chaos - wallMitigation, 0, 100);
}

function applyDoctrine(state) {
  const doctrineId = state.controls.doctrine ?? "balanced";
  const preset = DOCTRINE_PRESETS[doctrineId] ?? DOCTRINE_PRESETS.balanced;
  state.gameplay.doctrine = preset.id;
  state.gameplay.modifiers = {
    farmYield: preset.farmYield,
    lumberYield: preset.lumberYield,
    tradeYield: preset.tradeYield,
    sabotageResistance: preset.sabotageResistance,
    threatDamp: preset.threatDamp,
    farmBias: preset.farmBias,
  };
}

export class ProgressionSystem {
  constructor() {
    this.name = "ProgressionSystem";
  }

  update(dt, state) {
    applyDoctrine(state);
    const targetProsperity = computeProsperity(state);
    const targetThreat = computeThreat(state) * state.gameplay.modifiers.threatDamp;
    state.gameplay.prosperity = state.gameplay.prosperity * 0.95 + targetProsperity * 0.05;
    state.gameplay.threat = state.gameplay.threat * 0.92 + targetThreat * 0.08;
    state.gameplay.prosperity = clamp(state.gameplay.prosperity, 0, 100);
    state.gameplay.threat = clamp(state.gameplay.threat, 0, 100);

    updateObjectiveProgress(state, dt);
  }
}

export function getDoctrinePresets() {
  return Object.values(DOCTRINE_PRESETS);
}
