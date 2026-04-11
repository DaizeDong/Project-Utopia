import { DecisionScheduler } from "./DecisionScheduler.js";

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

    // Near final objective
    const totalObjectives = Array.isArray(objectives) ? objectives.length : 1;
    const nearFinal = objectiveIndex >= totalObjectives - 1;
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
    const payload = {
      channel: "strategic-director",
      summary: {
        timeSec: state.metrics.timeSec,
        workers: state.metrics.populationStats?.workers ?? 0,
        deaths: state.metrics.deathsTotal,
        food: Math.round(state.resources.food),
        wood: Math.round(state.resources.wood),
        stone: Math.round(state.resources.stone ?? 0),
        herbs: Math.round(state.resources.herbs ?? 0),
        tools: Math.round(state.resources.tools ?? 0),
        meals: Math.round(state.resources.meals ?? 0),
        prosperity: Math.round(state.gameplay.prosperity),
        threat: Math.round(state.gameplay.threat),
        objectiveIndex: state.gameplay.objectiveIndex,
        currentObjective: state.gameplay.objectives?.[state.gameplay.objectiveIndex]?.title ?? "",
        scenarioFamily: state.gameplay.scenario?.family ?? "",
        doctrine: state.gameplay.doctrine ?? "balanced",
        weather: state.weather?.current ?? "clear",
        season: state.weather?.season ?? null,
      },
      buildings: {
        warehouses: buildings.warehouses ?? 0,
        farms: buildings.farms ?? 0,
        lumbers: buildings.lumbers ?? 0,
        quarries: buildings.quarries ?? 0,
        herbGardens: buildings.herbGardens ?? 0,
        kitchens: buildings.kitchens ?? 0,
        smithies: buildings.smithies ?? 0,
        clinics: buildings.clinics ?? 0,
      },
      chainStatus: {
        food: (buildings.kitchens ?? 0) > 0 ? "complete" : (buildings.farms ?? 0) >= 6 ? "ready_for_kitchen" : "building_farms",
        tools: (buildings.smithies ?? 0) > 0 ? "complete" : (buildings.quarries ?? 0) > 0 ? "ready_for_smithy" : "no_quarry",
        medical: (buildings.clinics ?? 0) > 0 ? "complete" : (buildings.herbGardens ?? 0) > 0 ? "ready_for_clinic" : "no_herbs",
      },
      instructions: `Determine the colony's strategic phase and set priorities.
Output JSON with: strategy.phase (bootstrap|growth|industrialize|process|fortify|optimize),
strategy.primaryGoal (max 80 chars), strategy.constraints (array of max 5 rules for the tactical planner),
strategy.resourceBudget ({reserveWood, reserveFood} — minimums to keep in reserve),
plus standard fields: priority, resourceFocus, defensePosture, riskTolerance, workerFocus.
Key insight: tools (quarry→smithy) multiply ALL production by 15% — high ROI.`,
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
      state.ai.strategyDecisionCount = (state.ai.strategyDecisionCount ?? 0) + 1;
      this.scheduler.recordDecision(state);
      this.pendingResult = null;
    }

    // 3. Check if a new decision should be made
    if (this.pendingPromise) return;
    if (!this.scheduler.shouldTrigger(state)) return;

    // AI disabled: synchronous fallback
    if (!state.ai.enabled) {
      const strategy = this.buildFallbackStrategy(state);
      const now = state.metrics.timeSec;
      state.ai.strategy = strategy;
      state.ai.lastStrategySource = "fallback";
      state.ai.lastStrategySec = now;
      state.ai.strategyDecisionCount = (state.ai.strategyDecisionCount ?? 0) + 1;
      this.scheduler.recordDecision(state);
      return;
    }

    // AI enabled: async LLM call
    const promptContent = this.buildPromptContent(state);
    this.pendingPromise = services.llmClient
      .requestEnvironment(promptContent, state.ai.enabled)
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
