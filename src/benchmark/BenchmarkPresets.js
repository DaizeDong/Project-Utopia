// src/benchmark/BenchmarkPresets.js

import { TILE } from "../config/constants.js";
import { inBounds, getTile, setTile, listTilesByType, rebuildBuildingStats } from "../world/grid/Grid.js";

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
    resources: { food: 8, wood: 6 },
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
    resources: { food: 80, wood: 70, stone: 15, herbs: 10 },
    buildings: { warehouses: 3, farms: 8, lumbers: 4, walls: 20, quarries: 1, kitchens: 1, smithies: 1, herbGardens: 1, clinics: 1 },
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
    resources: { food: 30, wood: 25, stone: 5, herbs: 3 },
    buildings: { warehouses: 1, farms: 2, lumbers: 2, quarries: 1, herbGardens: 1, kitchens: 0, smithies: 0, clinics: 0 },
  },
  {
    id: "tooled_colony",
    label: "Tooled Colony",
    templateId: "fortified_basin",
    category: "economy",
    resources: { food: 80, wood: 70, stone: 10, herbs: 6, tools: 3 },
    buildings: { warehouses: 2, farms: 5, lumbers: 3, quarries: 1, smithies: 1, herbGardens: 1 },
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
    resources: { food: 80, wood: 60, stone: 15, herbs: 8 },
    buildings: { quarries: 1, smithies: 1 },
  },
  {
    id: "skeleton_crew",
    label: "Skeleton Crew (3 workers)",
    templateId: "temperate_plains",
    category: "pressure",
    removeWorkers: 9,
    resources: { food: 25, wood: 20, stone: 5, herbs: 3 },
  },
  {
    id: "wildlife_heavy",
    label: "Wildlife Heavy",
    templateId: "archipelago_isles",
    category: "pressure",
    extraHerbivores: 6,
    extraPredators: 3,
  },
  {
    id: "storm_start",
    label: "Starting in Storm",
    templateId: "temperate_plains",
    category: "pressure",
    weather: "storm",
    weatherDuration: 30,
  },

  // --- Stress variants ---
  {
    id: "crisis_compound",
    label: "Compound Crisis",
    templateId: "temperate_plains",
    category: "stress",
    removeWorkers: 8,
    resources: { food: 8, wood: 6, stone: 3, herbs: 2 },
    weather: "storm",
    weatherDuration: 25,
    extraPredators: 2,
  },
  {
    id: "island_isolation",
    label: "Island Isolation",
    templateId: "archipelago_isles",
    category: "stress",
    removeWorkers: 6,
    resources: { food: 20, wood: 15, stone: 5, herbs: 3 },
  },
  {
    id: "population_boom",
    label: "Population Boom",
    templateId: "temperate_plains",
    category: "stress",
    extraWorkers: 8,
    resources: { food: 30, wood: 20, stone: 5, herbs: 3 },
  },
  {
    id: "late_game_siege",
    label: "Late Game Siege",
    templateId: "fortified_basin",
    category: "stress",
    resources: { food: 80, wood: 70, stone: 15, herbs: 10 },
    buildings: { warehouses: 3, farms: 8, lumbers: 4, walls: 20, quarries: 1, kitchens: 1, smithies: 1, herbGardens: 1, clinics: 1 },
    threat: 80,
    extraPredators: 4,
    weather: "storm",
    weatherDuration: 20,
  },
  {
    id: "no_director",
    label: "No Director (Manual)",
    templateId: "temperate_plains",
    category: "stress",
    resources: { food: 50, wood: 40, stone: 10, herbs: 6 },
    disableDirector: true,
  },

  // --- Infrastructure variants (v0.6.9) ---
  {
    id: "road_connected",
    label: "Road-Connected Colony",
    templateId: "temperate_plains",
    category: "infrastructure",
    resources: { food: 60, wood: 50, stone: 12, herbs: 8 },
    buildings: { warehouses: 2, farms: 5, lumbers: 3, quarries: 1, herbGardens: 1, roads: 15 },
  },
  {
    id: "road_disconnected",
    label: "Disconnected Buildings",
    templateId: "temperate_plains",
    category: "infrastructure",
    resources: { food: 60, wood: 50, stone: 12, herbs: 8 },
    buildings: { warehouses: 2, farms: 5, lumbers: 3, quarries: 1, herbGardens: 1, roads: 0 },
  },
  {
    id: "worker_crowded",
    label: "Worker Crowding (12 workers, 3 sites)",
    templateId: "temperate_plains",
    category: "infrastructure",
    extraWorkers: 4,
    resources: { food: 60, wood: 40 },
    buildings: { warehouses: 1, farms: 2, lumbers: 1 },
  },
  {
    id: "worker_spread",
    label: "Worker Spread (8 workers, 12 sites)",
    templateId: "temperate_plains",
    category: "infrastructure",
    resources: { food: 60, wood: 50, stone: 10, herbs: 6 },
    buildings: { warehouses: 2, farms: 4, lumbers: 3, quarries: 1, herbGardens: 1, kitchens: 1 },
  },
  {
    id: "logistics_bottleneck",
    label: "Logistics Bottleneck",
    templateId: "fortified_basin",
    category: "infrastructure",
    resources: { food: 80, wood: 70, stone: 20, herbs: 10 },
    buildings: { warehouses: 1, farms: 8, lumbers: 4, quarries: 2, herbGardens: 2, kitchens: 1, smithies: 1, clinics: 1, roads: 2 },
  },
  {
    id: "mature_roads",
    label: "Mature Road Network",
    templateId: "temperate_plains",
    category: "infrastructure",
    resources: { food: 80, wood: 60, stone: 15, herbs: 8 },
    buildings: { warehouses: 3, farms: 6, lumbers: 3, quarries: 1, herbGardens: 1, kitchens: 1, smithies: 1, roads: 25 },
  },
];

// Map building stat keys to tile types
const BUILDING_KEY_TO_TILE = {
  farms: TILE.FARM,
  lumbers: TILE.LUMBER,
  roads: TILE.ROAD,
  warehouses: TILE.WAREHOUSE,
  walls: TILE.WALL,
  quarries: TILE.QUARRY,
  herbGardens: TILE.HERB_GARDEN,
  kitchens: TILE.KITCHEN,
  smithies: TILE.SMITHY,
  clinics: TILE.CLINIC,
};

/**
 * Place building tiles on the grid to match preset building counts.
 * Searches outward from existing infrastructure (roads, warehouses, etc.)
 * to find GRASS tiles for placement.
 */
function placeBuildingsOnGrid(state, buildings) {
  const { grid } = state;

  for (const [key, count] of Object.entries(buildings)) {
    const tileType = BUILDING_KEY_TO_TILE[key];
    if (tileType === undefined || count <= 0) continue;

    // Count how many already exist on the grid
    const existing = listTilesByType(grid, [tileType]).length;
    const toPlace = Math.max(0, count - existing);
    if (toPlace <= 0) continue;

    // Find anchor points (existing infrastructure) to search from
    const anchors = listTilesByType(grid, [TILE.ROAD, TILE.WAREHOUSE, TILE.FARM, TILE.LUMBER]);
    const placed = new Set();
    let remaining = toPlace;

    // Search outward from anchors
    for (let radius = 1; radius <= 10 && remaining > 0; radius += 1) {
      for (const anchor of anchors) {
        if (remaining <= 0) break;
        for (let dz = -radius; dz <= radius && remaining > 0; dz += 1) {
          for (let dx = -radius; dx <= radius && remaining > 0; dx += 1) {
            if (Math.abs(dx) + Math.abs(dz) !== radius) continue;
            const ix = anchor.ix + dx;
            const iz = anchor.iz + dz;
            const key2 = `${ix},${iz}`;
            if (placed.has(key2)) continue;
            placed.add(key2);
            if (!inBounds(ix, iz, grid)) continue;
            if (getTile(grid, ix, iz) !== TILE.GRASS) continue;
            setTile(grid, ix, iz, tileType);
            remaining -= 1;
          }
        }
      }
    }
  }

  state.buildings = rebuildBuildingStats(grid);
}

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

  // Buildings — place actual tiles on the grid, then rebuild stats.
  if (preset.buildings) {
    placeBuildingsOnGrid(state, preset.buildings);
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
