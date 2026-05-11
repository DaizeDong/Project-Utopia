/**
 * Bayesian Beta-Binomial scoring engine for benchmark evaluation.
 *
 * Replaces passRate*N+M linear formula with:
 * - Beta posterior for proper uncertainty quantification
 * - Relative scoring against baseline/ceiling
 * - Consistency penalty for cross-scenario variance
 */

// ── Beta distribution utilities ────────────────────────────────────

/** Regularized incomplete beta function (simple numeric approx) */
function betaIncomplete(x, a, b) {
  // Use continued fraction approximation (Lentz's method)
  // For benchmark scoring, we need decent accuracy but not scientific precision
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Simple numeric integration via trapezoidal rule (sufficient for our use case)
  const N = 200;
  const dx = x / N;
  let sum = 0;
  for (let i = 0; i <= N; i++) {
    const t = i * dx;
    const ft = Math.pow(t, a - 1) * Math.pow(1 - t, b - 1);
    sum += (i === 0 || i === N) ? ft / 2 : ft;
  }
  sum *= dx;
  // Normalize by Beta function B(a,b)
  const fullBeta = betaFn(a, b);
  return Math.min(1, Math.max(0, sum / fullBeta));
}

/** Beta function B(a,b) via log-gamma */
function betaFn(a, b) {
  return Math.exp(lnGamma(a) + lnGamma(b) - lnGamma(a + b));
}

/** Lanczos approximation to ln(Gamma(z)) */
function lnGamma(z) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Inverse Beta CDF via bisection (for credible intervals) */
function betaQuantile(p, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (betaIncomplete(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Scoring functions ──────────────────────────────────────────────

/**
 * Compute Bayesian posterior statistics from a set of scores.
 * Uses Beta(2,2) weakly informative prior.
 *
 * @param {number[]} scores - Array of scores, each in [0,1]
 * @returns {{ mean, std, ci95: [number, number], median, p5, p95, posterior: {alpha, beta} }}
 */
export function bayesianScore(scores) {
  if (scores.length === 0) {
    return { mean: 0.5, std: 0.29, ci95: [0.05, 0.95], median: 0.5, p5: 0.05, p95: 0.95, posterior: { alpha: 2, beta: 2 } };
  }
  const sumX = scores.reduce((a, b) => a + b, 0);
  const alpha = 2 + sumX;
  const beta = 2 + scores.length - sumX;
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const std = Math.sqrt(variance);
  return {
    mean: round(mean, 4),
    std: round(std, 4),
    ci95: [round(betaQuantile(0.025, alpha, beta), 4), round(betaQuantile(0.975, alpha, beta), 4)],
    median: round(betaQuantile(0.5, alpha, beta), 4),
    p5: round(betaQuantile(0.05, alpha, beta), 4),
    p95: round(betaQuantile(0.95, alpha, beta), 4),
    posterior: { alpha: round(alpha, 2), beta: round(beta, 2) },
  };
}

/**
 * Compute relative score: (agent - baseline) / (ceiling - baseline).
 * Returns 0 if agent <= baseline, 1 if agent >= ceiling.
 *
 * @param {number} agentScore
 * @param {number} baselineScore - Score from random/fallback strategy
 * @param {number} ceilingScore - Score from greedy oracle strategy
 * @returns {number} Relative score in [0,1]
 */
export function relativeScore(agentScore, baselineScore, ceilingScore) {
  const range = ceilingScore - baselineScore;
  if (range <= 0) return agentScore > baselineScore ? 1 : 0;
  return Math.max(0, Math.min(1, (agentScore - baselineScore) / range));
}

/**
 * Sandwich normalization (MeltingPot 2 / Agapiou et al. 2022) — array form.
 *
 *     score_norm(s) = (R_agent(s) − R_random(s)) / (R_exploiter(s) − R_random(s))
 *
 * R_random  ≡ deterministic-fallback policy (= Project-Utopia's `Guardrails` default).
 * R_exploiter ≡ scripted oracle policy (`ScriptedOraclePolicy.js`).
 *
 * Allows score > 1 to flag "superhuman LLM" runs without breaking math
 * (clip-on-output is the caller's choice). NaN-safe; range==0 short-circuits
 * to the binary above-baseline check.
 *
 * @param {number[]} agentScores
 * @param {number[]} fallbackScores  same length as agentScores (per-seed pairing)
 * @param {number[]} oracleScores    same length as agentScores
 * @param {{ clipUpperBound?: boolean }} [opts]  default: do NOT clip > 1 (paper convention)
 * @returns {number[]} normalized scores
 */
export function sandwichNormalize(agentScores, fallbackScores, oracleScores, opts = {}) {
  const n = agentScores.length;
  if (n === 0) return [];
  if (fallbackScores.length !== n || oracleScores.length !== n) {
    throw new Error(
      `sandwichNormalize: array length mismatch (agent=${n}, fb=${fallbackScores.length}, oracle=${oracleScores.length})`,
    );
  }
  const clipUpper = opts.clipUpperBound === true;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const range = oracleScores[i] - fallbackScores[i];
    let s;
    if (!Number.isFinite(range)) {
      // Non-finite oracle/fallback (NaN / Infinity) — return NaN to signal
      // upstream pipeline error rather than silently mask it.
      s = NaN;
    } else if (range < 0) {
      // Oracle is WORSE than fallback — this is an oracle blueprint bug.
      // Return NaN so caller can detect; do not silently produce a score.
      // (Reviewer B SC-1: collapsing this into "above-baseline binary" was wrong.)
      s = NaN;
    } else if (range === 0) {
      // Degenerate (oracle == fallback): binary above-baseline.
      s = agentScores[i] > fallbackScores[i] ? 1 : 0;
    } else {
      s = (agentScores[i] - fallbackScores[i]) / range;
      // Lower bound at 0 always; upper bound at 1 only if explicitly requested.
      if (s < 0) s = 0;
      if (clipUpper && s > 1) s = 1;
    }
    out[i] = Number.isFinite(s) ? round(s, 4) : s;
  }
  return out;
}

/**
 * Crafter geometric mean (Hafner 2021 — re-exported here for ScoringEngine consumers).
 * Punishes single-axis collapse.
 *
 *     S = exp((1/N) Σ ln(1 + sᵢ)) − 1
 */
export function geometricMean(scores) {
  if (!scores?.length) return 0;
  const N = scores.length;
  let logSum = 0;
  for (const s of scores) {
    const clipped = Math.max(0, Math.min(1, Number(s) || 0));
    logSum += Math.log(1 + clipped);
  }
  return round(Math.exp(logSum / N) - 1, 6);
}

/**
 * Apply consistency penalty: penalize high variance across scenarios.
 * finalScore = mean - lambda * std
 *
 * @param {number[]} scores
 * @param {number} [lambda=0.5]
 * @returns {number}
 */
export function consistencyAdjustedScore(scores, lambda = 0.5) {
  if (scores.length === 0) return 0;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  return Math.max(0, mean - lambda * Math.sqrt(variance));
}

/**
 * Compute effect size (Cohen's d) between two groups.
 */
export function cohenD(groupA, groupB) {
  if (groupA.length === 0 || groupB.length === 0) return 0;
  const meanA = groupA.reduce((a, b) => a + b, 0) / groupA.length;
  const meanB = groupB.reduce((a, b) => a + b, 0) / groupB.length;
  const varA = groupA.reduce((a, b) => a + (b - meanA) ** 2, 0) / groupA.length;
  const varB = groupB.reduce((a, b) => a + (b - meanB) ** 2, 0) / groupB.length;
  const pooledStd = Math.sqrt((varA + varB) / 2);
  if (pooledStd === 0) return 0;
  return (meanA - meanB) / pooledStd;
}

/**
 * Compute Bayes Factor (BF10) approximation using BIC method.
 * Compares H1 (different means) vs H0 (same mean).
 */
export function bayesFactor(groupA, groupB) {
  const nA = groupA.length, nB = groupB.length;
  if (nA < 2 || nB < 2) return 1;
  const n = nA + nB;
  const all = [...groupA, ...groupB];
  const grandMean = all.reduce((a, b) => a + b, 0) / n;
  const sse0 = all.reduce((a, b) => a + (b - grandMean) ** 2, 0); // H0: single mean
  const meanA = groupA.reduce((a, b) => a + b, 0) / nA;
  const meanB = groupB.reduce((a, b) => a + b, 0) / nB;
  const sse1 = groupA.reduce((a, b) => a + (b - meanA) ** 2, 0)
             + groupB.reduce((a, b) => a + (b - meanB) ** 2, 0); // H1: two means
  // BIC approximation: BF10 ≈ exp((BIC0 - BIC1) / 2)
  const bic0 = n * Math.log(Math.max(1e-10, sse0 / n)) + 1 * Math.log(n); // 1 param
  const bic1 = n * Math.log(Math.max(1e-10, sse1 / n)) + 2 * Math.log(n); // 2 params
  return Math.exp((bic0 - bic1) / 2);
}

/**
 * Generate a comparison verdict from two groups of scores.
 *
 * @param {number[]} treatment - Scores from the treatment group
 * @param {number[]} control - Scores from the control group
 * @returns {{ deltaMean, cohenD, bayesFactor, verdict: string }}
 */
export function compareGroups(treatment, control) {
  const meanT = treatment.length ? treatment.reduce((a, b) => a + b, 0) / treatment.length : 0;
  const meanC = control.length ? control.reduce((a, b) => a + b, 0) / control.length : 0;
  const d = cohenD(treatment, control);
  const bf = bayesFactor(treatment, control);
  let verdict;
  if (bf > 10 && Math.abs(d) > 0.5) verdict = "CONFIRMED_IMPROVEMENT";
  else if (bf > 3 && Math.abs(d) > 0.3) verdict = "LIKELY_IMPROVEMENT";
  else if (bf < 1/3) verdict = "NO_EFFECT";
  else verdict = "AMBIGUOUS";
  return {
    deltaMean: round(meanT - meanC, 4),
    cohenD: round(d, 3),
    bayesFactor: round(bf, 2),
    verdict,
  };
}

function round(v, d = 2) {
  const s = Number(v);
  return Number.isFinite(s) ? Number(s.toFixed(d)) : s;
}

/**
 * HELM Mean Win Rate (Liang et al. 2022 / TMLR 2023, §F.4 of survey).
 *
 *   MWR_m = (1 / (|M| − 1)) · mean_d [ Σ_{m' ≠ m} 1{S_{m,d} > S_{m',d}} ] / |D|
 *         = (1 / (|D| · (|M| − 1))) · Σ_d Σ_{m' ≠ m} 1{S_{m,d} > S_{m',d}}
 *
 * In paper §4.4b we describe MWR as: "for each pair (m_i, m_j) compute the
 * fraction of dimensions where m_i beats m_j, then average across j ≠ i".
 * The two definitions are algebraically equivalent — we implement the
 * pairwise form because it cleanly handles per-pair missing dimensions
 * (skip the dim for that pair only) and exposes the per-pair win rate
 * for downstream non-transitivity / α-rank analysis.
 *
 * Tie handling: a strict `>` is used, matching HELM's convention. Ties
 * contribute 0 to the winner's count for that dim/pair (i.e., neither
 * model wins). Use a small ε in pre-processing if integer-equal ties
 * are expected.
 *
 * Missing dim handling: a dim is counted only for pairs where BOTH
 * agents have a finite score. The pair's denominator is the number of
 * jointly-present dims (so two agents that share zero dims contribute
 * NaN, which we surface as 0 for the MWR sum and a 0 pair contribution).
 *
 * @param {Object<string, Object<string, number>>} perAgentDimensionScores
 *   Shape: { [agentId]: { [dimKey]: score, … }, … }.
 *   All scores should already be normalized to a comparable benefit-form
 *   scale (use DimensionNormalizer first if not).
 * @returns {Object<string, number>} { [agentId]: mwr ∈ [0,1] }
 *   Single-agent input → returns { [agentId]: 0 } (no opponents).
 */
export function computeHelmMwr(perAgentDimensionScores) {
  const agentIds = Object.keys(perAgentDimensionScores ?? {});
  const out = {};
  if (agentIds.length === 0) return out;
  if (agentIds.length === 1) {
    // No opponents → MWR is undefined; report 0 for downstream pipeline safety.
    out[agentIds[0]] = 0;
    return out;
  }

  for (const i of agentIds) {
    let pairWinRateSum = 0;
    let pairCount = 0;
    const scoresI = perAgentDimensionScores[i] ?? {};
    for (const j of agentIds) {
      if (j === i) continue;
      const scoresJ = perAgentDimensionScores[j] ?? {};
      // Joint-dim set: dims where both agents have a finite score.
      const dims = new Set(Object.keys(scoresI));
      for (const d of Object.keys(scoresJ)) dims.add(d);
      let wins = 0;
      let jointDims = 0;
      for (const d of dims) {
        const a = Number(scoresI[d]);
        const b = Number(scoresJ[d]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        jointDims++;
        if (a > b) wins++;
      }
      if (jointDims === 0) {
        // No comparable dims → contribute 0 fraction (and the pair counts
        // toward the denominator, matching HELM's "always |M|−1 opponents"
        // convention; a dropped pair would inflate winners that simply
        // happen to share no dims with one opponent).
        pairWinRateSum += 0;
      } else {
        pairWinRateSum += wins / jointDims;
      }
      pairCount++;
    }
    out[i] = pairCount > 0 ? round(pairWinRateSum / pairCount, 4) : 0;
  }
  return out;
}
