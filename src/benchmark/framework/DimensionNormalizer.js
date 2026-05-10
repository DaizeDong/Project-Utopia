// DimensionNormalizer — per-dimension transform layer (V3.1).
//
// The 5 academic-benchmark dimension plugins (RAE / GroupDynamics / Memory /
// DTE / Hierarchical) emit raw scores on incompatible scales — some [0,1]
// benefit-form, some cost-form (lower-better), some symmetric in [-1,1],
// some unbounded counts in ms or token-rate. ScoringEngine.bayesianScore,
// sandwichNormalize, and HELM MWR all assume comparable [0,1] benefit-form
// inputs. This module is the bridge.
//
// Each registered dim key maps to a `{ transform, ... }` recipe; calling
// `normalizeDimension(key, value)` returns a value in [0,1] (higher = better).
// Unknown keys + NaN / Infinity inputs surface as 0 with a console.warn so
// the caller can detect pipeline gaps without producing garbage downstream.
//
// Dim-key authority is the plugin source: see
// src/benchmark/dimensions/{ResourceAllocationEfficiency,GroupDynamics,
// MemoryDegradation,DecisionTokenEfficiency,HierarchicalCoordination}.js.
//
// Transform menu:
//   identity            — already in [0,1] benefit-form
//   invert              — `1 - x` for [0,1] cost-form (e.g. Gini, idle frac)
//   reciprocal          — `1 / x` for [1, ∞) cost-form (e.g. path overhead)
//   clipScale           — `clip01(x / scale)` for unbounded benefit-form caps
//   rescaleSymmetric    — `(x + 1) / 2` for [-1,1] symmetric correlations
//   exponentialDecay    — `e^{-x/scale}` (default) or `1 - e^{-x/scale}` if
//                         `fromZero: true` (use for benefit-form unbounded)

/**
 * Per-dimension transform metadata. Each entry maps a dim score key to a
 * normalization recipe that emits [0,1] benefit-form (higher = better).
 *
 * IMPORTANT: keys MUST exactly match plugin.scoreDimensions strings.
 */
export const DIMENSION_NORMALIZERS = Object.freeze({
  // ── Identity (already [0,1] benefit-form) ────────────────────────
  rae_composite:           { transform: "identity" },
  rae_sufficiency:         { transform: "identity" },
  anchored_fact_recall:    { transform: "identity" },
  action_grounded_recall:  { transform: "identity" },
  performance_at_t:        { transform: "identity" },
  state_target_obedience:  { transform: "identity" },
  plan_policy_alignment:   { transform: "identity" },

  // ── [0,1] cost-form (higher = worse) ─────────────────────────────
  rae_idle_capacity:       { transform: "invert", domain: [0, 1] },
  rae_distribution_gini:   { transform: "invert", domain: [0, 1] },
  behavioral_drift:        { transform: "invert", domain: [0, 1] },

  // ── [1, ∞) cost-form (1 = best) ──────────────────────────────────
  rae_path_overhead:       { transform: "reciprocal", domain: [1, Infinity] },

  // ── Unbounded benefit-form requiring scaling ─────────────────────
  // Per GroupDynamics.js `entropy()` (log2): max H = log2(#intents).
  // 5 canonical intents (farm/wood/deliver/eat/wander) give ~log2(5)≈2.32,
  // but plugins often broaden to ≥10 intents in practice → cap at ~log2(20)≈4.32.
  intent_entropy:          { transform: "clipScale", scale: 4.32 },

  // ── [-1, 1] symmetric (Pearson correlations) ─────────────────────
  coalition_coupling:        { transform: "rescaleSymmetric", domain: [-1, 1] },
  faction_responsiveness:    { transform: "rescaleSymmetric", domain: [-1, 1] },
  env_threat_responsiveness: { transform: "rescaleSymmetric", domain: [-1, 1] },

  // ── Unbounded cost-form: lower = better via e^{-x/scale} ─────────
  // colony_cadence_health: std-dev of decision intervals in seconds; 30s
  // is a generous "still healthy" cadence target for the strategic loop.
  colony_cadence_health:   { transform: "exponentialDecay", scale: 30 },
  // first_token_latency_p50: ms; 1s is the human-perceptible budget.
  first_token_latency_p50: { transform: "exponentialDecay", scale: 1000 },

  // ── Unbounded benefit-form: higher = better via 1 - e^{-x/scale} ─
  // DTE per-token: typical task progress per token ~ 0.01-0.5; scale=0.1
  // gives saturation near 0.3 (90%-tile of healthy runs).
  dte_per_completion_token: { transform: "exponentialDecay", scale: 0.1, fromZero: true },
  // DTE per-decision: typical progress per LLM call ~ 0.5-3; scale=1 saturates ~3.
  dte_per_decision:         { transform: "exponentialDecay", scale: 1, fromZero: true },
});

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Apply a single transform recipe to a numeric value.
 *
 * @param {object} recipe — entry from DIMENSION_NORMALIZERS
 * @param {number} value
 * @param {string} dimKey — for diagnostic warnings
 * @returns {number} ∈ [0,1]
 */
function applyTransform(recipe, value, dimKey) {
  const t = recipe?.transform;
  switch (t) {
    case "identity":
      return clamp01(value);

    case "invert":
      // [0,1] cost-form → benefit-form. Anything outside the domain clamps first.
      return clamp01(1 - clamp01(value));

    case "reciprocal": {
      // [1, ∞) cost-form (e.g. path overhead, where 1 is theoretical optimum).
      // Values below 1 (shouldn't happen but be defensive) saturate at 1.
      if (value <= 0) return 0;
      return clamp01(1 / Math.max(1, value));
    }

    case "clipScale": {
      const scale = Number(recipe?.scale);
      if (!isFiniteNum(scale) || scale <= 0) {
        // eslint-disable-next-line no-console
        console.warn(`[DimensionNormalizer] ${dimKey}: invalid scale=${scale} for clipScale; returning 0`);
        return 0;
      }
      return clamp01(value / scale);
    }

    case "rescaleSymmetric":
      // [-1,1] → [0,1]. Out-of-range inputs clamp to the domain endpoints.
      return clamp01((Math.max(-1, Math.min(1, value)) + 1) / 2);

    case "exponentialDecay": {
      const scale = Number(recipe?.scale);
      if (!isFiniteNum(scale) || scale <= 0) {
        // eslint-disable-next-line no-console
        console.warn(`[DimensionNormalizer] ${dimKey}: invalid scale=${scale} for exponentialDecay; returning 0`);
        return 0;
      }
      const fromZero = Boolean(recipe?.fromZero);
      const x = Math.max(0, value); // negatives in cost-form are non-physical
      const decay = Math.exp(-x / scale);
      return fromZero ? clamp01(1 - decay) : clamp01(decay);
    }

    default:
      // eslint-disable-next-line no-console
      console.warn(`[DimensionNormalizer] ${dimKey}: unknown transform "${t}"; returning 0`);
      return 0;
  }
}

/**
 * Normalize a single dimension score to [0,1] benefit-form.
 *
 * @param {string} dimKey — must be in DIMENSION_NORMALIZERS
 * @param {number} value
 * @returns {number} ∈ [0,1]; NaN if `dimKey` is unknown
 */
export function normalizeDimension(dimKey, value) {
  const recipe = DIMENSION_NORMALIZERS[dimKey];
  if (!recipe) {
    // eslint-disable-next-line no-console
    console.warn(`[DimensionNormalizer] unknown dim key "${dimKey}"; returning NaN`);
    return NaN;
  }
  if (!isFiniteNum(value)) {
    // NaN / Infinity / non-number → 0 with diagnostic warning. Do NOT
    // propagate NaN: bayesianScore / sandwichNormalize will silently turn
    // a single bad cell into a contaminated batch.
    // eslint-disable-next-line no-console
    console.warn(`[DimensionNormalizer] ${dimKey}: non-finite input ${value}; returning 0`);
    return 0;
  }
  return applyTransform(recipe, value, dimKey);
}

/**
 * Bulk-normalize a `Record<dimKey, number>` row. Unknown keys are
 * preserved with their original value (caller may log a warning),
 * matching the principle that normalizeRow should not silently drop
 * dimensions a future plugin might add.
 *
 * @param {Record<string, number>} scores
 * @returns {Record<string, number>}
 */
export function normalizeRow(scores) {
  if (!scores || typeof scores !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(scores)) {
    if (Object.prototype.hasOwnProperty.call(DIMENSION_NORMALIZERS, k)) {
      out[k] = normalizeDimension(k, v);
    } else {
      // Preserve unknown keys verbatim — do not corrupt row shape.
      out[k] = v;
    }
  }
  return out;
}

/**
 * Aggregate cells (from runSeedMatrix(.cells)) into per-dim arrays for
 * `sandwichNormalize`. Each cell is read at `cell.perDimensionScores[dimKey]`
 * (the SeedMatrix flat-row layout — see SeedMatrixCell.perDimensionScores).
 *
 * @param {Array<object>} cells — output of runSeedMatrix(.cells)
 * @param {string} dimKey
 * @returns {Array<{seed:number, scenario:string, value:number}>}
 */
export function gatherDimensionAcrossCells(cells, dimKey) {
  if (!Array.isArray(cells)) return [];
  const out = [];
  for (const cell of cells) {
    const scores = cell?.perDimensionScores ?? {};
    const raw = scores[dimKey];
    out.push({
      seed: cell?.seed,
      scenario: cell?.scenario,
      value: isFiniteNum(raw) ? raw : NaN,
    });
  }
  return out;
}

/**
 * Build (agent / fallback / oracle) input arrays for `sandwichNormalize`,
 * paired by (seed, scenario). The three input cell sets MUST cover the same
 * (seed, scenario) keys; otherwise this throws so the caller can detect
 * pipeline misalignment instead of producing silently-wrong sandwich norms.
 *
 * Output arrays are ordered by (seed asc, scenario asc) for stability.
 *
 * @param {Array<object>} agentCells
 * @param {Array<object>} fallbackCells
 * @param {Array<object>} oracleCells
 * @param {string} dimKey
 * @returns {{agent:number[], fallback:number[], oracle:number[],
 *           keys:Array<{seed:number, scenario:string}>}}
 */
export function buildSandwichTriple(agentCells, fallbackCells, oracleCells, dimKey) {
  const aMap = indexCellsBySeedScenario(agentCells, dimKey);
  const fMap = indexCellsBySeedScenario(fallbackCells, dimKey);
  const oMap = indexCellsBySeedScenario(oracleCells, dimKey);

  // Require all three sides to cover the same (seed, scenario) pairs.
  const aKeys = new Set(aMap.keys());
  const fKeys = new Set(fMap.keys());
  const oKeys = new Set(oMap.keys());
  if (aKeys.size !== fKeys.size || aKeys.size !== oKeys.size) {
    throw new Error(
      `buildSandwichTriple[${dimKey}]: cell-set size mismatch ` +
      `(agent=${aKeys.size}, fallback=${fKeys.size}, oracle=${oKeys.size})`,
    );
  }
  for (const k of aKeys) {
    if (!fKeys.has(k) || !oKeys.has(k)) {
      throw new Error(
        `buildSandwichTriple[${dimKey}]: missing matched (seed,scenario)="${k}" in fallback or oracle cells`,
      );
    }
  }

  // Sort for stable output ordering. Numeric seed first, then scenario string.
  const sortedKeys = Array.from(aKeys).sort((a, b) => {
    const [as, asc] = a.split("|");
    const [bs, bsc] = b.split("|");
    const ai = Number(as), bi = Number(bs);
    if (ai !== bi) return ai - bi;
    return asc < bsc ? -1 : asc > bsc ? 1 : 0;
  });

  const agent = [];
  const fallback = [];
  const oracle = [];
  const keys = [];
  for (const k of sortedKeys) {
    agent.push(aMap.get(k));
    fallback.push(fMap.get(k));
    oracle.push(oMap.get(k));
    const [seedStr, scenario] = k.split("|");
    keys.push({ seed: Number(seedStr), scenario });
  }
  return { agent, fallback, oracle, keys };
}

function indexCellsBySeedScenario(cells, dimKey) {
  const map = new Map();
  if (!Array.isArray(cells)) return map;
  for (const cell of cells) {
    if (cell == null) continue;
    const seed = cell.seed;
    const scenario = cell.scenario;
    if (seed === undefined || scenario === undefined) continue;
    const v = Number(cell?.perDimensionScores?.[dimKey]);
    map.set(`${seed}|${scenario}`, isFiniteNum(v) ? v : NaN);
  }
  return map;
}
