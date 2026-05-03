import { BALANCE } from "../../config/balance.js";
import { EVENT_TYPE } from "../../config/constants.js";
import { enqueueEvent } from "../../world/events/WorldEventQueue.js";
import { emitEvent, EVENT_TYPES as BUS_EVENT_TYPES } from "./GameEventBus.js";

/**
 * v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 3) — EventDirectorSystem.
 *
 * Why this exists: WorldEventSystem already consumes events from
 * `state.events.queue` (BANDIT_RAID / TRADE_CARAVAN / ANIMAL_MIGRATION + the
 * three Wave-2 additions DISEASE_OUTBREAK / WILDFIRE / MORALE_BREAK), but the
 * only authoritative producer in the codebase is `EnvironmentDirectiveApplier`,
 * which depends on a live LLM directive. With proxy offline rate ≈100% in the
 * default benchmark/dev runs the queue stays empty and no proactive pressure
 * ever materialises. EventDirectorSystem fixes the gap with a deterministic,
 * weight-driven pump that pushes one event into the queue every
 * `BALANCE.eventDirectorBaseIntervalSec` (default 240s game-time).
 *
 * Determinism: uses `services.rng.next()` so 4-seed benchmark runs stay
 * reproducible. If services.rng is missing (legacy bootstrap path), falls
 * back to Math.random.
 *
 * Bandit-raid downgrade: if the rolled type is BANDIT_RAID but
 * `state.gameplay.raidEscalation` indicates the raid cooldown has not yet
 * elapsed (currentTick - lastRaidTick < intervalTicks), downgrade to the
 * next-highest-weight non-raid event so the cadence promise holds.
 */

const NON_RAID_FALLBACK_ORDER = Object.freeze([
  EVENT_TYPE.ANIMAL_MIGRATION,
  EVENT_TYPE.TRADE_CARAVAN,
  EVENT_TYPE.DISEASE_OUTBREAK,
  EVENT_TYPE.WILDFIRE,
  EVENT_TYPE.MORALE_BREAK,
]);

function ensureDirectorState(state) {
  state.gameplay ??= {};
  if (!state.gameplay.eventDirector || typeof state.gameplay.eventDirector !== "object") {
    state.gameplay.eventDirector = {
      lastDispatchSec: -Infinity,
      dayBudget: 0,
      history: [],
    };
  }
  return state.gameplay.eventDirector;
}

function rollEventType(rng) {
  const weights = BALANCE.eventDirectorWeights ?? {};
  const entries = [
    [EVENT_TYPE.BANDIT_RAID, Number(weights.banditRaid ?? 0)],
    [EVENT_TYPE.ANIMAL_MIGRATION, Number(weights.animalMigration ?? 0)],
    [EVENT_TYPE.TRADE_CARAVAN, Number(weights.tradeCaravan ?? 0)],
    [EVENT_TYPE.DISEASE_OUTBREAK, Number(weights.diseaseOutbreak ?? 0)],
    [EVENT_TYPE.WILDFIRE, Number(weights.wildfire ?? 0)],
    [EVENT_TYPE.MORALE_BREAK, Number(weights.moraleBreak ?? 0)],
  ];
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return EVENT_TYPE.ANIMAL_MIGRATION;
  let pick = rng() * total;
  for (const [type, weight] of entries) {
    pick -= Math.max(0, weight);
    if (pick <= 0) return type;
  }
  return entries[entries.length - 1][0];
}

function isRaidOnCooldown(state) {
  const esc = state.gameplay?.raidEscalation ?? null;
  const intervalTicks = Number(esc?.intervalTicks ?? BALANCE.raidIntervalBaseTicks ?? 3600);
  const currentTick = Number(state.metrics?.tick ?? 0);
  const lastRaidTick = Number(state.gameplay?.lastRaidTick ?? -9999);
  return (currentTick - lastRaidTick) < intervalTicks;
}

function downgradeRaid(rng) {
  // Re-roll over non-raid weights so a downgrade does not silently bias the
  // distribution toward the cheapest fallback.
  const weights = BALANCE.eventDirectorWeights ?? {};
  const map = {
    [EVENT_TYPE.ANIMAL_MIGRATION]: Number(weights.animalMigration ?? 0),
    [EVENT_TYPE.TRADE_CARAVAN]: Number(weights.tradeCaravan ?? 0),
    [EVENT_TYPE.DISEASE_OUTBREAK]: Number(weights.diseaseOutbreak ?? 0),
    [EVENT_TYPE.WILDFIRE]: Number(weights.wildfire ?? 0),
    [EVENT_TYPE.MORALE_BREAK]: Number(weights.moraleBreak ?? 0),
  };
  const total = Object.values(map).reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return EVENT_TYPE.ANIMAL_MIGRATION;
  let pick = rng() * total;
  for (const type of NON_RAID_FALLBACK_ORDER) {
    pick -= Math.max(0, map[type] ?? 0);
    if (pick <= 0) return type;
  }
  return EVENT_TYPE.ANIMAL_MIGRATION;
}

function getTuning(eventType) {
  const tuning = BALANCE.eventDirectorTuning ?? {};
  // Map EVENT_TYPE string back to balance key.
  const keyMap = {
    [EVENT_TYPE.BANDIT_RAID]: "banditRaid",
    [EVENT_TYPE.ANIMAL_MIGRATION]: "animalMigration",
    [EVENT_TYPE.TRADE_CARAVAN]: "tradeCaravan",
    [EVENT_TYPE.DISEASE_OUTBREAK]: "diseaseOutbreak",
    [EVENT_TYPE.WILDFIRE]: "wildfire",
    [EVENT_TYPE.MORALE_BREAK]: "moraleBreak",
  };
  const key = keyMap[eventType] ?? "animalMigration";
  const entry = tuning[key] ?? {};
  return {
    durationSec: Number(entry.durationSec ?? 24),
    intensity: Number(entry.intensity ?? 1),
  };
}

export class EventDirectorSystem {
  constructor() {
    this.name = "EventDirectorSystem";
  }

  update(dt, state, services) {
    if (!state || !state.events) return;
    const director = ensureDirectorState(state);
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const intervalSec = Number(BALANCE.eventDirectorBaseIntervalSec ?? 240);

    // v0.10.2 PJ-followup-cadence-dampener R7 — opening-crisis safety net.
    // While the colony has no farms AND we're in the bootstrap window (<180s),
    // throttle event cadence to 2.5× baseline so saboteur draft / wildlife
    // events don't pull workers off harvest during the food crash window.
    // Disengages naturally the moment Plan-PL-terrain-min-guarantee or the
    // autopilot's first farm completes. Defense-in-depth complement to the
    // PL terrain floor for adversarial seeds that slip through the guarantee.
    const bootstrapWindow = (state.buildings?.farms ?? 0) === 0 && Number(state.metrics?.timeSec ?? 0) < 180;
    const effectiveIntervalSec = bootstrapWindow ? intervalSec * 2.5 : intervalSec;

    const lastDispatch = Number.isFinite(director.lastDispatchSec) ? director.lastDispatchSec : -Infinity;
    // First-run grace: after init the lastDispatchSec is -Infinity, so the
    // very first tick would otherwise dispatch immediately. Anchor the first
    // dispatch and offset by half-interval so the first event lands at
    // ~intervalSec/2 instead of a full interval out — v0.10.2 PJ-pacing P0
    // pulls first event from t=intervalSec to t=intervalSec/2 (45s at the
    // new 90s base interval) so the early game has visible motion. The
    // dampener applies to this offset too: during bootstrap the first event
    // lands at ~effectiveIntervalSec/2 (≈112s) instead of ~45s.
    if (!Number.isFinite(lastDispatch)) {
      director.lastDispatchSec = nowSec - effectiveIntervalSec * 0.5;
      return;
    }
    if (nowSec - lastDispatch < effectiveIntervalSec) return;

    const rng = typeof services?.rng?.next === "function"
      ? () => services.rng.next()
      : Math.random;

    let chosen = rollEventType(rng);
    if (chosen === EVENT_TYPE.BANDIT_RAID && isRaidOnCooldown(state)) {
      chosen = downgradeRaid(rng);
    }
    const { durationSec, intensity } = getTuning(chosen);
    enqueueEvent(state, chosen, {}, durationSec, intensity);

    // v0.10.2 PJ-pacing P0 — surface the dispatch on the player-visible
    // event log so chronicle/HUD listeners can react. Reuses the generic
    // EVENT_STARTED bus type with a `kind:"event_started"` discriminator
    // (no new mechanic — pure log channel).
    emitEvent(state, BUS_EVENT_TYPES.EVENT_STARTED, {
      kind: "event_started",
      eventType: chosen,
      intensity,
      durationSec,
    });

    director.lastDispatchSec = nowSec;
    director.dayBudget = Number(director.dayBudget ?? 0) + 1;
    director.history ??= [];
    director.history.unshift({ sec: Number(nowSec.toFixed(1)), type: chosen });
    if (director.history.length > 32) director.history.length = 32;

    // Push a trace line when debug.eventTrace is enabled (parity with
    // WorldEventSystem trace format).
    if (state.debug?.eventTrace) {
      state.debug.eventTrace.unshift(
        `[t=${nowSec.toFixed(1)}s] director dispatched ${chosen}`,
      );
      state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
    }
  }
}
