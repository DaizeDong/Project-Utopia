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

import { BUILD_COST } from "../../../config/balance.js";
import { SKILL_LIBRARY, listSkillStatus, getSkillTotalCost } from "./SkillLibrary.js";
import { formatObservationForLLM } from "./ColonyPerceiver.js";

// ── Constants ────────────────────────────────────────────────────────

const PLAN_COOLDOWN_SEC = 20;
const PLAN_MAX_STEPS = 8;
const PLAN_MIN_STEPS = 1;
const MAX_REASONING_LEN = 300;
const MAX_THOUGHT_LEN = 120;
const MAX_GOAL_LEN = 60;
const LLM_TIMEOUT_MS = 30000;

const VALID_PRIORITIES = new Set(["critical", "high", "medium", "low"]);
const VALID_BUILD_TYPES = new Set(Object.keys(BUILD_COST));
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

## Hard Rules
- Never plan more buildings than current resources can afford
- Warehouse spacing >= 5 tiles from nearest warehouse
- Production buildings within 12 tiles of a warehouse
- When food rate is negative, prioritize food before expansion
- Keep wood buffer ~8 for emergency builds
- Separate quarries from farms (dust pollution)
- Place herb_gardens adjacent to farms when possible
- Follow the strategy priority and constraints from the Strategic Advisor

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
 * @returns {string}
 */
export function buildPlannerPrompt(observation, memoryText, state, learnedSkillsText = "") {
  const sections = [];

  // Observation
  sections.push("## Current Observation\n" + formatObservationForLLM(observation));

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

  return {
    error: null,
    value: {
      id,
      thought,
      action: isSkill
        ? { type: "skill", skill: action.skill, hint }
        : { type: action.type, hint },
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
  const threat = observation.defense?.threat ?? 0;

  // Priority 1: Food crisis — add farms FIRST if food rate is negative
  if (foodRate < 0 && food < 40) {
    if (wood >= 5) {
      steps.push(_step(nextId++, "farm", "near_cluster:c0", "critical",
        "Food declining, need immediate food production",
        { food_rate_delta: "+0.4/s" }));
      if (wood >= 10) {
        steps.push(_step(nextId++, "farm", `near_step:${nextId - 2}`, "high",
          "Double down on food to reverse decline",
          { food_rate_delta: "+0.4/s" }, [nextId - 2]));
      }
    } else if (wood >= 1) {
      // Can't afford farm, but can build road to maintain productivity
      steps.push(_step(nextId++, "road", "near_cluster:c0", "high",
        "Food crisis but insufficient wood for farm, extend logistics",
        { logistics: "improved" }));
    }
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

  // Priority 4: Processing chain ��� quarry + smithy if not started
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
   * @returns {Promise<{ plan: object, source: "llm"|"fallback", error: string }>}
   */
  async requestPlan(observation, memoryText, state, learnedSkillsText = "") {
    // Try LLM if API key is available
    if (this._apiKey) {
      const userPrompt = buildPlannerPrompt(observation, memoryText, state, learnedSkillsText);
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
