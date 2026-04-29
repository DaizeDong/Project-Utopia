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
import { PlacementSpecialist } from "./PlacementSpecialist.js";
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

/** Sim seconds an active plan may stall on `waiting_resources` before it's killed.
 *  Why: LLM plans often front-load expensive steps and rely on production to
 *  catch up; without a grace period `isPlanBlocked` kills them on the same
 *  tick they're grounded. Tightened from 30→10 (Phase-LLM-Tune): full-system
 *  LLM benches showed plansCompleted=0/5 because plans hogged the slot for
 *  30s each while the colony fell behind. 10s is enough for resources to
 *  accumulate one production cycle. */
// v0.8.5 Tier 3: 10 → 18. 10s was less than smithyCycleSec=8 (so plans
// requiring tools always stalled before completion). 18s gives the
// tool/medicine pipelines real headroom to land.
const PLAN_STALL_GRACE_SEC = 18;

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
 *
 * Phase A wiring: an `llmClient` (proxy-routed) is now treated as equivalent
 * to a local API key for mode purposes. The HUD Autopilot toggle writes
 * `state.ai.coverageTarget` ("llm" or "fallback"); we honour that target as
 * a gate on top of the legacy `state.ai.enabled` flag so flipping Autopilot
 * deterministically switches between agent and algorithmic mode.
 *
 * @param {object} state — game state
 * @param {object} agentState — state.ai.agentDirector
 * @param {boolean} hasLlm — whether an LLM channel (apiKey or proxy client) is available
 * @returns {"agent"|"hybrid"|"algorithmic"}
 */
export function selectMode(state, agentState, hasLlm) {
  if (!state.ai?.enabled) return "algorithmic";

  // Autopilot OFF → coverageTarget="fallback" → run rule-based director only.
  // When the field is missing (older saves / tests) we fall through to the
  // legacy enabled-driven behaviour for back-compat.
  const coverageTarget = state.ai?.coverageTarget;
  if (coverageTarget === "fallback") return "algorithmic";

  // If no LLM channel available, can't use LLM at all
  if (!hasLlm) return "hybrid";

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
    this._placementSpecialist = new PlacementSpecialist({
      apiKey: options.apiKey ?? null,
      baseUrl: options.baseUrl ?? "https://api.openai.com/v1",
      model: options.model ?? "gpt-4o-mini",
    });
    this._buildSystem = new BuildSystem();

    // Active plan state
    this._activePlan = null;
    this._planStartSnap = null;
    this._lastPlanSec = -Infinity;
    this._pendingLLM = false;
    this._stepEvals = [];
    this._lastEvalText = ""; // P4: formatted evaluation from last completed plan
    this._planStalledSinceSec = null; // first sim sec the active plan was observed blocked
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

    // Determine operating mode. An LLM channel is present when either the
    // planner has a baked-in API key (test/headless path) or services exposes
    // a proxy-routed llmClient (browser runtime).
    const hasLlmChannel = !!this._planner._apiKey
      || (services && typeof services.llmClient?.requestPlan === "function");
    const mode = selectMode(state, agentState, hasLlmChannel);
    agentState.mode = mode;
    // Surface activePlan ref on agent state so HUD/panels can render plan
    // metadata even before the next plan completes.
    agentState.activePlan = this._activePlan
      ? { goal: this._activePlan.goal, steps: this._activePlan.steps.length, source: this._activePlan.source ?? "llm" }
      : (agentState.activePlan ?? null);

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
      const executed = executeNextSteps(this._activePlan, state, this._buildSystem, services);
      const postSnap = snapshotState(state);

      // Evaluate each executed step
      const planSource = this._activePlan?.source ?? "fallback";
      for (const step of executed) {
        const evaluation = this._evaluator.evaluateStep(step, preSnap, postSnap, state);
        this._stepEvals.push(evaluation);

        if (step.status === "completed") {
          agentState.stats.totalBuildingsPlaced++;
          // Phase B: attribute the placement to its plan source so panels can
          // distinguish "llm" vs "fallback" placements without an event bus.
          if (!state.ai.colonyDirector) state.ai.colonyDirector = {};
          state.ai.colonyDirector.lastBuildSource = planSource;
          state.ai.colonyDirector.lastBuildTimeSec = nowSec;
        }
      }

      // Any progress this tick resets the stall clock.
      if (executed.length > 0) {
        this._planStalledSinceSec = null;
      }

      // Check plan completion
      if (isPlanComplete(this._activePlan)) {
        this._completePlan(agentState, state, nowSec);
      } else if (isPlanBlocked(this._activePlan, state)) {
        // Grace period: a plan that's blocked because every remaining step is
        // `waiting_resources` should get PLAN_STALL_GRACE_SEC of sim time to
        // accumulate resources before we kill it. Plans whose steps lack a
        // groundedTile or fail dependencies will stay stalled and be culled
        // on the same schedule.
        if (this._planStalledSinceSec === null) this._planStalledSinceSec = nowSec;
        if (nowSec - this._planStalledSinceSec >= PLAN_STALL_GRACE_SEC) {
          this._failPlan(agentState, state, nowSec, "blocked");
        }
      } else {
        this._planStalledSinceSec = null;
      }
    }

    // ── Step 2: Generate new plan if needed ──
    // v0.8.6 Tier 1 AI-S15: pass `hasActivePlan` correctly so the crisis
    // branches (food_crisis / resource_opportunity) inside shouldReplan are
    // reachable. Pre-fix this call always passed `false`, collapsing every
    // replan to "no_active_plan" and skipping the crisis logic. With this
    // guard, an EXISTING valid plan can still abort + replan when
    // shouldReplan flags a true crisis (food crashing or resource windfall).
    const hasActivePlan = Boolean(
      this._activePlan
      && Array.isArray(this._activePlan.steps)
      && this._activePlan.steps.length > 0
      && !isPlanComplete(this._activePlan),
    );
    if (!this._pendingLLM) {
      const observation = this._perceiver.observe(state);
      const trigger = shouldReplan(nowSec, this._lastPlanSec, observation, hasActivePlan);
      // Only act when there's no active plan OR a crisis explicitly requested
      // a mid-flight replan. Heartbeat / cooldown without a crisis is a
      // no-op while a plan is already executing.
      const isCrisis = trigger.reason === "food_crisis" || trigger.reason === "resource_opportunity";
      const allowReplan = !this._activePlan || isCrisis;
      if (!allowReplan) trigger.should = false;

      if (trigger.should && nowSec - this._lastPlanSec >= PLAN_INTERVAL_SEC) {
        this._lastPlanSec = nowSec;

        if (mode === "agent") {
          // Async LLM call — fallback operates while waiting
          this._pendingLLM = true;
          const memText = this._memoryStore
            ? this._memoryStore.formatForPrompt("construction planning building", nowSec, 5)
            : "";
          const learnedText = this._learnedSkills.formatForPrompt(state.resources ?? {});
          const evalText = this._lastEvalText;

          this._lastEvalText = ""; // consume once
          // Phase A: pass the proxy-routed llmClient when available so the
          // browser path never holds an apiKey. ColonyPlanner falls back to
          // its direct callLLM path only when no llmClient is provided.
          this._planner.requestPlan(observation, memText, state, learnedText, evalText, {
            memoryStore: this._memoryStore,
            llmClient: services?.llmClient ?? null,
          })
            .then(({ plan, source, error }) => {
              this._pendingLLM = false;
              if (plan && plan.steps.length > 0) {
                const grounded = groundPlan(plan, state, this._buildSystem, services);
                const feasible = grounded.steps.filter(s => s.feasible).length;
                if (feasible > 0) {
                  this._activePlan = grounded;
                  this._planStartSnap = snapshotState(state);
                  this._stepEvals = [];
                  agentState.stats.plansGenerated++;
                  agentState.activePlan = { goal: plan.goal, steps: plan.steps.length, source };
                } else {
                  // No feasible steps — use fallback plan inline
                  this._adoptFallbackPlan(observation, state, agentState, services);
                }
              } else {
                // LLM failed — track failure and use fallback
                agentState.stats.llmFailures++;
                agentState.stats.lastLlmFailureSec = nowSec;
                this._adoptFallbackPlan(observation, state, agentState, services);
              }
            })
            .catch(() => {
              this._pendingLLM = false;
              agentState.stats.llmFailures++;
              agentState.stats.lastLlmFailureSec = nowSec;
            });
        } else {
          // Hybrid mode — use algorithmic fallback with memory-enriched planning
          this._adoptFallbackPlan(observation, state, agentState, services);
        }
      }
    }

    // ── Step 3: Hybrid fallback — keep the rule-based ColonyDirector ticking
    // alongside the active plan. Phase-LLM-Tune fix: previously fallback only
    // ran when activePlan===null, but full-system LLM benches showed colony
    // building output drops 25-40% during plan execution because the plan
    // executes ~1 step per tick while fallback would have placed many. Run
    // both: PlanExecutor handles LLM-targeted high-value placements, fallback
    // handles routine infra. They share state.resources, so when the plan is
    // resource-constrained the fallback naturally throttles. The throttle
    // rate (every-3rd-tick when plan active) keeps fallback from outpacing
    // the plan and consuming resources the plan reserved.
    if (!this._activePlan) {
      this._fallback.update(dt, state, services);
    } else if (this._fallbackThrottle === undefined) {
      this._fallbackThrottle = 0;
    }
    if (this._activePlan) {
      this._fallbackThrottle = ((this._fallbackThrottle ?? 0) + 1) % 3;
      if (this._fallbackThrottle === 0) {
        this._fallback.update(dt, state, services);
      }
    }
  }

  /**
   * Adopt a fallback (algorithmic) plan as the active plan.
   */
  _adoptFallbackPlan(observation, state, agentState, services = null) {
    const plan = generateFallbackPlan(observation, state);
    if (plan.steps.length === 0) return;

    const grounded = groundPlan(plan, state, this._buildSystem, services);
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

    // P4: Generate formatted evaluation summary for next plan request
    this._lastEvalText = this._evaluator.formatEvaluationForLLM(
      planEval, this._stepEvals, state, agentState.planHistory
    );

    this._activePlan = null;
    this._planStartSnap = null;
    this._stepEvals = [];
    this._planStalledSinceSec = null;
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
    this._planStalledSinceSec = null;
    agentState.activePlan = null;
  }

  /** Get combined stats from planner, evaluator, and learned skills. */
  get stats() {
    return {
      planner: this._planner.stats,
      evaluator: this._evaluator.stats,
      learnedSkills: this._learnedSkills.stats,
      placement: this._placementSpecialist.stats,
    };
  }

  /** Expose learned skill library for external access. */
  get learnedSkills() { return this._learnedSkills; }

  /** Expose active plan for UI/debug. */
  get activePlan() { return this._activePlan; }

  /** Expose perceiver for external observation. */
  get perceiver() { return this._perceiver; }
}
