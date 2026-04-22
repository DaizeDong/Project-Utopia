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

// Seasonal weather system: each season biases toward different weather types
const SEASONS = Object.freeze([
  { name: "spring", durationSec: 60, weights: { clear: 50, rain: 40, storm: 10, drought: 0, winter: 0 } },
  { name: "summer", durationSec: 60, weights: { clear: 40, rain: 0, storm: 20, drought: 40, winter: 0 } },
  { name: "autumn", durationSec: 50, weights: { clear: 60, rain: 30, storm: 10, drought: 0, winter: 0 } },
  { name: "winter", durationSec: 50, weights: { clear: 20, rain: 0, storm: 20, drought: 0, winter: 60 } },
]);

const WEATHER_DURATION = Object.freeze({
  clear: { minSec: 18, maxSec: 35 },
  rain: { minSec: 12, maxSec: 22 },
  storm: { minSec: 8, maxSec: 16 },
  drought: { minSec: 12, maxSec: 20 },
  winter: { minSec: 14, maxSec: 24 },
});

function pickWeatherFromSeason(season, rngFn) {
  const w = season.weights;
  const total = w.clear + w.rain + w.storm + w.drought + w.winter;
  let roll = rngFn() * total;
  for (const [weather, weight] of Object.entries(w)) {
    roll -= weight;
    if (roll <= 0) return weather;
  }
  return WEATHER.CLEAR;
}

export class WeatherSystem {
  constructor() {
    this.name = "WeatherSystem";
    this._seasonIndex = 0;
    this._seasonStartSec = -1;
    this._nextWeatherAtSec = -1;
  }

  update(dt, state, services) {
    const rngFn = typeof services?.rng?.next === "function"
      ? () => services.rng.next()
      : Math.random;
    state.weather.timeLeftSec -= dt;
    const now = state.metrics?.timeSec ?? 0;

    // Initialise season tracking on first tick
    if (this._seasonStartSec < 0) {
      this._seasonStartSec = now;
      this._nextWeatherAtSec = now;
      state.weather.season = SEASONS[0].name;
      state.weather.seasonProgress = 0;
    }

    // Advance season
    const season = SEASONS[this._seasonIndex];
    const seasonElapsed = now - this._seasonStartSec;
    state.weather.seasonProgress = Math.min(1, seasonElapsed / season.durationSec);
    if (seasonElapsed >= season.durationSec) {
      this._seasonIndex = (this._seasonIndex + 1) % SEASONS.length;
      this._seasonStartSec = now;
      state.weather.season = SEASONS[this._seasonIndex].name;
      state.weather.seasonProgress = 0;
    }

    // Weather changes within season
    if (now < this._nextWeatherAtSec) return;

    const currentSeason = SEASONS[this._seasonIndex];
    const weatherName = pickWeatherFromSeason(currentSeason, rngFn);
    const dur = WEATHER_DURATION[weatherName] ?? WEATHER_DURATION.clear;
    const duration = dur.minSec + rngFn() * (dur.maxSec - dur.minSec);
    const prevWeather = state.weather.current;
    setWeather(state, weatherName, duration, "cycle");
    this._nextWeatherAtSec = now + duration;
    if (prevWeather !== weatherName) {
      emitEvent(state, EVENT_TYPES.WEATHER_CHANGED, { from: prevWeather, to: weatherName, duration, season: currentSeason.name });
    }
  }
}
