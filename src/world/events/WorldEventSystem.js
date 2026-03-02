import { EVENT_TYPE, VISITOR_KIND } from "../../config/constants.js";

function applyActiveEvent(event, dt, state) {
  if (event.type === EVENT_TYPE.BANDIT_RAID) {
    const loss = event.intensity * dt * 0.75;
    state.resources.food = Math.max(0, state.resources.food - loss);
    state.resources.wood = Math.max(0, state.resources.wood - loss * 0.8);

    const saboteurs = state.agents.filter((a) => a.type === "VISITOR" && a.kind === VISITOR_KIND.SABOTEUR);
    const boost = Math.max(0.3, 1.5 - saboteurs.length * 0.03);
    for (const s of saboteurs) {
      s.sabotageCooldown = Math.max(1.5, s.sabotageCooldown - dt * boost);
    }
  }

  if (event.type === EVENT_TYPE.TRADE_CARAVAN) {
    state.resources.food += dt * 0.65 * event.intensity;
    state.resources.wood += dt * 0.45 * event.intensity;
  }

  if (event.type === EVENT_TYPE.ANIMAL_MIGRATION) {
    for (const animal of state.animals) {
      if (animal.kind === "HERBIVORE") {
        animal.memory.recentEvents.unshift("migration");
        animal.memory.recentEvents = animal.memory.recentEvents.slice(0, 6);
      }
    }
  }
}

function advanceLifecycle(event, dt) {
  event.elapsedSec += dt;

  if (event.status === "prepare" && event.elapsedSec >= 1) {
    event.status = "active";
    event.elapsedSec = 0;
    return true;
  }

  if (event.status === "active" && event.elapsedSec >= event.durationSec) {
    event.status = "resolve";
    event.elapsedSec = 0;
    return true;
  }

  if (event.status === "resolve" && event.elapsedSec >= 1) {
    event.status = "cooldown";
    event.elapsedSec = 0;
    return true;
  }

  return false;
}

export class WorldEventSystem {
  constructor() {
    this.name = "WorldEventSystem";
  }

  update(dt, state) {
    if (state.events.queue.length > 0) {
      const spawned = state.events.queue.splice(0, state.events.queue.length);
      state.events.active.push(...spawned);
      if (state.debug?.eventTrace) {
        for (const event of spawned) {
          state.debug.eventTrace.unshift(`[${state.metrics.timeSec.toFixed(1)}s] spawn ${event.type} status=${event.status}`);
        }
        state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
      }
    }

    for (const event of state.events.active) {
      const prevStatus = event.status;
      if (event.status === "active") {
        applyActiveEvent(event, dt, state);
      }
      const changed = advanceLifecycle(event, dt);
      if (changed && state.debug?.eventTrace) {
        state.debug.eventTrace.unshift(
          `[${state.metrics.timeSec.toFixed(1)}s] ${event.type} ${prevStatus} -> ${event.status}`,
        );
        state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
      }
    }

    state.events.active = state.events.active.filter((event) => {
      if (event.status !== "cooldown") return true;
      return event.elapsedSec < 4;
    });
  }
}
