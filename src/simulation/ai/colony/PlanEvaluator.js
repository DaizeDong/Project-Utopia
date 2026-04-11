/**
 * PlanEvaluator — Reflexion-based outcome assessment for colony plans.
 *
 * Responsibilities:
 * 1. Compare actual step outcomes to predicted effects
 * 2. Diagnose failures with structured cause analysis
 * 3. Generate natural language reflections for MemoryStore
 * 4. Evaluate overall plan success and compute quality scores
 * 5. Track evaluation statistics across planning cycles
 * 6. Systemic bottleneck analysis across step evaluations (P4)
 * 7. Recurring failure pattern detection (P4)
 * 8. Formatted evaluation summary for LLM consumption (P4)
 */

import { TILE } from "../../../config/constants.js";
import { listTilesByType, toIndex, inBounds } from "../../../world/grid/Grid.js";
import { analyzeResourceChains } from "./ColonyPerceiver.js";

// ── Constants ────────────────────────────────────────────────────────

/** Predicted vs actual tolerance: within 50% counts as success */
const PREDICTION_TOLERANCE = 0.5;

/** Max Manhattan distance for warehouse coverage check */
const WAREHOUSE_COVERAGE_DIST = 12;

/** Low moisture threshold for terrain diagnosis */
const LOW_MOISTURE_THRESHOLD = 0.3;

/** High elevation threshold for terrain diagnosis */
const HIGH_ELEVATION_THRESHOLD = 0.7;

/** Worker search radius for worker proximity check */
const WORKER_SEARCH_RADIUS = 12;

/** Max reflections to emit per plan evaluation */
const MAX_REFLECTIONS_PER_PLAN = 5;

/** Minimum importance for a reflection to be stored */
const MIN_REFLECTION_IMPORTANCE = 2;

// Production tile types that need warehouse coverage and worker servicing
const PRODUCTION_TILES = new Set([
  "farm", "lumber", "quarry", "herb_garden", "kitchen", "smithy", "clinic",
]);

// Resource keys tracked for rate comparison
const RATE_KEYS = ["food", "wood", "stone", "herbs", "meals", "tools", "medicine"];

// ── Step Evaluation ─────────────────────────────────────────────────

/**
 * Snapshot relevant state metrics before/after step execution.
 * Call snapshotBefore() before executing a step, snapshotAfter() after.
 * @param {object} state — game state
 * @returns {object} snapshot of resources and rates
 */
export function snapshotState(state) {
  const resources = {};
  for (const key of RATE_KEYS) {
    resources[key] = state.resources?.[key] ?? 0;
  }
  return {
    resources,
    timeSec: state.metrics?.timeSec ?? 0,
    workerCount: (state.agents ?? state.workers ?? []).filter(a => !a.type || (a.type === "WORKER" && a.alive !== false)).length,
    prosperity: state.prosperity ?? 0,
  };
}

/**
 * Parse a predicted effect string into a numeric value.
 * Handles formats like "+0.5/s", "+15%", "-3", "improved", etc.
 * @param {string|number} value
 * @returns {{ numeric: number|null, unit: string }}
 */
export function parsePredictedValue(value) {
  if (typeof value === "number") return { numeric: value, unit: "" };
  if (typeof value !== "string") return { numeric: null, unit: "" };

  const cleaned = value.trim();

  // Rate: "+0.5/s" or "-2/s"
  const rateMatch = cleaned.match(/^([+-]?\d+(?:\.\d+)?)\/s$/);
  if (rateMatch) return { numeric: parseFloat(rateMatch[1]), unit: "/s" };

  // Percentage: "+15%" or "-30%"
  const pctMatch = cleaned.match(/^([+-]?\d+(?:\.\d+)?)%$/);
  if (pctMatch) return { numeric: parseFloat(pctMatch[1]), unit: "%" };

  // Plain number: "+3" or "-2" or "5"
  const numMatch = cleaned.match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (numMatch) return { numeric: parseFloat(numMatch[1]), unit: "" };

  // Qualitative values: "improved", "marginal", etc.
  return { numeric: null, unit: cleaned };
}

/**
 * Evaluate a single completed plan step against its predictions.
 * @param {object} step — executed plan step (with status, groundedTile, etc.)
 * @param {object} beforeSnap — state snapshot before execution
 * @param {object} afterSnap — state snapshot after execution
 * @param {object} state — current game state (for spatial checks)
 * @returns {object} evaluation result
 */
export function evaluateStep(step, beforeSnap, afterSnap, state) {
  const evaluation = {
    stepId: step.id,
    action: step.action.skill ?? step.action.type,
    buildSuccess: step.status === "completed",
    predicted: step.predicted_effect ?? {},
    actual: {},
    deviations: {},
    success: step.status === "completed",
    diagnosis: [],
    score: 0, // 0-1 quality score
  };

  // If build failed entirely, score=0 and diagnose
  if (!evaluation.buildSuccess) {
    evaluation.score = 0;
    evaluation.diagnosis = diagnoseFailure(step, evaluation, state);
    return evaluation;
  }

  // Compute actual effects from snapshots
  const resourceDeltas = {};
  for (const key of RATE_KEYS) {
    const delta = (afterSnap.resources[key] ?? 0) - (beforeSnap.resources[key] ?? 0);
    if (Math.abs(delta) > 0.01) {
      resourceDeltas[key] = delta;
    }
  }
  evaluation.actual = resourceDeltas;

  // Compare predicted vs actual for each predicted metric
  let predictionCount = 0;
  let predictionHits = 0;

  for (const [metric, rawValue] of Object.entries(evaluation.predicted)) {
    const { numeric } = parsePredictedValue(rawValue);
    if (numeric === null) continue; // qualitative — skip

    predictionCount++;

    // Try to find corresponding actual metric
    // Map metric names to resource keys: "food_rate_delta" → "food", "wood_rate" → "wood"
    const resourceKey = _metricToResourceKey(metric);
    const actualValue = resourceDeltas[resourceKey] ?? 0;

    const deviation = actualValue - numeric;
    evaluation.deviations[metric] = deviation;

    // Success if within tolerance
    const tolerance = Math.abs(numeric) * PREDICTION_TOLERANCE;
    if (Math.abs(deviation) <= Math.max(tolerance, 0.1)) {
      predictionHits++;
    }
  }

  // Score: weighted by build success + prediction accuracy
  const predictionAccuracy = predictionCount > 0 ? predictionHits / predictionCount : 1;
  evaluation.score = evaluation.buildSuccess ? (0.6 + 0.4 * predictionAccuracy) : 0;

  // If score is low, diagnose
  if (evaluation.score < 0.8) {
    evaluation.diagnosis = diagnoseFailure(step, evaluation, state);
  }

  // Overall success = built + at least half predictions within tolerance
  evaluation.success = evaluation.buildSuccess && predictionAccuracy >= 0.5;

  return evaluation;
}

/**
 * Map metric name to resource key.
 * "food_rate_delta" → "food", "stone_rate" → "stone", "tools_rate" → "tools"
 */
function _metricToResourceKey(metric) {
  for (const key of RATE_KEYS) {
    if (metric.startsWith(key)) return key;
  }
  // Fallback: try removing common suffixes
  const base = metric.replace(/_(?:rate|delta|rate_delta|production|stock)$/, "");
  if (RATE_KEYS.includes(base)) return base;
  return metric;
}

// ── Failure Diagnosis ───────────────────────────────────────────────

/**
 * Diagnose why a step failed or underperformed.
 * Returns an array of structured causes.
 * @param {object} step — plan step
 * @param {object} evaluation — evaluation result so far
 * @param {object} state — game state
 * @returns {Array<{type: string, detail: string, severity: number}>}
 */
export function diagnoseFailure(step, evaluation, state) {
  const causes = [];
  const grid = state.grid;
  const tile = step.groundedTile ?? step.actualTile;

  // 1. Placement failure — no valid tile found
  if (!evaluation.buildSuccess) {
    if (!tile) {
      causes.push({ type: "no_valid_tile", detail: "no valid tile found for placement", severity: 5 });
    } else {
      causes.push({ type: "placement_rejected", detail: `tile (${tile.ix},${tile.iz}) rejected by build system`, severity: 4 });
    }
    return causes; // if placement failed, no further diagnosis needed
  }

  const actionType = step.action.skill ?? step.action.type;

  // 2. Warehouse coverage check for production buildings
  if (tile && PRODUCTION_TILES.has(actionType)) {
    const warehouseDist = _nearestWarehouseDistance(tile.ix, tile.iz, grid);
    if (warehouseDist > WAREHOUSE_COVERAGE_DIST) {
      causes.push({
        type: "uncovered",
        detail: `nearest warehouse is ${warehouseDist} tiles away (max ${WAREHOUSE_COVERAGE_DIST})`,
        severity: 4,
      });
    }
  }

  // 3. Worker proximity check
  if (tile && PRODUCTION_TILES.has(actionType)) {
    const nearbyWorkers = _countWorkersNear(tile.ix, tile.iz, state, WORKER_SEARCH_RADIUS);
    if (nearbyWorkers === 0) {
      causes.push({
        type: "no_workers",
        detail: `no workers within ${WORKER_SEARCH_RADIUS} tiles — building may be unserviced`,
        severity: 3,
      });
    }
  }

  // 4. Terrain quality check (moisture for farms/herb_gardens, elevation for walls)
  if (tile && grid?.moisture) {
    const idx = toIndex(tile.ix, tile.iz, grid.width);
    const moisture = grid.moisture[idx] ?? 0.5;
    const elevation = grid.elevation?.[idx] ?? 0.5;

    if ((actionType === "farm" || actionType === "herb_garden") && moisture < LOW_MOISTURE_THRESHOLD) {
      causes.push({
        type: "poor_terrain",
        detail: `low moisture (${moisture.toFixed(2)}) limits fertility recovery`,
        severity: 3,
      });
    }

    if (actionType === "lumber" && moisture < 0.2) {
      causes.push({
        type: "poor_terrain",
        detail: `very dry terrain (${moisture.toFixed(2)}) increases fire risk`,
        severity: 2,
      });
    }

    if ((actionType === "farm" || actionType === "lumber") && elevation > HIGH_ELEVATION_THRESHOLD) {
      causes.push({
        type: "high_elevation",
        detail: `high elevation (${elevation.toFixed(2)}) increases build cost and reduces efficiency`,
        severity: 2,
      });
    }
  }

  // 5. Adjacency issues — quarry near farms (pollution)
  if (tile && actionType === "quarry") {
    const nearbyFarms = _countAdjacentType(tile.ix, tile.iz, grid, TILE.FARM);
    if (nearbyFarms > 0) {
      causes.push({
        type: "adjacency_conflict",
        detail: `quarry adjacent to ${nearbyFarms} farm(s) — dust pollution reduces fertility`,
        severity: 3,
      });
    }
  }

  // 6. Prediction deviation diagnosis
  for (const [metric, deviation] of Object.entries(evaluation.deviations ?? {})) {
    if (Math.abs(deviation) > 0.5) {
      const direction = deviation < 0 ? "underperformed" : "overperformed";
      causes.push({
        type: "prediction_mismatch",
        detail: `${metric} ${direction} by ${Math.abs(deviation).toFixed(2)}`,
        severity: Math.abs(deviation) > 1 ? 3 : 2,
      });
    }
  }

  return causes;
}

/** Manhattan distance to nearest warehouse. Returns Infinity if none. */
function _nearestWarehouseDistance(ix, iz, grid) {
  const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
  let minDist = Infinity;
  for (const w of warehouses) {
    const d = Math.abs(w.ix - ix) + Math.abs(w.iz - iz);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/** Count workers within Manhattan distance of a tile. */
function _countWorkersNear(ix, iz, state, radius) {
  let count = 0;
  const agents = state.agents ?? state.workers ?? [];
  for (const w of agents) {
    if (w.type && w.type !== "WORKER") continue;
    if (w.alive === false) continue;
    const wx = w.tileX ?? w.ix ?? -1;
    const wz = w.tileZ ?? w.iz ?? -1;
    if (Math.abs(wx - ix) + Math.abs(wz - iz) <= radius) {
      count++;
    }
  }
  return count;
}

/** Count adjacent tiles of a given type (4-directional). */
function _countAdjacentType(ix, iz, grid, tileType) {
  let count = 0;
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [dx, dz] of dirs) {
    const nx = ix + dx;
    const nz = iz + dz;
    if (inBounds(nx, nz, grid) && grid.tiles[toIndex(nx, nz, grid.width)] === tileType) {
      count++;
    }
  }
  return count;
}

// ── Reflection Generation ───────────────────────────────────────────

/**
 * Generate a natural language reflection from a step evaluation.
 * @param {object} step — executed plan step
 * @param {object} evaluation — evaluation result
 * @param {object} state — current game state
 * @returns {{ text: string, category: string, importance: number }|null}
 */
export function generateReflection(step, evaluation, state) {
  const tile = step.groundedTile ?? step.actualTile;
  const actionType = step.action.skill ?? step.action.type;
  const coords = tile ? `(${tile.ix},${tile.iz})` : "(unknown)";

  // No diagnosis means success — only reflect on failures or significant findings
  if (evaluation.diagnosis.length === 0 && evaluation.success) {
    // Only generate positive reflections for high-value successes
    if (evaluation.score >= 0.9) {
      return null; // no reflection needed for smooth successes
    }
  }

  // Pick the highest severity cause for the primary reflection
  const sortedCauses = [...evaluation.diagnosis].sort((a, b) => b.severity - a.severity);
  const primary = sortedCauses[0];

  if (!primary) {
    // Low score but no specific diagnosis — generic underperformance
    return {
      text: `${_capitalize(actionType)} at ${coords} scored ${evaluation.score.toFixed(1)}/1.0 — predictions were inaccurate. Review expected outcomes for ${actionType} builds.`,
      category: "construction_reflection",
      importance: 3,
    };
  }

  // Template-based reflections for each cause type
  const text = _reflectionFromCause(actionType, coords, primary, evaluation);
  const importance = Math.min(5, Math.max(MIN_REFLECTION_IMPORTANCE, primary.severity));

  return {
    text,
    category: _categoryFromCauseType(primary.type),
    importance,
  };
}

/**
 * Generate reflection text from a specific cause.
 */
function _reflectionFromCause(actionType, coords, cause, evaluation) {
  switch (cause.type) {
    case "no_valid_tile":
      return `Failed to place ${actionType} — no valid tile found. REMEDY: Build a warehouse in a new area first, or clear ruins to free space. Check expansion frontiers for available grass tiles.`;

    case "placement_rejected":
      return `${_capitalize(actionType)} at ${coords} was rejected by the build system. REMEDY: Use location hints (near_cluster, terrain:high_moisture) to target better tiles.`;

    case "uncovered":
      return `${_capitalize(actionType)} at ${coords} is outside warehouse coverage (${cause.detail}). REMEDY: Build warehouse before placing production buildings in new areas. All production must be within ${WAREHOUSE_COVERAGE_DIST} tiles of a warehouse.`;

    case "no_workers":
      return `${_capitalize(actionType)} at ${coords} has no nearby workers — building will be unserviced. REMEDY: Build closer to existing clusters, or wait for population growth. Don't spread colony faster than workforce.`;

    case "poor_terrain":
      return `${_capitalize(actionType)} at ${coords} is on poor terrain (${cause.detail}). REMEDY: For farms/herb_gardens, target moisture > 0.5 using terrain:high_moisture hint. Check expansion frontiers for better terrain.`;

    case "high_elevation":
      return `${_capitalize(actionType)} at ${coords} is at high elevation (${cause.detail}). REMEDY: Prefer low-elevation tiles for production (cheaper build, better fertility). Reserve high elevation for walls (+50% defense).`;

    case "adjacency_conflict":
      return `${_capitalize(actionType)} at ${coords} has an adjacency conflict (${cause.detail}). REMEDY: Keep quarries at least 2 tiles from farms/herb_gardens. Place herb_gardens adjacent to farms for +fertility synergy.`;

    case "prediction_mismatch":
      return `${_capitalize(actionType)} at ${coords} ${cause.detail}. REMEDY: Calibrate predictions — actual yields depend on moisture, worker availability, and season modifiers.`;

    default:
      return `${_capitalize(actionType)} at ${coords}: ${cause.detail}`;
  }
}

/**
 * Map cause type to memory category.
 */
function _categoryFromCauseType(type) {
  switch (type) {
    case "no_valid_tile":
    case "placement_rejected":
      return "construction_failure";
    case "uncovered":
    case "no_workers":
      return "construction_reflection";
    case "poor_terrain":
    case "high_elevation":
      return "terrain_knowledge";
    case "adjacency_conflict":
      return "construction_pattern";
    case "prediction_mismatch":
      return "construction_reflection";
    default:
      return "construction_reflection";
  }
}

function _capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// ── Plan-Level Evaluation ───────────────────────────────────────────

/**
 * Evaluate an entire plan after all steps complete.
 * @param {object} plan — completed plan with step statuses
 * @param {object} planStartSnap — state snapshot when plan started
 * @param {object} planEndSnap — state snapshot when plan ended
 * @param {object} state — current game state
 * @returns {object} plan-level evaluation
 */
export function evaluatePlan(plan, planStartSnap, planEndSnap, state) {
  const steps = plan.steps ?? [];
  const completed = steps.filter(s => s.status === "completed").length;
  const failed = steps.filter(s => s.status === "failed").length;
  const total = steps.length;

  // Completion ratio
  const completionRatio = total > 0 ? completed / total : 0;

  // Resource change during plan
  const resourceChanges = {};
  for (const key of RATE_KEYS) {
    const before = planStartSnap?.resources?.[key] ?? 0;
    const after = planEndSnap?.resources?.[key] ?? 0;
    resourceChanges[key] = after - before;
  }

  // Time analysis
  const elapsedSec = (planEndSnap?.timeSec ?? 0) - (planStartSnap?.timeSec ?? 0);
  const horizonSec = plan.horizon_sec ?? 60;
  const timeEfficiency = horizonSec > 0 ? Math.min(1, horizonSec / Math.max(1, elapsedSec)) : 1;

  // Goal achievement score: weighted combination
  const completionScore = completionRatio * 0.4;
  const timeScore = timeEfficiency * 0.2;
  const buildScore = completed > 0 ? 0.3 : 0;
  const noFailureBonus = failed === 0 ? 0.1 : 0;
  const overallScore = completionScore + timeScore + buildScore + noFailureBonus;

  // Determine success
  const success = completionRatio >= 0.5 && completed > 0;

  return {
    goal: plan.goal,
    source: plan.source ?? "unknown",
    completed,
    failed,
    total,
    completionRatio,
    resourceChanges,
    elapsedSec,
    horizonSec,
    timeEfficiency,
    overallScore,
    success,
  };
}

// ── PlanEvaluator Class ─────────────────────────────────────────────

export class PlanEvaluator {
  /**
   * @param {object} [memoryStore] — MemoryStore instance for writing reflections
   */
  constructor(memoryStore = null) {
    this._memoryStore = memoryStore;
    this._stats = {
      stepsEvaluated: 0,
      stepSuccesses: 0,
      stepFailures: 0,
      plansEvaluated: 0,
      planSuccesses: 0,
      reflectionsGenerated: 0,
      avgStepScore: 0,
      avgPlanScore: 0,
    };
    this._scoreHistory = []; // rolling window for averages
  }

  get stats() { return { ...this._stats }; }

  /**
   * Evaluate a single step and optionally write reflection to memory.
   * @param {object} step — executed plan step
   * @param {object} beforeSnap — pre-execution snapshot
   * @param {object} afterSnap — post-execution snapshot
   * @param {object} state — current game state
   * @returns {object} evaluation result
   */
  evaluateStep(step, beforeSnap, afterSnap, state) {
    const evaluation = evaluateStep(step, beforeSnap, afterSnap, state);

    // Update stats
    this._stats.stepsEvaluated++;
    if (evaluation.success) this._stats.stepSuccesses++;
    else this._stats.stepFailures++;
    this._scoreHistory.push(evaluation.score);
    if (this._scoreHistory.length > 50) this._scoreHistory.shift();
    this._stats.avgStepScore = this._scoreHistory.reduce((a, b) => a + b, 0) / this._scoreHistory.length;

    // Generate and store reflection
    if (!evaluation.success || evaluation.score < 0.8) {
      const reflection = generateReflection(step, evaluation, state);
      if (reflection && this._memoryStore) {
        const timeSec = state.metrics?.timeSec ?? 0;
        if (reflection.category === "construction_failure" || reflection.category === "terrain_knowledge") {
          this._memoryStore.addObservation(timeSec, reflection.text, reflection.category, reflection.importance);
        } else {
          this._memoryStore.addReflection(timeSec, reflection.text);
        }
        this._stats.reflectionsGenerated++;
      }
    }

    return evaluation;
  }

  /**
   * Evaluate an entire completed plan.
   * @param {object} plan — completed plan
   * @param {object} planStartSnap — snapshot at plan start
   * @param {object} planEndSnap — snapshot at plan end
   * @param {object} state — current game state
   * @returns {object} plan evaluation
   */
  evaluatePlan(plan, planStartSnap, planEndSnap, state) {
    const result = evaluatePlan(plan, planStartSnap, planEndSnap, state);

    this._stats.plansEvaluated++;
    if (result.success) this._stats.planSuccesses++;
    this._stats.avgPlanScore = this._stats.plansEvaluated > 0
      ? (this._stats.avgPlanScore * (this._stats.plansEvaluated - 1) + result.overallScore) / this._stats.plansEvaluated
      : result.overallScore;

    // Plan-level reflection for failures
    if (!result.success && this._memoryStore) {
      const timeSec = state.metrics?.timeSec ?? 0;
      const text = `Plan "${result.goal}" ${result.success ? "succeeded" : "failed"}: ${result.completed}/${result.total} steps completed in ${result.elapsedSec}s (budget ${result.horizonSec}s). Score: ${result.overallScore.toFixed(2)}.`;
      this._memoryStore.addReflection(timeSec, text);
      this._stats.reflectionsGenerated++;
    }

    return result;
  }

  /**
   * Batch-evaluate all steps in a completed plan and generate reflections.
   * Limited to MAX_REFLECTIONS_PER_PLAN to avoid flooding memory.
   * @param {object} plan — completed plan with step evaluations
   * @param {Array<object>} stepEvaluations — evaluations for each step
   * @param {object} state — current game state
   * @returns {Array<{text: string, category: string, importance: number}>}
   */
  generatePlanReflections(plan, stepEvaluations, state) {
    const reflections = [];

    // Sort evaluations by score ascending (worst first)
    const sorted = [...stepEvaluations].sort((a, b) => a.score - b.score);

    for (const evaluation of sorted) {
      if (reflections.length >= MAX_REFLECTIONS_PER_PLAN) break;

      const step = plan.steps.find(s => s.id === evaluation.stepId);
      if (!step) continue;

      const reflection = generateReflection(step, evaluation, state);
      if (reflection && reflection.importance >= MIN_REFLECTION_IMPORTANCE) {
        reflections.push(reflection);
      }
    }

    // Store all reflections
    if (this._memoryStore) {
      const timeSec = state.metrics?.timeSec ?? 0;
      for (const r of reflections) {
        if (r.category === "construction_failure" || r.category === "terrain_knowledge") {
          this._memoryStore.addObservation(timeSec, r.text, r.category, r.importance);
        } else {
          this._memoryStore.addReflection(timeSec, r.text);
        }
        this._stats.reflectionsGenerated++;
      }
    }

    return reflections;
  }

  /**
   * Analyze systemic bottlenecks across all step evaluations in a plan.
   * Detects colony-wide patterns like coverage gaps, terrain issues, chain gaps.
   * @param {Array<object>} stepEvaluations — per-step evaluations
   * @param {object} state — current game state
   * @returns {object} systemic analysis
   */
  analyzeSystemicBottlenecks(stepEvaluations, state) {
    return analyzeSystemicBottlenecks(stepEvaluations, state);
  }

  /**
   * Detect recurring failure patterns across plan history.
   * @param {Array<object>} planHistory — from agentState.planHistory
   * @returns {Array<{pattern: string, count: number, remedy: string}>}
   */
  detectRecurringPatterns(planHistory) {
    return detectRecurringPatterns(planHistory);
  }

  /**
   * Format a comprehensive evaluation summary for LLM consumption.
   * @param {object} planEval — from evaluatePlan()
   * @param {Array<object>} stepEvaluations — per-step evaluations
   * @param {object} state — current game state
   * @param {Array<object>} [planHistory] — recent plan history
   * @returns {string}
   */
  formatEvaluationForLLM(planEval, stepEvaluations, state, planHistory = []) {
    return formatEvaluationForLLM(planEval, stepEvaluations, state, planHistory);
  }
}

// ── P4: Systemic Bottleneck Analysis ───────────────────────────────

/**
 * Analyze systemic bottlenecks across step evaluations.
 * Groups diagnoses by type and detects colony-wide patterns.
 * @param {Array<object>} stepEvaluations
 * @param {object} state
 * @returns {object} { coverageIssues, terrainIssues, workerIssues, chainGaps, summary }
 */
export function analyzeSystemicBottlenecks(stepEvaluations, state) {
  const diagCounts = {};
  const diagDetails = {};

  // Aggregate all diagnoses across steps
  for (const ev of stepEvaluations) {
    for (const cause of (ev.diagnosis ?? [])) {
      diagCounts[cause.type] = (diagCounts[cause.type] ?? 0) + 1;
      if (!diagDetails[cause.type]) diagDetails[cause.type] = [];
      diagDetails[cause.type].push({ action: ev.action, detail: cause.detail, severity: cause.severity });
    }
  }

  const totalSteps = stepEvaluations.length;
  const failedSteps = stepEvaluations.filter(e => !e.success).length;

  // Coverage issues
  const uncoveredCount = diagCounts.uncovered ?? 0;
  const coverageIssues = uncoveredCount > 0 ? {
    count: uncoveredCount,
    ratio: totalSteps > 0 ? uncoveredCount / totalSteps : 0,
    remedy: uncoveredCount >= 2
      ? "CRITICAL: Multiple buildings outside warehouse coverage. Build a new warehouse closer to expansion area before placing more production buildings."
      : "Place production buildings within 12 tiles of a warehouse.",
  } : null;

  // Terrain issues
  const terrainCount = (diagCounts.poor_terrain ?? 0) + (diagCounts.high_elevation ?? 0);
  const terrainIssues = terrainCount > 0 ? {
    count: terrainCount,
    types: diagDetails.poor_terrain?.map(d => d.detail) ?? [],
    remedy: "Prioritize high-moisture, low-elevation tiles for farms/herb_gardens. Use PlacementSpecialist terrain scoring.",
  } : null;

  // Worker coverage
  const workerCount = diagCounts.no_workers ?? 0;
  const workerIssues = workerCount > 0 ? {
    count: workerCount,
    remedy: workerCount >= 2
      ? "CRITICAL: Multiple unserviced buildings. Colony may be too spread out — consolidate or wait for more workers."
      : "Build closer to worker activity zones.",
  } : null;

  // Resource chain gap analysis
  const chainGaps = _analyzeChainGaps(stepEvaluations, state);

  // Overall summary
  const issues = [];
  if (coverageIssues) issues.push(`${uncoveredCount} uncovered builds`);
  if (terrainIssues) issues.push(`${terrainCount} terrain issues`);
  if (workerIssues) issues.push(`${workerCount} unserviced builds`);
  if (chainGaps.length > 0) issues.push(`${chainGaps.length} chain gap(s)`);

  return {
    coverageIssues,
    terrainIssues,
    workerIssues,
    chainGaps,
    failureRate: totalSteps > 0 ? failedSteps / totalSteps : 0,
    summary: issues.length > 0
      ? `Systemic issues: ${issues.join(", ")}`
      : "No systemic issues detected",
  };
}

/**
 * Analyze resource chain gaps based on what was built vs what's missing.
 * @param {Array<object>} stepEvaluations
 * @param {object} state
 * @returns {Array<{chain: string, gap: string, remedy: string}>}
 */
function _analyzeChainGaps(stepEvaluations, state) {
  const gaps = [];

  let chains;
  try {
    chains = analyzeResourceChains(state);
  } catch {
    return gaps;
  }

  // Count what was just built
  const builtTypes = {};
  for (const ev of stepEvaluations) {
    if (ev.buildSuccess) {
      builtTypes[ev.action] = (builtTypes[ev.action] ?? 0) + 1;
    }
  }

  for (const chain of chains) {
    if (!chain.bottleneck) continue;

    // Check if we built upstream without addressing the bottleneck
    const stages = chain.stages ?? [];
    const bottleneckStage = stages.find(s => s.status === "missing" || s.status === "ready");
    if (!bottleneckStage) continue;

    // If we built the upstream building but NOT the bottleneck building, flag it
    const upstreamBuilt = stages.some(s => s.status === "active" && builtTypes[s.building]);
    const bottleneckBuilt = builtTypes[bottleneckStage.building];

    if (upstreamBuilt && !bottleneckBuilt && bottleneckStage.status === "ready") {
      gaps.push({
        chain: chain.name,
        gap: `Built more ${stages[0].building}s but ${bottleneckStage.building} is ready and unbuilt`,
        remedy: chain.nextAction ?? `Build ${bottleneckStage.building}`,
      });
    }
  }

  return gaps;
}

// ── P4: Recurring Pattern Detection ────────────────────────────────

/**
 * Detect recurring failure patterns across plan history.
 * Groups consecutive failures by reason and suggests remedies.
 * @param {Array<object>} planHistory — from agentState.planHistory
 * @returns {Array<{pattern: string, count: number, remedy: string}>}
 */
export function detectRecurringPatterns(planHistory) {
  if (!planHistory || planHistory.length < 2) return [];

  const patterns = [];
  const failReasons = {};
  const goalFailures = {};
  let consecutiveFailures = 0;

  for (const entry of planHistory) {
    if (!entry.success) {
      consecutiveFailures++;
      const reason = entry.failReason ?? "unknown";
      failReasons[reason] = (failReasons[reason] ?? 0) + 1;

      // Track goal keywords
      const goalWords = (entry.goal ?? "").toLowerCase().split(/\s+/);
      for (const word of goalWords) {
        if (word.length > 3) {
          goalFailures[word] = (goalFailures[word] ?? 0) + 1;
        }
      }
    } else {
      consecutiveFailures = 0;
    }
  }

  // Consecutive failure streak
  if (consecutiveFailures >= 3) {
    patterns.push({
      pattern: `${consecutiveFailures} consecutive plan failures`,
      count: consecutiveFailures,
      remedy: "Consider simplifying plans (fewer steps) or switching to a different goal. The colony may need to consolidate before expanding.",
    });
  }

  // Repeated failure reasons
  for (const [reason, count] of Object.entries(failReasons)) {
    if (count >= 2) {
      const remedy = _remedyForFailReason(reason);
      patterns.push({ pattern: `Repeated "${reason}" failures`, count, remedy });
    }
  }

  // Repeated goal keyword failures (same type of plan keeps failing)
  for (const [word, count] of Object.entries(goalFailures)) {
    if (count >= 3) {
      patterns.push({
        pattern: `Plans involving "${word}" fail repeatedly`,
        count,
        remedy: `Deprioritize "${word}"-related plans. The colony may lack prerequisites or terrain for this goal.`,
      });
    }
  }

  return patterns;
}

function _remedyForFailReason(reason) {
  switch (reason) {
    case "blocked":
      return "Plans are getting blocked — likely resource shortage or no buildable tiles. Ensure resource reserves before planning builds.";
    case "timeout":
      return "Plans are timing out — reduce plan scope (fewer steps) or increase horizon.";
    case "no_tiles":
      return "No buildable tiles available — expand warehouse coverage or clear ruins for space.";
    default:
      return "Investigate root cause. Consider switching strategy phase or simplifying plan goals.";
  }
}

// ── P4: LLM-Formatted Evaluation Summary ───────────────────────────

/**
 * Format a comprehensive evaluation summary for LLM consumption.
 * Provides structured feedback the planner can use to improve future plans.
 * @param {object} planEval — from evaluatePlan()
 * @param {Array<object>} stepEvaluations — per-step evaluations
 * @param {object} state — current game state
 * @param {Array<object>} [planHistory] — recent plan history
 * @returns {string}
 */
export function formatEvaluationForLLM(planEval, stepEvaluations, state, planHistory = []) {
  const lines = [];

  // ── Plan outcome
  lines.push("## Last Plan Evaluation");
  lines.push(`Goal: ${planEval.goal}`);
  lines.push(`Result: ${planEval.success ? "✅ SUCCESS" : "❌ FAILED"} (${planEval.completed}/${planEval.total} steps, score ${planEval.overallScore.toFixed(2)})`);
  lines.push(`Time: ${planEval.elapsedSec}s / ${planEval.horizonSec}s budget (${(planEval.timeEfficiency * 100).toFixed(0)}% efficient)`);

  // Resource impact
  const changes = Object.entries(planEval.resourceChanges ?? {}).filter(([, v]) => Math.abs(v) > 0.5);
  if (changes.length > 0) {
    lines.push(`Resources: ${changes.map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${Math.round(v)}`).join(", ")}`);
  }

  // ── Step-level issues (top 3 worst)
  const worstSteps = [...stepEvaluations]
    .filter(e => !e.success || e.score < 0.8)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  if (worstSteps.length > 0) {
    lines.push("");
    lines.push("## Issues Found");
    for (const ev of worstSteps) {
      const topCause = (ev.diagnosis ?? []).sort((a, b) => b.severity - a.severity)[0];
      if (topCause) {
        lines.push(`- ${ev.action}: ${topCause.detail} [severity ${topCause.severity}/5]`);
      } else if (!ev.success) {
        lines.push(`- ${ev.action}: build failed (score ${ev.score.toFixed(2)})`);
      }
    }
  }

  // ── Systemic analysis
  const systemic = analyzeSystemicBottlenecks(stepEvaluations, state);
  if (systemic.coverageIssues || systemic.terrainIssues || systemic.workerIssues || systemic.chainGaps.length > 0) {
    lines.push("");
    lines.push("## Systemic Issues");
    if (systemic.coverageIssues) {
      lines.push(`⚠ COVERAGE: ${systemic.coverageIssues.count} builds outside warehouse range → ${systemic.coverageIssues.remedy}`);
    }
    if (systemic.workerIssues) {
      lines.push(`⚠ WORKERS: ${systemic.workerIssues.count} unserviced builds → ${systemic.workerIssues.remedy}`);
    }
    if (systemic.terrainIssues) {
      lines.push(`⚠ TERRAIN: ${systemic.terrainIssues.count} poor placement(s) → ${systemic.terrainIssues.remedy}`);
    }
    for (const gap of systemic.chainGaps) {
      lines.push(`⚠ CHAIN (${gap.chain}): ${gap.gap} → ${gap.remedy}`);
    }
  }

  // ── Recurring patterns
  const patterns = detectRecurringPatterns(planHistory);
  if (patterns.length > 0) {
    lines.push("");
    lines.push("## Recurring Patterns (IMPORTANT — break the loop!)");
    for (const p of patterns.slice(0, 3)) {
      lines.push(`🔄 ${p.pattern} (×${p.count}) → ${p.remedy}`);
    }
  }

  return lines.join("\n");
}
