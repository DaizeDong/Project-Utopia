import { TILE } from "../../../config/constants.js";

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
    byGroup[a.groupId] ??= { count: 0, avgHunger: 0, carrying: 0, states: {} };
    byGroup[a.groupId].count += 1;
    byGroup[a.groupId].avgHunger += a.hunger ?? 0;
    byGroup[a.groupId].carrying += (a.carry?.food ?? 0) + (a.carry?.wood ?? 0);
    byGroup[a.groupId].states[a.stateLabel] = (byGroup[a.groupId].states[a.stateLabel] ?? 0) + 1;
  }

  for (const a of state.animals) {
    byGroup[a.groupId] ??= { count: 0, states: {} };
    byGroup[a.groupId].count += 1;
    byGroup[a.groupId].states[a.stateLabel] = (byGroup[a.groupId].states[a.stateLabel] ?? 0) + 1;
  }

  for (const g of Object.values(byGroup)) {
    if (g.count && g.avgHunger !== undefined) {
      g.avgHunger = Number((g.avgHunger / g.count).toFixed(3));
    }
  }

  return {
    world: buildWorldSummary(state),
    groups: byGroup,
  };
}
