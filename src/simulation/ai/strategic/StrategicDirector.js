import { DecisionScheduler } from "./DecisionScheduler.js";

export const DEFAULT_STRATEGY = {
  priority: "grow",
  resourceFocus: "balanced",
  defensePosture: "neutral",
  riskTolerance: 0.5,
  expansionDirection: "none",
  workerFocus: "balanced",
  environmentPreference: "neutral",
};

const VALID_ENUMS = {
  priority: ["survive", "grow", "defend", "complete_objective"],
  resourceFocus: ["food", "wood", "balanced"],
  defensePosture: ["aggressive", "defensive", "neutral"],
  expansionDirection: ["north", "south", "east", "west", "none"],
  workerFocus: ["farm", "wood", "deliver", "balanced"],
  environmentPreference: ["calm", "pressure", "neutral"],
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
    const { food, wood } = state.resources;
    const workers = state.metrics.populationStats?.workers ?? 0;
    const { threat, prosperity, objectiveIndex, objectives } = state.gameplay;

    // Survival checks
    if (food < 15 || workers <= 3) {
      return {
        ...DEFAULT_STRATEGY,
        priority: "survive",
        resourceFocus: "food",
        defensePosture: "defensive",
        riskTolerance: 0.2,
        workerFocus: "farm",
        environmentPreference: "calm",
      };
    }

    // Threat check
    if (threat > 75) {
      return {
        ...DEFAULT_STRATEGY,
        priority: "defend",
        defensePosture: "defensive",
        riskTolerance: 0.2,
        environmentPreference: "calm",
      };
    }

    // Near final objective with good conditions
    const totalObjectives = Array.isArray(objectives) ? objectives.length : 1;
    const nearFinal = objectiveIndex >= totalObjectives - 1;
    if (nearFinal && prosperity >= 70 && threat <= 20) {
      return {
        ...DEFAULT_STRATEGY,
        priority: "complete_objective",
        riskTolerance: 0.7,
        environmentPreference: "calm",
      };
    }

    // Resource-specific focus
    let resourceFocus = "balanced";
    let workerFocus = "balanced";
    if (wood < 15) {
      resourceFocus = "wood";
      workerFocus = "wood";
    } else if (food < 30) {
      resourceFocus = "food";
      workerFocus = "farm";
    }

    return {
      ...DEFAULT_STRATEGY,
      priority: "grow",
      resourceFocus,
      workerFocus,
    };
  }

  /**
   * Build the user prompt content for the LLM call.
   * @param {object} state
   * @returns {string} JSON string
   */
  buildPromptContent(state) {
    const payload = {
      channel: "strategic-director",
      summary: {
        timeSec: state.metrics.timeSec,
        workers: state.metrics.populationStats?.workers ?? 0,
        deaths: state.metrics.deathsTotal,
        food: state.resources.food,
        wood: state.resources.wood,
        prosperity: state.gameplay.prosperity,
        threat: state.gameplay.threat,
        objectiveIndex: state.gameplay.objectiveIndex,
        currentObjective: state.gameplay.objectives?.[state.gameplay.objectiveIndex]?.title ?? "",
        scenarioFamily: state.gameplay.scenario?.family ?? "",
        doctrine: state.gameplay.doctrine ?? "balanced",
        weather: state.weather?.current ?? "clear",
      },
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
