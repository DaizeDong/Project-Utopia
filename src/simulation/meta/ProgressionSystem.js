import { BALANCE, TERRAIN_MECHANICS } from "../../config/balance.js";
import { TILE } from "../../config/constants.js";
import { getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";
import { emitEvent, EVENT_TYPES } from "./GameEventBus.js";
import { isFoodRunwayUnsafe } from "../economy/ResourceSystem.js";

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
  // v0.8.5 Tier 4: late-game milestones. Give the player goals to chase
  // after their colony has stabilised — population growth, year-1
  // survival, defending against late-game raids, and reaching balanced
  // dev-index dimensions.
  {
    kind: "pop_30",
    key: "pop30",
    label: "Population 30 · thriving township",
    message: "Thirty colonists strong — the camp is now a town.",
    baselineKey: "__devNever__",
    current: (state) => {
      const aliveWorkers = Array.isArray(state.agents)
        ? state.agents.filter((a) => a && a.alive !== false && a.type === "WORKER").length
        : 0;
      return aliveWorkers >= 30 ? 1 : 0;
    },
  },
  {
    kind: "dev_year_1",
    key: "devYear1",
    label: "One year survived",
    message: "365 days, and still growing. The colony has weathered every season.",
    baselineKey: "__devNever__",
    current: (state) => {
      // 365 in-game days at DAY_CYCLE_PERIOD_SEC = 90 = 32850 in-game seconds.
      const yearSec = 365 * 90;
      return Number(state.metrics?.timeSec ?? 0) >= yearSec ? 1 : 0;
    },
  },
  {
    kind: "defended_tier_5",
    key: "defendedTier5",
    label: "Tier-5 raid defended",
    message: "A late-game raid was repelled — your walls and GUARDs hold the line.",
    baselineKey: "__devNever__",
    current: (state) => {
      const tier = Number(state.gameplay?.raidEscalation?.tier ?? 0);
      const repelled = Number(state.metrics?.raidsRepelled ?? 0);
      // v0.10.1-r2-A5 P0: gate "defended" on real defensive infrastructure
      // (≥4 walls or ≥1 GUARD-role worker). Pre-r2, surviving the active
      // window with zero defenses still flipped this milestone — A5 R2 saw
      // "Tier-5 raid defended" light up on a 0-wall, 0-guard run because
      // raidsRepelled was incremented purely on event-status transition.
      const walls = Number(state.buildings?.walls ?? 0);
      const guards = Number(state.combat?.guardCount ?? 0);
      const hasDefense = guards >= 1 || walls >= 4;
      return tier >= 5 && repelled >= 1 && hasDefense ? 1 : 0;
    },
  },
  {
    kind: "all_dims_70",
    key: "allDims70",
    label: "All DevIndex dimensions ≥ 70",
    message: "Every dimension of the colony is healthy — true balance achieved.",
    baselineKey: "__devNever__",
    current: (state) => {
      const dims = state.gameplay?.devIndexDimensions;
      if (!dims) return 0;
      const keys = ["population", "economy", "infrastructure", "production", "defense", "resilience"];
      for (const k of keys) {
        if (Number(dims[k] ?? 0) < 70) return 0;
      }
      return 1;
    },
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

// v0.10.1-r3-A5 P0-1: recovery-essential build whitelist. When the colony is
// in a food runway crisis, ColonyDirectorSystem already filters fallback
// build proposals to this set so wall/depot/wildlife builds can't crowd out
// farms. Exposed as a named export so ColonyPlanner (LLM-fallback) and any
// future planner layer can consult the same source-of-truth set instead of
// hardcoding the list. Read-only (frozen) Set semantics — callers MUST NOT
// mutate. Wood production (lumber) is included because farms cost wood and a
// recovery cycle without lumber will starve the build queue at wood=0.
export const RECOVERY_ESSENTIAL_TYPES = Object.freeze(new Set(["farm", "lumber", "warehouse", "road"]));

// PF-milestone-tone-gate (R5 P1): set of milestone kinds whose copy is
// unambiguously celebratory ("thriving township", "Meals are flowing",
// "prosperous", "First Meal served", "First Medicine brewed"). Emitting these
// during mass starvation produced tonal whiplash (PF-Gap #2) — green toasts
// while colonists were dying. Gated in detectMilestones via colonyToneOk:
// when criticalHungerRatio (workers with hunger<0.20 / alive workers) >= 0.30
// the emit is SKIPPED and the milestone is NOT marked as seen, so it can
// re-fire later once the colony recovers. Hard-freeze compliant: no new
// milestones, no new copy strings, no new toast surfaces.
const POSITIVE_TONE_MILESTONES = Object.freeze(new Set([
  "pop_30",
  "dev_60",
  "dev_80",
  "first_meal",
  "first_medicine",
]));

/**
 * Returns true when the colony's tonal context is healthy enough to celebrate
 * a positive milestone. Defined as criticalHungerRatio < 0.30, where
 * criticalHungerRatio = (alive workers with hunger < 0.20) / (alive workers).
 * Returns false when there are zero alive workers or `state.agents` is
 * missing (don't celebrate when state is unknown).
 * @param {object} state
 * @returns {boolean}
 */
function colonyToneOk(state) {
  if (!Array.isArray(state?.agents)) return false;
  let alive = 0;
  let critical = 0;
  for (const agent of state.agents) {
    if (!agent || agent.type !== "WORKER" || agent.alive === false) continue;
    alive++;
    if (Number(agent.hunger ?? 0) < 0.20) critical++;
  }
  if (alive === 0) return false;
  return (critical / alive) < 0.30;
}

/**
 * Returns true when `buildType` is in the recovery-essential whitelist.
 * Use this from any planner / director layer that needs to honor the
 * "expansion paused" gate without re-listing the 4 types and risking drift.
 * @param {string} buildType
 * @returns {boolean}
 */
export function isRecoveryEssential(buildType) {
  return RECOVERY_ESSENTIAL_TYPES.has(buildType);
}

function ensureRecoveryState(state) {
  const recovery = state.gameplay.recovery ?? (state.gameplay.recovery = {
    charges: 2,
    activeBoostSec: 0,
    lastTriggerSec: -Infinity,
    collapseRisk: 0,
    lastReason: "",
    essentialOnly: false,
  });
  recovery.charges = clamp(Number(recovery.charges ?? 1), 0, BALANCE.recoveryChargeCap);
  recovery.activeBoostSec = Math.max(0, Number(recovery.activeBoostSec ?? 0));
  recovery.lastTriggerSec = Number.isFinite(recovery.lastTriggerSec) ? Number(recovery.lastTriggerSec) : -Infinity;
  recovery.collapseRisk = Math.max(0, Number(recovery.collapseRisk ?? 0));
  recovery.lastReason = String(recovery.lastReason ?? "");
  recovery.essentialOnly = Boolean(recovery.essentialOnly);
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
    // PF-milestone-tone-gate (R5 P1): defer celebratory milestones during
    // mass starvation. Skip WITHOUT pushing to `seen` so the milestone
    // re-fires once the colony recovers (criticalHungerRatio < 0.30).
    if (POSITIVE_TONE_MILESTONES.has(rule.kind) && !colonyToneOk(state)) continue;
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

function scenarioObjectiveId(entry, fallback) {
  return String(entry?.id ?? entry?.label ?? fallback).trim() || fallback;
}

function ensureScenarioObjectiveState(state, runtime) {
  const scenarioId = String(runtime?.scenario?.id ?? "default");
  const current = state.gameplay.scenarioObjectiveSeen;
  if (!current || current.scenarioId !== scenarioId) {
    state.gameplay.scenarioObjectiveSeen = {
      scenarioId,
      routes: (runtime?.routes ?? [])
        .filter((route) => route.connected)
        .map((route, idx) => scenarioObjectiveId(route, `route-${idx}`)),
      depots: (runtime?.depots ?? [])
        .filter((depot) => depot.ready)
        .map((depot, idx) => scenarioObjectiveId(depot, `depot-${idx}`)),
    };
  }
  return state.gameplay.scenarioObjectiveSeen;
}

function emitScenarioObjectiveMilestone(state, detail) {
  emitEvent(state, EVENT_TYPES.COLONY_MILESTONE, detail);
  logObjective(state, detail.message);
  if (state.controls) {
    state.controls.actionMessage = detail.message;
    state.controls.actionKind = "milestone";
  }
}

function detectScenarioObjectiveMilestones(state, runtime) {
  const seen = ensureScenarioObjectiveState(state, runtime);
  for (const [idx, route] of (runtime?.routes ?? []).entries()) {
    const id = scenarioObjectiveId(route, `route-${idx}`);
    if (!route.connected || seen.routes.includes(id)) continue;
    seen.routes.push(id);
    const label = String(route.label ?? "supply route").trim();
    emitScenarioObjectiveMilestone(state, {
      kind: "scenario_route_connected",
      key: id,
      label: `Route online: ${label}`,
      message: `Route online: ${label}. Workers can haul through the repaired line.`,
      current: seen.routes.length,
      baseline: 0,
    });
  }
  for (const [idx, depot] of (runtime?.depots ?? []).entries()) {
    const id = scenarioObjectiveId(depot, `depot-${idx}`);
    if (!depot.ready || seen.depots.includes(id)) continue;
    seen.depots.push(id);
    const label = String(depot.label ?? "depot").trim();
    emitScenarioObjectiveMilestone(state, {
      kind: "scenario_depot_ready",
      key: id,
      label: `Depot reclaimed: ${label}`,
      message: `Depot reclaimed: ${label}. Warehouse coverage now reaches this objective zone.`,
      current: seen.depots.length,
      baseline: 0,
    });
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

export function maybeTriggerRecovery(state, runtime, coverage, dt) {
  const recovery = ensureRecoveryState(state);
  recovery.activeBoostSec = Math.max(0, recovery.activeBoostSec - dt);
  recovery.collapseRisk = computeCollapseRisk(state, runtime, coverage);
  // v0.10.1-r3-A5 P0-1: maintain `essentialOnly` flag every tick from the
  // canonical inputs (autopilot foodRecoveryMode + ResourceSystem food
  // runway probe). Downstream planners (ColonyDirectorSystem fallback,
  // ColonyPlanner LLM-fallback) read this flag and restrict build proposals
  // to RECOVERY_ESSENTIAL_TYPES (farm/lumber/warehouse/road) so the
  // "expansion paused" toast cannot also pause farm placement — the
  // exact livelock the v0.10.1-r2 reviewer reproduced on 3/3 runs.
  const aiRecoveryActive = Boolean(state.ai?.foodRecoveryMode);
  const runwayUnsafe = isFoodRunwayUnsafe(state);
  recovery.essentialOnly = aiRecoveryActive || runwayUnsafe;

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
  // v0.10.1-r2-A5 P0: hard-gate emergency relief charges on actual collapse
  // signals (a death has occurred or severe pressure). Pre-r2 the trickle
  // path triggered as soon as food ≤ 12 — but with food=12 there's no real
  // crisis, so the AFK food pool kept getting topped up indefinitely while
  // workers were still healthy. Requiring "someone died OR severePressure"
  // means relief is reserved for genuine emergencies, not soft dips.
  const meaningfulCollapse = Number(state.metrics?.deathsTotal ?? 0) > 0 || severePressure;
  if ((!networkReady && !desperateResources) || recovery.charges <= 0 || (!criticalResources && !severePressure) || getWorkerCount(state) <= 0
    || !meaningfulCollapse) {
    return recovery;
  }
  if (nowSec - recovery.lastTriggerSec < BALANCE.recoveryCooldownSec) {
    return recovery;
  }
  // v0.10.1-r4-A5 P0-3: food-floor gating to prevent recovery boost burning
  // its only charge during the easy phase. A5 R3 trace: sim 0:18 (food=332,
  // wood=8) triggered boost via severePressure path (low-prosperity+
  // high-threat collapseRisk) — the unique relief charge consumed before
  // any real food crisis at ~5 min. When food >= 200 AND >= 1 farm exists,
  // there is no actual food emergency; defer the charge for a true crisis.
  // CRITICAL: this MUST NOT short-circuit isFoodRunwayUnsafe (which is the
  // canonical "food runway truly bad" probe — that already feeds
  // recovery.essentialOnly above and runs independently of this gate).
  // Concretely: the gate only blocks the charge consumption; the
  // essentialOnly flag (line ~519) is already set above on the actual
  // runway probe and remains active.
  const foodNow = Number(state.resources.food ?? 0);
  const farmsNow = Number(state.buildings?.farms ?? 0);
  if (foodNow >= 200 && farmsNow >= 1) {
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
  // PS-late-game-stall (R8): silence survivalScore creep when the colony
  // is dead. Pre-fix Run 3 accrued +91 -> +1031 across sim 6->28 min with
  // workers=0 / buildings=0 / production=0 — the score panel said
  // "you're earning points" while the world was rigor-mortis. clamp the
  // perSec accumulator by min(workers/4, 1) so a 4-worker colony scores
  // 100% baseline, a 1-worker colony scores 25%, a corpse scores 0.
  const workersAlive = Number(
    state?.metrics?.populationStats?.workers
      ?? state?.agents?.filter?.((a) => a?.type === "WORKER" && a?.alive !== false)?.length
      ?? 0,
  );
  const workerScale = Math.max(0, Math.min(1, workersAlive / 4));
  metrics.survivalScore += perSec * ticks * workerScale;

  // v0.10.1-r1-A5 P0-2: score must reflect outcomes, not just time.
  // Add a per-second bonus proportional to productive-building count so a
  // "do nothing" run accrues only the time floor while a built-up colony
  // scores 2-3x faster. NO new score system — same survivalScore metric,
  // just an extra summand sourced from observable game state. Defaults to
  // 0 if the BALANCE key is absent, so callers passing a metrics-only
  // state (no state.buildings) are unaffected.
  const perBuilding = Number(BALANCE.survivalScorePerProductiveBuildingSec ?? 0);
  if (perBuilding > 0 && ticks > 0) {
    const b = state.buildings ?? {};
    const productive =
        Number(b.farms ?? 0)
      + Number(b.lumbers ?? 0)
      + Number(b.quarries ?? 0)
      + Number(b.herbGardens ?? 0)
      + Number(b.kitchens ?? 0)
      + Number(b.smithies ?? 0)
      + Number(b.clinics ?? 0);
    if (productive > 0) {
      metrics.survivalScore += perBuilding * productive * ticks;
    }
  }

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
    // v0.10.1-r2-A2 P0: accumulator driving the scan-class cadence gate.
    // Drains `dt` each tick; when it crosses `_scanIntervalSec` the
    // scan-class work (coverage / milestones / recovery / scenario routes)
    // fires once and the accumulator carries the remainder. Using a
    // dt-accumulator (rather than `state.metrics.timeSec` directly) keeps
    // tests that don't advance `state.metrics.timeSec` working, AND drives
    // the gate exactly the same way in the real game where SimulationClock
    // already integrates dt into timeSec. First tick always fires (initial
    // accumulator >= interval).
    this._scanAccumulatorSec = Infinity;
    this._scanIntervalSec = 0.25;
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

    // v0.10.1-r2-A2 P0: dt-accumulator cadence gate around scan-class work.
    // computeProsperity/computeThreat smoothing (above) and
    // updateSurvivalScore (dt integration, below) MUST run every tick to
    // preserve smoothing alpha and dt monotonicity. The scan-class work
    // (buildCoverageStatus, detectScenarioObjectiveMilestones,
    // maybeTriggerRecovery, detectMilestones) only meaningfully changes at
    // sim-second granularity — running it 12× per render frame at 8x speed
    // (fixedStepSec=1/30=0.033s) is pure waste.
    //
    // Two-condition gate:
    //   (a) accumulator drained ≥ scanIntervalSec  — fires after enough sim
    //       time has accumulated across many small dt steps (the high-speed
    //       game-loop case we care about: 8x×12 steps becomes 1-2 scans).
    //   (b) dt ≥ slowCallerDtSec (≈ 1.5× the standard 1/30 step) — fires
    //       immediately when the caller is already at sim-second cadence
    //       (tests that drive update at dt=0.1 / dt=0.2 fall here, as does
    //       any future low-frequency external scheduler).
    // (b) keeps single-step tests (which expect each update to scan) green
    // while (a) delivers the 8x perf win.
    this._scanAccumulatorSec += Number(dt) || 0;
    const slowCallerDtSec = 0.05; // > 1/30 game step (0.033s)
    const scanDue = this._scanAccumulatorSec >= this._scanIntervalSec
      || (Number(dt) || 0) >= slowCallerDtSec;
    if (scanDue) {
      const runtime = getScenarioRuntime(state);
      const coverage = buildCoverageStatus(state);
      detectScenarioObjectiveMilestones(state, runtime);
      maybeTriggerRecovery(state, runtime, coverage, dt);
      detectMilestones(state);
      // Carry remainder so cadence stays close to interval over many ticks
      // rather than drifting; clamp if accumulator wildly overshoots.
      const remainder = this._scanAccumulatorSec - this._scanIntervalSec;
      this._scanAccumulatorSec = remainder > this._scanIntervalSec ? 0 : Math.max(0, remainder);
    }

    // v0.8.0 Phase 4 — Survival Mode. Survival score is the primary per-tick
    // scoring path; the legacy per-objective progression pipeline has been
    // retired (objectives no longer drive win outcomes). Stays on fast-path:
    // updateSurvivalScore integrates dt, so skipping ticks would compress
    // wall-clock score accumulation.
    updateSurvivalScore(state, dt);
  }
}

export function getDoctrinePresets() {
  return Object.values(DOCTRINE_PRESETS);
}
