import { getLongRunEventTuning } from "../../../config/longRunProfile.js";
import { enqueueEvent } from "../../../world/events/WorldEventQueue.js";
import { setWeather } from "../../../world/weather/WeatherSystem.js";

export function applyEnvironmentDirective(state, directive) {
  setWeather(state, directive.weather, directive.durationSec, "directive");

  const tuning = getLongRunEventTuning(state);
  for (const spawn of directive.eventSpawns ?? []) {
    const activeCount = (state.events.active ?? []).filter((event) => event.type === spawn.type).length;
    const queuedCount = (state.events.queue ?? []).filter((event) => event.type === spawn.type).length;
    const maxConcurrent = Number(tuning.maxConcurrentByType?.[spawn.type] ?? Infinity);
    if (activeCount + queuedCount >= maxConcurrent) continue;
    enqueueEvent(state, spawn.type, {}, spawn.durationSec, spawn.intensity);
  }
}
