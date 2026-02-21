import { WEATHER } from "../../config/constants.js";
import { WEATHER_MODIFIERS } from "../../config/balance.js";

export function setWeather(state, weatherName, durationSec = 30, source = "event") {
  const m = WEATHER_MODIFIERS[weatherName] ?? WEATHER_MODIFIERS[WEATHER.CLEAR];
  state.weather.current = weatherName;
  state.weather.timeLeftSec = durationSec;
  state.weather.moveCostMultiplier = m.moveCostMultiplier;
  state.weather.farmProductionMultiplier = m.farmProductionMultiplier;
  state.weather.lumberProductionMultiplier = m.lumberProductionMultiplier;
  state.weather.source = source;
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
