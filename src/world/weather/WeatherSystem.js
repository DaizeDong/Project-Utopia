import { WEATHER, TILE } from "../../config/constants.js";
import { WEATHER_MODIFIERS } from "../../config/balance.js";
import { getScenarioFocusZones, resolveScenarioFocusTiles } from "../scenarios/ScenarioFactory.js";
import { emitEvent, EVENT_TYPES } from "../../simulation/meta/GameEventBus.js";

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

function roundMetric(value, digits = 3) {
  return Number(Number(value ?? 0).toFixed(digits));
}

function expandHazardTiles(state, seeds = [], radius = 1) {
  const out = [];
  const seen = new Set();

  for (const seed of seeds) {
    if (!seed) continue;
    for (let iz = seed.iz - radius; iz <= seed.iz + radius; iz += 1) {
      for (let ix = seed.ix - radius; ix <= seed.ix + radius; ix += 1) {
        if (ix < 0 || iz < 0 || ix >= state.grid.width || iz >= state.grid.height) continue;
        if (Math.abs(ix - seed.ix) + Math.abs(iz - seed.iz) > radius) continue;
        const key = tileKey(ix, iz);
        if (seen.has(key)) continue;
        const tile = state.grid.tiles[ix + iz * state.grid.width];
        if (tile === TILE.WALL || tile === TILE.WATER) continue;
        seen.add(key);
        out.push({ ix, iz });
      }
    }
  }

  return out;
}

function buildWeatherHazardTiles(state, weatherName) {
  const refs = state.gameplay?.scenario?.weatherFocus?.[weatherName] ?? [];
  if (refs.length > 0) return resolveScenarioFocusTiles(state, refs);

  if (weatherName !== WEATHER.DROUGHT) return [];

  const farmTiles = [];
  for (let iz = 0; iz < state.grid.height; iz += 1) {
    for (let ix = 0; ix < state.grid.width; ix += 1) {
      if (state.grid.tiles[ix + iz * state.grid.width] === TILE.FARM) {
        farmTiles.push({ ix, iz });
      }
    }
  }
  return expandHazardTiles(state, farmTiles.slice(0, 6), 1);
}

function basePenaltyForWeather(weatherName) {
  if (weatherName === WEATHER.RAIN) return 1.22;
  if (weatherName === WEATHER.STORM) return 1.52;
  if (weatherName === WEATHER.WINTER) return 1.38;
  if (weatherName === WEATHER.DROUGHT) return 1.18;
  return 1;
}

function zonePenaltyForKind(kind) {
  if (kind === "choke") return 0.28;
  if (kind === "route") return 0.2;
  if (kind === "depot") return 0.16;
  if (kind === "wildlife") return 0.1;
  if (kind === "farms") return 0.18;
  return 0.08;
}

function buildWeatherFronts(state, weatherName) {
  const refs = state.gameplay?.scenario?.weatherFocus?.[weatherName] ?? [];
  const zones = refs.length > 0
    ? getScenarioFocusZones(state, refs)
    : weatherName === WEATHER.DROUGHT
      ? [{ ref: { kind: "farms", id: "farm-belt", limit: 6 }, kind: "farms", label: "farm belt", tiles: buildWeatherHazardTiles(state, weatherName) }]
      : [];
  const fronts = [];
  const penaltyByKey = {};
  const labelsByKey = {};
  const basePenalty = basePenaltyForWeather(weatherName);

  for (const zone of zones) {
    let peakPenalty = 1;
    let contestedTiles = 0;
    for (const tile of zone.tiles) {
      const key = tileKey(tile.ix, tile.iz);
      const nextPenalty = roundMetric(basePenalty + zonePenaltyForKind(zone.kind));
      if (penaltyByKey[key]) {
        contestedTiles += 1;
        penaltyByKey[key] = roundMetric(Math.max(penaltyByKey[key], nextPenalty) + 0.12, 3);
      } else {
        penaltyByKey[key] = nextPenalty;
      }
      peakPenalty = Math.max(peakPenalty, penaltyByKey[key]);
      labelsByKey[key] ??= [];
      if (!labelsByKey[key].includes(zone.label)) labelsByKey[key].push(zone.label);
    }
    fronts.push({
      label: zone.label,
      kind: zone.kind,
      tileCount: zone.tiles.length,
      contestedTiles,
      peakPenalty: roundMetric(peakPenalty, 2),
    });
  }

  const entries = Object.entries(penaltyByKey);
  const pressureScore = entries.length <= 0
    ? 0
    : roundMetric(entries.reduce((sum, [, penalty]) => sum + Math.max(0, Number(penalty) - 1), 0) / entries.length, 2);
  return {
    hazardTiles: entries.map(([key]) => {
      const [ix, iz] = key.split(",").map(Number);
      return { ix, iz };
    }),
    hazardPenaltyByKey: Object.fromEntries(entries.map(([key, penalty]) => [key, roundMetric(penalty, 3)])),
    hazardLabelByKey: labelsByKey,
    hazardFronts: fronts,
    hazardFocusSummary: fronts.length > 0 ? fronts.map((front) => front.label).join(", ") : "",
    pressureScore,
  };
}

function hazardPenaltyForWeather(weatherName) {
  if (weatherName === WEATHER.RAIN) return 1.35;
  if (weatherName === WEATHER.STORM) return 1.85;
  if (weatherName === WEATHER.WINTER) return 1.55;
  if (weatherName === WEATHER.DROUGHT) return 1.2;
  return 1;
}

function applyWeatherHazards(state, weatherName) {
  const nextWeather = buildWeatherFronts(state, weatherName);
  const nextTiles = nextWeather.hazardTiles;
  const nextKeys = nextTiles.map((tile) => tileKey(tile.ix, tile.iz)).sort();
  const prevKeys = Array.isArray(state.weather.hazardTiles)
    ? state.weather.hazardTiles.map((tile) => tileKey(tile.ix, tile.iz)).sort()
    : [];
  const nextPenalty = hazardPenaltyForWeather(weatherName);
  const prevPenalty = Number(state.weather.hazardPenaltyMultiplier ?? 1);
  const prevPenaltyByKey = JSON.stringify(state.weather.hazardPenaltyByKey ?? {});
  const nextPenaltyByKey = JSON.stringify(nextWeather.hazardPenaltyByKey ?? {});
  const prevFronts = JSON.stringify(state.weather.hazardFronts ?? []);
  const nextFronts = JSON.stringify(nextWeather.hazardFronts ?? []);

  state.weather.hazardTiles = nextTiles;
  state.weather.hazardTileSet = new Set(nextKeys);
  state.weather.hazardPenaltyMultiplier = nextPenalty;
  state.weather.hazardLabel = nextTiles.length > 0 ? `${weatherName}-front` : "clear";
  state.weather.hazardPenaltyByKey = nextWeather.hazardPenaltyByKey;
  state.weather.hazardLabelByKey = nextWeather.hazardLabelByKey;
  state.weather.hazardFronts = nextWeather.hazardFronts;
  state.weather.hazardFocusSummary = nextWeather.hazardFocusSummary;
  state.weather.pressureScore = nextWeather.pressureScore;

  if (
    nextKeys.join("|") !== prevKeys.join("|")
    || nextPenalty !== prevPenalty
    || prevPenaltyByKey !== nextPenaltyByKey
    || prevFronts !== nextFronts
  ) {
    state.grid.version = Number(state.grid.version ?? 0) + 1;
  }
}

export function setWeather(state, weatherName, durationSec = 30, source = "event") {
  const m = WEATHER_MODIFIERS[weatherName] ?? WEATHER_MODIFIERS[WEATHER.CLEAR];
  state.weather.current = weatherName;
  state.weather.timeLeftSec = durationSec;
  state.weather.moveCostMultiplier = m.moveCostMultiplier;
  state.weather.farmProductionMultiplier = m.farmProductionMultiplier;
  state.weather.lumberProductionMultiplier = m.lumberProductionMultiplier;
  state.weather.source = source;
  applyWeatherHazards(state, weatherName);
}

// Natural weather cycle: clear-dominant with occasional other weather
const WEATHER_CYCLE = Object.freeze([
  { weather: WEATHER.CLEAR, minSec: 25, maxSec: 40 },
  { weather: WEATHER.RAIN, minSec: 15, maxSec: 25 },
  { weather: WEATHER.CLEAR, minSec: 20, maxSec: 35 },
  { weather: WEATHER.DROUGHT, minSec: 12, maxSec: 20 },
  { weather: WEATHER.CLEAR, minSec: 20, maxSec: 30 },
  { weather: WEATHER.WINTER, minSec: 15, maxSec: 25 },
  { weather: WEATHER.CLEAR, minSec: 20, maxSec: 35 },
  { weather: WEATHER.STORM, minSec: 10, maxSec: 18 },
]);

export class WeatherSystem {
  constructor() {
    this.name = "WeatherSystem";
    this._cycleIndex = 0;
    this._nextCycleAtSec = -1;
  }

  update(dt, state) {
    state.weather.timeLeftSec -= dt;
    const now = state.metrics?.timeSec ?? 0;

    // Initialise internal cycle timer on first tick
    if (this._nextCycleAtSec < 0) {
      const first = WEATHER_CYCLE[0];
      this._nextCycleAtSec = now + (first.minSec + Math.random() * (first.maxSec - first.minSec));
    }

    // Natural weather cycle runs on its own timer, independent of
    // state.weather.timeLeftSec (which EnvironmentDirectorSystem may reset).
    if (now < this._nextCycleAtSec) return;

    this._cycleIndex = (this._cycleIndex + 1) % WEATHER_CYCLE.length;
    const entry = WEATHER_CYCLE[this._cycleIndex];
    const duration = entry.minSec + Math.random() * (entry.maxSec - entry.minSec);
    const prevWeather = state.weather.current;
    setWeather(state, entry.weather, duration, "cycle");
    this._nextCycleAtSec = now + duration;
    if (prevWeather !== entry.weather) {
      emitEvent(state, EVENT_TYPES.WEATHER_CHANGED, { from: prevWeather, to: entry.weather, duration });
    }
  }
}
