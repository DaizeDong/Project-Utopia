import { BALANCE, TERRAIN_MECHANICS } from "../../config/balance.js";
import { createWorker } from "../../entities/EntityFactory.js";
import { TILE } from "../../config/constants.js";
import { randomPassableTile, tileToWorld, toIndex } from "../../world/grid/Grid.js";
import { getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";
import { emitEvent, EVENT_TYPES } from "./GameEventBus.js";

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
    logisticsTargets: { warehouses: 1.0, farms: 1.0, lumbers: 1.0, roads: 1.0, walls: 1.0 },
    stockpileTargets: { food: 1.0, wood: 1.0, prosperityFloor: 36 },
    stabilityTargets: { walls: 1.0, holdSec: 1.0, prosperityOffset: 0, threatOffset: 0 },
    recoveryPackage: { food: 20, wood: 14, threatRelief: 10, prosperityBoost: 8 },
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
    logisticsTargets: { warehouses: 1.0, farms: 1.18, lumbers: 0.82, roads: 1.0, walls: 0.92 },
    stockpileTargets: { food: 0.88, wood: 1.08, prosperityFloor: 38 },
    stabilityTargets: { walls: 0.94, holdSec: 1.06, prosperityOffset: 2, threatOffset: -2 },
    recoveryPackage: { food: 24, wood: 12, threatRelief: 8, prosperityBoost: 10 },
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
    logisticsTargets: { warehouses: 1.08, farms: 0.86, lumbers: 1.18, roads: 1.15, walls: 1.0 },
    stockpileTargets: { food: 1.08, wood: 0.86, prosperityFloor: 34 },
    stabilityTargets: { walls: 1.04, holdSec: 0.96, prosperityOffset: -1, threatOffset: 2 },
    recoveryPackage: { food: 16, wood: 20, threatRelief: 8, prosperityBoost: 8 },
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
    logisticsTargets: { warehouses: 0.96, farms: 0.96, lumbers: 1.0, roads: 0.94, walls: 1.3 },
    stockpileTargets: { food: 0.98, wood: 1.0, prosperityFloor: 33 },
    stabilityTargets: { walls: 1.22, holdSec: 0.88, prosperityOffset: -2, threatOffset: 6 },
    recoveryPackage: { food: 18, wood: 14, threatRelief: 16, prosperityBoost: 6 },
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
    logisticsTargets: { warehouses: 1.2, farms: 0.92, lumbers: 0.92, roads: 1.12, walls: 0.84 },
    stockpileTargets: { food: 0.92, wood: 0.92, prosperityFloor: 40 },
    stabilityTargets: { walls: 0.84, holdSec: 1.05, prosperityOffset: 3, threatOffset: -3 },
    recoveryPackage: { food: 18, wood: 16, threatRelief: 10, prosperityBoost: 8 },
  },
});

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function scaleAbsolute(value, scale) {
  return Number((Number(value ?? 0) * Math.max(1, Number(scale ?? 1))).toFixed(3));
}

function improveModifier(value, mastery, direction = "higher") {
  const base = Number(value ?? 1);
  const bonus = Math.max(1, Number(mastery ?? 1));
  if (!Number.isFinite(base)) return 1;
  if (direction === "lower") {
    return Number((base >= 1 ? 1 + (base - 1) / bonus : 1 - (1 - base) * bonus).toFixed(4));
  }
  return Number((base >= 1 ? 1 + (base - 1) * bonus : 1 - (1 - base) / bonus).toFixed(4));
}

function ceilScaled(value, scale, minimum = 1) {
  if (value <= 0) return 0;
  return Math.max(minimum, Math.ceil(value * scale));
}

function getDoctrineMastery(state) {
  const mastery = Number(state.gameplay?.doctrineMastery ?? 1);
  return Number.isFinite(mastery) ? Math.max(1, mastery) : 1;
}

function ensureRecoveryState(state) {
  const recovery = state.gameplay.recovery ?? (state.gameplay.recovery = {
    charges: 2,
    activeBoostSec: 0,
    lastTriggerSec: -Infinity,
    collapseRisk: 0,
    lastReason: "",
  });
  recovery.charges = clamp(Number(recovery.charges ?? 1), 0, BALANCE.recoveryChargeCap);
  recovery.activeBoostSec = Math.max(0, Number(recovery.activeBoostSec ?? 0));
  recovery.lastTriggerSec = Number.isFinite(recovery.lastTriggerSec) ? Number(recovery.lastTriggerSec) : -Infinity;
  recovery.collapseRisk = Math.max(0, Number(recovery.collapseRisk ?? 0));
  recovery.lastReason = String(recovery.lastReason ?? "");
  return recovery;
}

function addRecoveryCharge(state, amount = 1) {
  const recovery = ensureRecoveryState(state);
  recovery.charges = clamp(recovery.charges + amount, 0, BALANCE.recoveryChargeCap);
}

function getWorkerCount(state) {
  return Number(
    state.metrics.populationStats?.workers
      ?? state.agents.filter((agent) => agent.type === "WORKER" && agent.alive !== false).length,
  );
}

function getDoctrinePreset(state) {
  const doctrineId = state.controls.doctrine ?? state.gameplay.doctrine ?? "balanced";
  return DOCTRINE_PRESETS[doctrineId] ?? DOCTRINE_PRESETS.balanced;
}

function ensureProgressionState(state) {
  state.gameplay.doctrineMastery = getDoctrineMastery(state);
  if (!Array.isArray(state.gameplay.objectiveLog)) state.gameplay.objectiveLog = [];
  return ensureRecoveryState(state);
}

export function getDoctrineAdjustedTargets(state, runtime) {
  const modifiers = state.gameplay.modifiers ?? {};
  return {
    logistics: {
      warehouses: ceilScaled(runtime.logisticsTargets.warehouses, Number(modifiers.logisticsWarehouseScale ?? 1)),
      farms: ceilScaled(runtime.logisticsTargets.farms, Number(modifiers.logisticsFarmScale ?? 1)),
      lumbers: ceilScaled(runtime.logisticsTargets.lumbers, Number(modifiers.logisticsLumberScale ?? 1)),
      roads: ceilScaled(runtime.logisticsTargets.roads, Number(modifiers.logisticsRoadScale ?? 1)),
      walls: ceilScaled(runtime.logisticsTargets.walls, Number(modifiers.logisticsWallScale ?? 1), 0),
    },
    stockpile: {
      food: Math.max(1, Math.round(runtime.stockpileTargets.food * Number(modifiers.stockpileFoodScale ?? 1))),
      wood: Math.max(1, Math.round(runtime.stockpileTargets.wood * Number(modifiers.stockpileWoodScale ?? 1))),
      prosperityFloor: Math.max(18, Math.round(Number(modifiers.stockpileProsperityFloor ?? 36))),
    },
    stability: {
      walls: ceilScaled(runtime.stabilityTargets.walls, Number(modifiers.stabilityWallScale ?? 1)),
      prosperity: clamp(
        Math.round(runtime.stabilityTargets.prosperity + Number(modifiers.stabilityProsperityOffset ?? 0)),
        18,
        90,
      ),
      threat: clamp(
        Math.round(runtime.stabilityTargets.threat + Number(modifiers.stabilityThreatOffset ?? 0)),
        12,
        92,
      ),
      holdSec: Math.max(10, Math.round(runtime.stabilityTargets.holdSec * Number(modifiers.stabilityHoldScale ?? 1))),
    },
  };
}

function buildCoverageStatus(state) {
  const logistics = state.metrics?.logistics ?? null;
  if (!logistics) {
    return {
      progress: 1,
      hint: "",
      isolated: 0,
      stretched: 0,
      overloaded: 0,
      stranded: 0,
    };
  }

  const isolated = Number(logistics.isolatedWorksites ?? 0);
  const stretched = Number(logistics.stretchedWorksites ?? 0);
  const overloaded = Number(logistics.overloadedWarehouses ?? 0);
  const stranded = Number(logistics.strandedCarryWorkers ?? 0);
  const depotDistance = Number(logistics.avgDepotDistance ?? 0);
  // Weighted average instead of Math.min — single logistics issue no longer zeros all progress
  const penalties = [
    { value: clamp(1 - isolated * 0.35, 0, 1), weight: 0.30 },
    { value: clamp(1 - stretched * 0.12, 0, 1), weight: 0.15 },
    { value: clamp(1 - overloaded * 0.20, 0, 1), weight: 0.20 },
    { value: clamp(1 - stranded * 0.35, 0, 1), weight: 0.20 },
    {
      value: depotDistance > BALANCE.workerFarDepotDistance
        ? clamp(1 - (depotDistance - BALANCE.workerFarDepotDistance) * 0.02, 0, 1)
        : 1,
      weight: 0.15,
    },
  ];
  const progress = penalties.reduce((sum, p) => sum + p.value * p.weight, 0);

  let hint = "";
  if (isolated > 0) {
    hint = "At least one worksite is isolated from any depot. Reconnect it before pushing objectives.";
  } else if (overloaded > 0) {
    hint = "A depot is overloaded. Add or reposition warehouses before scaling up.";
  } else if (stranded > 0) {
    hint = "Workers are carrying resources with no clean depot route. Repair the lane before waiting.";
  } else if (stretched > 0 || depotDistance > 15) {
    hint = "Routes are stretched. Shorten depot distance or add a forward warehouse.";
  }

  return {
    progress: Number(progress.toFixed(2)),
    hint,
    isolated,
    stretched,
    overloaded,
    stranded,
  };
}

function computeCollapseRisk(state, runtime, coverage) {
  const resourceRisk = clamp((18 - Number(state.resources.food ?? 0)) / 18, 0, 1) * 0.32
    + clamp((14 - Number(state.resources.wood ?? 0)) / 14, 0, 1) * 0.18;
  const prosperityRisk = clamp((34 - Number(state.gameplay.prosperity ?? 0)) / 34, 0, 1) * 0.22;
  const threatRisk = clamp((Number(state.gameplay.threat ?? 0) - 52) / 40, 0, 1) * 0.2;
  const networkRisk = clamp(1 - coverage.progress, 0, 1) * 0.08;
  const frontierRisk = runtime.routes.length > 0 && runtime.connectedRoutes < runtime.routes.length ? 0.06 : 0;
  return Number(clamp((resourceRisk + prosperityRisk + threatRisk + networkRisk + frontierRisk) * 100, 0, 100).toFixed(1));
}

function getRecoveryHint(state, runtime, recovery) {
  if (recovery.activeBoostSec > 0) {
    return `Recovery window ${recovery.activeBoostSec.toFixed(0)}s: use the relief to rebuild routes and refill depots.`;
  }
  if (recovery.collapseRisk < BALANCE.recoveryHintRiskThreshold) return "";
  const missingRoute = runtime.routes.find((route) => !route.connected);
  if (recovery.charges > 0 && (runtime.connectedRoutes > 0 || runtime.readyDepots > 0)) {
    return `Collapse risk ${recovery.collapseRisk.toFixed(0)}%. Keep a frontier route online to trigger emergency relief if the colony dips further.`;
  }
  if (missingRoute) {
    return `Collapse risk ${recovery.collapseRisk.toFixed(0)}%. Reopen the ${missingRoute.label} first or the colony has no recovery path.`;
  }
  return `Collapse risk ${recovery.collapseRisk.toFixed(0)}%. Stabilize food, wood, and threat before the colony fails.`;
}

function getSpatialPressureHint(state) {
  const spatial = state.metrics?.spatialPressure ?? {};
  if (
    Number(spatial.weatherPressure ?? 0) < 0.45
    && Number(spatial.eventPressure ?? 0) < 0.85
    && Number(spatial.contestedZones ?? 0) <= 0
  ) {
    return "";
  }

  const activeEvent = state.events.active?.[0] ?? null;
  const targetLabel = String(activeEvent?.payload?.targetLabel ?? state.weather?.hazardFocusSummary ?? "").trim();
  if (activeEvent?.type === "banditRaid") {
    return `Spatial pressure is concentrated on ${targetLabel || "the frontier"}. Reopen a safer lane or add walls before holding objectives.`;
  }
  if (activeEvent?.type === "tradeCaravan" && Number(activeEvent.payload?.rewardMultiplier ?? 1) < 1.1) {
    return `Trade lanes are weather-contested near ${targetLabel || "the depot corridor"}. Clear the route or place safer depot support before relying on caravan income.`;
  }
  return `Spatial pressure is spiking${targetLabel ? ` around ${targetLabel}` : ""}. Adjust roads, depots, or walls before waiting out the timer.`;
}

function applyPacingHint(state, runtime, coverage, recovery, baseHint) {
  const recoveryHint = getRecoveryHint(state, runtime, recovery);
  if (recoveryHint) return recoveryHint;
  if (coverage.progress < 1 && coverage.hint) return coverage.hint;
  const spatialHint = getSpatialPressureHint(state, runtime);
  if (spatialHint) return spatialHint;
  return baseHint;
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
    addRecoveryCharge(state, 1);
  } else if (objective.id === "stockpile-1") {
    for (let i = 0; i < 4; i += 1) {
      const tile = randomPassableTile(state.grid);
      const p = tileToWorld(tile.ix, tile.iz, state.grid);
      state.agents.push(createWorker(p.x, p.z));
    }
  } else if (objective.id === "stability-1") {
    state.gameplay.doctrineMastery = Number((getDoctrineMastery(state) * BALANCE.doctrineMasteryRewardMultiplier).toFixed(4));
  }
}

function maybeTriggerRecovery(state, runtime, coverage, dt) {
  const recovery = ensureRecoveryState(state);
  recovery.activeBoostSec = Math.max(0, recovery.activeBoostSec - dt);
  recovery.collapseRisk = computeCollapseRisk(state, runtime, coverage);

  const nowSec = Number(state.metrics.timeSec ?? 0);
  const networkReady = runtime.connectedRoutes > 0 || runtime.readyDepots > 0;
  const criticalResources = Number(state.resources.food ?? 0) <= BALANCE.recoveryCriticalResourceThreshold
    || Number(state.resources.wood ?? 0) <= BALANCE.recoveryCriticalResourceThreshold;
  const severePressure = recovery.collapseRisk >= BALANCE.recoveryTriggerRiskThreshold
    || (
      Number(state.gameplay.prosperity ?? 0) < BALANCE.recoveryCriticalProsperityThreshold
      && Number(state.gameplay.threat ?? 0) > BALANCE.recoveryCriticalThreatThreshold
    );
  // Network readiness is only required when resources aren't severely depleted
  const desperateResources = Number(state.resources.food ?? 0) <= 3 || Number(state.resources.wood ?? 0) <= 3;
  if ((!networkReady && !desperateResources) || recovery.charges <= 0 || (!criticalResources && !severePressure) || getWorkerCount(state) <= 0) {
    return recovery;
  }
  if (nowSec - recovery.lastTriggerSec < BALANCE.recoveryCooldownSec) {
    return recovery;
  }

  const modifiers = state.gameplay.modifiers ?? {};
  const foodBoost = Math.max(4, Math.round(Number(modifiers.recoveryFood ?? 12)));
  const woodBoost = Math.max(4, Math.round(Number(modifiers.recoveryWood ?? 10)));
  const threatRelief = Math.max(4, Number(modifiers.recoveryThreatRelief ?? 8));
  const prosperityBoost = Math.max(2, Number(modifiers.recoveryProsperityBoost ?? 6));

  state.resources.food += foodBoost;
  state.resources.wood += woodBoost;
  state.gameplay.threat = Math.max(0, state.gameplay.threat - threatRelief);
  state.gameplay.prosperity = clamp(state.gameplay.prosperity + prosperityBoost, 0, 100);

  recovery.charges = Math.max(0, recovery.charges - 1);
  recovery.activeBoostSec = BALANCE.recoveryWindowSec;
  recovery.lastTriggerSec = nowSec;
  recovery.lastReason = criticalResources ? "resource collapse" : "threat spiral";

  logObjective(state, `Emergency relief arrived: +${foodBoost} food, +${woodBoost} wood, threat -${threatRelief.toFixed(0)}.`);
  state.controls.actionMessage = "Emergency relief stabilized the colony. Use the window to rebuild routes and depots.";
  state.controls.actionKind = "success";
  return recovery;
}

function updateObjectiveProgress(state, dt, runtime, doctrineTargets, coverage, recovery) {
  const objectives = state.gameplay.objectives;
  const idx = state.gameplay.objectiveIndex;
  if (idx >= objectives.length) return;
  const objective = objectives[idx];
  if (objective.completed) {
    state.gameplay.objectiveIndex += 1;
    return;
  }

  const routeP = runtime.routes.length > 0 ? runtime.connectedRoutes / runtime.routes.length : 1;
  const depotP = runtime.depots.length > 0 ? runtime.readyDepots / runtime.depots.length : 1;

  if (objective.id === "logistics-1") {
    const targets = doctrineTargets.logistics;
    const wP = clamp(runtime.counts.warehouses / Math.max(1, targets.warehouses), 0, 1);
    const fP = clamp(runtime.counts.farms / Math.max(1, targets.farms), 0, 1);
    const lP = clamp(runtime.counts.lumbers / Math.max(1, targets.lumbers), 0, 1);
    const rP = clamp(runtime.counts.roads / Math.max(1, targets.roads), 0, 1);
    const wallP = targets.walls > 0 ? clamp(runtime.counts.walls / Math.max(1, targets.walls), 0, 1) : 1;
    objective.progress = Number((Math.min(routeP, depotP, wP, fP, lP, rP, wallP, coverage.progress) * 100).toFixed(1));

    const missingRoute = runtime.routes.find((route) => !route.connected);
    const missingDepot = runtime.depots.find((depot) => !depot.ready);
    const doctrineName = getDoctrinePreset(state).name;
    const baseHint = missingRoute
      ? missingRoute.hint
      : missingDepot
        ? missingDepot.hint
        : `Under ${doctrineName}, expand to ${targets.warehouses} warehouses, ${targets.farms} farms, ${targets.lumbers} lumbers, ${targets.roads} roads${targets.walls > 0 ? `, and ${targets.walls} walls` : ""}.`;

    state.gameplay.objectiveHint = applyPacingHint(state, runtime, coverage, recovery, baseHint);

    if (routeP >= 1 && depotP >= 1 && wP >= 1 && fP >= 1 && lP >= 1 && rP >= 1 && wallP >= 1 && coverage.progress >= 0.85) {
      objective.completed = true;
      logObjective(state, `Objective complete: ${objective.title}`);
      applyObjectiveReward(state, objective);
      emitEvent(state, EVENT_TYPES.COLONY_MILESTONE, { objective: objective.id, title: objective.title });
      state.gameplay.objectiveIndex += 1;
      state.gameplay.objectiveHint = runtime.scenario?.hintCopy?.afterLogistics ?? "Starter logistics online. Refill the stockpile.";
      state.controls.actionMessage = `Objective complete: ${objective.title}`;
      state.controls.actionKind = "success";
    }
    return;
  }

  if (objective.id === "stockpile-1") {
    const targets = doctrineTargets.stockpile;
    const foodP = clamp(state.resources.food / Math.max(1, targets.food), 0, 1);
    const woodP = clamp(state.resources.wood / Math.max(1, targets.wood), 0, 1);
    const prosperityP = clamp(state.gameplay.prosperity / Math.max(1, targets.prosperityFloor), 0, 1);
    const networkP = Math.min(routeP, depotP, coverage.progress >= 0.85 ? 1 : coverage.progress);
    objective.progress = Number((Math.min(foodP, woodP, prosperityP, networkP) * 100).toFixed(1));

    const missingRoute = runtime.routes.find((route) => !route.connected);
    const missingDepot = runtime.depots.find((depot) => !depot.ready);
    let baseHint = `Grow reserves to ${targets.food} food and ${targets.wood} wood while keeping prosperity above ${targets.prosperityFloor}.`;
    if (missingRoute) {
      baseHint = `Stockpile is blocked until the ${missingRoute.label} stays online.`;
    } else if (missingDepot) {
      baseHint = `Stockpile growth is unstable until ${missingDepot.label} is reclaimed.`;
    } else if (coverage.progress < 0.85 && coverage.hint) {
      baseHint = coverage.hint;
    } else if (prosperityP < 1) {
      baseHint = `Prosperity is too low for safe stockpiling. Stabilize the network before waiting for resources.`;
    }

    state.gameplay.objectiveHint = applyPacingHint(state, runtime, coverage, recovery, baseHint);
    if (foodP >= 1 && woodP >= 1 && prosperityP >= 1 && networkP >= 1) {
      objective.completed = true;
      logObjective(state, `Objective complete: ${objective.title}`);
      applyObjectiveReward(state, objective);
      emitEvent(state, EVENT_TYPES.COLONY_MILESTONE, { objective: objective.id, title: objective.title });
      state.gameplay.objectiveIndex += 1;
      state.gameplay.objectiveHint = runtime.scenario?.hintCopy?.afterStockpile ?? "Fortify the colony and hold stability under pressure.";
      state.controls.actionMessage = `Objective complete: ${objective.title}`;
      state.controls.actionKind = "success";
    }
    return;
  }

  if (objective.id === "stability-1") {
    const targets = doctrineTargets.stability;
    const wallsReady = runtime.counts.walls >= targets.walls;
    const frontierP = Math.min(routeP, depotP, coverage.progress >= 0.85 ? 1 : coverage.progress);
    const stable = wallsReady
      && frontierP >= 1
      && state.gameplay.prosperity >= targets.prosperity
      && state.gameplay.threat <= targets.threat;
    if (stable) {
      state.gameplay.objectiveHoldSec += dt;
    } else {
      state.gameplay.objectiveHoldSec = Math.max(0, state.gameplay.objectiveHoldSec - dt * BALANCE.objectiveHoldDecayPerSecond);
    }
    const wallP = clamp(runtime.counts.walls / Math.max(1, targets.walls), 0, 1);
    const holdP = clamp(state.gameplay.objectiveHoldSec / Math.max(1, targets.holdSec), 0, 1);
    objective.progress = Number((Math.min(wallP, holdP, frontierP) * 100).toFixed(1));

    let baseHint = !wallsReady
      ? `Build ${targets.walls} walls under the current doctrine before starting the stability hold.`
      : `Hold prosperity >= ${targets.prosperity} and threat <= ${targets.threat} for ${targets.holdSec} seconds while frontier routes remain online.`;
    if (frontierP < 1) {
      const missingRoute = runtime.routes.find((route) => !route.connected);
      const missingDepot = runtime.depots.find((depot) => !depot.ready);
      baseHint = missingRoute
        ? `Stability hold is paused while the ${missingRoute.label} is broken.`
        : missingDepot
          ? `Stability hold is paused until ${missingDepot.label} is reclaimed.`
          : coverage.hint || baseHint;
    }

    state.gameplay.objectiveHint = applyPacingHint(state, runtime, coverage, recovery, baseHint);
    if (state.gameplay.objectiveHoldSec >= targets.holdSec && wallsReady && frontierP >= 1) {
      objective.completed = true;
      logObjective(state, `Objective complete: ${objective.title}`);
      applyObjectiveReward(state, objective);
      emitEvent(state, EVENT_TYPES.COLONY_MILESTONE, { objective: objective.id, title: objective.title });
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
  const spatial = state.metrics?.spatialPressure ?? {};
  const weatherPenalty = (state.weather.current === "storm" ? 6 : state.weather.current === "drought" ? 5 : 0)
    + Number(spatial.weatherPressure ?? 0) * Number(BALANCE.weatherPressureProsperityPenalty ?? 11.5);
  const eventPenalty = state.events.active.length * 1.2
    + Number(spatial.eventPressure ?? 0) * Number(BALANCE.eventPressureProsperityPenalty ?? 7.2)
    + Number(spatial.contestedZones ?? 0) * Number(BALANCE.contestedZoneProsperityPenalty ?? 1.6);
  return clamp(resScore + infraScore - weatherPenalty - eventPenalty + 18, 0, 100);
}

function computeWallMitigation(state) {
  const grid = state.grid;
  const wallCount = state.buildings.walls;
  if (!wallCount || !grid.elevation) {
    return clamp(wallCount / 24, 0, 1) * 18;
  }
  let weightedWalls = 0;
  const tiles = grid.tiles;
  const len = grid.width * grid.height;
  for (let i = 0; i < len; i++) {
    if (tiles[i] === TILE.WALL) {
      weightedWalls += 1 + grid.elevation[i] * TERRAIN_MECHANICS.wallElevationDefenseBonus;
    }
  }
  return clamp(weightedWalls / 24, 0, 1) * 18;
}

function computeThreat(state) {
  const predators = state.animals.filter((a) => a.kind === "PREDATOR").length;
  const sabotageEvents = state.events.active.filter((e) => e.type === "sabotage").length;
  const lowFoodPenalty = state.resources.food < 25 ? (25 - state.resources.food) * 0.8 : 0;
  const wallMitigation = computeWallMitigation(state);
  const chaos = clamp(state.debug.boids?.avgNeighbors ?? 0, 0, 4) * 6;
  const spatial = state.metrics?.spatialPressure ?? {};
  const weatherThreat = Number(spatial.weatherPressure ?? 0) * Number(BALANCE.weatherPressureThreat ?? 4.8);
  const eventThreat = Number(spatial.eventPressure ?? 0) * Number(BALANCE.eventPressureThreat ?? 11.2);
  const contestedThreat = Number(spatial.contestedZones ?? 0) * Number(BALANCE.contestedZoneThreat ?? 3.4);
  return clamp(
    18 + predators * 2.5 + sabotageEvents * 7 + lowFoodPenalty + chaos + weatherThreat + eventThreat + contestedThreat - wallMitigation,
    0,
    100,
  );
}

function applyDoctrine(state) {
  const preset = getDoctrinePreset(state);
  const mastery = getDoctrineMastery(state);
  state.gameplay.doctrine = preset.id;
  state.gameplay.doctrineMastery = mastery;
  state.gameplay.modifiers = {
    farmYield: improveModifier(preset.farmYield, mastery, "higher"),
    lumberYield: improveModifier(preset.lumberYield, mastery, "higher"),
    tradeYield: improveModifier(preset.tradeYield, mastery, "higher"),
    sabotageResistance: improveModifier(preset.sabotageResistance, mastery, "higher"),
    threatDamp: improveModifier(preset.threatDamp, mastery, "lower"),
    farmBias: preset.farmBias,
    logisticsWarehouseScale: preset.logisticsTargets.warehouses,
    logisticsFarmScale: preset.logisticsTargets.farms,
    logisticsLumberScale: preset.logisticsTargets.lumbers,
    logisticsRoadScale: preset.logisticsTargets.roads,
    logisticsWallScale: preset.logisticsTargets.walls,
    stockpileFoodScale: preset.stockpileTargets.food,
    stockpileWoodScale: preset.stockpileTargets.wood,
    stockpileProsperityFloor: preset.stockpileTargets.prosperityFloor,
    stabilityWallScale: preset.stabilityTargets.walls,
    stabilityHoldScale: preset.stabilityTargets.holdSec,
    stabilityProsperityOffset: preset.stabilityTargets.prosperityOffset,
    stabilityThreatOffset: preset.stabilityTargets.threatOffset,
    recoveryFood: scaleAbsolute(preset.recoveryPackage.food, mastery),
    recoveryWood: scaleAbsolute(preset.recoveryPackage.wood, mastery),
    recoveryThreatRelief: scaleAbsolute(preset.recoveryPackage.threatRelief, mastery),
    recoveryProsperityBoost: scaleAbsolute(preset.recoveryPackage.prosperityBoost, mastery),
  };
}

export class ProgressionSystem {
  constructor() {
    this.name = "ProgressionSystem";
  }

  update(dt, state) {
    applyDoctrine(state);
    ensureProgressionState(state);

    const targetProsperity = computeProsperity(state);
    let targetThreat = computeThreat(state) * state.gameplay.modifiers.threatDamp;
    const recovery = state.gameplay.recovery;
    if (recovery.activeBoostSec > 0) {
      const relief = recovery.activeBoostSec / BALANCE.recoveryWindowSec;
      targetThreat *= 1 - relief * 0.18;
    }

    state.gameplay.prosperity = state.gameplay.prosperity * 0.95 + targetProsperity * 0.05;
    state.gameplay.threat = state.gameplay.threat * 0.92 + targetThreat * 0.08;
    state.gameplay.prosperity = clamp(state.gameplay.prosperity, 0, 100);
    state.gameplay.threat = clamp(state.gameplay.threat, 0, 100);

    const runtime = getScenarioRuntime(state);
    const doctrineTargets = getDoctrineAdjustedTargets(state, runtime);
    const coverage = buildCoverageStatus(state);
    const updatedRecovery = maybeTriggerRecovery(state, runtime, coverage, dt);
    updateObjectiveProgress(state, dt, runtime, doctrineTargets, coverage, updatedRecovery);
  }
}

export function getDoctrinePresets() {
  return Object.values(DOCTRINE_PRESETS);
}
