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
  WORKER_SOCIALIZED: "worker_socialized",
  // v0.8.0 Phase 2 M2 warehouse density risk events.
  WAREHOUSE_FIRE: "warehouse_fire",
  VERMIN_SWARM: "vermin_swarm",
  WAREHOUSE_QUEUE_TIMEOUT: "warehouse_queue_timeout",
  // v0.8.0 Phase 3 M1c demolition recycling.
  DEMOLITION_RECYCLED: "demolition_recycled",
  // v0.8.2 Round-5b Wave-1 (01a Step 1) — Autopilot food-crisis auto-pause.
  // Emitted by ResourceSystem when food=0 + autopilot on + ≥1 starvation
  // death in the last 30s. ColonyDirectorSystem listens and clamps
  // state.controls.speed to 0 + sets pausedByCrisis flag for HUD surfaces.
  FOOD_PRECRISIS_DETECTED: "food_precrisis_detected",
  FOOD_CRISIS_DETECTED: "food_crisis_detected",
  // v0.8.2 Round-5b (02a-rimworld-veteran Step 3) — Emitted by ResourceSystem
  // when state.buildings[category] decreases by ≥1 between grid rebuilds.
  // Surfaces silent scenario-objective regression (e.g. warehouses 7→3 with
  // no event log). Cause inferred from recent BUILDING_DESTROYED events.
  OBJECTIVE_REGRESSED: "objective_regressed",
  // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 4) — birth & rivalry beats.
  // WORKER_BORN: emitted by PopulationGrowthSystem alongside the legacy
  // VISITOR_ARRIVED reuse (kept for downstream-listener compatibility) so
  // narrative consumers can subscribe to a dedicated channel without
  // colour-filtering the legacy bus. Payload includes `parentNames: string[]`
  // and `lineageParentIds: string[]`.
  // WORKER_RIVALRY: emitted by WorkerAISystem when a relationship crosses the
  // -0.15 (Strained) or -0.45 (Rival) negative band. Payload mirrors the
  // existing positive WORKER_SOCIALIZED shape (`band`, `opinion`).
  WORKER_BORN: "worker_born",
  WORKER_RIVALRY: "worker_rivalry",
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
  const handlers = state.events.listeners.get(type);
  // v0.8.7 T1-3 (QA3-C3): de-duplicate handler registration. Pre-fix repeated
  // calls to onEvent (e.g., panel reinit on tab switch) appended the same
  // handler N times; on every emit the listener fired N times and the array
  // grew unbounded. We early-return here AND return an unsubscribe function
  // so callers can opt into explicit cleanup (HUDController, panel teardown).
  if (handlers.includes(handler)) {
    return () => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    };
  }
  handlers.push(handler);
  return () => {
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

export function getEventLog(state) {
  return state.events?.log ?? [];
}
