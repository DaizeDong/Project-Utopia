const SCENARIO_SPACE = Object.freeze({
  templateId: {
    type: "categorical",
    values: [
      "temperate_plains",
      "rugged_highlands",
      "archipelago_isles",
      "coastal_ocean",
      "fertile_riverlands",
      "fortified_basin",
    ],
  },
  seed: { type: "uniform_int", min: 1, max: 2 ** 31 },
  food: { type: "log_uniform", min: 5, max: 200 },
  wood: { type: "log_uniform", min: 3, max: 150 },
  stone: { type: "uniform", min: 0, max: 40 },
  herbs: { type: "uniform", min: 0, max: 25 },
  workerDelta: { type: "uniform_int", min: -8, max: 10 },
  threat: { type: "uniform", min: 0, max: 100 },
  predators: { type: "uniform_int", min: 0, max: 6 },
  weather: { type: "categorical", values: ["clear", "storm", "drought"] },
  weatherDuration: { type: "uniform_int", min: 10, max: 40 },
});

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleParam(spec, rng) {
  switch (spec.type) {
    case "categorical":
      return spec.values[Math.floor(rng() * spec.values.length)];
    case "uniform_int":
      return spec.min + Math.floor(rng() * (spec.max - spec.min + 1));
    case "uniform":
      return spec.min + rng() * (spec.max - spec.min);
    case "log_uniform":
      return Math.exp(
        Math.log(spec.min) +
          rng() * (Math.log(spec.max) - Math.log(spec.min)),
      );
    default:
      return 0;
  }
}

export function computeDifficulty(scenario) {
  const avgResource = (scenario.food + scenario.wood) / 2;
  const scarcity = 1 - Math.min(1, avgResource / 80);
  const threatNorm = (scenario.threat ?? 0) / 100;
  const populationStress =
    scenario.workerDelta < 0 ? Math.min(1, -scenario.workerDelta / 8) : 0;
  const weatherPenalty =
    scenario.weather === "storm"
      ? 0.3
      : scenario.weather === "drought"
        ? 0.2
        : 0;
  return Math.min(
    1,
    0.35 * scarcity +
      0.25 * threatNorm +
      0.2 * populationStress +
      0.2 * weatherPenalty,
  );
}

export function scenarioToPreset(scenario) {
  const preset = {
    id: `gen_${scenario.seed}`,
    label: `Generated (D=${computeDifficulty(scenario).toFixed(2)})`,
    templateId: scenario.templateId,
    category: "generated",
    resources: {
      food: Math.round(scenario.food),
      wood: Math.round(scenario.wood),
      stone: Math.round(scenario.stone),
      herbs: Math.round(scenario.herbs),
    },
  };
  if (scenario.threat > 0) preset.threat = Math.round(scenario.threat);
  if (scenario.predators > 0) preset.extraPredators = scenario.predators;
  if (scenario.workerDelta > 0) preset.extraWorkers = scenario.workerDelta;
  if (scenario.workerDelta < 0) preset.removeWorkers = -scenario.workerDelta;
  if (scenario.weather !== "clear") {
    preset.weather = scenario.weather;
    preset.weatherDuration = scenario.weatherDuration;
  }
  return preset;
}

/**
 * Generate N scenarios with stratified difficulty sampling.
 * @param {number} count
 * @param {number} [masterSeed=12345]
 */
export function generateScenarios(count, masterSeed = 12345) {
  const BINS = ["trivial", "easy", "medium", "hard", "extreme"];
  const binRanges = [
    [0, 0.15],
    [0.15, 0.3],
    [0.3, 0.45],
    [0.45, 0.65],
    [0.65, 1.01],
  ];
  const perBin = Math.ceil(count / BINS.length);
  const results = [];
  const rng = mulberry32(masterSeed);

  for (let b = 0; b < BINS.length; b++) {
    const [lo, hi] = binRanges[b];
    let found = 0;
    let attempts = 0;
    while (found < perBin && attempts < perBin * 500) {
      attempts++;
      const scenario = {};
      for (const [key, spec] of Object.entries(SCENARIO_SPACE)) {
        scenario[key] = sampleParam(spec, rng);
      }
      const d = computeDifficulty(scenario);
      if (d >= lo && d < hi) {
        const preset = scenarioToPreset(scenario);
        results.push({ scenario, preset, difficulty: d, bin: BINS[b] });
        found++;
      }
    }
  }
  return results.slice(0, count);
}

export const EDGE_CASES = Object.freeze([
  {
    id: "edge_starvation",
    templateId: "temperate_plains",
    resources: { food: 0, wood: 10 },
    removeWorkers: 6,
    category: "edge",
  },
  {
    id: "edge_overpop",
    templateId: "temperate_plains",
    resources: { food: 15, wood: 10 },
    extraWorkers: 15,
    category: "edge",
  },
  {
    id: "edge_no_wood",
    templateId: "archipelago_isles",
    resources: { food: 50, wood: 0 },
    category: "edge",
  },
  {
    id: "edge_max_threat",
    templateId: "fortified_basin",
    resources: { food: 40, wood: 30 },
    threat: 100,
    extraPredators: 6,
    category: "edge",
  },
  {
    id: "edge_storm_scarce",
    templateId: "rugged_highlands",
    resources: { food: 10, wood: 8, stone: 2 },
    weather: "storm",
    weatherDuration: 40,
    category: "edge",
  },
]);
