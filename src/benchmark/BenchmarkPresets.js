// src/benchmark/BenchmarkPresets.js

/**
 * Benchmark scenario presets for testing AI adaptability across diverse conditions.
 *
 * Categories:
 *   terrain  — different map templates
 *   economy  — varied resource/building levels
 *   pressure — different threat/population configurations
 */

let _presetIdCounter = 0;

function cloneWorker(template, id, x, z) {
  return {
    ...template,
    id: `worker-preset-${id}`,
    x,
    z,
    vx: 0,
    vz: 0,
    hunger: 0.8 + Math.random() * 0.2,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    path: null,
    pathIndex: 0,
    targetTile: null,
  };
}

function cloneAnimal(template, id, kind, x, z) {
  return {
    ...template,
    id: `animal-preset-${id}`,
    kind,
    x,
    z,
    vx: 0,
    vz: 0,
    path: null,
    pathIndex: 0,
    targetTile: null,
  };
}

export const BENCHMARK_PRESETS = [
  // --- Terrain variants ---
  {
    id: "temperate_default",
    label: "Temperate Plains (default)",
    templateId: "temperate_plains",
    category: "terrain",
  },
  {
    id: "fortified_default",
    label: "Fortified Basin (default)",
    templateId: "fortified_basin",
    category: "terrain",
  },
  {
    id: "archipelago_default",
    label: "Archipelago Isles (default)",
    templateId: "archipelago_isles",
    category: "terrain",
  },

  // --- Economy variants ---
  {
    id: "scarce_resources",
    label: "Scarce Resources",
    templateId: "temperate_plains",
    category: "economy",
    resources: { food: 12, wood: 10 },
  },
  {
    id: "abundant_resources",
    label: "Abundant Resources",
    templateId: "temperate_plains",
    category: "economy",
    resources: { food: 120, wood: 100 },
  },
  {
    id: "developed_colony",
    label: "Developed Colony",
    templateId: "fortified_basin",
    category: "economy",
    resources: { food: 80, wood: 70 },
    buildings: { warehouses: 3, farms: 8, lumbers: 4, walls: 20, quarries: 1, kitchens: 1 },
  },

  {
    id: "resource_chains_basic",
    label: "Basic Resource Chains",
    templateId: "temperate_plains",
    category: "economy",
    resources: { food: 60, wood: 50, stone: 15, herbs: 10 },
    buildings: { warehouses: 2, farms: 4, lumbers: 3, quarries: 1, herbGardens: 1, kitchens: 1, smithies: 0, clinics: 0 },
  },
  {
    id: "full_processing",
    label: "Full Processing Chain",
    templateId: "fortified_basin",
    category: "economy",
    resources: { food: 80, wood: 60, stone: 25, herbs: 15, meals: 5, medicine: 2, tools: 1 },
    buildings: { warehouses: 3, farms: 6, lumbers: 3, quarries: 2, herbGardens: 1, kitchens: 1, smithies: 1, clinics: 1 },
  },
  {
    id: "scarce_advanced",
    label: "Scarce Advanced Resources",
    templateId: "temperate_plains",
    category: "economy",
    resources: { food: 30, wood: 25, stone: 0, herbs: 0 },
    buildings: { warehouses: 1, farms: 2, lumbers: 2, quarries: 1, herbGardens: 1, kitchens: 0, smithies: 0, clinics: 0 },
  },
  {
    id: "tooled_colony",
    label: "Tooled Colony",
    templateId: "fortified_basin",
    category: "economy",
    resources: { food: 80, wood: 70, stone: 10, tools: 3 },
    buildings: { warehouses: 2, farms: 5, lumbers: 3, quarries: 1, smithies: 1 },
  },

  // --- Pressure variants ---
  {
    id: "high_threat",
    label: "High Threat",
    templateId: "temperate_plains",
    category: "pressure",
    threat: 65,
    extraPredators: 3,
  },
  {
    id: "large_colony",
    label: "Large Colony (20 workers)",
    templateId: "fortified_basin",
    category: "pressure",
    extraWorkers: 8,
    resources: { food: 80, wood: 60 },
  },
  {
    id: "skeleton_crew",
    label: "Skeleton Crew (4 workers)",
    templateId: "temperate_plains",
    category: "pressure",
    removeWorkers: 8,
    resources: { food: 25, wood: 20 },
  },
  {
    id: "wildlife_heavy",
    label: "Wildlife Heavy",
    templateId: "archipelago_isles",
    category: "pressure",
    extraHerbivores: 6,
    extraPredators: 2,
  },
  {
    id: "storm_start",
    label: "Starting in Storm",
    templateId: "temperate_plains",
    category: "pressure",
    weather: "storm",
    weatherDuration: 30,
  },
];

/**
 * Apply a preset's modifications to a freshly created game state.
 * @param {object} state - GameState from createInitialGameState
 * @param {object} preset - One of BENCHMARK_PRESETS
 */
export function applyPreset(state, preset) {
  if (!preset) return;

  // Resources
  if (preset.resources) {
    for (const [key, val] of Object.entries(preset.resources)) {
      state.resources[key] = val;
    }
  }

  // Buildings — overrides stat counters only, does NOT modify the grid.
  // Use this to simulate a "developed" state for metric calculations.
  if (preset.buildings) {
    for (const [key, val] of Object.entries(preset.buildings)) {
      state.buildings[key] = val;
    }
  }

  // Threat
  if (preset.threat !== undefined) {
    state.gameplay.threat = preset.threat;
  }

  // Weather
  if (preset.weather) {
    state.weather.current = preset.weather;
    state.weather.timeLeftSec = preset.weatherDuration ?? 20;
  }

  // Extra workers
  if (preset.extraWorkers > 0) {
    const template = state.agents.find((a) => a.type === "WORKER");
    if (!template) {
      console.warn(`[BenchmarkPresets] No WORKER template found for cloning`);
    } else {
      for (let i = 0; i < preset.extraWorkers; i++) {
        const cx = template.x + (Math.random() - 0.5) * 4;
        const cz = template.z + (Math.random() - 0.5) * 4;
        state.agents.push(cloneWorker(template, ++_presetIdCounter, cx, cz));
      }
    }
  }

  // Remove workers (keep at least 2)
  if (preset.removeWorkers > 0) {
    const workers = state.agents.filter((a) => a.type === "WORKER");
    const maxRemovable = Math.max(0, workers.length - 2);
    const toRemove = Math.min(preset.removeWorkers, maxRemovable);
    let removed = 0;
    state.agents = state.agents.filter((a) => {
      if (a.type === "WORKER" && removed < toRemove) {
        removed++;
        return false;
      }
      return true;
    });
  }

  // Extra predators
  if (preset.extraPredators > 0) {
    const template = state.animals.find((a) => a.kind === "PREDATOR");
    if (!template) {
      console.warn(`[BenchmarkPresets] No PREDATOR template found for cloning`);
    } else {
      for (let i = 0; i < preset.extraPredators; i++) {
        const cx = template.x + (Math.random() - 0.5) * 8;
        const cz = template.z + (Math.random() - 0.5) * 8;
        state.animals.push(cloneAnimal(template, ++_presetIdCounter, "PREDATOR", cx, cz));
      }
    }
  }

  // Extra herbivores
  if (preset.extraHerbivores > 0) {
    const template = state.animals.find((a) => a.kind === "HERBIVORE");
    if (!template) {
      console.warn(`[BenchmarkPresets] No HERBIVORE template found for cloning`);
    } else {
      for (let i = 0; i < preset.extraHerbivores; i++) {
        const cx = template.x + (Math.random() - 0.5) * 6;
        const cz = template.z + (Math.random() - 0.5) * 6;
        state.animals.push(cloneAnimal(template, ++_presetIdCounter, "HERBIVORE", cx, cz));
      }
    }
  }
}
