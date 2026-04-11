/**
 * CrisisInjector — injects dynamic crises into running simulations
 * to test AI adaptability and response quality.
 *
 * Waits for AI to reach steady state, then injects events and measures:
 * 1. Detection lag (ticks until perceiver reflects the threat)
 * 2. Response quality (strategy adjustment coverage)
 * 3. Recovery curve (time to return to 80% baseline health)
 */

const CRISIS_TYPES = Object.freeze({
  drought: {
    label: 'Drought',
    apply(state) {
      state.weather.current = 'drought';
      state.weather.timeLeftSec = 60;
    },
    detect(perceiverOutput) {
      return perceiverOutput?.environment?.weather === 'drought'
          || perceiverOutput?.environment?.weatherType === 'drought';
    },
  },
  predator_surge: {
    label: 'Predator Surge',
    apply(state) {
      const template = state.animals.find(a => a.kind === 'PREDATOR');
      if (!template) return;
      for (let i = 0; i < 3; i++) {
        const workers = (state.agents || []).filter(a => a.type === 'WORKER' && a.alive !== false);
        const target = workers[0] || template;
        // Deterministic offset based on index
        const angle = (i / 3) * 2 * Math.PI;
        state.animals.push({
          ...template,
          id: `crisis-pred-${i}`,
          x: target.x + Math.cos(angle) * 3,
          z: target.z + Math.sin(angle) * 3,
          vx: 0, vz: 0, path: null, pathIndex: 0, targetTile: null,
        });
      }
    },
    detect(perceiverOutput) {
      return (perceiverOutput?.defense?.predatorCount ?? 0) > 2
          || (perceiverOutput?.defense?.activeSaboteurs ?? 0) > 0;
    },
  },
  resource_crash: {
    label: 'Resource Crash',
    apply(state) {
      state.resources.food = Math.max(0, state.resources.food * 0.1);
      state.resources.wood = Math.max(0, state.resources.wood * 0.1);
    },
    detect(perceiverOutput) {
      return (perceiverOutput?.economy?.food?.stock ?? 100) < 10
          || perceiverOutput?.economy?.food?.projectedZeroSec != null;
    },
  },
  epidemic: {
    label: 'Epidemic (herbs drain)',
    apply(state) {
      state.resources.herbs = 0;
      // Increase hunger on all workers
      for (const agent of state.agents) {
        if (agent.type === 'WORKER' && agent.alive !== false) {
          agent.hunger = Math.max(0, (agent.hunger ?? 0.8) - 0.3);
        }
      }
    },
    detect(perceiverOutput) {
      return (perceiverOutput?.economy?.herbs?.stock ?? 10) < 2
          || perceiverOutput?.workforce?.growthBlockers?.some(b => b.includes('herb') || b.includes('hunger'));
    },
  },
});

export { CRISIS_TYPES };

export class CrisisInjector {
  /**
   * @param {object} [opts]
   * @param {number} [opts.steadyStateThreshold=30] - Ticks of stable strategy before injection
   * @param {string[]} [opts.crisisTypes] - Types to inject (defaults to all)
   */
  constructor(opts = {}) {
    this._threshold = opts.steadyStateThreshold ?? 30;
    this._types = opts.crisisTypes ?? Object.keys(CRISIS_TYPES);
    this._injections = []; // { type, tick, baselineSnapshot, detectionLag, recoveryTicks, responseActions }
    this._currentInjection = null;
    this._steadyCount = 0;
    this._lastStrategyHash = null;
    this._injectionIndex = 0;
  }

  /**
   * Call each tick to check for steady state and manage injections.
   * @param {object} state - Game state
   * @param {number} tick - Current tick
   * @param {object} [perceiverOutput] - Latest perceiver observation (for detection tracking)
   */
  update(state, tick, perceiverOutput) {
    // Track steady state via simple strategy hash
    const hash = this._computeStrategyHash(state);
    if (hash === this._lastStrategyHash) {
      this._steadyCount++;
    } else {
      this._steadyCount = 0;
      this._lastStrategyHash = hash;
    }

    // If we have an active injection, track detection and recovery
    if (this._currentInjection) {
      this._trackInjection(state, tick, perceiverOutput);
      return;
    }

    // Check if it's time to inject
    if (this._steadyCount >= this._threshold && this._injectionIndex < this._types.length) {
      this._inject(state, tick);
    }
  }

  _computeStrategyHash(state) {
    // Simple hash: count of workers per role category
    const roles = {};
    for (const a of state.agents) {
      if (a.type === 'WORKER' && a.alive !== false) {
        const role = a.role ?? 'idle';
        roles[role] = (roles[role] ?? 0) + 1;
      }
    }
    return JSON.stringify(roles);
  }

  _inject(state, tick) {
    const typeName = this._types[this._injectionIndex];
    const crisis = CRISIS_TYPES[typeName];
    if (!crisis) return;

    // Capture baseline
    const baseline = this._captureHealth(state);

    // Apply crisis
    crisis.apply(state);

    this._currentInjection = {
      type: typeName,
      injectedAtTick: tick,
      baseline,
      detected: false,
      detectionLag: null,
      recoveryTicks: null,
      minHealth: baseline.composite,
      responseActions: 0,
    };
    this._injectionIndex++;
    this._steadyCount = 0;
  }

  _trackInjection(state, tick, perceiverOutput) {
    const inj = this._currentInjection;
    const crisis = CRISIS_TYPES[inj.type];
    const elapsed = tick - inj.injectedAtTick;

    // Track detection
    if (!inj.detected && perceiverOutput && crisis.detect(perceiverOutput)) {
      inj.detected = true;
      inj.detectionLag = elapsed;
    }

    // Track health
    const health = this._captureHealth(state);
    if (health.composite < inj.minHealth) inj.minHealth = health.composite;

    // Track recovery: reached 80% of baseline?
    if (inj.recoveryTicks == null && health.composite >= inj.baseline.composite * 0.8 && elapsed > 10) {
      inj.recoveryTicks = elapsed;
    }

    // End tracking after 300 ticks (10 seconds at 30fps)
    if (elapsed >= 300) {
      if (inj.recoveryTicks == null) inj.recoveryTicks = 300; // never recovered
      this._injections.push({ ...inj });
      this._currentInjection = null;
    }
  }

  _captureHealth(state) {
    const food = state.resources.food ?? 0;
    const wood = state.resources.wood ?? 0;
    const workers = state.agents.filter(a => a.type === 'WORKER' && a.alive !== false).length;
    const prosperity = state.gameplay?.prosperity ?? 0;
    const threat = state.gameplay?.threat ?? 0;
    const composite = (food / 100 + wood / 100 + workers / 15 + prosperity / 100 + (1 - threat / 100)) / 5;
    return { food, wood, workers, prosperity, threat, composite: Math.max(0, Math.min(1, composite)) };
  }

  /**
   * Score a single injection's response quality.
   * @returns {{ detectionScore, responseScore, recoveryScore, composite }}
   */
  scoreInjection(injection) {
    // Detection: 0-3 ticks = 1.0, >100 ticks or undetected = 0
    const detLag = injection.detectionLag ?? 300;
    const detectionScore = Math.max(0, 1 - detLag / 100);

    // Recovery: recovered in <50 ticks = 1.0, 300 ticks = 0
    const recoveryScore = Math.max(0, 1 - (injection.recoveryTicks ?? 300) / 300);

    // Depth: how much did health drop? Less drop = better
    const dropRatio = injection.baseline.composite > 0
      ? (injection.baseline.composite - injection.minHealth) / injection.baseline.composite : 0;
    const resilienceScore = Math.max(0, 1 - dropRatio);

    const composite = 0.3 * detectionScore + 0.3 * recoveryScore + 0.4 * resilienceScore;
    return {
      detectionScore: Math.round(detectionScore * 1000) / 1000,
      recoveryScore: Math.round(recoveryScore * 1000) / 1000,
      resilienceScore: Math.round(resilienceScore * 1000) / 1000,
      composite: Math.round(composite * 1000) / 1000,
    };
  }

  /**
   * Get results for all completed injections.
   */
  getResults() {
    return this._injections.map(inj => ({
      ...inj,
      scores: this.scoreInjection(inj),
    }));
  }

  /**
   * Get aggregate adaptation score across all injections.
   * @returns {number} Score in [0,1]
   */
  getAdaptationScore() {
    const results = this.getResults();
    if (results.length === 0) return 0;
    return results.reduce((sum, r) => sum + r.scores.composite, 0) / results.length;
  }
}
