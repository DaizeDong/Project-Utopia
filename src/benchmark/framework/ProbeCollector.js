/**
 * ProbeCollector — behavioral capability probes for AI evaluation.
 *
 * Each probe tests a single irreducible capability through behavioral
 * assertions rather than format checks. Probes run on SimHarness instances
 * and return continuous [0,1] scores.
 */

import { SimHarness, DT_SEC } from './SimHarness.js';

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/**
 * @typedef {object} ProbeResult
 * @property {string} id - Probe identifier
 * @property {string} label - Human-readable label
 * @property {number} score - Score in [0,1]
 * @property {object} details - Probe-specific measurements
 */

// ── Individual Probes ──────────────────────────────────────────────

/**
 * RESOURCE_TRIAGE: When food is critically low, does AI prioritize food production?
 * Setup: food=3, workers=10 baseline. Measure food worker allocation at t=30s.
 */
async function probeResourceTriage(opts = {}) {
  const harness = new SimHarness({
    templateId: opts.templateId ?? 'temperate_plains',
    seed: opts.seed ?? 42,
    aiEnabled: true,
    preset: { id: 'probe_triage', resources: { food: 3, wood: 50 }, category: 'probe' },
  });

  await harness.advanceTo(30);

  // Count workers targeting food-related tiles (farms)
  const workers = harness.aliveWorkers;
  const foodWorkers = workers.filter(w => {
    const role = w.role ?? '';
    return role.includes('FARMER') || role.includes('FOOD') || role.includes('GATHERER');
  });
  const ratio = workers.length > 0 ? foodWorkers.length / workers.length : 0;

  return {
    id: 'RESOURCE_TRIAGE',
    label: 'Resource Triage Priority',
    score: clamp01(ratio / 0.5), // 50% allocation = full score
    details: { totalWorkers: workers.length, foodWorkers: foodWorkers.length, ratio },
  };
}

/**
 * THREAT_RESPONSE: When predators appear, measure defense response latency.
 * Setup: run 60s to steady state, then inject 3 predators. Measure ticks until wall-building starts.
 */
async function probeThreatResponse(opts = {}) {
  const harness = new SimHarness({
    templateId: opts.templateId ?? 'temperate_plains',
    seed: opts.seed ?? 42,
    aiEnabled: true,
    preset: { id: 'probe_threat', resources: { food: 60, wood: 50 }, category: 'probe' },
  });

  // Run to steady state
  await harness.advanceTo(60);
  const beforeWalls = harness.state.buildings?.walls ?? 0;

  // Inject predators
  const template = harness.state.animals.find(a => a.kind === 'PREDATOR');
  if (template) {
    for (let i = 0; i < 3; i++) {
      harness.state.animals.push({
        ...template,
        id: `probe-pred-${i}`,
        x: template.x + Math.cos((i / 3) * 2 * Math.PI) * 2,
        z: template.z + Math.sin((i / 3) * 2 * Math.PI) * 2,
        vx: 0, vz: 0, path: null, pathIndex: 0, targetTile: null,
      });
    }
    harness.state.gameplay.threat = Math.min(100, (harness.state.gameplay.threat ?? 0) + 30);
  }

  // Measure response: how quickly are walls built?
  let responseTick = -1;
  const maxTicks = Math.round(60 / DT_SEC); // 60 seconds
  for (let t = 0; t < maxTicks; t++) {
    await harness.tick();
    if ((harness.state.buildings?.walls ?? 0) > beforeWalls && responseTick < 0) {
      responseTick = t;
      break;
    }
  }

  const latencySec = responseTick >= 0 ? responseTick * DT_SEC : 60;
  return {
    id: 'THREAT_RESPONSE',
    label: 'Threat Response Latency',
    score: clamp01(1 - latencySec / 60), // respond in 0s = 1.0, 60s = 0
    details: { latencySec: Math.round(latencySec * 10) / 10, wallsBefore: beforeWalls, wallsAfter: harness.state.buildings?.walls ?? 0 },
  };
}

/**
 * BOTTLENECK_ID: With many farms but no warehouse, does AI build a warehouse?
 * Setup: 8 farms, 0 warehouses. Check if AI prioritizes warehouse within 60s.
 */
async function probeBottleneckId(opts = {}) {
  const harness = new SimHarness({
    templateId: opts.templateId ?? 'temperate_plains',
    seed: opts.seed ?? 42,
    aiEnabled: true,
    preset: {
      id: 'probe_bottleneck', resources: { food: 40, wood: 60 },
      buildings: { farms: 8, warehouses: 0 }, category: 'probe',
    },
  });

  await harness.advanceTo(60);
  const warehouses = harness.state.buildings?.warehouses ?? 0;

  return {
    id: 'BOTTLENECK_ID',
    label: 'Bottleneck Identification',
    score: warehouses > 0 ? 1 : 0,
    details: { warehousesBuilt: warehouses },
  };
}

/**
 * PLAN_COHERENCE: Measure goal stability over 5 consecutive decisions.
 * Lower switch rate = more coherent planning.
 */
async function probePlanCoherence(opts = {}) {
  const harness = new SimHarness({
    templateId: opts.templateId ?? 'temperate_plains',
    seed: opts.seed ?? 42,
    aiEnabled: true,
    preset: { id: 'probe_coherence', resources: { food: 50, wood: 40 }, category: 'probe' },
  });

  const goals = [];
  const sampleInterval = Math.round(20 / DT_SEC); // every 20s

  for (let sample = 0; sample < 5; sample++) {
    await harness.advanceTo((sample + 1) * 20);
    // Capture current strategy goal from AI state
    const goal = harness.state.ai?.currentGoal
              ?? harness.state.ai?.strategyGoal
              ?? harness.state.ai?.lastDecision?.goal
              ?? 'unknown';
    goals.push(String(goal));
  }

  // Count switches
  let switches = 0;
  for (let i = 1; i < goals.length; i++) {
    if (goals[i] !== goals[i - 1]) switches++;
  }
  const switchRate = goals.length > 1 ? switches / (goals.length - 1) : 0;

  return {
    id: 'PLAN_COHERENCE',
    label: 'Plan Coherence',
    score: clamp01(1 - switchRate), // no switches = 1.0
    details: { goals, switches, switchRate },
  };
}

/**
 * ADAPTATION: After steady state, inject combined crisis and measure recovery.
 * Setup: run 60s, then storm + resource crash. Measure time to 80% health.
 */
async function probeAdaptation(opts = {}) {
  const harness = new SimHarness({
    templateId: opts.templateId ?? 'temperate_plains',
    seed: opts.seed ?? 42,
    aiEnabled: true,
    preset: { id: 'probe_adapt', resources: { food: 60, wood: 50 }, category: 'probe' },
  });

  await harness.advanceTo(60);
  const baselineSnap = harness.snapshot();

  // Inject combined crisis
  harness.state.weather.current = 'storm';
  harness.state.weather.timeLeftSec = 30;
  harness.state.resources.food = Math.max(3, harness.state.resources.food * 0.2);

  // Track recovery
  let recoveryTick = -1;
  const maxTicks = Math.round(120 / DT_SEC);
  for (let t = 0; t < maxTicks; t++) {
    await harness.tick();
    const snap = harness.snapshot();
    // Check if recovered to 80% of baseline food + wood
    const baseRes = baselineSnap.food + baselineSnap.wood;
    const currRes = snap.food + snap.wood;
    if (baseRes > 0 && currRes >= baseRes * 0.8 && recoveryTick < 0) {
      recoveryTick = t;
      break;
    }
  }

  const recoverySec = recoveryTick >= 0 ? recoveryTick * DT_SEC : 120;
  return {
    id: 'ADAPTATION',
    label: 'Crisis Adaptation',
    score: clamp01(1 - recoverySec / 120),
    details: { recoverySec: Math.round(recoverySec * 10) / 10, baselineFood: baselineSnap.food, baselineWood: baselineSnap.wood },
  };
}

/**
 * SCALING: Test efficiency across different population sizes.
 * Run same scenario with 5, 15, 25 workers. Check if resource-per-worker improves or at least stays stable.
 */
async function probeScaling(opts = {}) {
  const populations = [5, 15, 25];
  const efficiencies = [];

  for (const pop of populations) {
    const workerDelta = pop - 12; // baseline is ~12 workers
    const preset = {
      id: `probe_scale_${pop}`,
      resources: { food: 60, wood: 50 },
      category: 'probe',
    };
    if (workerDelta > 0) preset.extraWorkers = workerDelta;
    else if (workerDelta < 0) preset.removeWorkers = -workerDelta;

    const harness = new SimHarness({
      templateId: opts.templateId ?? 'temperate_plains',
      seed: opts.seed ?? 42,
      aiEnabled: true,
      preset,
    });

    const before = harness.snapshot();
    await harness.advanceTo(60);
    const after = harness.snapshot();

    const resourceGain = (after.food + after.wood) - (before.food + before.wood);
    const efficiency = after.workers > 0 ? resourceGain / after.workers : 0;
    efficiencies.push({ pop, efficiency, workers: after.workers, resourceGain });
  }

  // Score: efficiency should not collapse as population grows
  // If efficiency at 25 workers >= 50% of efficiency at 5 workers, full score
  const eff5 = efficiencies[0]?.efficiency ?? 0;
  const eff25 = efficiencies[2]?.efficiency ?? 0;
  const ratio = eff5 !== 0 ? eff25 / eff5 : (eff25 > 0 ? 1 : 0);
  const score = clamp01(ratio / 0.5); // 50% retention = full score

  return {
    id: 'SCALING',
    label: 'Population Scaling',
    score,
    details: { efficiencies },
  };
}

// ── Public API ─────────────────────────────────────────────────────

export const PROBES = Object.freeze({
  RESOURCE_TRIAGE: probeResourceTriage,
  THREAT_RESPONSE: probeThreatResponse,
  BOTTLENECK_ID: probeBottleneckId,
  PLAN_COHERENCE: probePlanCoherence,
  ADAPTATION: probeAdaptation,
  SCALING: probeScaling,
});

/**
 * Run all probes (or a subset) and return results.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.probeIds] - Subset of probe IDs to run (default: all)
 * @param {string} [opts.templateId]
 * @param {number} [opts.seed]
 * @returns {Promise<ProbeResult[]>}
 */
export async function runProbes(opts = {}) {
  const ids = opts.probeIds ?? Object.keys(PROBES);
  const results = [];
  for (const id of ids) {
    const fn = PROBES[id];
    if (!fn) continue;
    try {
      const result = await fn({ templateId: opts.templateId, seed: opts.seed });
      results.push(result);
    } catch (err) {
      results.push({ id, label: id, score: 0, details: { error: err.message } });
    }
  }
  return results;
}
