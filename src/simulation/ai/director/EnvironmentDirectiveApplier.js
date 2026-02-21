import { enqueueEvent } from "../../../world/events/WorldEventQueue.js";
import { setWeather } from "../../../world/weather/WeatherSystem.js";

export function applyEnvironmentDirective(state, directive) {
  setWeather(state, directive.weather, directive.durationSec, "directive");

  for (const spawn of directive.eventSpawns ?? []) {
    enqueueEvent(state, spawn.type, {}, spawn.durationSec, spawn.intensity);
  }
}
