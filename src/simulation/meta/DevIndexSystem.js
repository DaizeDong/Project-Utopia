import { BALANCE } from "../../config/balance.js";
import {
  collectEconomySnapshot,
  scoreAllDims,
} from "../telemetry/EconomyTelemetry.js";

/**
 * DevIndexSystem — Living World v0.8.0 Phase 4 (spec § 5.6).
 *
 * Aggregates six economy/colony dimensions into a single 0–100 composite
 * "development index". Runs after `ProgressionSystem` and before
 * `WarehouseQueueSystem` in SYSTEM_ORDER (see `src/config/constants.js`).
 *
 * The system itself is a thin normaliser + weighter. Raw per-tick data
 * gathering lives in `src/simulation/telemetry/EconomyTelemetry.js` so that
 * each dimension is independently unit-testable.
 *
 * Public state contract (other systems / agents read these):
 *   state.gameplay.devIndex         — number in [0, 100], float, latest tick
 *   state.gameplay.devIndexSmoothed — number in [0, 100], float, window mean
 *   state.gameplay.devIndexDims     — { population, economy, infrastructure,
 *                                       production, defense, resilience }
 *                                     all floats in [0, 100]
 *   state.gameplay.devIndexHistory  — ring-buffered number[], length ≤ window
 *
 * Agent 4.B's RaidEscalatorSystem reads `devIndexSmoothed` to scale raid
 * intensity; fields MUST NOT be renamed or restructured mid-phase.
 */

const DEFAULT_WEIGHTS = Object.freeze({
  population: 1 / 6,
  economy: 1 / 6,
  infrastructure: 1 / 6,
  production: 1 / 6,
  defense: 1 / 6,
  resilience: 1 / 6,
});

function clamp0to100(v) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

function computeWeightedComposite(dims, weights) {
  const w = weights ?? DEFAULT_WEIGHTS;
  let sum = 0;
  let weightTotal = 0;
  for (const key of ["population", "economy", "infrastructure", "production", "defense", "resilience"]) {
    const weight = Number(w[key] ?? 0);
    if (!(weight > 0)) continue;
    const v = clamp0to100(dims[key]);
    sum += v * weight;
    weightTotal += weight;
  }
  if (weightTotal <= 0) return 0;
  return clamp0to100(sum / weightTotal);
}

/** Pure helper so tests can exercise the math without instantiating the system. */
export function computeDevIndexComposite(dims, weights) {
  return computeWeightedComposite(dims, weights);
}

function ensureDevIndexState(state) {
  state.gameplay ??= {};
  const g = state.gameplay;
  if (!g.devIndexDims || typeof g.devIndexDims !== "object") {
    g.devIndexDims = {
      population: 0, economy: 0, infrastructure: 0,
      production: 0, defense: 0, resilience: 0,
    };
  }
  if (typeof g.devIndex !== "number") g.devIndex = 0;
  if (typeof g.devIndexSmoothed !== "number") g.devIndexSmoothed = 0;
  if (!Array.isArray(g.devIndexHistory)) g.devIndexHistory = [];
  return g;
}

export class DevIndexSystem {
  constructor() {
    this.name = "DevIndexSystem";
  }

  update(_dt, state, _services) {
    if (!state) return;
    const g = ensureDevIndexState(state);

    // 1. Gather raw per-tick signals (pure function).
    const snapshot = collectEconomySnapshot(state);

    // 2. Normalise each dimension into [0, 100] independently.
    const dims = scoreAllDims(snapshot);
    g.devIndexDims.population = clamp0to100(dims.population);
    g.devIndexDims.economy = clamp0to100(dims.economy);
    g.devIndexDims.infrastructure = clamp0to100(dims.infrastructure);
    g.devIndexDims.production = clamp0to100(dims.production);
    g.devIndexDims.defense = clamp0to100(dims.defense);
    g.devIndexDims.resilience = clamp0to100(dims.resilience);

    // 3. Composite = weighted mean of the 6 dims.
    const weights = BALANCE.devIndexWeights ?? DEFAULT_WEIGHTS;
    const composite = computeWeightedComposite(g.devIndexDims, weights);
    g.devIndex = composite;

    // 4. Ring-buffer smoothing.
    const windowSize = Math.max(1, Number(BALANCE.devIndexWindowTicks ?? 60));
    const history = g.devIndexHistory;
    history.push(composite);
    while (history.length > windowSize) history.shift();
    let sum = 0;
    for (const v of history) sum += v;
    g.devIndexSmoothed = history.length > 0
      ? clamp0to100(sum / history.length)
      : composite;
  }
}
