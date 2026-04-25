import { BALANCE, TERRAIN_MECHANICS } from "../../config/balance.js";
import { TILE } from "../../config/constants.js";
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

const MILESTONE_RULES = Object.freeze([
  {
    kind: "first_farm",
    key: "firstFarm",
    label: "First Farm raised",
    message: "Your colony has a food foothold.",
    baselineKey: "farms",
    current: (state) => Number(state.buildings?.farms ?? 0),
  },
  {
    kind: "first_lumber",
    key: "firstLumber",
    label: "First Lumber camp raised",
    message: "Wood supply is online.",
    baselineKey: "lumbers",
    current: (state) => Number(state.buildings?.lumbers ?? 0),
  },
  {
    kind: "first_warehouse",
    key: "firstWarehouse",
    label: "First extra Warehouse raised",
    message: "The logistics net has a second anchor.",
    baselineKey: "warehouses",
    current: (state) => Number(state.buildings?.warehouses ?? 0),
  },
  {
    kind: "first_kitchen",
    key: "firstKitchen",
    label: "First Kitchen raised",
    message: "Meals can now turn raw food into stamina.",
    baselineKey: "kitchens",
    current: (state) => Number(state.buildings?.kitchens ?? 0),
  },
  {
    kind: "first_meal",
    key: "firstMeal",
    label: "First Meal served",
    message: "Prepared food is reaching the colony.",
    baselineKey: "meals",
    current: (state) => Number(state.resources?.meals ?? 0),
  },
  {
    kind: "first_tool",
    key: "firstTool",
    label: "First Tool forged",
    message: "Advanced production has started.",
    baselineKey: "tools",
    current: (state) => Number(state.resources?.tools ?? 0),
  },
  {
    kind: "first_clinic",
    key: "firstClinic",
    label: "First Clinic opened",
    message: "Herbs can now become medicine.",
    baselineKey: "clinics",
    current: (state) => Number(state.buildings?.clinics ?? 0),
  },
  {
    kind: "first_smithy",
    key: "firstSmithy",
    label: "First Smithy lit",
    message: "Stone + wood \u2192 tools is online.",
    baselineKey: "smithies",
    current: (state) => Number(state.buildings?.smithies ?? 0),
  },
  {
    kind: "first_medicine",
    key: "firstMedicine",
    label: "First Medicine brewed",
    message: "Injuries are no longer permanent.",
    baselineKey: "medicine",
    current: (state) => Number(state.resources?.medicine ?? 0),
  },
  {
    kind: "dev_40",
    key: "dev40",
    label: "Dev 40 \u00b7 foothold",
    message: "Your colony is surviving; widen the production chain.",
    baselineKey: "__devNever__",
    current: (state) => (Number(state.gameplay?.devIndexSmoothed ?? 0) >= 40 ? 1 : 0),
  },
  {
    kind: "dev_60",
    key: "dev60",
    label: "Dev 60 \u00b7 thriving",
    message: "Meals are flowing; consider Smithy for tool bonus.",
    baselineKey: "__devNever__",
    current: (state) => (Number(state.gameplay?.devIndexSmoothed ?? 0) >= 60 ? 1 : 0),
  },
  {
    kind: "dev_80",
    key: "dev80",
    label: "Dev 80 \u00b7 prosperous",
    message: "You can survive a raid; stockpile medicine and walls.",
    baselineKey: "__devNever__",
    current: (state) => (Number(state.gameplay?.devIndexSmoothed ?? 0) >= 80 ? 1 : 0),
  },
  {
    kind: "first_haul_delivery",
    key: "firstHaul",
    label: "First warehouse delivery",
    message: "Haulers are shortening your food trips.",
    baselineKey: "haulDeliveredLife",
    current: (state) => Number(state.metrics?.haulDeliveredLife ?? 0),
  },
]);

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
  if (!Array.isArray(state.gameplay.milestonesSeen)) {
    state.gameplay.milestonesSeen = state.gameplay.milestonesSeen instanceof Set
      ? Array.from(state.gameplay.milestonesSeen)
      : [];
  }
  state.gameplay.milestoneBaseline ??= {
    warehouses: Number(state.buildings?.warehouses ?? 0),
    farms: Number(state.buildings?.farms ?? 0),
    lumbers: Number(state.buildings?.lumbers ?? 0),
    kitchens: Number(state.buildings?.kitchens ?? 0),
    meals: Number(state.resources?.meals ?? 0),
    tools: Number(state.resources?.tools ?? 0),
    clinics: Number(state.buildings?.clinics ?? 0),
    smithies: Number(state.buildings?.smithies ?? 0),
    medicine: Number(state.resources?.medicine ?? 0),
    haulDeliveredLife: Number(state.metrics?.haulDeliveredLife ?? 0),
    __devNever__: 0,
  };
  return ensureRecoveryState(state);
}

function detectMilestones(state) {
  const seen = state.gameplay.milestonesSeen;
  const baseline = state.gameplay.milestoneBaseline ?? {};
  for (const rule of MILESTONE_RULES) {
    if (seen.includes(rule.kind)) continue;
    const current = Number(rule.current(state));
    const start = Number(baseline[rule.baselineKey] ?? 0);
    if (!Number.isFinite(current) || current <= Math.max(start, 0)) continue;
    seen.push(rule.kind);
    emitEvent(state, EVENT_TYPES.COLONY_MILESTONE, {
      kind: rule.kind,
      key: rule.key,
      label: rule.label,
      message: rule.message,
      current,
      baseline: start,
    });
    if (state.controls) {
      state.controls.actionMessage = `${rule.label}: ${rule.message}`;
      state.controls.actionKind = "milestone";
    }
  }
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

function logObjective(state, text) {
  const msg = `[${state.metrics.timeSec.toFixed(1)}s] ${text}`;
  state.gameplay.objectiveLog.unshift(msg);
  state.gameplay.objectiveLog = state.gameplay.objectiveLog.slice(0, 24);
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

  // v0.8.2 Round-1 02e-indie-critic — narrativize the emergency relief toast.
  // Previous copy ("Emergency relief stabilized the colony. Use the window to
  // rebuild routes and depots.") read as a commit-log entry; replaced with a
  // scene-setting sentence so the event feels diegetic. Mechanics unchanged —
  // same resources applied, same actionKind, same recovery charge consumed.
  logObjective(state, `A relief caravan crested the ridge as the last grain ran out — +${foodBoost} food, +${woodBoost} wood, threat eased by ${threatRelief.toFixed(0)}.`);
  state.controls.actionMessage = "The colony breathes again. Rebuild your routes before the next wave.";
  state.controls.actionKind = "success";
  return recovery;
}

// v0.8.0 Phase 4 — Survival Mode. Replaces updateObjectiveProgress as the
// primary per-tick scoring path. Accrues a running score on
// `state.metrics.survivalScore`:
//   +BALANCE.survivalScorePerSecond per in-game second survived
//   +BALANCE.survivalScorePerBirth on each newly observed birth event
//   -BALANCE.survivalScorePenaltyPerDeath on each newly observed colonist death
// Births are surfaced by PopulationGrowthSystem setting
// `state.metrics.lastBirthGameSec` = `state.metrics.timeSec` on spawn; this
// function caches the previous value to detect new births. Deaths are
// detected via delta on `state.metrics.deathsTotal`.
export function updateSurvivalScore(state, dt) {
  if (!state || !state.metrics) return;
  const metrics = state.metrics;
  metrics.survivalScore = Number.isFinite(Number(metrics.survivalScore))
    ? Number(metrics.survivalScore)
    : 0;

  const perSec = Number(BALANCE.survivalScorePerSecond ?? 1);
  const perBirth = Number(BALANCE.survivalScorePerBirth ?? 5);
  const perDeath = Number(BALANCE.survivalScorePenaltyPerDeath ?? 10);
  const ticks = Math.max(0, Number(dt) || 0);
  metrics.survivalScore += perSec * ticks;

  // Birth detection: PopulationGrowthSystem increments metrics.birthsTotal on
  // each spawn. Diff against a cached cursor so every birth scores exactly
  // once, even when multiple births land inside the same integer `timeSec`
  // (silent-failure C2: the prior timestamp cursor dropped those).
  //
  // v0.8.0 Phase 4 iteration SR2: if a caller constructed `metrics` without
  // `survivalLastBirthsSeen` but set `birthsTotal` to a non-zero baseline
  // (tests that bypass createInitialGameState), seed the cursor to the
  // current total so we don't retroactively score pre-existing births.
  const birthsTotal = Number(metrics.birthsTotal ?? 0);
  if (metrics.survivalLastBirthsSeen === undefined) {
    metrics.survivalLastBirthsSeen = birthsTotal;
  }
  const prevBirthsSeen = Number(metrics.survivalLastBirthsSeen ?? 0);
  if (Number.isFinite(birthsTotal) && birthsTotal > prevBirthsSeen) {
    metrics.survivalScore += perBirth * (birthsTotal - prevBirthsSeen);
    metrics.survivalLastBirthsSeen = birthsTotal;
  }

  // Death detection: MortalitySystem increments metrics.deathsTotal on every
  // death. Diff against a cached baseline to apply the penalty exactly once
  // per death. Same SR2 seeding rule as births above.
  const deathsTotal = Number(metrics.deathsTotal ?? 0);
  if (metrics.survivalLastDeathsSeen === undefined) {
    metrics.survivalLastDeathsSeen = deathsTotal;
  }
  const prevDeathsSeen = Number(metrics.survivalLastDeathsSeen ?? 0);
  if (Number.isFinite(deathsTotal) && deathsTotal > prevDeathsSeen) {
    metrics.survivalScore -= perDeath * (deathsTotal - prevDeathsSeen);
    metrics.survivalLastDeathsSeen = deathsTotal;
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

  // v0.8.0 Phase 4: DevIndexSystem (runs next in SYSTEM_ORDER) owns the
  // per-tick economy/colony aggregation into state.gameplay.devIndex* —
  // do not aggregate economy signals here.

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
    const coverage = buildCoverageStatus(state);
    maybeTriggerRecovery(state, runtime, coverage, dt);
    // v0.8.0 Phase 4 — Survival Mode. Survival score is the primary per-tick
    // scoring path; the legacy per-objective progression pipeline has been
    // retired (objectives no longer drive win outcomes).
    updateSurvivalScore(state, dt);
    detectMilestones(state);
  }
}

export function getDoctrinePresets() {
  return Object.values(DOCTRINE_PRESETS);
}
