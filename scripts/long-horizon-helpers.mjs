// Long-horizon benchmark helpers — Living World v0.8.0 spec § 16.
//
// Exports reusable sampling + validation utilities so smoke tests can drive
// the sim without spawning a subprocess. The script (`long-horizon-bench.mjs`)
// composes these primitives; tests exercise the same code paths.
//
// Contract notes:
//   - `bootHeadlessSim` matches `GameApp.createSystems()` (src/app/GameApp.js)
//     order exactly, minus VisibilitySystem which depends on worldToTile math
//     but is included (runs headless-safe). No Three.js is imported.
//   - `runToDayBoundary` drives the sim in 1/30s ticks until `timeSec` crosses
//     the target day boundary, an early-stop condition fires, or a guard trips.
//   - `sampleCheckpoint` is cheap (< 5ms): no deep scans, just shallow reads of
//     known state fields. Resource-node inventory is not yet implemented in
//     v0.8.0 Phase 5, so `nodes` reports zeros — Phase 6/7 may extend this.
//   - `validateCheckpoints` enforces spec § 16.2 thresholds + the monotonicity
//     rule (DevIndex[i+1] ≥ 0.85 × DevIndex[i] unless saturation[i+1] > 0.85).

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { SimulationClock } from "../src/app/SimulationClock.js";
import { VisibilitySystem } from "../src/simulation/world/VisibilitySystem.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { DevIndexSystem } from "../src/simulation/meta/DevIndexSystem.js";
import { RaidEscalatorSystem } from "../src/simulation/meta/RaidEscalatorSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { PopulationGrowthSystem } from "../src/simulation/population/PopulationGrowthSystem.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { MemoryObserver } from "../src/simulation/ai/memory/MemoryObserver.js";
import { StrategicDirector } from "../src/simulation/ai/strategic/StrategicDirector.js";
import { EnvironmentDirectorSystem } from "../src/simulation/ai/director/EnvironmentDirectorSystem.js";
import { WeatherSystem } from "../src/world/weather/WeatherSystem.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { NPCBrainSystem } from "../src/simulation/ai/brains/NPCBrainSystem.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { VisitorAISystem } from "../src/simulation/npc/VisitorAISystem.js";
import { AnimalAISystem } from "../src/simulation/npc/AnimalAISystem.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { WildlifePopulationSystem } from "../src/simulation/ecology/WildlifePopulationSystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { ProcessingSystem } from "../src/simulation/economy/ProcessingSystem.js";
import { TileStateSystem } from "../src/simulation/economy/TileStateSystem.js";
import { WarehouseQueueSystem } from "../src/simulation/economy/WarehouseQueueSystem.js";
import { ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { evaluateRunOutcomeState } from "../src/app/runOutcome.js";

// Default simulation timestep — matches GameApp.controls.fixedStepSec
// (src/entities/EntityFactory.js line 696). The long-horizon harness lets
// callers override DT via the tick-rate flag (dt = 1 / tickRate) because
// running 365 in-game days at 30 Hz would take 20+ minutes of wall time.
// Trading determinism for throughput is acceptable at this scale — the
// benchmark measures aggregate colony development curves, not frame-exact
// behaviour. See spec § 16.1 ("--tick-rate: trades accuracy for speed").
export const DT_SEC = 1 / 30;
export const DEFAULT_TICK_RATE = 12;

// Spec § 16: "Each in-game day = 240 game-seconds". The in-code SimulationClock
// uses a 60-second day/night cycle for visuals, but the long-horizon harness
// measures colony development over longer scales. The spec's 240s/day matches
// the DevIndex smoothing window and the raid cadence (raidIntervalBaseTicks =
// 3600 ticks ≈ 120s, two raids per day at tier 0).
export const SEC_PER_DAY = 240;

// Spec § 16.2 + § 16.7: saturationIndicator > 0.85 exempts the monotonicity
// rule and signals the plateau endgame.
export const SATURATION_THRESHOLD = 0.85;

// Spec § 16.2: per-checkpoint minimum requirement thresholds. Only the days
// present as keys are validated; the harness may sample additional days (e.g.
// a final tick) which are recorded but not subject to these thresholds.
export const CHECKPOINT_THRESHOLDS = Object.freeze({
  30: Object.freeze({ devIndex: 40, population: 8, maxDeaths: 0 }),
  90: Object.freeze({ devIndex: 55 }),
  180: Object.freeze({ devIndex: 65, maxSaturation: 0.40, minDim: 45 }),
  365: Object.freeze({ devIndex: 70, maxSaturation: 0.70, minDim: 50, raidsRepelled: 10 }),
  548: Object.freeze({ devIndex: 72, saturationOrFloor: 0.80 }),
  730: Object.freeze({ devIndex: 72, saturationOrFloor: 0.85 }),
});

export const DEFAULT_CHECKPOINT_DAYS = Object.freeze([30, 90, 180, 365, 548, 730]);

// Monotonicity rule: DevIndex must not regress by more than 15% between
// adjacent checkpoints unless saturation has already crossed the plateau
// threshold at the later checkpoint.
const MONOTONICITY_RATIO = 0.85;

function buildSystems(memoryStore) {
  // Order mirrors GameApp.createSystems() (src/app/GameApp.js lines 215-239).
  // The triplet DevIndexSystem → RaidEscalatorSystem → WorldEventSystem MUST
  // stay contiguous and in that order (see the assertSystemOrder invariant).
  return [
    new SimulationClock(),
    new VisibilitySystem(),
    new ProgressionSystem(),
    new DevIndexSystem(),
    new RaidEscalatorSystem(),
    new RoleAssignmentSystem(),
    new PopulationGrowthSystem(),
    new StrategicDirector(memoryStore),
    new EnvironmentDirectorSystem(),
    new WeatherSystem(),
    new WorldEventSystem(),
    new TileStateSystem(),
    new NPCBrainSystem(),
    new WarehouseQueueSystem(),
    new WorkerAISystem(),
    new VisitorAISystem(),
    new AnimalAISystem(),
    new MortalitySystem(),
    new WildlifePopulationSystem(),
    new BoidsSystem(),
    new ResourceSystem(),
    new ProcessingSystem(),
    new ColonyDirectorSystem(),
  ];
}

function refreshPopulationStats(state) {
  const workers = (state.agents ?? []).filter(
    (a) => a.type === "WORKER" && a.alive !== false,
  );
  state.metrics.populationStats = {
    workers: workers.length,
    totalEntities: (state.agents?.length ?? 0) + (state.animals?.length ?? 0),
  };
  state.metrics.deathsTotal = state.metrics.deathsTotal ?? 0;
}

/**
 * Boot a headless sim seeded deterministically.
 *
 * @param {object} opts
 * @param {number} opts.seed - required PRNG seed; feeds `services.rng`.
 * @param {string} [opts.preset="temperate_plains"] - map template id.
 * @returns {{state: object, systems: object[], services: object, memoryStore: object, tickFn: Function}}
 *
 * All randomness flows through `services.rng` (SeededRng in src/app/rng.js) —
 * no Math.random in the harness. `tickFn()` advances one fixed simulation step
 * (DT_SEC) and returns the outcome object if the run has terminated, or null.
 */
export function bootHeadlessSim({ seed, preset = "temperate_plains", tickRate = DEFAULT_TICK_RATE } = {}) {
  if (!Number.isFinite(Number(seed))) {
    throw new Error("bootHeadlessSim: seed must be a finite number");
  }
  const seedNum = Number(seed);
  const tr = Number(tickRate);
  if (!(tr > 0)) throw new Error("bootHeadlessSim: tickRate must be > 0");
  // Clamp dt to [1/60, 2]: < 1/60 is pointless overhead, > 2 breaks per-tick
  // rate assumptions baked into systems like PopulationGrowth and Mortality.
  const dt = Math.max(1 / 60, Math.min(2, 1 / tr));

  const state = createInitialGameState({ templateId: preset, seed: seedNum });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  // Fallback AI only — no network calls from this harness.
  state.ai.enabled = false;
  state.ai.coverageTarget = "fallback";
  state.ai.runtimeProfile = "long_run";

  const memoryStore = new MemoryStore();
  const memoryObserver = new MemoryObserver(memoryStore);
  const services = createServices(seedNum, { offlineAiFallback: true, deterministic: true });
  services.memoryStore = memoryStore;

  const systems = buildSystems(memoryStore);
  refreshPopulationStats(state);

  const tickFn = () => {
    for (const system of systems) {
      system.update(dt, state, services);
    }
    refreshPopulationStats(state);
    memoryObserver.observe(state);
    if (state.session.phase === "active") {
      const outcome = evaluateRunOutcomeState(state);
      if (outcome) {
        state.session.phase = "end";
        state.session.outcome = outcome.outcome;
        state.session.reason = outcome.reason;
        state.session.endedAtSec = Number(state.metrics.timeSec ?? 0);
        return outcome;
      }
    }
    return null;
  };

  return { state, systems, services, memoryStore, tickFn, dt };
}

/**
 * Compute the current numeric saturation indicator in [0, 1].
 *
 * Spec § 5.6 defines `saturationIndicator = usedTiles / revealedUsableTiles`,
 * but v0.8.0 Phase 5 does not yet expose those counters. Until Phase 7 lands
 * node-layer telemetry we derive a stable proxy from the DevIndex dims: the
 * minimum per-dim score divided by 100. This rises smoothly as every dim
 * develops and tracks the "all dims above threshold" boolean flag that
 * ColonyPerceiver already ships (see src/simulation/ai/colony/ColonyPerceiver.js
 * lines 919-947). When a real numeric field appears at `gameplay.devIndexSaturation`
 * or `gameplay.saturationIndicator`, we prefer it.
 */
export function computeSaturation(state) {
  const g = state?.gameplay ?? {};
  const primaryRaw = g.devIndexSaturation ?? g.saturationIndicator;
  if (primaryRaw !== undefined && primaryRaw !== null) {
    const direct = Number(primaryRaw);
    if (Number.isFinite(direct) && direct >= 0 && direct <= 1) return direct;
    // Primary field exists but is non-finite or out-of-range — surface a warn
    // once per process so a silent upstream regression is visible on stderr.
    warnOnce(
      "computeSaturation: non-finite primary saturation field",
      { value: primaryRaw },
    );
  }
  const dims = g.devIndexDims;
  if (!dims || typeof dims !== "object") {
    // Structural absence — return NaN so the validator flags this as a data
    // integrity violation rather than a "barely developed colony at 0".
    return Number.NaN;
  }
  const values = [
    dims.population, dims.economy, dims.infrastructure,
    dims.production, dims.defense, dims.resilience,
  ].map((v) => Number(v)).filter(Number.isFinite);
  if (values.length === 0) return Number.NaN;
  const minDim = Math.min(...values);
  const clamped = Math.max(0, Math.min(100, minDim));
  return Number((clamped / 100).toFixed(4));
}

const _warnOnceSeen = new Set();
function warnOnce(key, details) {
  if (_warnOnceSeen.has(key)) return;
  _warnOnceSeen.add(key);
  try {
    console.warn(`[long-horizon] ${key} ${JSON.stringify(details)}`);
  } catch {
    console.warn(`[long-horizon] ${key}`);
  }
}

// Count raids that have ended with the colony still alive. Phase 5 does not
// yet emit an explicit `raid.resolved{outcome:defeated}` event; the best proxy
// is counting raid events that have transitioned off `state.events.active`
// back into the log, but since those details aren't yet tracked either we
// fall back to counting all bandit_raid events ever spawned. Phase 6/7 should
// wire a real counter into RaidEscalator / WorldEventSystem.
function countRaidsRepelled(state) {
  // Prefer a monotonic counter once Phase 7 wires raid-outcome events into
  // `state.metrics.raidsRepelled`. Until then, scan the ring-buffer log; that
  // under-reports after the buffer rolls over but is fine at current volumes.
  const monotonic = state?.metrics?.raidsRepelled;
  if (Number.isFinite(Number(monotonic))) return Number(monotonic);
  const events = state?.events;
  if (!events) return 0;
  const log = events.log;
  if (log === undefined) return 0;
  if (!Array.isArray(log)) {
    warnOnce(
      "countRaidsRepelled: state.events.log is not an array — possible shape drift",
      { type: typeof log },
    );
    return 0;
  }
  let count = 0;
  for (const entry of log) {
    if (!entry) continue;
    const type = String(entry.type ?? "");
    if (type === "bandit_raid_resolved" || type === "raid_repelled") {
      count += 1;
    }
  }
  return count;
}

/**
 * Sample a lightweight snapshot for a checkpoint. Must stay fast (< 5ms on
 * typical 96×72 grids) — no deep scans of arrays, no JSON walking.
 */
export function sampleCheckpoint(state, day) {
  const g = state?.gameplay ?? {};
  const dimsRaw = g.devIndexDims ?? {};
  // Freeze a shallow copy so later mutations (the sim keeps running) cannot
  // retroactively change recorded history.
  const dims = {
    population: round2(dimsRaw.population),
    economy: round2(dimsRaw.economy),
    infrastructure: round2(dimsRaw.infrastructure),
    production: round2(dimsRaw.production),
    defense: round2(dimsRaw.defense),
    resilience: round2(dimsRaw.resilience),
  };
  const resources = state?.resources ?? {};
  const escalation = g.raidEscalation ?? {};

  return {
    day: Number(day),
    timeSec: round2(state?.metrics?.timeSec ?? 0),
    devIndex: round2(g.devIndex ?? 0),
    devIndexSmoothed: round2(g.devIndexSmoothed ?? 0),
    dims,
    saturation: computeSaturation(state),
    population: Number(state?.metrics?.populationStats?.workers ?? 0),
    deathsTotal: Number(state?.metrics?.deathsTotal ?? 0),
    resources: {
      food: round2(resources.food ?? 0),
      wood: round2(resources.wood ?? 0),
      stone: round2(resources.stone ?? 0),
      herbs: round2(resources.herbs ?? 0),
      meals: round2(resources.meals ?? 0),
      tools: round2(resources.tools ?? 0),
      medicine: round2(resources.medicine ?? 0),
    },
    // Node-layer telemetry is not in v0.8.0 Phase 5 yet; the `_stub: true`
    // marker keeps the JSON shape stable for downstream tooling while making
    // the absence legible — readers should not treat zeros as real data.
    nodes: {
      _stub: true,
      forest: { known: 0, depleted: 0 },
      stone: { known: 0, depleted: 0 },
      herb: { known: 0, depleted: 0 },
    },
    raidsRepelled: countRaidsRepelled(state),
    raidTier: Number(escalation.tier ?? 0),
    survivalScore: Math.floor(Number(state?.metrics?.survivalScore ?? 0)),
    // Post-terminal flag is set by runToDayBoundary when the sim died but the
    // caller opted out of early-stop. validateCheckpoints treats this as a
    // hard violation so dead colonies never silently "pass" a later gate.
    postTerminal: false,
  };
}

// Absent (undefined/null) → 0 because callers already guard with `?? 0`.
// A genuine non-finite number (NaN, Infinity) → NaN so validateCheckpoints
// can surface the data-integrity regression instead of silently coercing.
function round2(value) {
  if (value === undefined || value === null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.NaN;
  return Math.round(n * 100) / 100;
}

/**
 * Run the sim forward until it either crosses the `targetDay` boundary or an
 * early-stop condition fires.
 *
 * @param {{state: object, tickFn: Function}} simCtx
 * @param {number} targetDay - absolute day boundary to reach.
 * @param {object} [options]
 * @param {boolean} [options.earlyStopOnDeath=true]
 * @param {boolean} [options.earlyStopOnSaturation=true]
 * @param {number} [options.maxTicksGuard] - safety cap; defaults to 2× expected.
 * @returns {{checkpoint: object|null, stopped: "reached"|"loss"|"saturation"|"guard"|"post_terminal", postTerminal?: boolean}}
 *
 * Death semantics: when the sim terminates (`phase === "end"`), we ALWAYS stop
 * ticking — even when `earlyStopOnDeath` is false. The option only controls
 * whether the return tag is `"loss"` (early-stop) vs `"post_terminal"` (the
 * caller opted out of early-stop, but we still refuse to tick a dead colony;
 * returning a post-mortem checkpoint marked `postTerminal: true` so callers
 * can distinguish real progress from frozen state).
 */
export function runToDayBoundary(simCtx, targetDay, options = {}) {
  const {
    earlyStopOnDeath = true,
    earlyStopOnSaturation = true,
    maxTicksGuard,
  } = options;
  const { state, tickFn } = simCtx;
  const targetSec = Number(targetDay) * SEC_PER_DAY;
  const startSec = Number(state?.metrics?.timeSec ?? 0);
  if (state?.session?.phase === "end") {
    // Already dead before we started — never tick a terminal state.
    const cp = sampleCheckpoint(state, currentDay(state));
    cp.postTerminal = true;
    return {
      checkpoint: cp,
      stopped: earlyStopOnDeath ? "loss" : "post_terminal",
      postTerminal: true,
    };
  }
  if (startSec >= targetSec) {
    return { checkpoint: sampleCheckpoint(state, targetDay), stopped: "reached" };
  }
  const dt = Number(simCtx.dt ?? DT_SEC);
  const ticksNeeded = Math.ceil((targetSec - startSec) / dt);
  const guard = Number.isFinite(maxTicksGuard)
    ? Math.max(1, Math.floor(maxTicksGuard))
    : ticksNeeded * 2 + 1000;

  let ticks = 0;
  while (ticks < guard) {
    const outcome = tickFn();
    ticks += 1;
    if (state.session.phase === "end" || outcome) {
      // Sim terminated. We refuse to silently skip time on a dead colony —
      // the post-terminal path is explicit so callers cannot confuse it with
      // a healthy Day-N checkpoint.
      const cp = sampleCheckpoint(state, currentDay(state));
      cp.postTerminal = true;
      return {
        checkpoint: cp,
        stopped: earlyStopOnDeath ? "loss" : "post_terminal",
        postTerminal: true,
      };
    }
    if (earlyStopOnSaturation && computeSaturation(state) > SATURATION_THRESHOLD) {
      return { checkpoint: sampleCheckpoint(state, currentDay(state)), stopped: "saturation" };
    }
    if (Number(state.metrics.timeSec ?? 0) >= targetSec) {
      return { checkpoint: sampleCheckpoint(state, targetDay), stopped: "reached" };
    }
  }
  return { checkpoint: sampleCheckpoint(state, currentDay(state)), stopped: "guard" };
}

export function currentDay(state) {
  const sec = Number(state?.metrics?.timeSec ?? 0);
  return Math.floor(sec / SEC_PER_DAY);
}

/**
 * Validate a list of checkpoints against spec § 16.2 thresholds + the
 * monotonicity rule. Only days that have a threshold entry are hard-gated;
 * every adjacent pair is checked for monotonicity regardless.
 *
 * Violations are returned as structured objects so callers can render tables
 * or assert on specific rules.
 */
// Numeric fields whose non-finite value is a data-integrity violation.
const CHECKPOINT_NUMERIC_FIELDS = Object.freeze([
  "devIndex", "devIndexSmoothed", "saturation",
  "population", "deathsTotal", "raidsRepelled",
]);

export function validateCheckpoints(checkpoints) {
  const violations = [];

  // 1. Data-integrity pass — any non-finite numeric field is a hard violation.
  // Must run first so downstream comparisons don't silently evaluate `NaN < X`
  // as false.
  for (const cp of checkpoints) {
    const bad = [];
    for (const field of CHECKPOINT_NUMERIC_FIELDS) {
      if (!Number.isFinite(Number(cp[field]))) bad.push(field);
    }
    if (cp.dims) {
      for (const key of ["population", "economy", "infrastructure", "production", "defense", "resilience"]) {
        if (!Number.isFinite(Number(cp.dims[key]))) bad.push(`dims.${key}`);
      }
    } else {
      bad.push("dims");
    }
    if (bad.length > 0) {
      violations.push({
        kind: "non_finite_in_checkpoint",
        day: cp.day,
        fields: bad,
      });
    }
    // A post-terminal checkpoint (sim died but caller opted out of early-stop)
    // is a hard failure — we never want "Day 365 passed" from a frozen corpse.
    if (cp.postTerminal) {
      violations.push({
        kind: "post_terminal_checkpoint",
        day: cp.day,
      });
    }
  }

  for (const cp of checkpoints) {
    const thresholds = CHECKPOINT_THRESHOLDS[cp.day];
    if (!thresholds) continue;
    // Plateau exemption: Day 548/730 gates are "DevIndex OR saturation plateau"
    // — the entire threshold row is waived when plateau is reached. Hoisted
    // from the devIndex-only branch so minDim/maxSaturation also honour it.
    const plateauOk = thresholds.saturationOrFloor !== undefined
      && Number.isFinite(Number(cp.saturation))
      && cp.saturation > thresholds.saturationOrFloor;
    if (plateauOk) continue;

    if (thresholds.devIndex !== undefined
      && Number.isFinite(Number(cp.devIndex))
      && cp.devIndex < thresholds.devIndex) {
      violations.push({
        kind: "devIndex_below_min",
        day: cp.day,
        observed: cp.devIndex,
        required: thresholds.devIndex,
      });
    }
    if (thresholds.population !== undefined
      && Number.isFinite(Number(cp.population))
      && cp.population < thresholds.population) {
      violations.push({
        kind: "population_below_min",
        day: cp.day,
        observed: cp.population,
        required: thresholds.population,
      });
    }
    if (thresholds.maxDeaths !== undefined
      && Number.isFinite(Number(cp.deathsTotal))
      && cp.deathsTotal > thresholds.maxDeaths) {
      violations.push({
        kind: "deaths_above_max",
        day: cp.day,
        observed: cp.deathsTotal,
        required: thresholds.maxDeaths,
      });
    }
    if (thresholds.maxSaturation !== undefined
      && Number.isFinite(Number(cp.saturation))
      && cp.saturation >= thresholds.maxSaturation) {
      violations.push({
        kind: "saturation_above_max",
        day: cp.day,
        observed: cp.saturation,
        required: thresholds.maxSaturation,
      });
    }
    if (thresholds.minDim !== undefined && cp.dims) {
      const dimValues = [
        cp.dims.population, cp.dims.economy, cp.dims.infrastructure,
        cp.dims.production, cp.dims.defense, cp.dims.resilience,
      ].map(Number).filter(Number.isFinite);
      if (dimValues.length === 6) {
        const minDim = Math.min(...dimValues);
        if (minDim < thresholds.minDim) {
          violations.push({
            kind: "dim_below_min",
            day: cp.day,
            observed: minDim,
            required: thresholds.minDim,
          });
        }
      }
    }
    if (thresholds.raidsRepelled !== undefined
      && Number.isFinite(Number(cp.raidsRepelled))
      && cp.raidsRepelled < thresholds.raidsRepelled) {
      violations.push({
        kind: "raids_below_min",
        day: cp.day,
        observed: cp.raidsRepelled,
        required: thresholds.raidsRepelled,
      });
    }
  }

  // Monotonicity rule. Adjacent pairs must satisfy
  //   DevIndex[i+1] ≥ 0.85 × DevIndex[i]
  // unless saturation[i+1] > 0.85 (plateau exemption).
  for (let i = 0; i + 1 < checkpoints.length; i += 1) {
    const prev = checkpoints[i];
    const next = checkpoints[i + 1];
    if (!Number.isFinite(Number(prev.devIndex)) || !Number.isFinite(Number(next.devIndex))) {
      // Already flagged in the data-integrity pass; skip to avoid double-
      // reporting a NaN comparison.
      continue;
    }
    if (Number.isFinite(Number(next.saturation)) && next.saturation > SATURATION_THRESHOLD) continue;
    const floor = prev.devIndex * MONOTONICITY_RATIO;
    if (next.devIndex < floor) {
      violations.push({
        kind: "monotonicity_violation",
        fromDay: prev.day,
        toDay: next.day,
        fromDevIndex: prev.devIndex,
        toDevIndex: next.devIndex,
        requiredFloor: Number(floor.toFixed(2)),
      });
    }
  }

  return { passed: violations.length === 0, violations };
}
