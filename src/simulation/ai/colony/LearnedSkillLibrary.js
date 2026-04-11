/**
 * LearnedSkillLibrary — Voyager-inspired skill learning from successful plans.
 *
 * Extracts reusable compound build patterns from completed plans that scored
 * above a quality threshold. Learned skills are stored alongside the frozen
 * SKILL_LIBRARY and can be referenced by future planner prompts.
 *
 * Key mechanisms:
 * - Extracts relative offsets from plan anchor (first grounded tile)
 * - Infers terrain preferences from actual placement positions
 * - Deduplicates similar skills by action-type signature
 * - Caps learned skill count per session to prevent bloat
 * - Tracks skill usage and success for confidence scoring
 *
 * Reference: Voyager [4] — open-ended skill library with iterative refinement
 */

import { SKILL_LIBRARY, getSkillTotalCost, checkSkillPreconditions } from "./SkillLibrary.js";
import { BUILD_COST } from "../../../config/balance.js";
import { toIndex } from "../../../world/grid/Grid.js";

// ── Constants ────────────────────────────────────────────────────────

/** Minimum plan overall score to consider for skill extraction */
const MIN_PLAN_SCORE = 0.7;

/** Minimum number of completed build steps in a plan for skill extraction */
const MIN_COMPLETED_STEPS = 3;

/** Maximum learned skills stored in a session */
const MAX_LEARNED_SKILLS = 10;

/** Similarity threshold for deduplication (0-1, Jaccard on action types) */
const DEDUP_SIMILARITY_THRESHOLD = 0.8;

/** Minimum uses before a learned skill becomes "trusted" */
const TRUSTED_USE_COUNT = 2;

// ── Skill Extraction ────────────────────────────────────────────────

/**
 * Extract a skill candidate from a completed, evaluated plan.
 * Returns null if the plan doesn't meet quality criteria.
 *
 * @param {object} plan — completed plan with grounded steps
 * @param {object} planEvaluation — from PlanEvaluator.evaluatePlan()
 * @param {Array<object>} stepEvaluations — per-step evaluations
 * @param {object} grid — game grid (for terrain inference)
 * @returns {object|null} — skill candidate or null
 */
export function extractSkillFromPlan(plan, planEvaluation, stepEvaluations, grid) {
  // Quality gate
  if (!planEvaluation.success || planEvaluation.overallScore < MIN_PLAN_SCORE) return null;
  if (planEvaluation.completed < MIN_COMPLETED_STEPS) return null;

  // Collect completed steps with grounded tiles (skip skills — only learn atomic builds)
  const completedSteps = plan.steps.filter(
    s => s.status === "completed" && s.groundedTile && !s.action.skill
  );
  if (completedSteps.length < MIN_COMPLETED_STEPS) return null;

  // Compute anchor = first completed step's tile
  const anchor = completedSteps[0].groundedTile;

  // Compute relative offsets
  const steps = completedSteps.map(s => ({
    type: s.action.type,
    offset: [s.groundedTile.ix - anchor.ix, s.groundedTile.iz - anchor.iz],
  }));

  // Infer terrain preference from actual placement positions
  const terrainPref = inferTerrainPreference(completedSteps, grid);

  // Compute total cost
  const totalCost = {};
  for (const s of steps) {
    const cost = BUILD_COST[s.type];
    if (!cost) continue;
    for (const [res, amount] of Object.entries(cost)) {
      totalCost[res] = (totalCost[res] ?? 0) + amount;
    }
  }

  // Compute expected effect from step evaluations
  const expectedEffect = computeExpectedEffect(completedSteps, stepEvaluations);

  // Generate descriptive name from action composition
  const actionCounts = {};
  for (const s of steps) {
    actionCounts[s.type] = (actionCounts[s.type] ?? 0) + 1;
  }
  const name = generateSkillName(actionCounts, plan.goal);

  return {
    name,
    description: `${plan.goal} (learned from successful plan, score ${planEvaluation.overallScore.toFixed(2)})`,
    preconditions: Object.freeze({ ...totalCost }),
    steps: steps.map(s => Object.freeze({ type: s.type, offset: s.offset })),
    expectedEffect: Object.freeze(expectedEffect),
    terrain_preference: Object.freeze(terrainPref),
    // Metadata (not in frozen SKILL_LIBRARY, but used by LearnedSkillLibrary)
    _meta: {
      learnedAt: Date.now(),
      sourceGoal: plan.goal,
      sourcePlanScore: planEvaluation.overallScore,
      uses: 0,
      successes: 0,
      actionSignature: _actionSignature(steps),
    },
  };
}

/**
 * Infer terrain preferences from actual placement positions.
 * @param {Array<object>} steps — completed steps with groundedTile
 * @param {object} grid
 * @returns {object} terrain preference
 */
export function inferTerrainPreference(steps, grid) {
  if (!grid?.moisture || !grid?.elevation || steps.length === 0) return {};

  let totalMoisture = 0;
  let totalElevation = 0;
  let count = 0;

  for (const step of steps) {
    const tile = step.groundedTile;
    if (!tile) continue;
    const idx = toIndex(tile.ix, tile.iz, grid.width);
    totalMoisture += grid.moisture[idx] ?? 0.5;
    totalElevation += grid.elevation[idx] ?? 0.5;
    count++;
  }

  if (count === 0) return {};

  const avgMoisture = totalMoisture / count;
  const avgElevation = totalElevation / count;

  const pref = {};

  // If avg moisture > 0.4, the skill prefers moist areas
  if (avgMoisture > 0.45) {
    pref.minMoisture = Math.round((avgMoisture - 0.15) * 100) / 100;
  }

  // If avg elevation is notably high or low, record preference
  if (avgElevation > 0.55) {
    pref.minElevation = Math.round((avgElevation - 0.15) * 100) / 100;
  } else if (avgElevation < 0.4) {
    pref.maxElevation = Math.round((avgElevation + 0.2) * 100) / 100;
  }

  return pref;
}

/**
 * Compute expected effect from step evaluations.
 * Aggregates actual resource deltas from successful steps.
 */
export function computeExpectedEffect(completedSteps, stepEvaluations) {
  const effect = {};

  // Count building types for rough effect estimation
  const typeCounts = {};
  for (const s of completedSteps) {
    typeCounts[s.action.type] = (typeCounts[s.action.type] ?? 0) + 1;
  }

  // Estimate effects from building types
  if (typeCounts.farm) effect.food_rate = `+${(typeCounts.farm * 0.4).toFixed(1)}/s`;
  if (typeCounts.lumber) effect.wood_rate = `+${(typeCounts.lumber * 0.5).toFixed(1)}/s`;
  if (typeCounts.quarry) effect.stone_rate = `+${(typeCounts.quarry * 0.3).toFixed(1)}/s`;
  if (typeCounts.herb_garden) effect.herbs_rate = `+${(typeCounts.herb_garden * 0.2).toFixed(1)}/s`;
  if (typeCounts.kitchen) effect.meals_rate = `+${(typeCounts.kitchen * 0.3).toFixed(1)}/s`;
  if (typeCounts.smithy) effect.tools_rate = `+${(typeCounts.smithy * 0.2).toFixed(1)}/s`;
  if (typeCounts.clinic) effect.medicine_rate = `+${(typeCounts.clinic * 0.15).toFixed(1)}/s`;
  if (typeCounts.wall) effect.threat_reduction = `-${typeCounts.wall * 2}`;
  if (typeCounts.warehouse) effect.coverage = `+${typeCounts.warehouse} anchor`;
  if (typeCounts.road) effect.logistics = "improved";

  return effect;
}

/**
 * Generate a human-readable skill name from action composition.
 */
export function generateSkillName(actionCounts, goal) {
  const parts = [];

  // Dominant action types
  const sorted = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sorted.slice(0, 3)) {
    if (count > 1) {
      parts.push(`${count}x${type}`);
    } else {
      parts.push(type);
    }
  }

  if (parts.length === 0) return "learned_pattern";

  const base = parts.join("_");
  return `learned_${base}`;
}

// ── Action Signature (for deduplication) ────────────────────────────

function _actionSignature(steps) {
  // Sorted list of action types — used for Jaccard similarity
  const types = steps.map(s => s.type).sort();
  return types.join(",");
}

/**
 * Compute Jaccard similarity between two action signatures.
 * @returns {number} 0-1
 */
export function signatureSimilarity(sigA, sigB) {
  const setA = new Set(sigA.split(","));
  const setB = new Set(sigB.split(","));
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

// ── LearnedSkillLibrary Class ───────────────────────────────────────

export class LearnedSkillLibrary {
  constructor() {
    /** @type {Map<string, object>} id → skill */
    this._skills = new Map();
    this._nextId = 1;
    this._stats = {
      skillsExtracted: 0,
      skillsDeduplicated: 0,
      skillsEvicted: 0,
    };
  }

  get stats() { return { ...this._stats }; }
  get size() { return this._skills.size; }

  /**
   * Attempt to learn a skill from a completed plan.
   * Returns the skill ID if learned, null if rejected.
   * @param {object} plan
   * @param {object} planEvaluation
   * @param {Array<object>} stepEvaluations
   * @param {object} grid
   * @returns {string|null}
   */
  maybeLearnSkill(plan, planEvaluation, stepEvaluations, grid) {
    const candidate = extractSkillFromPlan(plan, planEvaluation, stepEvaluations, grid);
    if (!candidate) return null;

    // Check for duplicates (similar action signature)
    const candidateSig = candidate._meta.actionSignature;
    for (const [id, existing] of this._skills) {
      const sim = signatureSimilarity(candidateSig, existing._meta.actionSignature);
      if (sim >= DEDUP_SIMILARITY_THRESHOLD) {
        // Duplicate found — keep the higher-scoring one
        if (candidate._meta.sourcePlanScore > existing._meta.sourcePlanScore) {
          this._skills.delete(id);
          this._stats.skillsDeduplicated++;
          break; // replace with candidate
        } else {
          this._stats.skillsDeduplicated++;
          return null; // existing is better, reject
        }
      }
    }

    // Evict weakest if at capacity
    if (this._skills.size >= MAX_LEARNED_SKILLS) {
      this._evictWeakest();
    }

    const skillId = `learned_${this._nextId++}`;
    this._skills.set(skillId, candidate);
    this._stats.skillsExtracted++;
    return skillId;
  }

  /**
   * Record a usage of a learned skill (for confidence tracking).
   * @param {string} skillId
   * @param {boolean} success
   */
  recordUsage(skillId, success) {
    const skill = this._skills.get(skillId);
    if (!skill) return;
    skill._meta.uses++;
    if (success) skill._meta.successes++;
  }

  /**
   * Get a learned skill by ID.
   * @param {string} skillId
   * @returns {object|null}
   */
  getSkill(skillId) {
    return this._skills.get(skillId) ?? null;
  }

  /**
   * List all learned skills with their status.
   * @param {object} resources
   * @returns {Array<{skillId, name, affordable, confidence, uses}>}
   */
  listLearnedSkills(resources) {
    const result = [];
    for (const [skillId, skill] of this._skills) {
      const totalCost = {};
      for (const step of skill.steps) {
        const cost = BUILD_COST[step.type];
        if (!cost) continue;
        for (const [res, amount] of Object.entries(cost)) {
          totalCost[res] = (totalCost[res] ?? 0) + amount;
        }
      }

      let affordable = true;
      for (const [res, needed] of Object.entries(totalCost)) {
        if ((resources[res] ?? 0) < needed) { affordable = false; break; }
      }

      const meta = skill._meta;
      const confidence = meta.uses >= TRUSTED_USE_COUNT
        ? (meta.successes / meta.uses)
        : 0.5; // uncertain until proven

      result.push({
        skillId,
        name: skill.name,
        description: skill.description,
        affordable,
        confidence,
        uses: meta.uses,
        steps: skill.steps.length,
      });
    }
    return result;
  }

  /**
   * Format learned skills for LLM prompt injection.
   * Only includes skills with confidence > 0.3.
   * @param {object} resources
   * @returns {string}
   */
  formatForPrompt(resources) {
    const skills = this.listLearnedSkills(resources);
    const viable = skills.filter(s => s.confidence > 0.3);
    if (viable.length === 0) return "";

    const lines = viable.map(s => {
      const status = s.affordable ? "✓" : "✗";
      return `- ${s.name} [${status}] (${s.steps} steps, confidence ${(s.confidence * 100).toFixed(0)}%): ${s.description}`;
    });

    return "## Learned Skills\n" + lines.join("\n");
  }

  /**
   * Get all skill IDs (including built-in SKILL_LIBRARY keys).
   * @returns {Set<string>}
   */
  allSkillIds() {
    const ids = new Set(Object.keys(SKILL_LIBRARY));
    for (const id of this._skills.keys()) ids.add(id);
    return ids;
  }

  /** Evict the lowest-confidence skill to make room. */
  _evictWeakest() {
    let weakestId = null;
    let weakestScore = Infinity;

    for (const [id, skill] of this._skills) {
      const meta = skill._meta;
      // Score = plan score × confidence, weighted by usage
      const confidence = meta.uses > 0 ? meta.successes / meta.uses : 0.5;
      const score = meta.sourcePlanScore * confidence * (1 + Math.log1p(meta.uses));
      if (score < weakestScore) {
        weakestScore = score;
        weakestId = id;
      }
    }

    if (weakestId) {
      this._skills.delete(weakestId);
      this._stats.skillsEvicted++;
    }
  }
}
