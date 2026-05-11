// PVB — Policy-Value Baseline (W1 P0-4).
//
// Pluribus / AIVAT-style variance reduction wrapper for noisy benchmark
// scores. The exact AIVAT formulation requires running the fallback policy
// F at every state to obtain V_F(state); doing that on a 96x72 colony sim
// would cost an extra full-tick simulation per recorded sample, which is
// computationally untenable inside a unit-test budget.
//
// We use a tractable proxy: V̂_F(state) is a closed-form scalar derived
// from the colony's two cleanest signals (prosperity and worker count).
// This still satisfies the PVB invariant — the correction sums to a
// deterministic, agent-independent baseline term plus per-tick deltas
// that average to zero in expectation when the agent IS the fallback —
// while staying O(1) per recorded state.
//
//   PVB(A, s) = realizedScore(A, s) − V̂_F(s_0)
//             + Σ_t [V̂_F(s_t)_underF − V̂_F(s_t)_underA]
//
// In our proxy `..._underF` is approximated by the running EMA of past
// V̂_F samples (the "what F would do" baseline), and `..._underA` is the
// instantaneous V̂_F at the agent's realized state — so when A == F the
// correction terms cancel and PVB ≈ realizedScore − V̂_F(s_0).

const EMA_ALPHA = 0.15;

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Lightweight value estimate for the fallback policy F at the given state.
 * Pure function of state; no simulation step. Output is in [0,1].
 *
 * Combines two signals:
 *   - Prosperity (0..100) → normalized to [0,1]
 *   - Worker headcount → normalized against a soft cap of 24
 *
 * Multiplied so that V̂_F is high only when BOTH signals are strong.
 *
 * @param {object} state
 * @returns {number}
 */
export function fallbackValueEstimate(state) {
  if (!state || typeof state !== "object") return 0;
  const prosperity = Number(state?.gameplay?.prosperity ?? 0);
  const workersRaw =
    state?.metrics?.populationStats?.workers
    ?? state?.agents?.filter?.((a) => a?.type === "WORKER" && a?.alive !== false)?.length
    ?? 0;
  const workers = Number(workersRaw) || 0;

  const pComp = clamp01(prosperity / 100);
  const wComp = clamp01(workers / 24);
  return Number((pComp * wComp).toFixed(6));
}

/**
 * Tracks per-tick value estimates and computes the PVB correction.
 *
 * Usage:
 *   const tracker = new PVBTracker();
 *   tracker.recordTick(harness.state, "agentA");  // call once per tick
 *   const { pvb_score, baseline_v0, sum_corrections } =
 *     tracker.finalize(realizedScore);
 */
export class PVBTracker {
  constructor() {
    this._initial = null;
    this._emaUnderF = null;
    this._sumCorrections = 0;
    this._ticks = 0;
    this._lastAgentId = "";
  }

  /**
   * @param {object} state
   * @param {string} [agentId]
   */
  recordTick(state, agentId = "") {
    const v = fallbackValueEstimate(state);
    if (this._initial === null) {
      this._initial = v;
      this._emaUnderF = v;
    } else {
      // Per-tick correction: the EMA represents "what F would have looked
      // like up to now". Difference vs. realized v under A is the PVB
      // delta. Accumulate.
      const corr = this._emaUnderF - v;
      this._sumCorrections += corr;
      this._emaUnderF = (1 - EMA_ALPHA) * this._emaUnderF + EMA_ALPHA * v;
    }
    this._ticks += 1;
    if (agentId) this._lastAgentId = agentId;
  }

  /**
   * @param {number} realizedScore
   * @returns {{ pvb_score: number, baseline_v0: number, sum_corrections: number, ticks: number }}
   */
  finalize(realizedScore) {
    const baseline = this._initial ?? 0;
    const score = Number(realizedScore) || 0;
    // Correction is averaged across ticks rather than summed — the raw sum
    // grows linearly with run length and would dominate the realized score.
    // Mean delta keeps the correction in the same units as the score.
    const meanCorr = this._ticks > 0 ? this._sumCorrections / this._ticks : 0;
    const pvb = score - baseline + meanCorr;
    return {
      pvb_score: Number(pvb.toFixed(6)),
      baseline_v0: Number(baseline.toFixed(6)),
      sum_corrections: Number(meanCorr.toFixed(6)),
      ticks: this._ticks,
    };
  }

  reset() {
    this._initial = null;
    this._emaUnderF = null;
    this._sumCorrections = 0;
    this._ticks = 0;
    this._lastAgentId = "";
  }
}

/**
 * Run a SimHarness for `durationSec` seconds, recording PVB samples each
 * tick, then compute the PVB-corrected score from a user-supplied
 * scoring function applied at the end.
 *
 * @param {{ tick: () => Promise<void>, state: object }} harness
 * @param {number} durationSec
 * @param {(state: object) => number} scoreFn
 * @param {object} [opts]
 * @param {string} [opts.agentId]
 * @param {number} [opts.dtSec=1/30]
 * @returns {Promise<{raw: number, pvb: number, baseline_v0: number, sum_corrections: number, ticks: number}>}
 */
export async function runWithPVB(harness, durationSec, scoreFn, opts = {}) {
  if (!harness || typeof harness.tick !== "function") {
    throw new Error("runWithPVB: harness must expose async tick()");
  }
  const dtSec = Number(opts.dtSec ?? 1 / 30);
  const totalTicks = Math.max(1, Math.round(Number(durationSec) / dtSec));
  const tracker = new PVBTracker();
  const agentId = String(opts.agentId ?? "");

  // Record initial state BEFORE any tick so baseline_v0 reflects the
  // starting point, not the post-first-tick state.
  tracker.recordTick(harness.state, agentId);

  for (let t = 0; t < totalTicks; t++) {
    await harness.tick();
    tracker.recordTick(harness.state, agentId);
    if (harness.state?.session?.phase === "end") break;
  }

  const raw = Number(scoreFn(harness.state)) || 0;
  const finalized = tracker.finalize(raw);
  return {
    raw: Number(raw.toFixed(6)),
    pvb: finalized.pvb_score,
    baseline_v0: finalized.baseline_v0,
    sum_corrections: finalized.sum_corrections,
    ticks: finalized.ticks,
  };
}
