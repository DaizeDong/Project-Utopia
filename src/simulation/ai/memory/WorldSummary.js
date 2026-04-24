import { GROUP_IDS } from "../../../config/aiConfig.js";
import { TILE } from "../../../config/constants.js";
import {
  GROUP_DEFAULT_STATE,
  listGroupStates,
  listGroupTransitions,
} from "../../npc/state/StateGraph.js";
import { getScenarioRuntime } from "../../../world/scenarios/ScenarioFactory.js";
import { MIN_FOOD_FOR_GROWTH } from "../../population/PopulationGrowthSystem.js";
import {
  sampleTerrainAggregates,
  sampleSoilAggregates,
  sampleNodeDepletionCounts,
  sampleWaterConnectivity,
} from "../colony/ColonyPerceiver.js";

const POLICY_GROUP_ORDER = Object.freeze([
  GROUP_IDS.WORKERS,
  GROUP_IDS.TRADERS,
  GROUP_IDS.SABOTEURS,
  GROUP_IDS.HERBIVORES,
  GROUP_IDS.PREDATORS,
]);

function countPassability(grid) {
  let passable = 0;
  for (let i = 0; i < grid.tiles.length; i += 1) {
    if (grid.tiles[i] !== TILE.WALL && grid.tiles[i] !== TILE.WATER) passable += 1;
  }
  return passable / grid.tiles.length;
}

function estimateCongestion(state) {
  let moving = 0;
  let idle = 0;
  for (const e of [...state.agents, ...state.animals]) {
    const speed = Math.hypot(e.vx, e.vz);
    if (speed > 0.2) moving += 1;
    else idle += 1;
  }
  const total = moving + idle;
  if (total === 0) return 0;
  return idle / total;
}

function resolveDominantState(stateCounts, fallbackState) {
  let bestState = fallbackState;
  let bestCount = -1;
  for (const [state, count] of Object.entries(stateCounts ?? {})) {
    const safe = Number(count) || 0;
    if (safe > bestCount) {
      bestCount = safe;
      bestState = state;
    }
  }
  return bestState;
}

function buildTransitionHints(groupId, world, groupStats) {
  const dominant = groupStats.dominantState;
  const avgHunger = Number(groupStats.avgHunger ?? 0.5);
  const food = Number(world.resources?.food ?? 0);
  const threatSignals = Number(world.events?.length ?? 0);
  const hints = [];

  if (groupId === GROUP_IDS.WORKERS) {
    if (food < MIN_FOOD_FOR_GROWTH || avgHunger < 0.34) hints.push("seek_food -> eat -> seek_task");
    if ((groupStats.carrying ?? 0) > Math.max(4, groupStats.count * 0.5)) hints.push("deliver -> seek_task");
    if (dominant === "wander" || dominant === "idle") hints.push("wander -> seek_task -> harvest");
  } else if (groupId === GROUP_IDS.TRADERS) {
    if (avgHunger < 0.36) hints.push("seek_food -> eat -> seek_trade");
    if (dominant === "wander" || dominant === "idle") hints.push("wander -> seek_trade");
    if (threatSignals > 0) hints.push("trade -> seek_trade (short ttl)");
  } else if (groupId === GROUP_IDS.SABOTEURS) {
    if (avgHunger < 0.34) hints.push("seek_food -> eat -> scout");
    hints.push("scout -> sabotage -> evade -> scout");
  } else if (groupId === GROUP_IDS.HERBIVORES) {
    if (dominant === "flee") hints.push("flee -> regroup -> graze");
    else hints.push("graze -> regroup -> wander");
  } else if (groupId === GROUP_IDS.PREDATORS) {
    if (dominant === "rest") hints.push("rest -> stalk -> hunt");
    else hints.push("stalk -> hunt -> feed -> roam");
  }

  return Array.from(new Set(hints)).slice(0, 3);
}

function buildFrontierSummary(runtime) {
  return {
    connectedRoutes: Number(runtime.connectedRoutes ?? 0),
    totalRoutes: Number(runtime.routes?.length ?? 0),
    readyDepots: Number(runtime.readyDepots ?? 0),
    totalDepots: Number(runtime.depots?.length ?? 0),
    brokenRouteCount: Number((runtime.routes ?? []).filter((route) => !route.connected).length),
    brokenRoutes: (runtime.routes ?? []).filter((route) => !route.connected).map((route) => route.label).slice(0, 3),
    readyDepotLabels: (runtime.depots ?? []).filter((depot) => depot.ready).map((depot) => depot.label).slice(0, 3),
    unreadyDepotCount: Number((runtime.depots ?? []).filter((depot) => !depot.ready).length),
    unreadyDepots: (runtime.depots ?? []).filter((depot) => !depot.ready).map((depot) => depot.label).slice(0, 3),
  };
}

function buildOperationsSummary(world) {
  const frontier = world.frontier ?? {};
  const logistics = world.logistics ?? {};
  const recovery = world.gameplay?.recovery ?? {};
  const ecology = world.ecology ?? {};
  const issues = [];

  if ((frontier.brokenRoutes ?? []).length > 0) issues.push(`repair ${frontier.brokenRoutes[0]}`);
  if ((frontier.unreadyDepots ?? []).length > 0) issues.push(`reclaim ${frontier.unreadyDepots[0]}`);
  if (Number(logistics.overloadedWarehouses ?? 0) > 0) issues.push("relieve depot congestion");
  if (Number(logistics.strandedCarryWorkers ?? 0) > 0) issues.push("unstick delivery paths");
  if (Number(ecology.pressuredFarms ?? 0) > 0) issues.push("respond to farm pressure");
  if (Number(recovery.collapseRisk ?? 0) >= 60) issues.push("preserve recovery window");

  return {
    keyIssues: issues.slice(0, 5),
    focus: issues[0] ?? "maintain stable frontier throughput",
  };
}

export function buildWorldSummary(state) {
  const workers = state.agents.filter((a) => a.type === "WORKER").length;
  const visitors = state.agents.filter((a) => a.type === "VISITOR").length;
  const herbivores = state.animals.filter((a) => a.kind === "HERBIVORE").length;
  const predators = state.animals.filter((a) => a.kind === "PREDATOR").length;
  const runtime = getScenarioRuntime(state);
  const currentObjective = state.gameplay?.objectives?.[state.gameplay?.objectiveIndex ?? 0] ?? null;

  const summary = {
    simTimeSec: Math.floor(state.metrics.timeSec),
    resources: {
      food: Number(state.resources.food.toFixed(2)),
      wood: Number(state.resources.wood.toFixed(2)),
      stone: Number(Number(state.resources?.stone ?? 0).toFixed(2)),
      herbs: Number(Number(state.resources?.herbs ?? 0).toFixed(2)),
      meals: Number(Number(state.resources?.meals ?? 0).toFixed(2)),
      medicine: Number(Number(state.resources?.medicine ?? 0).toFixed(2)),
      tools: Number(Number(state.resources?.tools ?? 0).toFixed(2)),
    },
    population: { workers, visitors, herbivores, predators },
    buildings: { ...state.buildings },
    scenario: {
      id: String(runtime.scenario?.id ?? ""),
      title: String(runtime.scenario?.title ?? ""),
      family: String(runtime.scenario?.family ?? ""),
      summary: String(runtime.scenario?.summary ?? ""),
    },
    objective: currentObjective
      ? {
          id: currentObjective.id,
          title: currentObjective.title,
          description: currentObjective.description,
          progress: Number(Number(currentObjective.progress ?? 0).toFixed(1)),
          hint: String(state.gameplay?.objectiveHint ?? ""),
        }
      : {
          id: "",
          title: "All objectives completed",
          description: "",
          progress: 100,
          hint: String(state.gameplay?.objectiveHint ?? ""),
        },
    gameplay: {
      doctrine: String(state.gameplay?.doctrine ?? "balanced"),
      prosperity: Number(Number(state.gameplay?.prosperity ?? 0).toFixed(2)),
      threat: Number(Number(state.gameplay?.threat ?? 0).toFixed(2)),
      doctrineMastery: Number(Number(state.gameplay?.doctrineMastery ?? 1).toFixed(3)),
      recovery: {
        charges: Number(state.gameplay?.recovery?.charges ?? 0),
        activeBoostSec: Number(Number(state.gameplay?.recovery?.activeBoostSec ?? 0).toFixed(1)),
        collapseRisk: Number(Number(state.gameplay?.recovery?.collapseRisk ?? 0).toFixed(1)),
        lastReason: String(state.gameplay?.recovery?.lastReason ?? ""),
      },
    },
    frontier: buildFrontierSummary(runtime),
    weather: {
      current: state.weather.current,
      timeLeftSec: Number(state.weather.timeLeftSec.toFixed(1)),
      pressureScore: Number((state.weather.pressureScore ?? 0).toFixed(2)),
      hazardFronts: Number(state.weather.hazardFronts?.length ?? 0),
      hazardFocusSummary: String(state.weather.hazardFocusSummary ?? ""),
    },
    traffic: {
      congestion: Number(estimateCongestion(state).toFixed(3)),
      passableRatio: Number(countPassability(state.grid).toFixed(3)),
    },
    logistics: {
      carryingWorkers: Number(state.metrics?.logistics?.carryingWorkers ?? 0),
      totalCarryInTransit: Number(Number(state.metrics?.logistics?.totalCarryInTransit ?? 0).toFixed(2)),
      avgDepotDistance: Number(Number(state.metrics?.logistics?.avgDepotDistance ?? 0).toFixed(2)),
      strandedCarryWorkers: Number(state.metrics?.logistics?.strandedCarryWorkers ?? 0),
      overloadedWarehouses: Number(state.metrics?.logistics?.overloadedWarehouses ?? 0),
      busiestWarehouseLoad: Number(state.metrics?.logistics?.busiestWarehouseLoad ?? 0),
      stretchedWorksites: Number(state.metrics?.logistics?.stretchedWorksites ?? 0),
      isolatedWorksites: Number(state.metrics?.logistics?.isolatedWorksites ?? 0),
      summary: String(state.metrics?.logistics?.summary ?? "Logistics: unavailable"),
    },
    ecology: {
      pressuredFarms: Number(state.metrics?.ecology?.pressuredFarms ?? 0),
      maxFarmPressure: Number(Number(state.metrics?.ecology?.maxFarmPressure ?? 0).toFixed(2)),
      frontierPredators: Number(state.metrics?.ecology?.frontierPredators ?? 0),
      migrationHerds: Number(state.metrics?.ecology?.migrationHerds ?? 0),
      hotspotFarms: (state.metrics?.ecology?.hotspotFarms ?? []).slice(0, 3),
      summary: String(state.metrics?.ecology?.summary ?? "Ecology: unavailable"),
    },
    events: state.events.active.map((e) => ({
      type: e.type,
      status: e.status,
      intensity: e.intensity,
      targetLabel: String(e.payload?.targetLabel ?? ""),
      severity: String(e.payload?.severity ?? ""),
      pressure: Number(Number(e.payload?.pressure ?? 0).toFixed(2)),
      contestedTiles: Number(e.payload?.contestedTiles ?? 0),
      remainingSec: Number(Math.max(0, e.durationSec - e.elapsedSec).toFixed(1)),
    })),
    spatialPressure: {
      weatherPressure: Number((state.metrics.spatialPressure?.weatherPressure ?? 0).toFixed(2)),
      eventPressure: Number((state.metrics.spatialPressure?.eventPressure ?? 0).toFixed(2)),
      contestedZones: Number(state.metrics.spatialPressure?.contestedZones ?? 0),
      activeEventCount: Number(state.metrics.spatialPressure?.activeEventCount ?? 0),
    },
    aiMode: state.ai.mode,

    // v0.8.2: terrain, soil, node depletion counts, water connectivity
    terrain: sampleTerrainAggregates(state.grid),
    soil: sampleSoilAggregates(state.grid),
    nodes: sampleNodeDepletionCounts(state.grid),
    connectivity: sampleWaterConnectivity(state),
  };

  summary.operations = buildOperationsSummary(summary);

  if (state.ai?.strategy) {
    summary._strategyContext = {
      priority: state.ai.strategy.priority,
      resourceFocus: state.ai.strategy.resourceFocus,
      defensePosture: state.ai.strategy.defensePosture,
      riskTolerance: state.ai.strategy.riskTolerance,
      workerFocus: state.ai.strategy.workerFocus,
      environmentPreference: state.ai.strategy.environmentPreference,
    };
  }

  return summary;
}

export function buildPolicySummary(state) {
  const byGroup = {};

  for (const a of state.agents) {
    const stateNode = a.blackboard?.fsm?.state ?? a.stateLabel ?? "idle";
    byGroup[a.groupId] ??= { count: 0, avgHunger: 0, carrying: 0, states: {} };
    byGroup[a.groupId].count += 1;
    byGroup[a.groupId].avgHunger += a.hunger ?? 0;
    byGroup[a.groupId].carrying += (a.carry?.food ?? 0) + (a.carry?.wood ?? 0);
    byGroup[a.groupId].states[stateNode] = (byGroup[a.groupId].states[stateNode] ?? 0) + 1;
  }

  for (const a of state.animals) {
    const stateNode = a.blackboard?.fsm?.state ?? a.stateLabel ?? "idle";
    byGroup[a.groupId] ??= { count: 0, states: {} };
    byGroup[a.groupId].count += 1;
    byGroup[a.groupId].states[stateNode] = (byGroup[a.groupId].states[stateNode] ?? 0) + 1;
  }

  for (const g of Object.values(byGroup)) {
    if (g.count && g.avgHunger !== undefined) {
      g.avgHunger = Number((g.avgHunger / g.count).toFixed(3));
    }
  }

  const world = buildWorldSummary(state);
  const transitionContext = {};
  for (const groupId of POLICY_GROUP_ORDER) {
    const stats = byGroup[groupId] ?? { count: 0, avgHunger: 0, carrying: 0, states: {} };
    const dominantState = resolveDominantState(stats.states, GROUP_DEFAULT_STATE[groupId] ?? "idle");
    transitionContext[groupId] = {
      count: Number(stats.count ?? 0),
      avgHunger: Number(stats.avgHunger ?? 0),
      carrying: Number(stats.carrying ?? 0),
      states: stats.states ?? {},
      dominantState,
      stateNodes: listGroupStates(groupId),
      transitions: listGroupTransitions(groupId),
      preferredPaths: buildTransitionHints(groupId, world, {
        ...stats,
        dominantState,
      }),
    };
  }

  return {
    world,
    groups: byGroup,
    stateTransitions: {
      groups: transitionContext,
      generatedAtSec: Number(state.metrics.timeSec ?? 0),
    },
  };
}
