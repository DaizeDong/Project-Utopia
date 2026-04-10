/**
 * SkillLibrary — Compound build patterns (Voyager-inspired)
 *
 * Skills are reusable multi-step build templates that the Planner can invoke
 * as atomic actions. Each skill defines preconditions, placement offsets,
 * expected effects, and terrain preferences.
 */

import { BUILD_COST } from "../../../config/balance.js";
import { TILE } from "../../../config/constants.js";
import { getTile, inBounds, toIndex } from "../../../world/grid/Grid.js";

// ── Skill Definitions ────────────────────────────────────────────────

export const SKILL_LIBRARY = Object.freeze({
  logistics_hub: Object.freeze({
    name: "Logistics Hub",
    description: "Warehouse + road star + 2 farms — creates a new logistics anchor with food production",
    preconditions: Object.freeze({ wood: 22, availableGrass: 12 }),
    steps: Object.freeze([
      Object.freeze({ type: "warehouse", offset: [0, 0] }),
      Object.freeze({ type: "road", offset: [1, 0] }),
      Object.freeze({ type: "road", offset: [-1, 0] }),
      Object.freeze({ type: "road", offset: [0, 1] }),
      Object.freeze({ type: "road", offset: [0, -1] }),
      Object.freeze({ type: "farm", offset: [2, 0] }),
      Object.freeze({ type: "farm", offset: [-2, 0] }),
    ]),
    expectedEffect: Object.freeze({ coverage: "+1 cluster", food_rate: "+1.0/s" }),
    terrain_preference: Object.freeze({ minMoisture: 0.4 }),
  }),

  processing_cluster: Object.freeze({
    name: "Processing Cluster",
    description: "Quarry + Smithy near warehouse — unlocks tools for colony-wide production boost",
    preconditions: Object.freeze({ wood: 18, stone: 5 }),
    steps: Object.freeze([
      Object.freeze({ type: "quarry", offset: [0, 0] }),
      Object.freeze({ type: "road", offset: [1, 0] }),
      Object.freeze({ type: "smithy", offset: [2, 0] }),
    ]),
    expectedEffect: Object.freeze({ tools_rate: "+0.2/s", production_multiplier: "+15%" }),
    terrain_preference: Object.freeze({ maxElevation: 0.6 }),
  }),

  defense_line: Object.freeze({
    name: "Defense Line",
    description: "Wall chain along elevation ridge — maximizes wall defense bonus",
    preconditions: Object.freeze({ wood: 10 }),
    steps: Object.freeze([
      Object.freeze({ type: "wall", offset: [0, 0] }),
      Object.freeze({ type: "wall", offset: [1, 0] }),
      Object.freeze({ type: "wall", offset: [2, 0] }),
      Object.freeze({ type: "wall", offset: [3, 0] }),
      Object.freeze({ type: "wall", offset: [4, 0] }),
    ]),
    expectedEffect: Object.freeze({ threat: "-5", wall_coverage: "+0.05" }),
    terrain_preference: Object.freeze({ minElevation: 0.6 }),
  }),

  food_district: Object.freeze({
    name: "Food District",
    description: "Dense farm cluster near warehouse with kitchen — maximizes food throughput",
    preconditions: Object.freeze({ wood: 25, stone: 3, farms: 6 }),
    steps: Object.freeze([
      Object.freeze({ type: "farm", offset: [0, 1] }),
      Object.freeze({ type: "farm", offset: [1, 0] }),
      Object.freeze({ type: "farm", offset: [0, -1] }),
      Object.freeze({ type: "farm", offset: [-1, 0] }),
      Object.freeze({ type: "kitchen", offset: [0, 0] }),
    ]),
    expectedEffect: Object.freeze({ food_rate: "+2.0/s", meals_rate: "+0.3/s" }),
    terrain_preference: Object.freeze({ minMoisture: 0.5 }),
  }),

  expansion_outpost: Object.freeze({
    name: "Expansion Outpost",
    description: "Warehouse + road + farm + lumber in new territory — seeds colony expansion",
    preconditions: Object.freeze({ wood: 22 }),
    steps: Object.freeze([
      Object.freeze({ type: "road", offset: [-1, 0] }),
      Object.freeze({ type: "warehouse", offset: [0, 0] }),
      Object.freeze({ type: "road", offset: [1, 0] }),
      Object.freeze({ type: "farm", offset: [2, 0] }),
      Object.freeze({ type: "lumber", offset: [0, 2] }),
    ]),
    expectedEffect: Object.freeze({ coverage: "+1 frontier", food_rate: "+0.4/s", wood_rate: "+0.5/s" }),
    terrain_preference: Object.freeze({ minMoisture: 0.3 }),
  }),

  bridge_link: Object.freeze({
    name: "Bridge Link",
    description: "Bridge chain across water with road approaches — connects islands",
    preconditions: Object.freeze({ wood: 12, stone: 4 }),
    steps: Object.freeze([
      Object.freeze({ type: "road", offset: [-1, 0] }),
      Object.freeze({ type: "bridge", offset: [0, 0] }),
      Object.freeze({ type: "bridge", offset: [1, 0] }),
      Object.freeze({ type: "road", offset: [2, 0] }),
    ]),
    expectedEffect: Object.freeze({ connectivity: "+1 route" }),
    terrain_preference: Object.freeze({}),
  }),
});

// ── Skill Queries ────────────────────────────────────────────────────

/**
 * Compute the total resource cost for a skill by summing BUILD_COST of each step.
 * @param {string} skillId
 * @returns {Record<string, number>}
 */
export function getSkillTotalCost(skillId) {
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) return {};
  const total = {};
  for (const step of skill.steps) {
    const cost = BUILD_COST[step.type];
    if (!cost) continue;
    for (const [res, amount] of Object.entries(cost)) {
      total[res] = (total[res] ?? 0) + amount;
    }
  }
  return total;
}

/**
 * Check whether a skill's preconditions are met given current state.
 * Preconditions can include resource amounts and building counts.
 * @param {string} skillId
 * @param {object} resources — { food, wood, stone, herbs, ... }
 * @param {object} buildings — { farms, warehouses, ... }
 * @returns {{ met: boolean, missing: string[] }}
 */
export function checkSkillPreconditions(skillId, resources, buildings) {
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) return { met: false, missing: ["unknown skill"] };

  const missing = [];
  const pre = skill.preconditions;

  // Resource checks
  for (const res of ["wood", "stone", "herbs", "food"]) {
    if (pre[res] != null && (resources[res] ?? 0) < pre[res]) {
      missing.push(`${res}: need ${pre[res]}, have ${resources[res] ?? 0}`);
    }
  }

  // Building count checks
  if (pre.farms != null && (buildings.farms ?? 0) < pre.farms) {
    missing.push(`farms: need ${pre.farms}, have ${buildings.farms ?? 0}`);
  }

  // availableGrass is checked at placement time, not here
  return { met: missing.length === 0, missing };
}

/**
 * Expand a skill into concrete build steps anchored at a given tile.
 * @param {string} skillId
 * @param {{ ix: number, iz: number }} anchor — center tile
 * @returns {Array<{ type: string, ix: number, iz: number }>} — absolute tile positions
 */
export function expandSkillSteps(skillId, anchor) {
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) return [];
  return skill.steps.map(step => ({
    type: step.type,
    ix: anchor.ix + step.offset[0],
    iz: anchor.iz + step.offset[1],
  }));
}

/**
 * Check how many of a skill's steps can actually be placed at an anchor.
 * Returns a feasibility ratio (0-1) and the list of feasible/infeasible steps.
 * @param {string} skillId
 * @param {{ ix: number, iz: number }} anchor
 * @param {object} grid
 * @param {object} buildSystem
 * @param {object} state
 * @returns {{ ratio: number, feasible: number, total: number, steps: Array }}
 */
export function assessSkillFeasibility(skillId, anchor, grid, buildSystem, state) {
  const expanded = expandSkillSteps(skillId, anchor);
  if (expanded.length === 0) return { ratio: 0, feasible: 0, total: 0, steps: [] };

  let feasibleCount = 0;
  const steps = expanded.map(step => {
    if (!inBounds(step.ix, step.iz, grid)) {
      return { ...step, feasible: false, reason: "out_of_bounds" };
    }
    const preview = buildSystem.previewToolAt(state, step.type, step.ix, step.iz);
    if (preview.ok) {
      feasibleCount++;
      return { ...step, feasible: true, reason: null };
    }
    return { ...step, feasible: false, reason: preview.reason ?? "blocked" };
  });

  return {
    ratio: feasibleCount / expanded.length,
    feasible: feasibleCount,
    total: expanded.length,
    steps,
  };
}

/**
 * Score a candidate anchor tile for a skill based on terrain preferences.
 * Higher score = better fit. Returns 0-1.
 * @param {string} skillId
 * @param {{ ix: number, iz: number }} anchor
 * @param {object} grid
 * @returns {number}
 */
export function scoreSkillTerrain(skillId, anchor, grid) {
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) return 0;

  const pref = skill.terrain_preference;
  if (!pref || Object.keys(pref).length === 0) return 1; // no preference = always good

  // Sample average terrain across all step positions (not just anchor)
  let totalElev = 0;
  let totalMoist = 0;
  let count = 0;
  for (const step of skill.steps) {
    const ix = anchor.ix + step.offset[0];
    const iz = anchor.iz + step.offset[1];
    if (ix >= 0 && iz >= 0 && ix < grid.width && iz < grid.height) {
      const idx = toIndex(ix, iz, grid.width);
      totalElev += grid.elevation?.[idx] ?? 0.5;
      totalMoist += grid.moisture?.[idx] ?? 0.5;
      count++;
    }
  }
  if (count === 0) return 0.1;

  const elevation = totalElev / count;
  const moisture = totalMoist / count;

  let score = 1;

  if (pref.minMoisture != null) {
    if (moisture < pref.minMoisture) {
      // Soft penalty: score degrades smoothly but never below 0.1
      score *= 0.1 + 0.9 * (moisture / pref.minMoisture);
    }
  }
  if (pref.maxElevation != null) {
    if (elevation > pref.maxElevation) {
      score *= 0.1 + 0.9 * Math.max(0, 1 - (elevation - pref.maxElevation) / 0.4);
    }
  }
  if (pref.minElevation != null) {
    if (elevation < pref.minElevation) {
      score *= 0.1 + 0.9 * (elevation / pref.minElevation);
    }
  }

  return Math.max(0.05, Math.min(1, score));
}

/**
 * Select the best skill for a given strategic goal.
 * @param {string} goal — one of: "expand_coverage", "boost_food", "boost_processing", "fortify", "connect_islands"
 * @param {object} resources
 * @param {object} buildings
 * @returns {{ skillId: string, skill: object } | null}
 */
export function selectSkillForGoal(goal, resources, buildings) {
  const goalSkillMap = {
    expand_coverage: ["logistics_hub", "expansion_outpost"],
    boost_food: ["food_district", "logistics_hub"],
    boost_processing: ["processing_cluster"],
    fortify: ["defense_line"],
    connect_islands: ["bridge_link"],
  };

  const candidates = goalSkillMap[goal];
  if (!candidates) return null;

  for (const skillId of candidates) {
    const { met } = checkSkillPreconditions(skillId, resources, buildings);
    if (met) {
      return { skillId, skill: SKILL_LIBRARY[skillId] };
    }
  }
  return null;
}

/**
 * List all skills and their current affordability status.
 * @param {object} resources
 * @param {object} buildings
 * @returns {Array<{ skillId: string, name: string, affordable: boolean, missing: string[] }>}
 */
export function listSkillStatus(resources, buildings) {
  return Object.keys(SKILL_LIBRARY).map(skillId => {
    const skill = SKILL_LIBRARY[skillId];
    const { met, missing } = checkSkillPreconditions(skillId, resources, buildings);
    return { skillId, name: skill.name, affordable: met, missing };
  });
}
