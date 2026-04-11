/**
 * PlanEvaluator — Reflexion-based outcome assessment for colony plans.
 *
 * Responsibilities:
 * 1. Compare actual step outcomes to predicted effects
 * 2. Diagnose failures with structured cause analysis
 * 3. Generate natural language reflections for MemoryStore
 * 4. Evaluate overall plan success and compute quality scores
 * 5. Track evaluation statistics across planning cycles
 */

import { TILE } from "../../../config/constants.js";
import { listTilesByType, toIndex, inBounds } from "../../../world/grid/Grid.js";

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
      return `Failed to place ${actionType} — no valid tile found. Area may be congested or terrain unsuitable. Consider expanding to new territory first.`;

    case "placement_rejected":
      return `${_capitalize(actionType)} at ${coords} was rejected by the build system. The chosen location may conflict with existing buildings or terrain.`;

    case "uncovered":
      return `${_capitalize(actionType)} at ${coords} is outside warehouse coverage (${cause.detail}). Future ${actionType} builds must be within ${WAREHOUSE_COVERAGE_DIST} tiles of a warehouse.`;

    case "no_workers":
      return `${_capitalize(actionType)} at ${coords} has no nearby workers and may be unserviced. Place production buildings near worker activity zones.`;

    case "poor_terrain":
      return `${_capitalize(actionType)} at ${coords} is on poor terrain (${cause.detail}). Prioritize high-moisture tiles for farms and herb gardens.`;

    case "high_elevation":
      return `${_capitalize(actionType)} at ${coords} is at high elevation (${cause.detail}). Prefer lower ground for production buildings to reduce costs.`;

    case "adjacency_conflict":
      return `${_capitalize(actionType)} at ${coords} has an adjacency conflict (${cause.detail}). Separate quarries from farms to avoid fertility penalties.`;

    case "prediction_mismatch":
      return `${_capitalize(actionType)} at ${coords} ${cause.detail}. Adjust future predictions for ${actionType} in similar conditions.`;

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
}
