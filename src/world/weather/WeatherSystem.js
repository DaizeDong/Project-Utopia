import { WEATHER, TILE } from "../../config/constants.js";
import { WEATHER_MODIFIERS } from "../../config/balance.js";
import { resolveScenarioFocusTiles } from "../scenarios/ScenarioFactory.js";

function tileKey(ix, iz) {
  return `${ix},${iz}`;
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

function hazardPenaltyForWeather(weatherName) {
  if (weatherName === WEATHER.RAIN) return 1.35;
  if (weatherName === WEATHER.STORM) return 1.85;
  if (weatherName === WEATHER.WINTER) return 1.55;
  if (weatherName === WEATHER.DROUGHT) return 1.2;
  return 1;
}

function applyWeatherHazards(state, weatherName) {
  const nextTiles = buildWeatherHazardTiles(state, weatherName);
  const nextKeys = nextTiles.map((tile) => tileKey(tile.ix, tile.iz)).sort();
  const prevKeys = Array.isArray(state.weather.hazardTiles)
    ? state.weather.hazardTiles.map((tile) => tileKey(tile.ix, tile.iz)).sort()
    : [];
  const nextPenalty = hazardPenaltyForWeather(weatherName);
  const prevPenalty = Number(state.weather.hazardPenaltyMultiplier ?? 1);

  state.weather.hazardTiles = nextTiles;
  state.weather.hazardTileSet = new Set(nextKeys);
  state.weather.hazardPenaltyMultiplier = nextPenalty;
  state.weather.hazardLabel = nextTiles.length > 0 ? `${weatherName}-front` : "clear";

  if (nextKeys.join("|") !== prevKeys.join("|") || nextPenalty !== prevPenalty) {
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

export class WeatherSystem {
  constructor() {
    this.name = "WeatherSystem";
  }

  update(dt, state) {
    state.weather.timeLeftSec -= dt;
    if (state.weather.timeLeftSec > 0) return;

    setWeather(state, WEATHER.CLEAR, 999, "default");
  }
}
