import { DecisionScheduler } from "./DecisionScheduler.js";
import { BALANCE } from "../../../config/balance.js";
import { TILE } from "../../../config/constants.js";
import { listTilesByType, toIndex, getTileState } from "../../../world/grid/Grid.js";
import {
  buildStrategicAnalytics,
  formatStrategicAnalyticsForLLM,
  validateStrategicPick,
  candidateUseRate,
} from "./StrategicAnalytics.js";

// ── Living World v0.8.0 Phase 5 (patches 14-18) — strategic goal tuning ─────
/** Threat-tier at or above which we switch to fortify_and_survive. */
const FORTIFY_THREAT_TIER = 3;
/** Prime-tile fertility threshold for the opportunity-cost hint. */
const PRIME_FERTILITY_THRESHOLD = 0.8;
/** Seconds a DevIndex dimension must stay below 50 before repair goal fires. */
const DEV_INDEX_DIM_REPAIR_SEC = 60;
/** Dimension-threshold that triggers a repair goal. */
const DEV_INDEX_DIM_THRESHOLD = 50;
/** Ordered goal chain for survival/fortify mode (patch 15). */
export const SURVIVAL_GOAL_CHAIN = Object.freeze([
  "preserve_food_reserve",
  "maintain_worker_count",
  "maintain_wall_perimeter",
  "repel_raid",
]);
/** Fixed-order DevIndex dimension keys — iterate this rather than Object.entries
 * so repair-goal selection is deterministic and stable across runs. Must match
 * the dim keys populated by DevIndexSystem. */
export const DEV_INDEX_DIM_KEYS = Object.freeze([
  "population",
  "economy",
  "infrastructure",
  "production",
  "defense",
  "resilience",
]);

export const DEFAULT_STRATEGY = {
  priority: "grow",
  resourceFocus: "balanced",
  defensePosture: "neutral",
  riskTolerance: 0.5,
  expansionDirection: "none",
  workerFocus: "balanced",
  environmentPreference: "neutral",
  // P2: Extended strategy fields
  phase: "bootstrap",
  primaryGoal: "",
  constraints: [],
  resourceBudget: { reserveWood: 8, reserveFood: 15 },
};

const VALID_ENUMS = {
  priority: ["survive", "grow", "defend", "complete_objective"],
  resourceFocus: ["food", "wood", "stone", "balanced"],
  defensePosture: ["aggressive", "defensive", "neutral"],
  expansionDirection: ["north", "south", "east", "west", "none"],
  workerFocus: ["farm", "wood", "deliver", "balanced"],
  environmentPreference: ["calm", "pressure", "neutral"],
  phase: ["bootstrap", "growth", "industrialize", "process", "fortify", "optimize"],
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function sanitizeString(value, maxLen) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * Validate and clamp a raw LLM output into a safe strategy result.
 * @param {object|null|undefined} raw
 * @returns {{ reasoning: string, strategy: object, observations: string[], summary: string }}
 */
export function guardStrategy(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const rawStrategy = input.strategy && typeof input.strategy === "object" ? input.strategy : {};

  const strategy = {};
  for (const [key, allowed] of Object.entries(VALID_ENUMS)) {
    const value = rawStrategy[key];
    strategy[key] = allowed.includes(value) ? value : DEFAULT_STRATEGY[key];
  }

  const rawRisk = Number(rawStrategy.riskTolerance);
  strategy.riskTolerance = Number.isFinite(rawRisk) ? clamp(rawRisk, 0, 1) : DEFAULT_STRATEGY.riskTolerance;

  // P2: Extended fields
  strategy.primaryGoal = sanitizeString(rawStrategy.primaryGoal, 80) || DEFAULT_STRATEGY.primaryGoal;

  const rawConstraints = Array.isArray(rawStrategy.constraints) ? rawStrategy.constraints : [];
  strategy.constraints = rawConstraints.slice(0, 5).map(c => sanitizeString(c, 120)).filter(c => c.length > 0);

  const rawBudget = rawStrategy.resourceBudget && typeof rawStrategy.resourceBudget === "object" ? rawStrategy.resourceBudget : {};
  strategy.resourceBudget = {
    reserveWood: clamp(Number(rawBudget.reserveWood) || 8, 0, 100),
    reserveFood: clamp(Number(rawBudget.reserveFood) || 15, 0, 200),
  };

  const reasoning = sanitizeString(input.reasoning, 500);
  const summary = sanitizeString(input.summary, 80);

  const rawObs = Array.isArray(input.observations) ? input.observations : [];
  const observations = rawObs
    .slice(0, 3)
    .map((o) => sanitizeString(o, 200))
    .filter((o) => o.length > 0);

  return { reasoning, strategy, observations, summary };
}

// ── Phase 5 helpers (patches 14-16, 18) ─────────────────────────────────────

/** Read current threat tier from raid escalation, falling back to 0. */
export function getCurrentThreatTier(state) {
  const v = Number(state?.gameplay?.raidEscalation?.tier ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Determine whether we should switch to fortify_and_survive (patch 14).
 * Also writes `state.gameplay.strategicGoal` / `strategicGoalChain` (patch 15).
 * @param {object} state
 * @returns {{goal:string, chain:Array<string>}}
 */
export function applyThreatTierGoal(state) {
  const tier = getCurrentThreatTier(state);
  state.gameplay ??= {};
  const prevGoal = state.gameplay.strategicGoal;

  if (tier >= FORTIFY_THREAT_TIER) {
    state.gameplay.strategicGoal = "fortify_and_survive";
    // Only install the survival chain on the transition into fortify mode so
    // we don't thrash async consumers that snapshot the chain between ticks.
    if (prevGoal !== "fortify_and_survive" || !Array.isArray(state.gameplay.strategicGoalChain)) {
      state.gameplay.strategicGoalChain = [...SURVIVAL_GOAL_CHAIN];
    }
    return {
      goal: "fortify_and_survive",
      chain: [...(state.gameplay.strategicGoalChain ?? SURVIVAL_GOAL_CHAIN)],
    };
  }

  state.gameplay.strategicGoal = "economic_growth";
  // Only clear the chain when transitioning out of fortify — during sustained
  // economic ticks we leave whatever the planner wrote (empty or otherwise)
  // untouched, preventing wipe/refill churn every tick.
  if (prevGoal === "fortify_and_survive") {
    state.gameplay.strategicGoalChain = [];
  } else if (!Array.isArray(state.gameplay.strategicGoalChain)) {
    state.gameplay.strategicGoalChain = [];
  }
  return { goal: "economic_growth", chain: [...state.gameplay.strategicGoalChain] };
}

/**
 * Patch 16 — if any candidate tile in the fallback pool is "prime" (high
 * fertility AND adjacent to a warehouse) and we are NOT in fortify mode, emit
 * a `distributed_layout_hint` so ColonyPlanner's fallback can down-rank it.
 * The hint bag lives on `state.ai.fallbackHints`.
 *
 * Returns `{ emitted, primeTiles }` describing whether a hint was emitted.
 * @param {object} state
 */
export function emitOpportunityCostHint(state) {
  state.ai ??= {};
  const fallbackHints = state.ai.fallbackHints ?? (state.ai.fallbackHints = {});
  // Fortify mode: clear any stale hint and bail (survival overrides growth).
  if (state.gameplay?.strategicGoal === "fortify_and_survive") {
    delete fallbackHints.distributed_layout_hint;
    return { emitted: false, primeTiles: [] };
  }
  const grid = state?.grid;
  if (!grid) return { emitted: false, primeTiles: [] };

  const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
  if (warehouses.length === 0) return { emitted: false, primeTiles: [] };

  const primeTiles = [];
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const w of warehouses) {
    for (const [dx, dz] of dirs) {
      const ix = w.ix + dx;
      const iz = w.iz + dz;
      if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
      const tsEntry = getTileState(grid, ix, iz);
      const fertility = Number(tsEntry?.fertility ?? 0);
      const tile = grid.tiles[toIndex(ix, iz, grid.width)];
      if (tile !== TILE.GRASS) continue;
      if (fertility >= PRIME_FERTILITY_THRESHOLD) {
        primeTiles.push({ ix, iz, fertility });
      }
    }
  }

  if (primeTiles.length > 0) {
    fallbackHints.distributed_layout_hint = {
      issuedAtSec: Number(state?.metrics?.timeSec ?? 0),
      reason: "prime_tile_near_warehouse",
      primeTiles: primeTiles.slice(0, 5),
      message:
        "Consider distributing new producers further from warehouses — prime-fertility warehouse-adjacent tiles carry long-term density risk.",
    };
    return { emitted: true, primeTiles };
  }

  // No prime tiles this tick — clear any stale hint.
  delete fallbackHints.distributed_layout_hint;
  return { emitted: false, primeTiles: [] };
}

/**
 * Patch 18 — DevIndex-aware repair goal. When any dim stays < 50 for
 * DEV_INDEX_DIM_REPAIR_SEC game-seconds, emit `rebalance_<dim>` on
 * `state.gameplay.strategicRepairGoal`. Dimension timers live on
 * `state.ai.devIndexDimBelow50TimerSec` as a `{ dimName: seconds }` map.
 * @param {object} state
 * @param {number} dt
 */
export function updateDevIndexRepairGoal(state, dt) {
  const dims = state?.gameplay?.devIndexDims;
  if (!dims || typeof dims !== "object") return null;
  state.ai ??= {};
  const timers = state.ai.devIndexDimBelow50TimerSec ?? (state.ai.devIndexDimBelow50TimerSec = {});
  const dtSec = Number.isFinite(dt) && dt > 0 ? Number(dt) : 0;

  let triggered = null;
  let worstDuration = 0;

  // Iterate the fixed dim list so selection is deterministic; Object.entries
  // order can vary if DevIndexSystem ever emits keys in a different order.
  for (const dim of DEV_INDEX_DIM_KEYS) {
    if (!(dim in dims)) continue;
    const value = Number(dims[dim] ?? 0);
    if (value < DEV_INDEX_DIM_THRESHOLD) {
      timers[dim] = Number(timers[dim] ?? 0) + dtSec;
      if (timers[dim] >= DEV_INDEX_DIM_REPAIR_SEC && timers[dim] > worstDuration) {
        triggered = dim;
        worstDuration = timers[dim];
      }
    } else if (timers[dim] > 0) {
      timers[dim] = 0;
    }
  }

  state.gameplay ??= {};
  if (triggered) {
    state.gameplay.strategicRepairGoal = `rebalance_${triggered}`;
  } else {
    // Don't clobber a repair goal that another system wrote; only clear
    // the one we own.
    const current = state.gameplay.strategicRepairGoal;
    if (typeof current === "string" && current.startsWith("rebalance_")) {
      const dim = current.slice("rebalance_".length);
      const value = Number(dims[dim] ?? 0);
      if (value >= DEV_INDEX_DIM_THRESHOLD) {
        state.gameplay.strategicRepairGoal = null;
      }
    }
  }
  return state.gameplay.strategicRepairGoal ?? null;
}

/**
 * Phase 5 integration point — runs every tick, independent of the LLM's
 * async cadence. Publishes all Phase 5 strategic outputs.
 * @param {object} state
 * @param {number} dt
 */
export function applyPhase5StrategicAdaptations(state, dt) {
  if (!state) return;
  state.gameplay ??= {};
  state.ai ??= {};
  applyThreatTierGoal(state);
  emitOpportunityCostHint(state);
  updateDevIndexRepairGoal(state, dt);
}

/**
 * Phase-aware preamble — emitted in the LLM prompt so the model gets a
 * deterministic, structured signal about which phase the colony has
 * already earned. The deterministic fallback is greedy and stays in
 * bootstrap; this preamble is the LLM's lever for non-greedy phase
 * progression and chain-investment decisions.
 *
 * Pure function — exported for unit tests.
 *
 * @param {object} ctx
 * @returns {{stage:string, hint:string, bottleneck:string}}
 */
export function describePhasePreamble(ctx) {
  const {
    farms = 0, quarries = 0, smithies = 0, kitchens = 0,
    clinics = 0, herbGardens = 0, warehouses = 0,
    workers = 0, tools = 0, food = 0, threat = 0,
    devSmoothed = 0, previousPhase = "bootstrap",
  } = ctx ?? {};

  // Survival overrides
  if (food < 15 || workers <= 3) {
    return {
      stage: "bootstrap-survive",
      hint: "Food/labor critical — stabilize before any chain investment.",
      bottleneck: food < 15 ? "food" : "workers",
    };
  }
  if (threat > 75) {
    return {
      stage: "fortify",
      hint: "High threat — wall + defense before growth chains.",
      bottleneck: "defense",
    };
  }

  const bootstrapMet = farms >= 4 && warehouses >= 1;

  if (!bootstrapMet) {
    return {
      stage: "bootstrap",
      hint: "Establish 4 farms + 1 warehouse before chain investment.",
      bottleneck: farms < 4 ? "farms" : "warehouses",
    };
  }

  // Long-horizon investment opportunities ranked by ROI
  if (quarries === 0) {
    return {
      stage: "industrialize",
      hint: "Bootstrap met. Build quarry to unlock smithy→tools (+15% all production).",
      bottleneck: "no_quarry",
    };
  }
  if (smithies === 0) {
    return {
      stage: "industrialize",
      hint: "Quarry online. Build smithy NEXT — tools multiply every production building.",
      bottleneck: "no_smithy",
    };
  }
  // Tool-deficit: if we have a smithy but tools per worker is below half,
  // workers are bottlenecked by tools — DO NOT add more farms/workers yet.
  if (tools > 0 && workers > 0 && tools < workers / 2) {
    return {
      stage: "industrialize",
      hint: "Tools per worker low — keep smithy fed before scaling headcount.",
      bottleneck: "tools_per_worker",
    };
  }
  if (kitchens === 0 && farms >= 6) {
    return {
      stage: "process",
      hint: "Farm surplus — build kitchen to convert food→meals 2x.",
      bottleneck: "no_kitchen",
    };
  }
  if (clinics === 0 && herbGardens > 0) {
    return {
      stage: "process",
      hint: "Herbs available — clinic reduces mortality, free survival multiplier.",
      bottleneck: "no_clinic",
    };
  }

  // All chains in place — optimize/growth posture
  if (devSmoothed >= 60) {
    return {
      stage: "optimize",
      hint: "Chains complete and devIndex healthy — fine-tune density and roads.",
      bottleneck: "none",
    };
  }
  return {
    stage: "growth",
    hint: "Chains in place. Expand balanced production and add clusters.",
    bottleneck: previousPhase === "bootstrap" ? "stuck_in_bootstrap" : "none",
  };
}

/**
 * If the LLM returns an empty/missing primaryGoal, synthesize a
 * meaningful one from the current state. This guarantees the
 * downstream `state.ai.strategy.primaryGoal` is never the empty
 * string — fixing the "Decision shows goal=" UI bug.
 *
 * Exported for unit tests.
 *
 * @param {object} strategy — already-guarded strategy object
 * @param {object} state
 * @returns {string} non-empty primaryGoal under 80 chars
 */
export function synthesizePrimaryGoal(strategy, state) {
  const existing = sanitizeString(strategy?.primaryGoal, 80);
  if (existing) return existing;

  const buildings = state?.buildings ?? {};
  const farms = buildings.farms ?? 0;
  const warehouses = buildings.warehouses ?? 0;
  const quarries = buildings.quarries ?? 0;
  const smithies = buildings.smithies ?? 0;
  const kitchens = buildings.kitchens ?? 0;
  const food = Number(state?.resources?.food ?? 0);
  // Round 2: harness/test states may not have populated populationStats yet
  // (only GameApp's main loop sets it). Fall back to the live agents
  // array so synthesize doesn't mis-fire the "workers<=3" survival
  // branch on a state that has 12+ healthy workers.
  let workers = Number(state?.metrics?.populationStats?.workers ?? 0);
  if (!workers && Array.isArray(state?.agents)) {
    workers = state.agents.filter((a) => a?.type === "WORKER" && a?.alive !== false).length;
  }
  const threat = Number(state?.gameplay?.threat ?? 0);
  const phase = strategy?.phase ?? "bootstrap";
  const priority = strategy?.priority ?? "grow";

  // Order matches the deterministic fallback's branch ordering, then phase.
  if (food < 15 || workers <= 3) return "Stabilize food and worker count to prevent collapse";
  if (threat > 75) return "Hold the line — walls and defense before further growth";
  if (priority === "complete_objective") return "Push final objective with current chain output";
  if (farms < 4 || warehouses < 1) return "Establish bootstrap: 4 farms and a warehouse";
  if (quarries === 0) return "Build quarry to unlock the tool chain";
  if (smithies === 0) return "Build smithy — tools multiply all production by 15%";
  if (kitchens === 0 && farms >= 6) return "Build kitchen to convert food surplus into meals";

  switch (phase) {
    case "bootstrap": return "Establish bootstrap: farms, warehouse, and worker safety";
    case "industrialize": return "Sustain quarry→smithy chain and feed tool demand";
    case "process": return "Process raw goods into meals/medicine for multipliers";
    case "fortify": return "Fortify perimeter and stabilize before resuming growth";
    case "optimize": return "Optimize chain throughput and warehouse density";
    case "growth":
    default: return "Expand balanced production and add new clusters";
  }
}

function pushAiCallLog(state, exchange) {
  state.ai.llmCallLog ??= [];
  state.ai.llmCallLog.unshift(exchange);
  state.ai.llmCallLog = state.ai.llmCallLog.slice(0, 24);
}

function pushDebugAiTrace(state, exchange) {
  state.debug ??= {};
  state.debug.aiTrace ??= [];
  state.debug.aiTrace.unshift({
    atSec: Number(exchange.simSec ?? 0),
    source: "strategic",
    category: exchange.category,
    fallback: Boolean(exchange.fallback),
    error: exchange.error ?? "",
    model: exchange.model ?? "",
    decisionResult: exchange.decisionResult ?? null,
  });
  if (state.debug.aiTrace.length > 32) state.debug.aiTrace.length = 32;
}

function recordStrategicExchange(state, result, strategy, nowSec, promptContent = "") {
  const usedFallback = Boolean(result?.fallback);
  const debugExchange = result?.debug ?? {};
  const requestSummary = debugExchange.requestSummary ?? (() => {
    try {
      return promptContent ? JSON.parse(promptContent) : null;
    } catch {
      return promptContent ? { channel: "strategic-director", rawPrompt: promptContent } : null;
    }
  })();
  const exchange = {
    category: "strategic-director",
    label: "Strategic Director",
    simSec: nowSec,
    source: usedFallback ? "fallback" : "llm",
    fallback: usedFallback,
    model: result?.model ?? state.ai.lastStrategyModel ?? "",
    endpoint: debugExchange.endpoint ?? "/api/ai/environment",
    requestedAtIso: debugExchange.requestedAtIso ?? "",
    requestSummary,
    promptSystem: debugExchange.promptSystem ?? "",
    promptUser: debugExchange.promptUser ?? promptContent,
    requestPayload: debugExchange.requestPayload ?? { endpoint: "/api/ai/environment", channel: "strategic-director" },
    rawModelContent: debugExchange.rawModelContent ?? "",
    parsedBeforeValidation: debugExchange.parsedBeforeValidation ?? result?.data ?? null,
    guardedOutput: debugExchange.guardedOutput ?? result?.data ?? null,
    decisionResult: strategy ?? null,
    error: result?.error ?? debugExchange.error ?? "",
  };
  state.ai.lastStrategicExchange = exchange;
  state.ai.strategicExchanges ??= [];
  state.ai.strategicExchanges.unshift(exchange);
  state.ai.strategicExchanges = state.ai.strategicExchanges.slice(0, 8);
  pushAiCallLog(state, exchange);
  pushDebugAiTrace(state, exchange);
}

export class StrategicDirector {
  /**
   * @param {import("../memory/MemoryStore.js").MemoryStore} memoryStore
   * @param {object} [options]
   * @param {number} [options.heartbeatSec]
   */
  constructor(memoryStore, options = {}) {
    this.name = "StrategicDirector";
    this.memoryStore = memoryStore;
    this.scheduler = new DecisionScheduler({
      heartbeatSec: options.heartbeatSec ?? 90,
    });
    this.pendingPromise = null;
    this.pendingResult = null;
  }

  /**
   * Deterministic fallback strategy based on current state.
   * @param {object} state
   * @returns {object} strategy object
   */
  buildFallbackStrategy(state) {
    const { food, wood, stone, herbs, tools } = state.resources;
    const workers = state.metrics.populationStats?.workers ?? 0;
    const { threat, prosperity, objectiveIndex, objectives } = state.gameplay;
    const buildings = state.buildings ?? {};
    const farms = buildings.farms ?? 0;
    const quarries = buildings.quarries ?? 0;
    const smithies = buildings.smithies ?? 0;
    const kitchens = buildings.kitchens ?? 0;
    const clinics = buildings.clinics ?? 0;

    // Survival checks
    if (food < 15 || workers <= 3) {
      return {
        ...DEFAULT_STRATEGY,
        priority: "survive",
        phase: "bootstrap",
        primaryGoal: "Stabilize food production and prevent colony collapse",
        resourceFocus: "food",
        defensePosture: "defensive",
        riskTolerance: 0.2,
        workerFocus: "farm",
        environmentPreference: "calm",
        constraints: ["do not build non-food buildings", "prioritize farms near warehouses"],
        resourceBudget: { reserveWood: 5, reserveFood: 0 },
      };
    }

    // Threat check
    if (threat > 75) {
      return {
        ...DEFAULT_STRATEGY,
        priority: "defend",
        phase: "fortify",
        primaryGoal: "Build walls and reduce threat before expanding",
        defensePosture: "defensive",
        riskTolerance: 0.2,
        environmentPreference: "calm",
        constraints: ["build walls on high elevation for defense bonus", "do not expand to new clusters"],
        resourceBudget: { reserveWood: 10, reserveFood: 20 },
      };
    }

    // Near final objective. Gated on totalObjectives > 0 — v0.8.0 retired the
    // objective system (ScenarioFactory returns []); without this guard the
    // branch would fire trivially (objectiveIndex 0 >= -1) every eval.
    const totalObjectives = Array.isArray(objectives) ? objectives.length : 0;
    const nearFinal = totalObjectives > 0 && objectiveIndex >= totalObjectives - 1;
    if (nearFinal && prosperity >= 70 && threat <= 20) {
      return {
        ...DEFAULT_STRATEGY,
        priority: "complete_objective",
        phase: "optimize",
        primaryGoal: "Optimize production efficiency to complete final objective",
        riskTolerance: 0.7,
        environmentPreference: "calm",
        constraints: ["focus on objective requirements", "maintain food surplus"],
        resourceBudget: { reserveWood: 8, reserveFood: 20 },
      };
    }

    // Phase detection based on colony state
    // Only run detailed phase detection if building data is available
    let phase = "growth";
    let primaryGoal = "";
    let resourceFocus = "balanced";
    let workerFocus = "balanced";
    const constraints = [];
    let reserveWood = 8;
    let reserveFood = 15;

    const hasBuildingData = Object.keys(buildings).length > 0;

    if (hasBuildingData && (farms < 4 || (buildings.warehouses ?? 0) < 1)) {
      // Early game: need basic food + logistics
      phase = "bootstrap";
      primaryGoal = "Establish basic food production with 4+ farms and warehouse coverage";
      resourceFocus = "food";
      workerFocus = "farm";
      constraints.push("build farms first, then lumber for wood income");
      reserveWood = 5;
    } else if (hasBuildingData && quarries === 0 && farms >= 4) {
      phase = "industrialize";
      primaryGoal = "Build quarry→smithy chain for tools (+15% all production)";
      resourceFocus = "stone";
      constraints.push("quarry is highest priority", "separate quarry from farms (dust pollution)");
      reserveWood = 12;
    } else if (hasBuildingData && smithies === 0 && quarries > 0 && stone >= 5) {
      phase = "industrialize";
      primaryGoal = "Build smithy to convert stone into tools";
      resourceFocus = "stone";
      constraints.push("smithy is highest priority — tools multiply everything");
      reserveWood = 6;
    } else if (hasBuildingData && kitchens === 0 && farms >= 6) {
      phase = "process";
      primaryGoal = "Build kitchen to convert food surplus into efficient meals";
      resourceFocus = "food";
      constraints.push("kitchen needs food surplus to be useful");
      reserveWood = 8;
    } else if (hasBuildingData && clinics === 0 && (buildings.herbGardens ?? 0) > 0 && herbs >= 4) {
      phase = "process";
      primaryGoal = "Build clinic for medicine production to reduce mortality";
      constraints.push("clinic needs herb surplus");
    } else {
      // Mature colony or no building data — growth mode with resource focus
      phase = "growth";
      primaryGoal = "Expand colony with balanced production and new clusters";

      if (wood < 15) {
        resourceFocus = "wood";
        workerFocus = "wood";
      } else if (food < 30) {
        resourceFocus = "food";
        workerFocus = "farm";
      }
      constraints.push("maintain warehouse coverage for new buildings");
      reserveWood = 10;
      reserveFood = 20;
    }

    return {
      ...DEFAULT_STRATEGY,
      priority: "grow",
      phase,
      primaryGoal,
      resourceFocus,
      workerFocus,
      constraints,
      resourceBudget: { reserveWood, reserveFood },
    };
  }

  /**
   * Build the user prompt content for the LLM call.
   * @param {object} state
   * @returns {string} JSON string
   */
  buildPromptContent(state) {
    const buildings = state.buildings ?? {};
    const farms = buildings.farms ?? 0;
    const quarries = buildings.quarries ?? 0;
    const smithies = buildings.smithies ?? 0;
    const kitchens = buildings.kitchens ?? 0;
    const clinics = buildings.clinics ?? 0;
    const herbGardens = buildings.herbGardens ?? 0;
    const warehouses = buildings.warehouses ?? 0;
    const workers = state.metrics.populationStats?.workers ?? 0;
    const tools = Math.round(state.resources.tools ?? 0);
    const food = Math.round(state.resources.food);
    const threat = Math.round(state.gameplay.threat);
    const devIndex = Math.round(state.gameplay?.devIndex ?? 0);
    const devSmoothed = Math.round(state.gameplay?.devIndexSmoothed ?? 0);
    const previousPhase = state.ai?.strategy?.phase ?? "bootstrap";
    const previousGoal = state.ai?.strategy?.primaryGoal ?? "";

    // Phase-aware preamble: the deterministic fallback gets stuck in
    // bootstrap because it requires `farms<4 OR no warehouse` strictly.
    // The LLM should use this preamble as a tiebreaker when those
    // hard thresholds are met but other multipliers (tools, kitchen)
    // would yield more devIndex than another farm.
    const preamble = describePhasePreamble({
      farms, quarries, smithies, kitchens, clinics, herbGardens, warehouses,
      workers, tools, food, threat, devSmoothed, previousPhase,
    });

    // Round 2: ranked candidate menus. The LLM picks priority/phase/
    // resourceFocus from these instead of inventing them. The post-
    // validator (validateStrategicPick) falls back to the top-1
    // candidate when the LLM violates the menu.
    const analytics = buildStrategicAnalytics(state);
    const computedSignalsBlock = formatStrategicAnalyticsForLLM(analytics);

    const payload = {
      channel: "strategic-director",
      summary: {
        timeSec: state.metrics.timeSec,
        workers,
        deaths: state.metrics.deathsTotal,
        food,
        wood: Math.round(state.resources.wood),
        stone: Math.round(state.resources.stone ?? 0),
        herbs: Math.round(state.resources.herbs ?? 0),
        tools,
        meals: Math.round(state.resources.meals ?? 0),
        prosperity: Math.round(state.gameplay.prosperity),
        threat,
        devIndex,
        devIndexSmoothed: devSmoothed,
        objectiveIndex: state.gameplay.objectiveIndex,
        currentObjective: state.gameplay.objectives?.[state.gameplay.objectiveIndex]?.title ?? "",
        scenarioFamily: state.gameplay.scenario?.family ?? "",
        doctrine: state.gameplay.doctrine ?? "balanced",
        weather: state.weather?.current ?? "clear",
        season: state.weather?.season ?? null,
      },
      buildings: {
        warehouses, farms,
        lumbers: buildings.lumbers ?? 0,
        quarries, herbGardens, kitchens, smithies, clinics,
      },
      chainStatus: {
        food: kitchens > 0 ? "complete" : farms >= 6 ? "ready_for_kitchen" : "building_farms",
        tools: smithies > 0 ? "complete" : quarries > 0 ? "ready_for_smithy" : "no_quarry",
        medical: clinics > 0 ? "complete" : herbGardens > 0 ? "ready_for_clinic" : "no_herbs",
      },
      previous: { phase: previousPhase, primaryGoal: previousGoal },
      computedSignals: computedSignalsBlock,
      computedSignalsRaw: analytics,
      phasePreamble: preamble,
      instructions: [
        "You are a phase-aware strategic director. Pick THE single best phase and write a non-empty primaryGoal.",
        "PICK FROM MENUS (Round 2): `strategy.priority` MUST be one of the priorityCandidates values; `strategy.phase` MUST be one of the phaseCandidates values; `strategy.resourceFocus` SHOULD be the focus column of the top bottleneck (or 'balanced').",
        "If a Constraint Flag forces survive/defend/fortify, OBEY IT — do not override.",
        "Strongly prefer the TOP-1 candidate per field. Only choose runner-up when its score is within 0.10 of the leader AND you have a domain reason. Random rotation hurts continuity.",
        "When bootstrap is met (farms>=4 AND warehouses>=1), do NOT pick phase=bootstrap. Move to industrialize→process→growth/optimize.",
        "Phases: bootstrap < growth < industrialize < process < fortify | optimize. Progress monotonically unless threat>75 (fortify) or food<15 (bootstrap survive).",
        "Bootstrap exit: farms>=4 AND warehouses>=1 — DO NOT remain in bootstrap once both are met.",
        "Long-horizon multipliers beat greedy headcount: smithy (+15% all production), kitchen (food→meals 2x), clinic (mortality reduction). Recommend investing in these BEFORE adding more farms when chainStatus shows ready_for_X.",
        "Worker bottleneck: if tools<workers/2 and quarries==0, the bottleneck is tools NOT headcount — primaryGoal should drive quarry→smithy chain.",
        "Output strict JSON. strategy.primaryGoal MUST be a concrete imperative sentence under 80 chars referencing the chosen bottleneck/phase (e.g., 'Build smithy to unlock tool multiplier' — not empty, not generic 'optimize colony').",
        "strategy.constraints: 2-5 short rules the tactical planner will follow this tick.",
        "Required strategy keys: priority, phase, primaryGoal, resourceFocus, defensePosture, riskTolerance, workerFocus, expansionDirection, environmentPreference, constraints, resourceBudget.",
      ].join(" "),
    };

    const memoryText = this.memoryStore.formatForPrompt(
      "strategy resources threat prosperity",
      state.metrics.timeSec,
    );
    if (memoryText) {
      payload.recentMemory = memoryText;
    }

    return JSON.stringify(payload);
  }

  /**
   * Main system update, called each tick.
   * @param {number} _dt
   * @param {object} state
   * @param {object} services
   */
  update(_dt, state, services) {
    // Phase 5 — per-tick adaptations run regardless of LLM cadence.
    applyPhase5StrategicAdaptations(state, _dt);

    // 1. Initialize state.ai.strategy if missing
    if (!state.ai.strategy) {
      state.ai.strategy = { ...DEFAULT_STRATEGY };
      state.ai.lastStrategySource = state.ai.lastStrategySource ?? "none";
      state.ai.lastStrategySec = state.ai.lastStrategySec ?? 0;
      state.ai.strategyDecisionCount = state.ai.strategyDecisionCount ?? 0;
    }

    // 2. Process pendingResult if LLM call completed
    if (this.pendingResult) {
      const now = state.metrics.timeSec;
      const usedFallback = Boolean(this.pendingResult.fallback);
      let strategy;

      if (usedFallback || this.pendingResult.error) {
        strategy = this.buildFallbackStrategy(state);
      } else {
        const guarded = guardStrategy(this.pendingResult.data);
        strategy = guarded.strategy;

        // Round 2 — validate the LLM picks against the candidate menus.
        // Falls back to top-1 candidate per field on violation; tracks
        // candidateUseRate so the bench can report menu adherence.
        const analytics = buildStrategicAnalytics(state);
        const validated = validateStrategicPick(strategy, analytics);
        strategy = validated.strategy;

        state.ai.strategy ??= {};
        const useRate = candidateUseRate(validated.picks);
        state.ai.strategyPicks = validated.picks;
        state.ai.strategyCandidateUseRate = useRate;
        // Running average across decisions
        const prevAvg = Number(state.ai.candidateUseRateAvg ?? 0);
        const prevCount = Number(state.ai.candidateUseRateSamples ?? 0);
        const newCount = prevCount + 1;
        state.ai.candidateUseRateSamples = newCount;
        state.ai.candidateUseRateAvg = (prevAvg * prevCount + useRate) / newCount;

        // Post-validation: ensure primaryGoal is non-empty. The
        // strategic-director.md system prompt did not historically
        // require primaryGoal, so the LLM frequently omitted it,
        // leaving the UI to render `goal=` empty. Synthesize from
        // current state when the model didn't supply one.
        if (!sanitizeString(strategy.primaryGoal, 80)) {
          strategy.primaryGoal = synthesizePrimaryGoal(strategy, state);
        }

        // Store observations as reflections in memoryStore
        if (guarded.observations && guarded.observations.length > 0) {
          for (const obs of guarded.observations) {
            this.memoryStore.addReflection(now, obs);
          }
        }
      }

      state.ai.strategy = strategy;
      state.ai.lastStrategySource = usedFallback ? "fallback" : "llm";
      state.ai.lastStrategySec = now;
      state.ai.lastStrategyError = this.pendingResult.error ?? "";
      state.ai.lastStrategyModel = this.pendingResult.model ?? state.ai.lastStrategyModel ?? "";
      state.ai.strategyDecisionCount = (state.ai.strategyDecisionCount ?? 0) + 1;
      recordStrategicExchange(state, this.pendingResult, strategy, now);
      this.scheduler.recordDecision(state);
      this.pendingResult = null;
    }

    // 3. Check if a new decision should be made
    if (this.pendingPromise) return;
    const forceStrategicDecision = Boolean(state.ai.forceStrategicDecision);
    if (!forceStrategicDecision && !this.scheduler.shouldTrigger(state)) return;
    state.ai.forceStrategicDecision = false;

    const wantsLlm = state.ai.enabled && state.ai.coverageTarget !== "fallback";

    // AI disabled or fallback coverage: synchronous local strategy.
    if (!wantsLlm) {
      const strategy = this.buildFallbackStrategy(state);
      const now = state.metrics.timeSec;
      const promptContent = this.buildPromptContent(state);
      state.ai.strategy = strategy;
      state.ai.lastStrategySource = "fallback";
      state.ai.lastStrategySec = now;
      state.ai.lastStrategyError = "";
      state.ai.lastStrategyModel = "fallback";
      state.ai.strategyDecisionCount = (state.ai.strategyDecisionCount ?? 0) + 1;
      recordStrategicExchange(state, {
        fallback: true,
        data: { strategy },
        error: "",
        model: "fallback",
        debug: {
          requestedAtIso: new Date().toISOString(),
          endpoint: "/api/ai/environment",
          requestSummary: JSON.parse(promptContent),
          promptSystem: "(local fallback: strategic proxy call skipped)",
          promptUser: promptContent,
          requestPayload: { endpoint: "/api/ai/environment", channel: "strategic-director", mode: "fallback-local" },
          rawModelContent: JSON.stringify({ strategy }, null, 2),
          parsedBeforeValidation: { strategy },
          guardedOutput: { strategy },
          error: "",
        },
      }, strategy, now, promptContent);
      this.scheduler.recordDecision(state);
      return;
    }

    // AI enabled: async LLM call
    const promptContent = this.buildPromptContent(state);
    const fallbackStrategy = this.buildFallbackStrategy(state);
    const requestStrategic = typeof services?.llmClient?.requestStrategic === "function"
      ? services.llmClient.requestStrategic.bind(services.llmClient)
      : async () => ({
        fallback: true,
        data: { strategy: fallbackStrategy },
        error: "requestStrategic unavailable",
        model: "fallback",
      });
    this.pendingPromise = requestStrategic(promptContent, wantsLlm, { strategy: fallbackStrategy })
      .then((result) => {
        this.pendingResult = result;
      })
      .catch((err) => {
        this.pendingResult = {
          fallback: true,
          data: null,
          error: String(err?.message ?? err),
        };
      })
      .finally(() => {
        this.pendingPromise = null;
      });
  }
}
