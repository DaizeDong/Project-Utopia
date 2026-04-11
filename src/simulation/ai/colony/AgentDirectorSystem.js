/**
 * AgentDirectorSystem — LLM-powered colony director with graceful degradation.
 *
 * Drop-in replacement for ColonyDirectorSystem. Orchestrates the full
 * Perceive → Plan → Ground → Execute → Evaluate → Reflect pipeline.
 *
 * Three modes with automatic fallback:
 *   1. "agent"       — Full LLM planning + algorithmic fallback during async calls
 *   2. "hybrid"      — Algorithmic planning enriched by past reflections
 *   3. "algorithmic" — Pure ColonyDirectorSystem (AI disabled)
 */

import { ColonyDirectorSystem } from "../../meta/ColonyDirectorSystem.js";
import { ColonyPerceiver } from "./ColonyPerceiver.js";
import { ColonyPlanner, shouldReplan, generateFallbackPlan } from "./ColonyPlanner.js";
import { groundPlan, executeNextSteps, isPlanComplete, isPlanBlocked, getPlanProgress } from "./PlanExecutor.js";
import { PlanEvaluator, snapshotState } from "./PlanEvaluator.js";
import { LearnedSkillLibrary } from "./LearnedSkillLibrary.js";
import { BuildSystem } from "../../construction/BuildSystem.js";
import { rebuildBuildingStats } from "../../../world/grid/Grid.js";

// ── Constants ────────────────────────────────────────────────────────

/** Minimum seconds between plan generation attempts */
const PLAN_INTERVAL_SEC = 2;

/** Maximum plan history entries to keep */
const MAX_PLAN_HISTORY = 20;

/** Mode selection: how many consecutive LLM failures before switching to hybrid */
const LLM_FAILURE_THRESHOLD = 3;

/** Seconds to wait before retrying LLM after failures */
const LLM_RETRY_DELAY_SEC = 60;

// ── State Initialization ────────────────────────────────────────────

function ensureAgentDirectorState(state) {
  if (!state.ai) state.ai = {};
  if (!state.ai.agentDirector) {
    state.ai.agentDirector = {
      mode: "agent",
      activePlan: null,
      planHistory: [],
      stats: {
        plansGenerated: 0,
        plansCompleted: 0,
        plansFailed: 0,
        plansSuperseded: 0,
        totalBuildingsPlaced: 0,
        reflectionsGenerated: 0,
        llmFailures: 0,
        lastLlmFailureSec: -Infinity,
      },
    };
  }
  return state.ai.agentDirector;
}

// ── Mode Selection ──────────────────────────────────────────────────

/**
 * Select operating mode based on AI state and LLM availability.
 * @param {object} state — game state
 * @param {object} agentState — state.ai.agentDirector
 * @param {boolean} hasApiKey — whether LLM API key is configured
 * @returns {"agent"|"hybrid"|"algorithmic"}
 */
export function selectMode(state, agentState, hasApiKey) {
  if (!state.ai?.enabled) return "algorithmic";

  // If no API key, can't use LLM at all
  if (!hasApiKey) return "hybrid";

  // If too many consecutive LLM failures, switch to hybrid temporarily
  const stats = agentState?.stats;
  if (stats && stats.llmFailures >= LLM_FAILURE_THRESHOLD) {
    const nowSec = state.metrics?.timeSec ?? 0;
    const sinceFailure = nowSec - (stats.lastLlmFailureSec ?? 0);
    if (sinceFailure < LLM_RETRY_DELAY_SEC) return "hybrid";
    // Enough time passed — reset and try again
    stats.llmFailures = 0;
  }

  return "agent";
}

// ── AgentDirectorSystem Class ───────────────────────────────────────

export class AgentDirectorSystem {
  /**
   * @param {object} memoryStore — MemoryStore instance
   * @param {object} [options]
   * @param {string} [options.apiKey]
   * @param {string} [options.baseUrl]
   * @param {string} [options.model]
   */
  constructor(memoryStore, options = {}) {
    this.name = "AgentDirectorSystem";

    this._memoryStore = memoryStore;
    this._fallback = new ColonyDirectorSystem();
    this._perceiver = new ColonyPerceiver();
    this._planner = new ColonyPlanner({
      apiKey: options.apiKey ?? null,
      baseUrl: options.baseUrl ?? "https://api.openai.com/v1",
      model: options.model ?? "gpt-4o-mini",
    });
    this._evaluator = new PlanEvaluator(memoryStore);
    this._learnedSkills = new LearnedSkillLibrary();
    this._buildSystem = new BuildSystem();

    // Active plan state
    this._activePlan = null;
    this._planStartSnap = null;
    this._lastPlanSec = -Infinity;
    this._pendingLLM = false;
    this._stepEvals = [];
  }

  /**
   * Main update tick — orchestrates the full agent pipeline.
   * @param {number} dt — delta time in seconds
   * @param {object} state — game state
   * @param {object} services — service container
   */
  update(dt, state, services) {
    if (state.session?.phase !== "active") return;

    const agentState = ensureAgentDirectorState(state);
    const nowSec = state.metrics?.timeSec ?? 0;

    // Determine operating mode
    const hasApiKey = !!this._planner._apiKey;
    const mode = selectMode(state, agentState, hasApiKey);
    agentState.mode = mode;

    // Algorithmic mode — delegate entirely to fallback
    if (mode === "algorithmic") {
      this._fallback.update(dt, state, services);
      return;
    }

    // Ensure fallback's build system is ready (for scenario requirements)
    this._fallback._buildSystem = this._fallback._buildSystem ?? new BuildSystem();

    // ── Step 1: Execute current plan steps ──
    if (this._activePlan && this._activePlan.steps.length > 0) {
      const preSnap = snapshotState(state);
      const executed = executeNextSteps(this._activePlan, state, this._buildSystem);
      const postSnap = snapshotState(state);

      // Evaluate each executed step
      for (const step of executed) {
        const evaluation = this._evaluator.evaluateStep(step, preSnap, postSnap, state);
        this._stepEvals.push(evaluation);

        if (step.status === "completed") {
          agentState.stats.totalBuildingsPlaced++;
        }
      }

      // Check plan completion
      if (isPlanComplete(this._activePlan)) {
        this._completePlan(agentState, state, nowSec);
      } else if (isPlanBlocked(this._activePlan, state)) {
        this._failPlan(agentState, state, nowSec, "blocked");
      }
    }

    // ── Step 2: Generate new plan if needed ──
    if (!this._activePlan && !this._pendingLLM) {
      const observation = this._perceiver.observe(state);
      const trigger = shouldReplan(nowSec, this._lastPlanSec, observation, false);

      if (trigger.should && nowSec - this._lastPlanSec >= PLAN_INTERVAL_SEC) {
        this._lastPlanSec = nowSec;

        if (mode === "agent") {
          // Async LLM call — fallback operates while waiting
          this._pendingLLM = true;
          const memText = this._memoryStore
            ? this._memoryStore.formatForPrompt("construction planning building", nowSec, 5)
            : "";
          const learnedText = this._learnedSkills.formatForPrompt(state.resources ?? {});

          this._planner.requestPlan(observation, memText, state, learnedText)
            .then(({ plan, source, error }) => {
              this._pendingLLM = false;
              if (plan && plan.steps.length > 0) {
                const grounded = groundPlan(plan, state, this._buildSystem);
                const feasible = grounded.steps.filter(s => s.feasible).length;
                if (feasible > 0) {
                  this._activePlan = grounded;
                  this._planStartSnap = snapshotState(state);
                  this._stepEvals = [];
                  agentState.stats.plansGenerated++;
                  agentState.activePlan = { goal: plan.goal, steps: plan.steps.length, source };
                } else {
                  // No feasible steps — use fallback plan inline
                  this._adoptFallbackPlan(observation, state, agentState);
                }
              } else {
                // LLM failed — track failure and use fallback
                agentState.stats.llmFailures++;
                agentState.stats.lastLlmFailureSec = nowSec;
                this._adoptFallbackPlan(observation, state, agentState);
              }
            })
            .catch(() => {
              this._pendingLLM = false;
              agentState.stats.llmFailures++;
              agentState.stats.lastLlmFailureSec = nowSec;
            });
        } else {
          // Hybrid mode — use algorithmic fallback with memory-enriched planning
          this._adoptFallbackPlan(observation, state, agentState);
        }
      }
    }

    // ── Step 3: Fallback — if no active plan, use algorithmic system ──
    if (!this._activePlan) {
      this._fallback.update(dt, state, services);
    }
  }

  /**
   * Adopt a fallback (algorithmic) plan as the active plan.
   */
  _adoptFallbackPlan(observation, state, agentState) {
    const plan = generateFallbackPlan(observation, state);
    if (plan.steps.length === 0) return;

    const grounded = groundPlan(plan, state, this._buildSystem);
    const feasible = grounded.steps.filter(s => s.feasible).length;
    if (feasible > 0) {
      this._activePlan = grounded;
      this._planStartSnap = snapshotState(state);
      this._stepEvals = [];
      agentState.stats.plansGenerated++;
      agentState.activePlan = { goal: plan.goal, steps: plan.steps.length, source: "fallback" };
    }
  }

  /**
   * Handle plan completion — evaluate overall and record history.
   */
  _completePlan(agentState, state, nowSec) {
    const planEndSnap = snapshotState(state);
    const planEval = this._evaluator.evaluatePlan(
      this._activePlan, this._planStartSnap, planEndSnap, state
    );

    // Generate batch reflections for failed steps
    if (this._stepEvals.some(e => !e.success)) {
      this._evaluator.generatePlanReflections(this._activePlan, this._stepEvals, state);
    }

    // Attempt to learn a skill from this successful plan
    const learnedId = this._learnedSkills.maybeLearnSkill(
      this._activePlan, planEval, this._stepEvals, state.grid
    );
    if (learnedId) {
      agentState.stats.skillsLearned = (agentState.stats.skillsLearned ?? 0) + 1;
    }

    agentState.stats.plansCompleted++;
    agentState.stats.reflectionsGenerated = this._evaluator.stats.reflectionsGenerated;

    // Record in history
    const progress = getPlanProgress(this._activePlan);
    agentState.planHistory.push({
      goal: this._activePlan.goal,
      success: planEval.success,
      score: planEval.overallScore,
      completed: progress.completed,
      total: progress.total,
      completedAtSec: nowSec,
    });
    if (agentState.planHistory.length > MAX_PLAN_HISTORY) {
      agentState.planHistory.shift();
    }

    this._activePlan = null;
    this._planStartSnap = null;
    this._stepEvals = [];
    agentState.activePlan = null;
  }

  /**
   * Handle plan failure — record and clear.
   */
  _failPlan(agentState, state, nowSec, reason) {
    agentState.stats.plansFailed++;

    const progress = getPlanProgress(this._activePlan);
    agentState.planHistory.push({
      goal: this._activePlan.goal,
      success: false,
      score: 0,
      completed: progress.completed,
      total: progress.total,
      completedAtSec: nowSec,
      failReason: reason,
    });
    if (agentState.planHistory.length > MAX_PLAN_HISTORY) {
      agentState.planHistory.shift();
    }

    // Write failure reflection
    if (this._memoryStore) {
      this._memoryStore.addReflection(
        nowSec,
        `Plan "${this._activePlan.goal}" was ${reason}: ${progress.completed}/${progress.total} steps completed.`
      );
      agentState.stats.reflectionsGenerated++;
    }

    this._activePlan = null;
    this._planStartSnap = null;
    this._stepEvals = [];
    agentState.activePlan = null;
  }

  /** Get combined stats from planner, evaluator, and learned skills. */
  get stats() {
    return {
      planner: this._planner.stats,
      evaluator: this._evaluator.stats,
      learnedSkills: this._learnedSkills.stats,
    };
  }

  /** Expose learned skill library for external access. */
  get learnedSkills() { return this._learnedSkills; }

  /** Expose active plan for UI/debug. */
  get activePlan() { return this._activePlan; }

  /** Expose perceiver for external observation. */
  get perceiver() { return this._perceiver; }
}
