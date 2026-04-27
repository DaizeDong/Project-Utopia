import { emitEvent, EVENT_TYPES } from "../simulation/meta/GameEventBus.js";

const DAY_CYCLE_PERIOD_SEC = 60; // 60s = one full day/night cycle

export class SimulationClock {
  constructor() {
    this.name = "SimulationClock";
    this._prevIsNight = false;
  }

  update(dt, state) {
    state.metrics.timeSec += dt;
    state.metrics.tick += 1;
    state.metrics.frameCount += 1;

    // Day/night cycle: 0-1, where 0.0-0.5 is day and 0.5-1.0 is night
    const cyclePos = (state.metrics.timeSec % DAY_CYCLE_PERIOD_SEC) / DAY_CYCLE_PERIOD_SEC;
    state.environment ??= {};
    state.environment.dayNightPhase = cyclePos;
    state.environment.isNight = cyclePos >= 0.5;
    // Light level: peaks at 0.25 (noon), troughs at 0.75 (midnight)
    // Sine wave: 1.0 at noon, 0.0 at midnight
    state.environment.lightLevel = 0.5 + 0.5 * Math.cos((cyclePos - 0.25) * Math.PI * 2);

    // Emit day/night transition events
    if (state.environment.isNight && !this._prevIsNight) {
      emitEvent(state, EVENT_TYPES.NIGHT_BEGAN, { phase: cyclePos });
    } else if (!state.environment.isNight && this._prevIsNight) {
      emitEvent(state, EVENT_TYPES.DAY_BEGAN, { phase: cyclePos });
    }
    this._prevIsNight = state.environment.isNight;
  }
}
