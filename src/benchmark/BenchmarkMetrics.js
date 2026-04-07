/**
 * Benchmark Metrics Module
 *
 * Computes task performance, cost efficiency, and decision quality metrics
 * from colony simulation data for AI agent benchmarking.
 */

// ── Helpers ──────────────────────────────────────────────────────────

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr) {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function coefficientOfVariation(arr) {
  const m = mean(arr);
  if (m === 0) return 0;
  return std(arr) / m;
}

/**
 * Time-weighted average over samples.
 * Uses the time deltas between consecutive samples as weights.
 * If fewer than 2 samples, returns the single value or 0.
 */
function timeWeightedAverage(samples, key) {
  if (samples.length === 0) return 0;
  if (samples.length === 1) return samples[0][key];

  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    // Use the average of the two bracketing values for each interval
    const val = (samples[i - 1][key] + samples[i][key]) / 2;
    weightedSum += val * dt;
    totalWeight += dt;
  }

  if (totalWeight === 0) return samples[0][key];
  return weightedSum / totalWeight;
}

function safeDivide(numerator, denominator, fallback = 0) {
  if (denominator === 0) return fallback;
  return numerator / denominator;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Compute task performance metrics from game simulation data.
 *
 * @param {Array<{t:number, food:number, wood:number, workers:number, prosperity:number, threat:number}>} samples
 * @param {{totalObjectives:number, completedObjectives:number, survivalSec:number, maxSurvivalSec:number, initialWorkers:number, deathsTotal:number}} config
 * @returns {{T_surv:number, T_obj:number, T_res:number, T_pop:number, T_pros:number, T_threat:number, T_composite:number}}
 */
export function computeTaskScore(samples, config) {
  const {
    totalObjectives,
    completedObjectives,
    survivalSec,
    maxSurvivalSec,
    initialWorkers,
    deathsTotal,
  } = config;

  const T_surv = clamp01(safeDivide(survivalSec, maxSurvivalSec, 0));
  const T_obj = clamp01(safeDivide(completedObjectives, totalObjectives, 0));

  // T_res: resource stability via coefficient of variation
  const foodValues = samples.map((s) => s.food);
  const woodValues = samples.map((s) => s.wood);
  const cvFood = coefficientOfVariation(foodValues);
  const cvWood = coefficientOfVariation(woodValues);
  const T_res = clamp01(1 - (cvFood + cvWood) / 2);

  const T_pop = Math.max(0, 1 - safeDivide(deathsTotal, initialWorkers, 0));

  const T_pros = clamp01(timeWeightedAverage(samples, "prosperity") / 100);
  const T_threat = clamp01(1 - timeWeightedAverage(samples, "threat") / 100);

  const T_composite =
    0.20 * T_surv +
    0.25 * T_obj +
    0.10 * T_res +
    0.10 * T_pop +
    0.15 * T_pros +
    0.10 * T_threat +
    0.10 * T_surv;

  return { T_surv, T_obj, T_res, T_pop, T_pros, T_threat, T_composite };
}

/**
 * Compute cost efficiency metrics from decision logs.
 *
 * @param {Array<{t:number, source:"llm"|"fallback", tokens:number, latencyMs:number}>} decisions
 * @param {number} gameDurationMin
 * @param {number} costPerToken
 * @returns {{totalDecisions:number, llmDecisions:number, fallbackDecisions:number, totalTokens:number, C_tok:number, C_min:number, C_lat:number, C_fb:number}}
 */
export function computeCostMetrics(decisions, gameDurationMin, costPerToken) {
  const totalDecisions = decisions.length;
  const llmDecisions = decisions.filter((d) => d.source === "llm").length;
  const fallbackDecisions = decisions.filter((d) => d.source === "fallback").length;
  const totalTokens = decisions.reduce((s, d) => s + d.tokens, 0);

  const C_tok = safeDivide(totalTokens, llmDecisions, 0);
  const C_min = safeDivide(totalTokens * costPerToken, gameDurationMin, 0);

  const avgLatency = mean(decisions.map((d) => d.latencyMs));
  const C_lat = avgLatency / 20000;

  const C_fb = safeDivide(fallbackDecisions, totalDecisions, 0);

  return {
    totalDecisions,
    llmDecisions,
    fallbackDecisions,
    totalTokens,
    C_tok,
    C_min,
    C_lat,
    C_fb,
  };
}

/**
 * Compute decision quality metrics from guardrail and crisis data.
 *
 * @param {Array<{totalValues:number, clampedValues:number}>} guardrailLog
 * @param {number} crisisEvents
 * @param {number} crisisResponses
 * @returns {{D_hall:number, D_adapt:number}}
 */
export function computeDecisionQuality(guardrailLog, crisisEvents, crisisResponses) {
  const sumClamped = guardrailLog.reduce((s, g) => s + g.clampedValues, 0);
  const sumTotal = guardrailLog.reduce((s, g) => s + g.totalValues, 0);

  const D_hall = safeDivide(sumClamped, sumTotal, 0);
  const D_adapt = crisisEvents === 0 ? 1 : safeDivide(crisisResponses, crisisEvents, 1);

  return { D_hall, D_adapt };
}
