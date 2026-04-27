/**
 * Decision Trace Graph — tracks causal chains across AI pipeline phases.
 *
 * Instruments Perceiver → Planner → Executor → Evaluator interfaces
 * and performs backward attribution when negative events occur.
 */

const PHASES = ['perceiver', 'planner', 'executor', 'evaluator', 'director'];

/**
 * A single trace entry recording phase input/output at a point in time.
 */
// { tick, phase, input, output, metadata }

export class DecisionTracer {
  constructor() {
    this._traces = [];       // All trace entries
    this._faultCounts = {};  // { phase: count }
    for (const p of PHASES) this._faultCounts[p] = 0;
    this._negativeEvents = []; // Detected negative events
  }

  /**
   * Record a phase's input/output at a given tick.
   * @param {number} tick
   * @param {string} phase - One of PHASES
   * @param {object} input - What this phase received
   * @param {object} output - What this phase produced
   * @param {object} [metadata] - Extra context
   */
  record(tick, phase, input, output, metadata = {}) {
    this._traces.push({ tick, phase, input, output, metadata, timestamp: Date.now() });
  }

  /**
   * Record a negative event (population decline, resource depletion, etc).
   * @param {number} tick
   * @param {string} type - 'population_decline' | 'resource_depletion' | 'objective_failure'
   * @param {object} details
   */
  recordNegativeEvent(tick, type, details) {
    this._negativeEvents.push({ tick, type, details });
  }

  /**
   * Perform backward attribution for a negative event.
   * Walks back through the trace to find which phase is responsible.
   *
   * Attribution logic:
   * 1. Find the most recent traces before the event tick
   * 2. Check executor: did it deviate from planner instructions?
   * 3. Check planner: did it have the crisis signal in its input but ignore it?
   * 4. Check perceiver: did the raw state contain the signal but perceiver missed it?
   *
   * @param {{ tick, type, details }} event
   * @returns {{ attributedPhase: string, confidence: number, reasoning: string }}
   */
  attributeEvent(event) {
    const priorTraces = this._traces.filter(t => t.tick <= event.tick && t.tick >= event.tick - 150);
    // Group by phase, take most recent
    const latest = {};
    for (const t of priorTraces) {
      if (!latest[t.phase] || t.tick > latest[t.phase].tick) latest[t.phase] = t;
    }

    // Check executor first: did it try to execute the plan?
    const executorTrace = latest['executor'];
    const plannerTrace = latest['planner'];
    const perceiverTrace = latest['perceiver'];

    if (executorTrace && plannerTrace) {
      const planSteps = plannerTrace.output?.steps?.length ?? 0;
      const executed = executorTrace.output?.executedSteps ?? 0;
      if (planSteps > 0 && executed === 0) {
        this._faultCounts['executor']++;
        return { attributedPhase: 'executor', confidence: 0.8, reasoning: 'Plan existed but executor completed 0 steps' };
      }
    }

    // Check planner: did it receive crisis signal but not address it?
    if (plannerTrace && perceiverTrace) {
      const hasCrisisSignal = this._detectCrisisSignal(perceiverTrace.output, event.type);
      const planAddressesCrisis = this._planAddressesCrisis(plannerTrace.output, event.type);
      if (hasCrisisSignal && !planAddressesCrisis) {
        this._faultCounts['planner']++;
        return { attributedPhase: 'planner', confidence: 0.7, reasoning: 'Perceiver detected crisis but planner did not address it' };
      }
    }

    // Check perceiver: did it miss the signal entirely?
    if (perceiverTrace) {
      const hasCrisisSignal = this._detectCrisisSignal(perceiverTrace.output, event.type);
      if (!hasCrisisSignal) {
        this._faultCounts['perceiver']++;
        return { attributedPhase: 'perceiver', confidence: 0.6, reasoning: 'Crisis signal not present in perceiver output' };
      }
    }

    // Default: attribute to director for not orchestrating response
    this._faultCounts['director']++;
    return { attributedPhase: 'director', confidence: 0.4, reasoning: 'No specific phase fault identified; director failed to orchestrate' };
  }

  /** Check if perceiver output contains a signal related to the event type */
  _detectCrisisSignal(perceiverOutput, eventType) {
    if (!perceiverOutput) return false;
    switch (eventType) {
      case 'resource_depletion':
        return perceiverOutput.economy?.food?.projectedZeroSec != null
            || perceiverOutput.economy?.food?.stock < 15
            || perceiverOutput.economy?.wood?.stock < 10;
      case 'population_decline':
        return perceiverOutput.workforce?.growthBlockers?.length > 0
            || perceiverOutput.defense?.activeSaboteurs > 0;
      case 'objective_failure':
        return perceiverOutput.objective?.progressPct < 30;
      default: return false;
    }
  }

  /** Check if planner output addresses the crisis type */
  _planAddressesCrisis(plannerOutput, eventType) {
    if (!plannerOutput?.steps) return false;
    const stepTypes = plannerOutput.steps.map(s => s.type?.toLowerCase() ?? '');
    switch (eventType) {
      case 'resource_depletion':
        return stepTypes.some(t => t.includes('farm') || t.includes('lumber') || t.includes('food'));
      case 'population_decline':
        return stepTypes.some(t => t.includes('wall') || t.includes('defense') || t.includes('clinic'));
      case 'objective_failure':
        return stepTypes.some(t => t.includes('warehouse') || t.includes('objective'));
      default: return false;
    }
  }

  /**
   * Run attribution for all recorded negative events.
   * Safe to call multiple times — computes fault counts from scratch each time.
   * @returns {{ faultDistribution: Record<string, number>, attributions: object[] }}
   */
  analyzeAll() {
    // Reset fault counts before re-computing to avoid double-counting on repeated calls
    for (const p of PHASES) this._faultCounts[p] = 0;

    const attributions = this._negativeEvents.map(e => ({
      event: e,
      attribution: this.attributeEvent(e),
    }));
    const total = Object.values(this._faultCounts).reduce((a, b) => a + b, 0) || 1;
    const faultDistribution = {};
    for (const p of PHASES) {
      faultDistribution[p] = Math.round(this._faultCounts[p] / total * 100);
    }
    return { faultDistribution, attributions, totalEvents: this._negativeEvents.length };
  }

  /** Reset all state */
  reset() {
    this._traces = [];
    this._negativeEvents = [];
    for (const p of PHASES) this._faultCounts[p] = 0;
  }
}
