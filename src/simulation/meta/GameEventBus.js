const MAX_EVENTS = 200;

const EVENT_TYPES = Object.freeze({
  WORKER_DIED: "worker_died",
  WORKER_STARVED: "worker_starved",
  WORKER_RESTING: "worker_resting",
  BUILDING_PLACED: "building_placed",
  BUILDING_DESTROYED: "building_destroyed",
  RESOURCE_DEPLETED: "resource_depleted",
  RESOURCE_SURPLUS: "resource_surplus",
  WEATHER_CHANGED: "weather_changed",
  PREDATOR_ATTACK: "predator_attack",
  HERBIVORE_FLED: "herbivore_fled",
  TRADE_COMPLETED: "trade_completed",
  SABOTAGE_OCCURRED: "sabotage_occurred",
  FOOD_SHORTAGE: "food_shortage",
  VISITOR_ARRIVED: "visitor_arrived",
  NIGHT_BEGAN: "night_began",
  DAY_BEGAN: "day_began",
  WORKER_MOOD_LOW: "worker_mood_low",
  COLONY_MILESTONE: "colony_milestone",
  ANIMAL_MIGRATION: "animal_migration",
});

export { EVENT_TYPES };

export function initEventBus(state) {
  state.events ??= { log: [], listeners: new Map() };
  state.events.log ??= [];
  state.events.listeners ??= new Map();
}

export function emitEvent(state, type, detail = {}) {
  initEventBus(state);
  const event = {
    type,
    t: Number(state.metrics?.timeSec ?? 0),
    entityId: detail.entityId ?? null,
    entityName: detail.entityName ?? null,
    detail,
  };
  state.events.log.push(event);
  if (state.events.log.length > MAX_EVENTS) {
    state.events.log = state.events.log.slice(-MAX_EVENTS);
  }
  // Notify listeners
  const handlers = state.events.listeners.get(type);
  if (handlers) {
    for (const fn of handlers) fn(event);
  }
}

export function onEvent(state, type, handler) {
  initEventBus(state);
  if (!state.events.listeners.has(type)) {
    state.events.listeners.set(type, []);
  }
  state.events.listeners.get(type).push(handler);
}

export function getEventLog(state) {
  return state.events?.log ?? [];
}
