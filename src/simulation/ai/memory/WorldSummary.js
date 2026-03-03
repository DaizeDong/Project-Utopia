import { GROUP_IDS } from "../../../config/aiConfig.js";
import { TILE } from "../../../config/constants.js";
import {
  GROUP_DEFAULT_STATE,
  listGroupStates,
  listGroupTransitions,
} from "../../npc/state/StateGraph.js";

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
    if (food < 20 || avgHunger < 0.34) hints.push("seek_food -> eat -> seek_task");
    if ((groupStats.carrying ?? 0) > Math.max(4, groupStats.count * 0.5)) hints.push("harvest -> deliver -> seek_task");
    if (dominant === "wander" || dominant === "idle") hints.push("wander -> seek_task -> harvest");
  } else if (groupId === GROUP_IDS.TRADERS) {
    if (avgHunger < 0.36) hints.push("seek_food -> eat -> seek_trade");
    if (dominant === "wander" || dominant === "idle") hints.push("wander -> seek_trade -> trade");
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

export function buildWorldSummary(state) {
  const workers = state.agents.filter((a) => a.type === "WORKER").length;
  const visitors = state.agents.filter((a) => a.type === "VISITOR").length;
  const herbivores = state.animals.filter((a) => a.kind === "HERBIVORE").length;
  const predators = state.animals.filter((a) => a.kind === "PREDATOR").length;

  return {
    simTimeSec: Math.floor(state.metrics.timeSec),
    resources: {
      food: Number(state.resources.food.toFixed(2)),
      wood: Number(state.resources.wood.toFixed(2)),
    },
    population: { workers, visitors, herbivores, predators },
    buildings: { ...state.buildings },
    weather: { current: state.weather.current, timeLeftSec: Number(state.weather.timeLeftSec.toFixed(1)) },
    traffic: {
      congestion: Number(estimateCongestion(state).toFixed(3)),
      passableRatio: Number(countPassability(state.grid).toFixed(3)),
    },
    events: state.events.active.map((e) => ({
      type: e.type,
      status: e.status,
      intensity: e.intensity,
      remainingSec: Number(Math.max(0, e.durationSec - e.elapsedSec).toFixed(1)),
    })),
    aiMode: state.ai.mode,
  };
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
