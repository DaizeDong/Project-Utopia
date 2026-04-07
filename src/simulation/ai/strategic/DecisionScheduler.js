/**
 * DecisionScheduler — determines when the StrategicDirector should make a new
 * decision based on heartbeat intervals, critical/significant game events, and
 * a cooldown to prevent rapid-fire triggers.
 */
export class DecisionScheduler {
  /**
   * @param {object} options
   * @param {number} [options.heartbeatSec=90]  Maximum seconds between decisions.
   * @param {number} [options.cooldownSec=15]    Minimum seconds between decisions.
   */
  constructor(options = {}) {
    this.heartbeatSec = options.heartbeatSec ?? 90;
    this.cooldownSec = options.cooldownSec ?? 15;

    this.initialized = false;
    this.lastDecisionSec = 0;
    this.lastDeathCount = 0;
    this.lastObjectiveIndex = 0;
    this.lastProsperity = 0;
    this.lastThreat = 0;
  }

  /**
   * Returns true if the StrategicDirector should make a decision now.
   * @param {object} state  Current game state snapshot.
   * @returns {boolean}
   */
  shouldTrigger(state) {
    // 1. Phase gate
    if (state.session.phase !== "active") return false;

    // 2. First call — always trigger
    if (!this.initialized) return true;

    const elapsed = state.metrics.timeSec - this.lastDecisionSec;

    // 3. Heartbeat — guaranteed trigger after interval
    if (elapsed >= this.heartbeatSec) return true;

    // 4. Cooldown — suppress everything while cooling down
    if (elapsed < this.cooldownSec) return false;

    // 5. Critical events (immediate, past cooldown)
    const { workers } = state.metrics.populationStats;
    const { food, wood } = state.resources;
    const { threat } = state.gameplay;

    if (workers === 0) return true;
    if (food <= 5) return true;
    if (wood <= 5) return true;
    if (threat >= 85) return true;

    // 6. Significant events (past cooldown)
    if (state.metrics.deathsTotal > this.lastDeathCount) return true;
    if (state.gameplay.objectiveIndex !== this.lastObjectiveIndex) return true;
    if (Math.abs(state.gameplay.prosperity - this.lastProsperity) > 15) return true;

    // 7. Nothing noteworthy
    return false;
  }

  /**
   * Snapshot current state values so the next shouldTrigger call can detect
   * changes relative to the most recent decision.
   * @param {object} state  Current game state snapshot.
   */
  recordDecision(state) {
    this.lastDecisionSec = state.metrics.timeSec;
    this.lastDeathCount = state.metrics.deathsTotal;
    this.lastObjectiveIndex = state.gameplay.objectiveIndex;
    this.lastProsperity = state.gameplay.prosperity;
    this.lastThreat = state.gameplay.threat;
    this.initialized = true;
  }
}
