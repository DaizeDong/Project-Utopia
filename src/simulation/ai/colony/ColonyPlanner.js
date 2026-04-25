/**
 * ColonyPlanner — LLM-powered construction planner with algorithmic fallback.
 *
 * Responsibilities:
 * 1. Build structured prompts from observations + memory + skill library
 * 2. Call OpenAI-compatible LLM API for plan generation
 * 3. Validate and sanitize LLM responses into typed plan objects
 * 4. Generate algorithmic fallback plans when LLM is unavailable
 * 5. Manage planning cadence (trigger conditions, cooldowns)
 */

import {
  BALANCE,
  BUILD_COST,
  computeEscalatedBuildCost,
  pluralBuildingKey,
} from "../../../config/balance.js";
import { TILE, MOVE_DIRECTIONS_4 } from "../../../config/constants.js";
import { inBounds, toIndex, getTileState, listTilesByType } from "../../../world/grid/Grid.js";
import {
  SKILL_LIBRARY,
  listSkillStatus,
  getSkillTotalCost,
  suggestProspectFogFrontier,
  suggestRecycleAbandonedWorksite,
  suggestRelocateDepletedProducer,
} from "./SkillLibrary.js";
import { formatObservationForLLM } from "./ColonyPerceiver.js";

// ── v0.8.0 Phase 5 (patches 9-10) constants ──────────────────────────
// Depletion down-rank threshold + multiplier per spec 13.2 patch 9. The
// threshold reads from BALANCE so the planner and PlanEvaluator agree on what
// "depleted" means; local fallback covers older BALANCE snapshots.
const FALLBACK_DEPLETION_POOL_THRESHOLD = Number(BALANCE.yieldPoolDepletedThreshold ?? 60);
const FALLBACK_DEPLETION_MULTIPLIER = 0.6;
// Isolation penalty per spec 13.2 patch 10.
const FALLBACK_ISOLATION_MULTIPLIER = 0.8;
const FALLBACK_ISOLATION_MIN_STEPS = 3;
const FALLBACK_ISOLATION_BFS_RADIUS = 6;
// Tiles that form a contiguous road network for connectivity checks.
const ROAD_LIKE = new Set([TILE.ROAD, TILE.BRIDGE, TILE.WAREHOUSE]);

/**
 * Patch 10 — Isolation-sensitive connectivity probe for fallback scoring.
 * Returns a result object describing whether the candidate tile sits adjacent
 * to a road-network component that reaches a warehouse at least `minSteps`
 * Manhattan steps away. BFS is capped at `FALLBACK_ISOLATION_BFS_RADIUS` to
 * keep this cheap; callers can inspect `truncated` to know the probe hit the
 * radius wall and `skipped` when the map has no warehouses at all (early
 * game), in which case the isolation penalty is meaningless and we avoid
 * silently taxing every candidate.
 *
 * Back-compat: callers that compare against a boolean still work because the
 * legacy signature (`if (!candidateHasReachableWarehouse(...))`) coerces the
 * object to truthy. `.reachable` is the intended boolean accessor.
 *
 * @param {object} grid
 * @param {number} ix
 * @param {number} iz
 * @param {number} [minSteps]
 * @returns {{reachable:boolean, truncated:boolean, skipped:boolean}}
 */
export function candidateHasReachableWarehouse(grid, ix, iz, minSteps = FALLBACK_ISOLATION_MIN_STEPS) {
  if (!grid || !inBounds(ix, iz, grid)) {
    return { reachable: false, truncated: false, skipped: false };
  }
  // Short-circuit: no warehouses on the map → isolation probe is meaningless.
  const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
  if (!warehouses || warehouses.length === 0) {
    return { reachable: true, truncated: false, skipped: true };
  }
  const { width } = grid;
  const visited = new Set();
  const start = toIndex(ix, iz, width);
  visited.add(start);
  // Head-index queue: avoids O(N) queue.shift() on large BFS frontiers.
  const queue = [[ix, iz, 0]];
  let head = 0;
  let truncated = false;
  while (head < queue.length) {
    const [cx, cz, hops] = queue[head++];
    if (hops > FALLBACK_ISOLATION_BFS_RADIUS) { truncated = true; continue; }
    const tile = grid.tiles[toIndex(cx, cz, width)];
    if (tile === TILE.WAREHOUSE && hops >= minSteps) {
      return { reachable: true, truncated: false, skipped: false };
    }
    for (const { dx, dz } of MOVE_DIRECTIONS_4) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!inBounds(nx, nz, grid)) continue;
      const nIdx = toIndex(nx, nz, width);
      if (visited.has(nIdx)) continue;
      const nTile = grid.tiles[nIdx];
      if (ROAD_LIKE.has(nTile) || (hops === 0 && nTile === TILE.GRASS)) {
        visited.add(nIdx);
        queue.push([nx, nz, hops + 1]);
      }
    }
  }
  return { reachable: false, truncated, skipped: false };
}

/**
 * Patch 9 + 10 — Score a fallback candidate placement with depletion and
 * isolation awareness. Returns a multiplier in [0, 1] that callers apply to
 * their base score. Factors in:
 *   - yieldPool < 60 → × 0.6 (depleted site)
 *   - salinized      → × 0.6 (treated same as low pool)
 *   - no road-connected warehouse ≥ 3 steps away → × 0.8 (isolation)
 *
 * Multipliers compose (worst-case: 0.48). Designed so existing scoring code
 * can do `baseScore *= scoreFallbackCandidate(...)` without breaking.
 * @param {object} grid
 * @param {number} ix
 * @param {number} iz
 * @returns {{multiplier:number, reasons:string[]}}
 */
export function scoreFallbackCandidate(grid, ix, iz) {
  let mult = 1;
  const reasons = [];
  const ts = getTileState(grid, ix, iz);
  if (ts) {
    const pool = Number(ts.yieldPool ?? 0);
    const salinized = Number(ts.salinized ?? 0) > 0;
    if (salinized || (pool > 0 && pool < FALLBACK_DEPLETION_POOL_THRESHOLD)) {
      mult *= FALLBACK_DEPLETION_MULTIPLIER;
      reasons.push(salinized ? "salinized" : `low_pool(${pool})`);
    }
  }
  const probe = candidateHasReachableWarehouse(grid, ix, iz);
  if (probe.skipped) {
    reasons.push("isolation_probe_skipped");
  } else if (!probe.reachable) {
    mult *= FALLBACK_ISOLATION_MULTIPLIER;
    reasons.push(probe.truncated ? "isolated_probe_truncated" : "isolated");
  }
  return { multiplier: Math.round(mult * 1000) / 1000, reasons };
}

/**
 * Rank a list of candidate tile placements by applying depletion + isolation
 * multipliers on top of each candidate's `score`. Pure helper — callers in
 * PlacementSpecialist or other fallback enumerators can pipe their scored
 * candidates through this before selecting the winner.
 * @param {object} grid
 * @param {Array<{ix:number, iz:number, score:number}>} candidates
 * @returns {Array<{ix:number, iz:number, score:number, multiplier:number, reasons:string[]}>}
 */
export function rankFallbackCandidates(grid, candidates) {
  return candidates.map((c) => {
    const { multiplier, reasons } = scoreFallbackCandidate(grid, c.ix, c.iz);
    return {
      ix: c.ix,
      iz: c.iz,
      score: (Number(c.score) || 0) * multiplier,
      multiplier,
      reasons,
    };
  }).sort((a, b) => b.score - a.score);
}

// ── Constants ────────────────────────────────────────────────────────

const PLAN_COOLDOWN_SEC = 20;
const PLAN_MAX_STEPS = 8;
const PLAN_MIN_STEPS = 1;
const MAX_REASONING_LEN = 300;
const MAX_THOUGHT_LEN = 120;
const MAX_GOAL_LEN = 60;
const LLM_TIMEOUT_MS = 30000;

const VALID_PRIORITIES = new Set(["critical", "high", "medium", "low"]);
// `reassign_role` is a pseudo-action: it doesn't build anything and bypasses
// BUILD_COST. PlanExecutor reads it as a noop and writes
// `state.ai.fallbackHints.pendingRoleBoost = step.role` so
// RoleAssignmentSystem can consume the signal next tick.
const VALID_BUILD_TYPES = new Set([...Object.keys(BUILD_COST), "reassign_role"]);
const VALID_SKILL_NAMES = new Set(Object.keys(SKILL_LIBRARY));

// ── System Prompt (inlined from npc-colony-planner.md for bundled use) ──

const SYSTEM_PROMPT = `You are the construction planner for a medieval colony simulation.
Return strict JSON only. No markdown fencing, no commentary.

## Available Build Actions (cost → expected yield)
- farm (5 wood) — food +0.4/s per farm, needs warehouse within 12 tiles. High moisture (>0.5) improves fertility cap.
- lumber (5 wood) — wood +0.5/s per lumber. Fire risk on low moisture (<0.25) during drought.
- warehouse (10 wood) — logistics anchor, spacing >= 5 from others. Enables worker delivery.
- quarry (6 wood) — stone +0.3/s per quarry. Dust pollution hurts adjacent farms (-0.004 fertility/tick).
- herb_garden (4 wood) — herbs +0.2/s. Boosts adjacent farm fertility (+0.003/tick).
- kitchen (8 wood + 3 stone) — food → meals. Needs food surplus. Adjacent farm gets compost bonus.
- smithy (6 wood + 5 stone) — stone → tools +0.2/s. Tools boost all production by ~15%.
- clinic (6 wood + 4 herbs) — herbs → medicine +0.15/s. Reduces colonist mortality.
- road (1 wood) — extends logistics, reduces worker travel time.
- wall (2 wood) — defense. High elevation walls get +50% defense bonus.
- bridge (3 wood + 1 stone) — crosses water, connects islands.

## Resource Chain Dependencies (build in order!)
1. FOOD CHAIN: farm → kitchen (requires 6+ farms and food surplus) → meals (2x hunger efficiency)
2. TOOL CHAIN: quarry → smithy (requires stable stone) → tools → ALL harvest +15% (highest ROI)
3. MEDICAL CHAIN: herb_garden → clinic (requires herb surplus) → medicine → lower mortality
Key insight: Tools multiply everything. Prioritize quarry→smithy after basic food is stable.

## Seasonal Decision Guide
- Spring: favorable for farming — expand food production
- Summer: drought risk — avoid low-moisture lumber/farms (fire), stockpile food
- Autumn: best expansion window — build infrastructure
- Winter: production drops 15-35% — ensure food reserves BEFORE winter arrives
- Plan 30-60s ahead: if winter is coming, secure food now, not when it hits

## Available Skills (compound builds)
- logistics_hub (24 wood): warehouse + 4 roads + 2 farms → new logistics anchor + food +1.0/s
- processing_cluster (13 wood + 5 stone): quarry + road + smithy → tools +0.2/s, production +15%
- defense_line (10 wood): 5 walls → threat -5, wall coverage +0.05
- food_district (25 wood + 3 stone): 4 farms + kitchen → food +2.0/s, meals +0.3/s (needs 6+ farms)
- expansion_outpost (22 wood): warehouse + 2 roads + farm + lumber → new territory, food +0.4/s
- bridge_link (12 wood + 4 stone): 2 roads + 2 bridges → island connectivity
- medical_center (11 wood + 4 herbs): herb_garden + road + clinic → medicine +0.15/s, herbs +0.2/s
- resource_hub (15 wood): lumber + 2 roads + quarry → wood +0.5/s, stone +0.3/s
- rapid_farms (15 wood): 3 farms in L-shape → food +1.2/s (best on high moisture terrain)

## Terrain Impact
- Elevation: +15% wood cost per 0.1 above 0.5; +30% move cost at elevation 1.0; walls get +50% defense at high elevation
- Moisture: fertility cap = min(1.0, moisture*1.4+0.25); drought fire risk when moisture < 0.25
- Adjacency: herb_garden next to farm = +fertility; quarry next to farm = -fertility; kitchen next to farm = +compost

## Location Hints
- near_cluster:<id> — within 6 tiles of cluster center
- near_step:<id> — within 4 tiles of a prior step
- expansion:<north|south|east|west> — in expansion frontier
- coverage_gap — near uncovered worksites
- terrain:high_moisture — moist tiles near infrastructure

## M1-M4 Quantified Mechanics (v0.8.0 "living world")
- A farm with yieldPool<50 produces at 40%; avoid rebuilding on tiles where avgYieldPool.farm is near zero.
- A warehouse with density>400 has 0.8%/s fire ignite chance; never stack >6 producers on one warehouse.
- Carried food spoils at 0.005/s off-road (herbs at 0.010/s); keep hauls short or roaded.
- Roads grant 3%/step stacking speed up to 1.6× at 20 steps; long producer-to-warehouse legs benefit most.
- When densityRiskActive is true, prefer expansion via a new warehouse over piling producers on the hot one.
- When nextExhaustionMinutes.<type> drops under 10, relocate or rotate; do not keep feeding the depleted node.

## Hard Rules
- Never plan more buildings than current resources can afford
- Warehouse spacing >= 5 tiles from nearest warehouse
- Production buildings within 12 tiles of a warehouse
- When food rate is negative, prioritize food before expansion
- Keep wood buffer ~8 for emergency builds
- Separate quarries from farms (dust pollution)
- Place herb_gardens adjacent to farms when possible
- Follow the strategy priority and constraints from the Strategic Advisor
- If "Last Plan Evaluation" is provided, address its issues — avoid repeating the same mistakes
- If "Recurring Patterns" are listed, BREAK THE LOOP by choosing a different approach

## Output Format
{
  "goal": "short description (max 60 chars)",
  "horizon_sec": number,
  "reasoning": "2-3 sentence analysis referencing chains/seasons/strategy (max 300 chars)",
  "steps": [
    {
      "id": 1,
      "thought": "why, referencing chain status or season (max 120 chars)",
      "action": { "type": "<building>", "hint": "<hint>" },
      "predicted_effect": { "<metric>": "<value>" },
      "priority": "critical|high|medium|low",
      "depends_on": []
    }
  ]
}
For skills: "action": { "type": "skill", "skill": "<name>", "hint": "<hint>" }
3-8 steps. Unique numeric ids from 1. Valid JSON only.`;

// ── Prompt Construction ──────────────────────────────────────────────

/**
 * Build the user prompt from observation, memory, skill status, and learned skills.
 * @param {object} observation — from ColonyPerceiver.observe()
 * @param {string} memoryText — from MemoryStore.formatForPrompt()
 * @param {object} state — game state (for affordable check)
 * @param {string} [learnedSkillsText] — from LearnedSkillLibrary.formatForPrompt()
 * @param {string} [evaluationText] — from PlanEvaluator.formatEvaluationForLLM() (P4)
 * @param {object} [options] — { memoryStore } — Phase 5 H7: when present, the
 *                              prompt includes the last few
 *                              `postcondition_violation` observations so the
 *                              LLM can address them explicitly.
 * @returns {string}
 */
export function buildPlannerPrompt(observation, memoryText, state, learnedSkillsText = "", evaluationText = "", options = {}) {
  const sections = [];

  // H7: decorate the observation with recent postcondition violations so
  // formatObservationForLLM renders them inline. We avoid mutating the caller's
  // object by shallow-cloning when we have violations to attach.
  let obs = observation;
  const memStore = options.memoryStore;
  if (memStore && typeof memStore.getRecentByCategory === "function") {
    const recent = memStore.getRecentByCategory("postcondition_violation", 3);
    if (recent.length > 0) {
      obs = { ...observation, postconditionViolations: recent.map((r) => r.text) };
    }
  }

  // Observation
  sections.push("## Current Observation\n" + formatObservationForLLM(obs));

  // Phase 5 H7 / strategic wiring — surface the current strategic goal +
  // chain + repair goal + fallback hints so the LLM sees what the strategic
  // layer has decided since its last turn. These live on state.gameplay /
  // state.ai and were published by StrategicDirector.applyPhase5StrategicAdaptations.
  const gp = state?.gameplay ?? {};
  const strategicLines = [];
  if (gp.strategicGoal) strategicLines.push(`- Goal: ${gp.strategicGoal}`);
  if (Array.isArray(gp.strategicGoalChain) && gp.strategicGoalChain.length > 0) {
    strategicLines.push(`- Goal chain: ${gp.strategicGoalChain.join(" → ")}`);
  }
  if (gp.strategicRepairGoal) strategicLines.push(`- Repair focus: ${gp.strategicRepairGoal}`);
  const hints = state?.ai?.fallbackHints ?? {};
  if (hints.distributed_layout_hint) {
    strategicLines.push(`- Layout hint: ${hints.distributed_layout_hint.message}`);
  }
  if (strategicLines.length > 0) {
    sections.push("\n## Strategic State (Phase 5)\n" + strategicLines.join("\n"));
  }

  // Recent reflections
  if (memoryText) {
    sections.push("\n## Recent Reflections\n" + memoryText);
  }

  // Skill availability
  const resources = state.resources ?? {};
  const buildings = state.buildings ?? {};
  const skillStatus = listSkillStatus(resources, buildings);
  const affordableSkills = skillStatus.filter(s => s.affordable).map(s => s.name);
  const unaffordableSkills = skillStatus.filter(s => !s.affordable).map(s => `${s.name} (need: ${s.missing.join(", ")})`);

  sections.push("\n## Skill Availability");
  if (affordableSkills.length > 0) {
    sections.push("Affordable: " + affordableSkills.join(", "));
  }
  if (unaffordableSkills.length > 0) {
    sections.push("Unaffordable: " + unaffordableSkills.join("; "));
  }

  // Learned skills (from successful past plans)
  if (learnedSkillsText) {
    sections.push("\n" + learnedSkillsText);
  }

  // Affordable building types
  const affordableTypes = Object.entries(observation.affordable ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  sections.push("\n## Affordable Buildings: " + (affordableTypes.join(", ") || "none"));

  // P4: Evaluation feedback from last plan
  if (evaluationText) {
    sections.push("\n" + evaluationText);
  }

  return sections.join("\n");
}

// ── Response Validation ──────────────────────────────────────────────

/**
 * Validate and sanitize a raw LLM plan response.
 * Returns { ok: true, plan } or { ok: false, error, plan: null }.
 * @param {*} raw — parsed JSON from LLM
 * @returns {{ ok: boolean, plan: object|null, error: string }}
 */
export function validatePlanResponse(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, plan: null, error: "response is not an object" };
  }

  // Goal
  const goal = _truncate(String(raw.goal ?? "unnamed plan"), MAX_GOAL_LEN);

  // Horizon
  const horizon_sec = Math.max(10, Math.min(600, Number(raw.horizon_sec) || 60));

  // Reasoning
  const reasoning = _truncate(String(raw.reasoning ?? ""), MAX_REASONING_LEN);

  // Steps
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    return { ok: false, plan: null, error: "steps must be non-empty array" };
  }

  const steps = [];
  const seenIds = new Set();
  const errors = [];

  for (const rawStep of raw.steps.slice(0, PLAN_MAX_STEPS)) {
    const step = _validateStep(rawStep, seenIds);
    if (step.error) {
      errors.push(`step ${rawStep?.id ?? "?"}: ${step.error}`);
      continue;
    }
    steps.push(step.value);
  }

  if (steps.length < PLAN_MIN_STEPS) {
    return { ok: false, plan: null, error: `only ${steps.length} valid steps (need ${PLAN_MIN_STEPS}+): ${errors.join("; ")}` };
  }

  // Fixup depends_on references — remove references to IDs that don't exist
  const validIds = new Set(steps.map(s => s.id));
  for (const step of steps) {
    step.depends_on = step.depends_on.filter(id => validIds.has(id));
  }

  return {
    ok: true,
    plan: { goal, horizon_sec, reasoning, steps },
    error: errors.length > 0 ? `warnings: ${errors.join("; ")}` : "",
  };
}

function _validateStep(raw, seenIds) {
  if (!raw || typeof raw !== "object") {
    return { error: "not an object", value: null };
  }

  const id = Number(raw.id);
  if (!Number.isFinite(id) || id < 1) {
    return { error: "invalid id", value: null };
  }
  if (seenIds.has(id)) {
    return { error: `duplicate id ${id}`, value: null };
  }
  seenIds.add(id);

  const action = raw.action;
  if (!action || typeof action !== "object") {
    return { error: "missing action", value: null };
  }

  // Validate action type
  const isSkill = action.type === "skill" && action.skill;
  if (isSkill) {
    if (!VALID_SKILL_NAMES.has(action.skill)) {
      return { error: `unknown skill: ${action.skill}`, value: null };
    }
  } else if (!VALID_BUILD_TYPES.has(action.type)) {
    return { error: `unknown build type: ${action.type}`, value: null };
  }

  const hint = typeof action.hint === "string" ? action.hint : null;
  const thought = _truncate(String(raw.thought ?? ""), MAX_THOUGHT_LEN);
  const priority = VALID_PRIORITIES.has(raw.priority) ? raw.priority : "medium";
  const depends_on = Array.isArray(raw.depends_on)
    ? raw.depends_on.filter(d => typeof d === "number" && d >= 1)
    : [];
  const predicted_effect = raw.predicted_effect && typeof raw.predicted_effect === "object"
    ? raw.predicted_effect
    : {};

  // Preserve the `role` field for `reassign_role` so PlanExecutor can write
  // the correct pending hint. All other action types drop unknown payload fields.
  const reassignRole = (action.type === "reassign_role" && typeof action.role === "string")
    ? action.role
    : null;

  return {
    error: null,
    value: {
      id,
      thought,
      action: isSkill
        ? { type: "skill", skill: action.skill, hint }
        : (reassignRole
          ? { type: "reassign_role", role: reassignRole, hint }
          : { type: action.type, hint }),
      predicted_effect,
      priority,
      depends_on,
      status: "pending",
    },
  };
}

function _truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

// ── Fallback Plan Generation ─────────────────────────────────────────

/**
 * Generate an algorithmic fallback plan based on observation.
 * Used when LLM is unavailable or disabled.
 * @param {object} observation — from ColonyPerceiver.observe()
 * @param {object} state — game state
 * @returns {object} plan
 */
export function generateFallbackPlan(observation, state) {
  const steps = [];
  let nextId = 1;
  const resources = state.resources ?? {};
  const buildings = state.buildings ?? {};
  const wood = resources.wood ?? 0;
  const stone = resources.stone ?? 0;
  const food = resources.food ?? 0;
  const herbs = resources.herbs ?? 0;
  const foodRate = observation.economy?.food?.rate ?? 0;
  const woodRate = observation.economy?.wood?.rate ?? 0;
  const clusters = observation.topology?.clusters ?? [];
  const coverage = observation.topology?.coveragePercent ?? 100;
  const warehouses = buildings.warehouses ?? 0;
  const farms = buildings.farms ?? 0;
  const lumbers = buildings.lumbers ?? 0;
  const walls = buildings.walls ?? 0;
  const kitchens = buildings.kitchens ?? 0;
  const workerCount = observation.workforce?.total ?? 0;
  const threat = observation.defense?.threat ?? 0;

  // Escalator-aware affordability: the Nth farm/kitchen costs more than the
  // flat BUILD_COST value once over BUILD_COST_ESCALATOR[kind].softTarget.
  // Using escalated cost here stops the fallback from emitting build steps
  // that ConstructionSystem would immediately bounce with "insufficientResource".
  const farmCost = computeEscalatedBuildCost("farm", farms);
  const kitchenCost = computeEscalatedBuildCost("kitchen", kitchens);

  // Priority 1: Food crisis — add farms FIRST if food rate is negative
  if (foodRate < 0 && food < 40) {
    if (wood >= (farmCost.wood ?? 5)) {
      steps.push(_step(nextId++, "farm", "near_cluster:c0", "critical",
        "Food declining, need immediate food production",
        { food_rate_delta: "+0.4/s" }));
      // When population has outgrown the meal pipeline (>=12 workers, zero
      // kitchens), prioritize a kitchen over a second farm — stacking farms
      // when workers can't eat raw food fast enough just leaves food to rot;
      // a kitchen converts food→meals at 2× hunger efficiency.
      if (workerCount >= 12 && kitchens === 0
          && wood >= (kitchenCost.wood ?? 8)
          && stone >= (kitchenCost.stone ?? 2)) {
        steps.push(_step(nextId++, "kitchen", "near_cluster:c0", "critical",
          "Pop exceeds meal throughput — forcing kitchen before more farms",
          { meals_rate: "+1/cycle", food_efficiency: "2x" }, [nextId - 2]));
      } else if (wood >= (farmCost.wood ?? 5) + 5) {
        // Second farm: use fresh escalator since the first farm increased
        // the count; add 5 wood headroom so logistics road is still plausible.
        const secondFarmCost = computeEscalatedBuildCost("farm", farms + 1);
        if (wood >= (secondFarmCost.wood ?? 5)) {
          steps.push(_step(nextId++, "farm", `near_step:${nextId - 2}`, "high",
            "Double down on food to reverse decline",
            { food_rate_delta: "+0.4/s" }, [nextId - 2]));
        }
      }
    } else if (wood >= 1) {
      // Can't afford farm, but can build road to maintain productivity
      steps.push(_step(nextId++, "road", "near_cluster:c0", "high",
        "Food crisis but insufficient wood for farm, extend logistics",
        { logistics: "improved" }));
    }
  }

  // Phase 5 — SkillLibrary suggestion hooks. These run once we've addressed
  // any food crisis (Priority 1) and before generic coverage/wood priorities
  // so the planner reacts to M1-M4 terrain depletion signals even when the
  // LLM isn't available. Each helper emits 0..N suggestions; we cap their
  // footprint so they don't swamp the existing priority ladder.
  const prospectSuggestions = suggestProspectFogFrontier(state);
  for (const s of prospectSuggestions.slice(0, 1)) {
    steps.push({
      id: nextId++,
      thought: `All ${s.resource} nodes depleted — prospect fog frontier`,
      action: { type: "skill", skill: "prospect_fog_frontier", hint: `coords:${s.target.ix},${s.target.iz}` },
      predicted_effect: { exploration: "+1 frontier tile", resource: s.resource },
      priority: "high",
      depends_on: [],
      status: "pending",
    });
  }

  const recycleSuggestions = suggestRecycleAbandonedWorksite(state);
  for (const s of recycleSuggestions.slice(0, 1)) {
    steps.push({
      id: nextId++,
      thought: `Abandoned ${s.producer ?? "producer"} at (${s.target.ix},${s.target.iz}) — recycle for stone refund`,
      action: { type: "skill", skill: "recycle_abandoned_worksite", hint: `coords:${s.target.ix},${s.target.iz}` },
      predicted_effect: { stone: "+refund", logistics: "freed tile" },
      priority: "medium",
      depends_on: [],
      status: "pending",
    });
  }

  const relocateSuggestions = suggestRelocateDepletedProducer(state);
  for (const s of relocateSuggestions.slice(0, 1)) {
    if (!s.to) continue;
    steps.push({
      id: nextId++,
      thought: `${s.producer} at (${s.from.ix},${s.from.iz}) depleted — relocate to (${s.to.ix},${s.to.iz})`,
      action: { type: "skill", skill: "relocate_depleted_producer", hint: `coords:${s.to.ix},${s.to.iz}` },
      predicted_effect: { production: "restored", coverage: "preserved" },
      priority: "high",
      depends_on: [],
      status: "pending",
    });
  }

  // Priority 2: Coverage gap — add warehouse if many disconnected worksites
  if (coverage < 70 && wood >= 10) {
    steps.push(_step(nextId++, "warehouse", "coverage_gap", "high",
      "Many worksites uncovered, need logistics anchor",
      { coverage: "+15%" }));
  }

  // Priority 3: Wood shortage — add lumber if wood rate is low
  if (woodRate <= 0 && lumbers < farms && wood >= 5) {
    steps.push(_step(nextId++, "lumber", "near_cluster:c0", "high",
      "Wood stagnant, need lumber for future builds",
      { wood_rate_delta: "+0.5/s" }));
  }

  // Priority 3.5: Food processing - kitchen converts raw food to meals (2x
  // hunger efficiency). Phase 10: food gate 20 → 5. The 20-threshold acted
  // as a chicken-and-egg: farm output was eaten as fast as it arrived, so
  // food rarely crossed 20 and the kitchen was never built, leaving the
  // colony stuck at the DevIndex-44 starvation equilibrium. Firing at 5
  // proves the chain works with any sustained harvest and unlocks the
  // meal-powered growth loop (DevIndex 44 → 72+ at day 90).
  //
  // Stone gate is 2 (not 3) because early stone drains faster than quarries
  // refill; a higher threshold pushes Kitchen into late-game limbo. The
  // pop>=12 branch upgrades priority to "critical" so the planner can't be
  // crowded out by farm/warehouse stacking when the meal pipeline is the
  // actual bottleneck.
  // v0.8.2 Round-5b (02a-rimworld-veteran Step 2) — Scenario-aware Kitchen gate.
  // Gate Bastion / Broken Frontier allocate 7-10 walls × 1 stone each, so a
  // flat stone>=2 gate loses to wall allocation and Kitchen never gets built.
  // If scenario wants walls AND we've built less than half, reserve stone for
  // remaining walls before opening the Kitchen gate.
  const wallTargetTotal = Number(state?.gameplay?.scenario?.targets?.walls ?? 0);
  const wallBuilt = Number(buildings.walls ?? 0);
  const remainingWalls = Math.max(0, wallTargetTotal - wallBuilt);
  const reservedStoneForWalls = (wallTargetTotal >= 7 && wallBuilt < wallTargetTotal * 0.5)
    ? Math.min(remainingWalls, Math.max(0, stone - 2))
    : 0;
  const kitchenStoneGate = 2 + reservedStoneForWalls;
  if (
    kitchens === 0
    && farms >= 2
    && food >= 5
    && workerCount >= 2
    && wood >= 8
    && stone >= kitchenStoneGate
    && clusters.length > 0
  ) {
    const forceCritical = workerCount >= 12;
    steps.push(_step(nextId++, "kitchen", "near_cluster:c0",
      forceCritical ? "critical" : "high",
      forceCritical
        ? "Pop exceeds meal throughput — forcing kitchen before more farms"
        : "No kitchen - raw food spoils without conversion, meals double hunger efficiency",
      { meals_rate: "+1/cycle", food_efficiency: "2x" }));
  }

  // Priority 3.75 "idle processing chain": when a processing building exists
  // but no worker is assigned (e.g. Kitchen built, COOK=0, Meals stay at 0),
  // emit a `reassign_role` pseudo-step. PlanExecutor writes
  // `state.ai.fallbackHints.pendingRoleBoost = role` and RoleAssignmentSystem
  // consumes it next tick to force a single slot.
  //
  // The food guard mirrors the ingredients check — don't ask for a cook when
  // the stockpile is too low for the kitchen to even start cycling.
  //
  // Low-pop colonies (workerCount < lowPopBand) use a lower food threshold
  // because food is drained faster than produced at small pop sizes, so the
  // normal threshold is never cleared and the pipeline stays permanently idle.
  const idleChainThresholdBase = Number(BALANCE.fallbackIdleChainThreshold ?? 15);
  const idleChainLowPopBand = Number(BALANCE.fallbackIdleChainLowPopBand ?? 6);
  const idleChainLowPopThreshold = Number(BALANCE.fallbackIdleChainThresholdLowPop ?? 6);
  const liveWorkerCount = Array.isArray(state.agents)
    ? state.agents.filter((a) => a && a.type === "WORKER").length
    : 0;
  const idleChainThreshold = (liveWorkerCount > 0 && liveWorkerCount < idleChainLowPopBand)
    ? idleChainLowPopThreshold
    : idleChainThresholdBase;
  const roleCounts = state.metrics?.roleCounts ?? null;
  const cookWorkers = Number(roleCounts?.COOK ?? roleCounts?.cook ?? 0);
  const smithWorkers = Number(roleCounts?.SMITH ?? roleCounts?.smith ?? 0);
  const herbalistWorkers = Number(roleCounts?.HERBALIST ?? roleCounts?.herbalist ?? 0);
  if (kitchens >= 1 && cookWorkers === 0 && food >= idleChainThreshold) {
    steps.push({
      id: nextId++,
      thought: "Kitchen exists but no cook — pipeline idle",
      action: { type: "reassign_role", role: "COOK", hint: null },
      predicted_effect: { cook_slot_delta: "+1", meals_rate: "+1/cycle" },
      priority: "high",
      depends_on: [],
      status: "pending",
    });
  }
  if ((buildings.smithies ?? 0) >= 1 && smithWorkers === 0 && stone >= 5) {
    steps.push({
      id: nextId++,
      thought: "Smithy exists but no smith — pipeline idle",
      action: { type: "reassign_role", role: "SMITH", hint: null },
      predicted_effect: { smith_slot_delta: "+1", tools_rate: "+0.2/s" },
      priority: "high",
      depends_on: [],
      status: "pending",
    });
  }
  if ((buildings.clinics ?? 0) >= 1 && herbalistWorkers === 0 && herbs >= 3) {
    steps.push({
      id: nextId++,
      thought: "Clinic exists but no herbalist — pipeline idle",
      action: { type: "reassign_role", role: "HERBALIST", hint: null },
      predicted_effect: { herbalist_slot_delta: "+1", medicine_rate: "+0.15/s" },
      priority: "high",
      depends_on: [],
      status: "pending",
    });
  }

  // Priority 4: Processing chain - quarry + smithy if not started
  if ((buildings.quarries ?? 0) === 0 && wood >= 6 && farms >= 3) {
    steps.push(_step(nextId++, "quarry", "near_cluster:c0", "medium",
      "No quarries, need stone for advanced buildings",
      { stone_rate: "+0.3/s" }));
  }
  if ((buildings.smithies ?? 0) === 0 && (buildings.quarries ?? 0) > 0 && wood >= 6 && stone >= 5) {
    steps.push(_step(nextId++, "smithy", "near_cluster:c0", "medium",
      "Stone available, smithy unlocks tools for production boost",
      { tools_rate: "+0.2/s" }));
  }

  // Priority 5: Defense — walls if threat is rising
  if (threat > 30 && walls < 8 && wood >= 4) {
    steps.push(_step(nextId++, "wall", null, "medium",
      "Threat rising, need wall coverage",
      { threat_reduction: "-3" }));
    steps.push(_step(nextId++, "wall", `near_step:${nextId - 2}`, "low",
      "Extend wall line", { threat_reduction: "-2" }, [nextId - 2]));
  }

  // Priority 5.5: Bridge utility — suggest bridge if any production tile is
  // water-isolated (adjacent to WATER with no warehouse reachable via passable
  // tiles). Uses the existing candidateHasReachableWarehouse probe.
  if (wood >= 3 && stone >= 1 && steps.length < PLAN_MAX_STEPS) {
    const bridgeSuggestion = _detectWaterIsolation(state);
    if (bridgeSuggestion) {
      steps.push({
        id: nextId++,
        thought: `${bridgeSuggestion.producer} at (${bridgeSuggestion.ix},${bridgeSuggestion.iz}) isolated by water — bridge needed`,
        action: { type: "bridge", hint: `coords:${bridgeSuggestion.waterIx},${bridgeSuggestion.waterIz}` },
        predicted_effect: { connectivity: "+1 isolated site", logistics: "restored" },
        priority: "medium",
        depends_on: [],
        status: "pending",
      });
    }
  }

  // Priority 6: Road network expansion
  if (wood >= 3 && steps.length < 6) {
    steps.push(_step(nextId++, "road", null, "low",
      "Extend road network for worker pathing",
      { logistics: "improved" }));
  }

  // Priority 7: Medical center if no clinic and herbs available
  if ((buildings.clinics ?? 0) === 0 && herbs >= 4 && wood >= 11 && steps.length < 6) {
    steps.push({
      id: nextId++,
      thought: "No clinic — establish medical infrastructure for colonist health",
      action: { type: "skill", skill: "medical_center", hint: "near_cluster:c0" },
      predicted_effect: { medicine_rate: "+0.15/s", herbs_rate: "+0.2/s" },
      priority: "medium",
      depends_on: [],
      status: "pending",
    });
  }

  // Priority 8: Rapid farms if food rate still low and need quick boost
  if (foodRate < 1 && wood >= 15 && farms >= 2 && steps.length < 5) {
    steps.push({
      id: nextId++,
      thought: "Food production low, rapid farm cluster for quick boost",
      action: { type: "skill", skill: "rapid_farms", hint: "terrain:high_moisture" },
      predicted_effect: { food_rate: "+1.2/s" },
      priority: "high",
      depends_on: [],
      status: "pending",
    });
  }

  // Priority 9: Resource hub if no quarry and lumber balanced
  if ((buildings.quarries ?? 0) === 0 && lumbers >= 1 && wood >= 15 && steps.length < 5) {
    steps.push({
      id: nextId++,
      thought: "Diversify raw materials with combined lumber + quarry hub",
      action: { type: "skill", skill: "resource_hub", hint: "near_cluster:c0" },
      predicted_effect: { wood_rate: "+0.5/s", stone_rate: "+0.3/s" },
      priority: "medium",
      depends_on: [],
      status: "pending",
    });
  }

  // Priority 10: Expansion skill if flush with resources
  if (wood >= 25 && steps.length < 4 && clusters.length < 3) {
    const bestFrontier = observation.topology?.expansionFrontiers?.[0];
    const hint = bestFrontier ? `expansion:${bestFrontier.direction}` : null;
    steps.push({
      id: nextId++,
      thought: "Resources sufficient for expansion outpost",
      action: { type: "skill", skill: "expansion_outpost", hint },
      predicted_effect: { coverage: "+1 frontier", food_rate: "+0.4/s" },
      priority: "medium",
      depends_on: [],
      status: "pending",
    });
  }

  // Ensure at least 1 step
  if (steps.length === 0) {
    if (wood >= 1) {
      steps.push(_step(nextId++, "road", null, "low",
        "Minimal action: expand road network",
        { logistics: "marginal" }));
    } else {
      // Zero resources — plan a gathering-only step (no build cost)
      steps.push({
        id: nextId++,
        thought: "No resources available, workers should gather before building",
        action: { type: "road", hint: null },
        predicted_effect: { status: "deferred until wood >= 1" },
        priority: "low",
        depends_on: [],
        status: "deferred",
      });
    }
  }

  // Determine goal from first step
  const goalParts = [];
  if (steps.some(s => s.priority === "critical")) goalParts.push("crisis response");
  else if (steps.some(s => s.action.type === "farm")) goalParts.push("food production");
  if (steps.some(s => s.action.type === "warehouse")) goalParts.push("logistics");
  if (steps.some(s => s.action.skill)) goalParts.push("expansion");
  const goal = goalParts.length > 0 ? goalParts.join(" + ") : "maintenance";

  return {
    goal,
    horizon_sec: 60,
    reasoning: "Algorithmic fallback based on observation priorities.",
    steps: steps.slice(0, PLAN_MAX_STEPS),
    source: "fallback",
  };
}

/**
 * Water-isolation detection for bridge suggestions.
 * For each production tile (FARM, LUMBER, QUARRY, HERB_GARDEN), checks if:
 *   1. The tile has a WATER neighbor (water is adjacent), AND
 *   2. The tile has no reachable warehouse via the existing BFS probe.
 * Returns the first such isolated tile plus the water neighbor coordinate
 * to build the bridge at, or null if all worksites are passably connected.
 *
 * @param {object} state — game state
 * @returns {{ producer:string, ix:number, iz:number, waterIx:number, waterIz:number }|null}
 */
function _detectWaterIsolation(state) {
  const grid = state?.grid;
  if (!grid || !grid.tiles) return null;
  const { width, height } = grid;
  const PRODUCER_TYPES = new Map([
    [TILE.FARM, "farm"],
    [TILE.LUMBER, "lumber"],
    [TILE.QUARRY, "quarry"],
    [TILE.HERB_GARDEN, "herb_garden"],
  ]);

  for (let iz = 0; iz < height; iz++) {
    for (let ix = 0; ix < width; ix++) {
      const tileType = grid.tiles[toIndex(ix, iz, width)];
      if (!PRODUCER_TYPES.has(tileType)) continue;

      // Check if the BFS probe finds no reachable warehouse
      const probe = candidateHasReachableWarehouse(grid, ix, iz, 1);
      if (probe.skipped || probe.reachable) continue;

      // Production tile has no warehouse connection — look for adjacent water
      for (const { dx, dz } of MOVE_DIRECTIONS_4) {
        const nx = ix + dx;
        const nz = iz + dz;
        if (!inBounds(nx, nz, grid)) continue;
        const nType = grid.tiles[toIndex(nx, nz, width)];
        if (nType === TILE.WATER) {
          return {
            producer: PRODUCER_TYPES.get(tileType),
            ix,
            iz,
            waterIx: nx,
            waterIz: nz,
          };
        }
      }
    }
  }
  return null;
}

function _step(id, type, hint, priority, thought, predicted_effect, depends_on = []) {
  return {
    id,
    thought,
    action: { type, hint },
    predicted_effect,
    priority,
    depends_on,
    status: "pending",
  };
}

// ── LLM API Call ─────────────────────────────────────────────────────

/**
 * Call an OpenAI-compatible chat completions API.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} config — { apiKey, baseUrl, model, timeoutMs }
 * @returns {Promise<{ ok: boolean, data: object|null, error: string, latencyMs: number }>}
 */
export async function callLLM(systemPrompt, userPrompt, config) {
  const { apiKey, baseUrl, model, timeoutMs } = config;
  if (!apiKey) {
    return { ok: false, data: null, error: "no API key", latencyMs: 0 };
  }

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs ?? LLM_TIMEOUT_MS);
  const started = performance.now();

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 1500,
      }),
      signal: ctrl.signal,
    });

    const latencyMs = performance.now() - started;

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, data: null, error: `HTTP ${resp.status}: ${text.slice(0, 200)}`, latencyMs };
    }

    const payload = await resp.json();
    const content = payload.choices?.[0]?.message?.content ?? "";

    // Parse JSON from response — try direct parse, then extract from markdown fences
    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch { /* fall through */ }
      }
    }

    if (!parsed) {
      return { ok: false, data: null, error: "could not parse JSON from response", latencyMs };
    }

    return { ok: true, data: parsed, error: "", latencyMs };
  } catch (err) {
    const latencyMs = performance.now() - started;
    const msg = err?.name === "AbortError" ? "timeout" : String(err?.message ?? err).slice(0, 200);
    return { ok: false, data: null, error: msg, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

// ── Trigger Conditions ─���─────────────────────────────────────────────

/**
 * Determine whether a new plan should be generated.
 * @param {number} nowSec — current game time
 * @param {number} lastPlanSec — time of last plan
 * @param {object} observation — current observation
 * @param {boolean} hasActivePlan — is a plan currently executing
 * @returns {{ should: boolean, reason: string }}
 */
export function shouldReplan(nowSec, lastPlanSec, observation, hasActivePlan) {
  // No active plan — always replan (bypass cooldown)
  if (!hasActivePlan) {
    return { should: true, reason: "no_active_plan" };
  }

  // Crisis: food declining and stock low (bypass cooldown)
  const foodRate = observation.economy?.food?.rate ?? 0;
  const foodStock = observation.economy?.food?.stock ?? 100;
  if (foodRate < 0 && foodStock < 30) {
    return { should: true, reason: "food_crisis" };
  }

  // Opportunity: lots of resources available (bypass cooldown)
  const wood = observation.economy?.wood?.stock ?? 0;
  if (wood > 100) {
    return { should: true, reason: "resource_opportunity" };
  }

  // Don't replan too soon for non-urgent triggers
  if (nowSec - lastPlanSec < PLAN_COOLDOWN_SEC) {
    return { should: false, reason: "cooldown" };
  }

  // Heartbeat: replan every 30s regardless
  if (nowSec - lastPlanSec >= 30) {
    return { should: true, reason: "heartbeat" };
  }

  return { should: false, reason: "no_trigger" };
}

// ── ColonyPlanner Class ──────────────────────────────────────────────

export class ColonyPlanner {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey]
   * @param {string} [options.baseUrl]
   * @param {string} [options.model]
   * @param {number} [options.timeoutMs]
   */
  constructor(options = {}) {
    this._apiKey = options.apiKey ?? null;
    this._baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this._model = options.model ?? "gpt-4o-mini";
    this._timeoutMs = options.timeoutMs ?? LLM_TIMEOUT_MS;

    // Stats
    this._stats = {
      llmCalls: 0,
      llmSuccesses: 0,
      llmFailures: 0,
      fallbackPlans: 0,
      totalLatencyMs: 0,
      lastError: "",
      lastPlanSource: "none",
    };
  }

  get stats() { return { ...this._stats }; }

  /**
   * Request a plan from the LLM (or fallback).
   * @param {object} observation — from ColonyPerceiver.observe()
   * @param {string} memoryText — from MemoryStore.formatForPrompt()
   * @param {object} state — game state
   * @param {string} [learnedSkillsText] — from LearnedSkillLibrary.formatForPrompt()
   * @param {string} [evaluationText] — from PlanEvaluator.formatEvaluationForLLM() (P4)
   * @returns {Promise<{ plan: object, source: "llm"|"fallback", error: string }>}
   */
  async requestPlan(observation, memoryText, state, learnedSkillsText = "", evaluationText = "", options = {}) {
    // Try LLM if API key is available
    if (this._apiKey) {
      const userPrompt = buildPlannerPrompt(observation, memoryText, state, learnedSkillsText, evaluationText, options);
      this._stats.llmCalls++;

      const result = await callLLM(SYSTEM_PROMPT, userPrompt, {
        apiKey: this._apiKey,
        baseUrl: this._baseUrl,
        model: this._model,
        timeoutMs: this._timeoutMs,
      });

      if (result.ok && result.data) {
        this._stats.totalLatencyMs += result.latencyMs;
        const validation = validatePlanResponse(result.data);

        if (validation.ok) {
          this._stats.llmSuccesses++;
          this._stats.lastPlanSource = "llm";
          validation.plan.source = "llm";
          return { plan: validation.plan, source: "llm", error: validation.error };
        }

        // LLM returned invalid JSON structure — fallback
        this._stats.llmFailures++;
        this._stats.lastError = `validation: ${validation.error}`;
      } else {
        this._stats.llmFailures++;
        this._stats.lastError = result.error;
        this._stats.totalLatencyMs += result.latencyMs;
      }
    }

    // Fallback
    const plan = generateFallbackPlan(observation, state);
    this._stats.fallbackPlans++;
    this._stats.lastPlanSource = "fallback";
    return { plan, source: "fallback", error: "" };
  }

  /**
   * Request a plan synchronously (fallback only, no LLM).
   * @param {object} observation
   * @param {object} state
   * @returns {{ plan: object, source: "fallback" }}
   */
  requestFallbackPlan(observation, state) {
    const plan = generateFallbackPlan(observation, state);
    this._stats.fallbackPlans++;
    this._stats.lastPlanSource = "fallback";
    return { plan, source: "fallback" };
  }
}
