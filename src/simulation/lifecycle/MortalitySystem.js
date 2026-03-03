import { ANIMAL_KIND, ENTITY_TYPE } from "../../config/constants.js";
import { pushWarning } from "../../app/warnings.js";

function deathThresholdFor(entity) {
  if (entity.type === ENTITY_TYPE.WORKER) return { hunger: 0.05, holdSec: 20 };
  if (entity.type === ENTITY_TYPE.VISITOR) return { hunger: 0.04, holdSec: 26 };
  if (entity.kind === ANIMAL_KIND.HERBIVORE) return { hunger: 0.035, holdSec: 14 };
  return { hunger: 0.03, holdSec: 22 };
}

function incrementDeathCounters(state, entity, reason) {
  state.metrics.deathsTotal = Number(state.metrics.deathsTotal ?? 0) + 1;
  state.metrics.deathsByReason ??= {};
  state.metrics.deathsByReason[reason] = Number(state.metrics.deathsByReason[reason] ?? 0) + 1;
  state.metrics.deathsByGroup ??= {};
  const groupId = String(entity.groupId ?? entity.kind ?? entity.type ?? "unknown");
  state.metrics.deathsByGroup[groupId] = Number(state.metrics.deathsByGroup[groupId] ?? 0) + 1;
}

function markDeath(entity, reason, nowSec) {
  entity.alive = false;
  entity.deathReason = reason;
  entity.deathSec = nowSec;
}

function shouldStarve(entity, dt) {
  const { hunger, holdSec } = deathThresholdFor(entity);
  const current = Number(entity.hunger ?? 1);
  if (current <= hunger) {
    entity.starvationSec = Number(entity.starvationSec ?? 0) + dt;
  } else {
    entity.starvationSec = 0;
  }
  return Number(entity.starvationSec ?? 0) >= holdSec;
}

export class MortalitySystem {
  constructor() {
    this.name = "MortalitySystem";
  }

  update(dt, state) {
    const nowSec = Number(state.metrics.timeSec ?? 0);
    const deadIds = new Set();
    const deathEvents = [];

    for (const entity of state.agents) {
      if (entity.alive === false) {
        deadIds.add(entity.id);
        continue;
      }
      if (Number(entity.hp ?? 1) <= 0) {
        markDeath(entity, entity.deathReason || "event", nowSec);
      } else if (shouldStarve(entity, dt)) {
        markDeath(entity, "starvation", nowSec);
      }
      if (entity.alive === false) {
        deadIds.add(entity.id);
        incrementDeathCounters(state, entity, entity.deathReason || "event");
        deathEvents.push(`${entity.displayName ?? entity.id} died (${entity.deathReason || "event"}).`);
      }
    }

    for (const animal of state.animals) {
      if (animal.alive === false) {
        deadIds.add(animal.id);
        continue;
      }
      if (Number(animal.hp ?? 1) <= 0) {
        markDeath(animal, animal.deathReason || "predation", nowSec);
      } else if (shouldStarve(animal, dt)) {
        markDeath(animal, "starvation", nowSec);
      }
      if (animal.alive === false) {
        deadIds.add(animal.id);
        incrementDeathCounters(state, animal, animal.deathReason || "event");
        deathEvents.push(`${animal.displayName ?? animal.id} died (${animal.deathReason || "event"}).`);
      }
    }

    if (deadIds.size === 0) return;

    state.agents = state.agents.filter((entity) => !deadIds.has(entity.id));
    state.animals = state.animals.filter((entity) => !deadIds.has(entity.id));

    if (state.controls.selectedEntityId && deadIds.has(state.controls.selectedEntityId)) {
      state.controls.selectedEntityId = null;
      state.controls.actionMessage = "Selected entity died and was removed.";
      state.controls.actionKind = "info";
    }

    state.debug.eventTrace ??= [];
    for (const msg of deathEvents) {
      state.debug.eventTrace.unshift(`[${nowSec.toFixed(1)}s] ${msg}`);
      pushWarning(state, msg, "warn", "MortalitySystem");
    }
    state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
  }
}
