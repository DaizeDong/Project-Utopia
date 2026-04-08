import { BUILD_COST } from "../../config/balance.js";
import { TILE } from "../../config/constants.js";
import { inBounds, getTile, listTilesByType, rebuildBuildingStats } from "../../world/grid/Grid.js";
import { canAfford } from "../construction/BuildAdvisor.js";
import { BuildSystem } from "../construction/BuildSystem.js";

const EVAL_INTERVAL_SEC = 5;

// Phase thresholds for colony development
const PHASE_TARGETS = Object.freeze({
  bootstrap: { farms: 3, lumbers: 2, roads: 6 },
  logistics: { warehouses: 2, farms: 4, lumbers: 3, roads: 20 },
  processing: { quarries: 1, herbGardens: 1, kitchens: 1 },
  fortification: { walls: 12, smithies: 1, clinics: 1 },
});

// Resource buffer to keep for non-emergency builds
const RESOURCE_BUFFER = Object.freeze({ wood: 10, food: 10 });

/**
 * Determine the current colony development phase based on building counts.
 * @param {object} buildings — result of rebuildBuildingStats
 * @returns {string} phase name
 */
function determinePhase(buildings) {
  const b = buildings ?? {};

  const bootstrapDone = (b.farms ?? 0) >= PHASE_TARGETS.bootstrap.farms
    && (b.lumbers ?? 0) >= PHASE_TARGETS.bootstrap.lumbers
    && (b.roads ?? 0) >= PHASE_TARGETS.bootstrap.roads;

  if (!bootstrapDone) return "bootstrap";

  const logisticsDone = (b.warehouses ?? 0) >= PHASE_TARGETS.logistics.warehouses
    && (b.farms ?? 0) >= PHASE_TARGETS.logistics.farms
    && (b.lumbers ?? 0) >= PHASE_TARGETS.logistics.lumbers
    && (b.roads ?? 0) >= PHASE_TARGETS.logistics.roads;

  if (!logisticsDone) return "logistics";

  const processingDone = (b.quarries ?? 0) >= PHASE_TARGETS.processing.quarries
    && (b.herbGardens ?? 0) >= PHASE_TARGETS.processing.herbGardens
    && (b.kitchens ?? 0) >= PHASE_TARGETS.processing.kitchens;

  if (!processingDone) return "processing";

  const fortificationDone = (b.walls ?? 0) >= PHASE_TARGETS.fortification.walls
    && (b.smithies ?? 0) >= PHASE_TARGETS.fortification.smithies
    && (b.clinics ?? 0) >= PHASE_TARGETS.fortification.clinics;

  if (!fortificationDone) return "fortification";

  return "complete";
}

/**
 * Assess colony needs and return a sorted list of build priorities.
 * @param {object} state — game state
 * @returns {Array<{type: string, priority: number, reason: string}>}
 */
export function assessColonyNeeds(state) {
  const buildings = state.buildings ?? {};
  const resources = state.resources ?? {};
  const food = resources.food ?? 0;
  const wood = resources.wood ?? 0;
  const stone = resources.stone ?? 0;
  const herbs = resources.herbs ?? 0;
  const phase = determinePhase(buildings);

  const needs = [];

  // Emergency needs (bypass resource buffer checks)
  if (food < 20) {
    needs.push({ type: "farm", priority: 100, reason: "emergency food shortage" });
  }
  if (wood < 10) {
    needs.push({ type: "lumber", priority: 95, reason: "emergency wood shortage" });
  }

  // Phase-based needs
  if (phase === "bootstrap") {
    if ((buildings.farms ?? 0) < PHASE_TARGETS.bootstrap.farms) {
      needs.push({ type: "farm", priority: 80, reason: "bootstrap: need farms" });
    }
    if ((buildings.lumbers ?? 0) < PHASE_TARGETS.bootstrap.lumbers) {
      needs.push({ type: "lumber", priority: 78, reason: "bootstrap: need lumbers" });
    }
    if ((buildings.roads ?? 0) < PHASE_TARGETS.bootstrap.roads) {
      needs.push({ type: "road", priority: 75, reason: "bootstrap: need roads" });
    }
  } else if (phase === "logistics") {
    if ((buildings.warehouses ?? 0) < PHASE_TARGETS.logistics.warehouses) {
      needs.push({ type: "warehouse", priority: 70, reason: "logistics: need warehouses" });
    }
    if ((buildings.farms ?? 0) < PHASE_TARGETS.logistics.farms) {
      needs.push({ type: "farm", priority: 68, reason: "logistics: need more farms" });
    }
    if ((buildings.lumbers ?? 0) < PHASE_TARGETS.logistics.lumbers) {
      needs.push({ type: "lumber", priority: 66, reason: "logistics: need more lumbers" });
    }
    if ((buildings.roads ?? 0) < PHASE_TARGETS.logistics.roads) {
      needs.push({ type: "road", priority: 60, reason: "logistics: need more roads" });
    }
  } else if (phase === "processing") {
    if ((buildings.quarries ?? 0) < PHASE_TARGETS.processing.quarries) {
      needs.push({ type: "quarry", priority: 55, reason: "processing: need quarry" });
    }
    if ((buildings.herbGardens ?? 0) < PHASE_TARGETS.processing.herbGardens) {
      needs.push({ type: "herb_garden", priority: 53, reason: "processing: need herb garden" });
    }
    if ((buildings.kitchens ?? 0) < PHASE_TARGETS.processing.kitchens && stone >= 3) {
      needs.push({ type: "kitchen", priority: 50, reason: "processing: need kitchen" });
    }
  } else if (phase === "fortification") {
    if ((buildings.walls ?? 0) < PHASE_TARGETS.fortification.walls) {
      needs.push({ type: "wall", priority: 45, reason: "fortification: need walls" });
    }
    if ((buildings.smithies ?? 0) < PHASE_TARGETS.fortification.smithies && stone >= 8) {
      needs.push({ type: "smithy", priority: 40, reason: "fortification: need smithy" });
    }
    if ((buildings.clinics ?? 0) < PHASE_TARGETS.fortification.clinics && herbs >= 4) {
      needs.push({ type: "clinic", priority: 38, reason: "fortification: need clinic" });
    }
  }

  // Sort by descending priority, deduplicate type (keep highest priority for each type)
  needs.sort((a, b) => b.priority - a.priority);
  const seen = new Set();
  return needs.filter((n) => {
    if (seen.has(n.type)) return false;
    seen.add(n.type);
    return true;
  });
}

/**
 * Find a valid placement tile for a given tool, searching outward from
 * existing infrastructure in Manhattan shells.
 * @param {object} state
 * @param {BuildSystem} buildSystem
 * @param {string} tool
 * @returns {{ix: number, iz: number} | null}
 */
function findPlacementTile(state, buildSystem, tool) {
  const { grid } = state;

  // Gather anchor tiles from existing infrastructure
  const anchorTypes = [TILE.ROAD, TILE.WAREHOUSE, TILE.FARM, TILE.LUMBER];
  const anchors = listTilesByType(grid, anchorTypes);

  // Build a set of already-tried coords to avoid duplicates
  const tried = new Set();

  function tryTile(ix, iz) {
    if (!inBounds(ix, iz, grid)) return null;
    const key = `${ix},${iz}`;
    if (tried.has(key)) return null;
    tried.add(key);
    const preview = buildSystem.previewToolAt(state, tool, ix, iz);
    return preview.ok ? { ix, iz } : null;
  }

  // Search outward in Manhattan shells radius 1-6 from anchor tiles
  for (let radius = 1; radius <= 6; radius += 1) {
    for (const anchor of anchors) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.abs(dx) + Math.abs(dz) !== radius) continue;
          const result = tryTile(anchor.ix + dx, anchor.iz + dz);
          if (result) return result;
        }
      }
    }
  }

  // Fallback: scan entire grid
  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      const result = tryTile(ix, iz);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Select the next build action, checking affordability with resource buffer.
 * @param {object} state
 * @returns {{type: string, priority: number, reason: string} | null}
 */
export function selectNextBuild(state) {
  const needs = assessColonyNeeds(state);
  const resources = state.resources ?? {};

  for (const need of needs) {
    const cost = BUILD_COST[need.type] ?? {};
    const isEmergency = need.priority >= 90;

    if (isEmergency) {
      if (canAfford(resources, cost)) return need;
    } else {
      // Non-emergency: maintain resource buffer
      const bufferedResources = {
        food: (resources.food ?? 0) - RESOURCE_BUFFER.food,
        wood: (resources.wood ?? 0) - RESOURCE_BUFFER.wood,
        stone: resources.stone ?? 0,
        herbs: resources.herbs ?? 0,
      };
      if (canAfford(bufferedResources, cost)) return need;
    }
  }

  return null;
}

function ensureDirectorState(state) {
  if (!state.ai) state.ai = {};
  if (!state.ai.colonyDirector) {
    state.ai.colonyDirector = {
      lastEvalSec: -Infinity,
      phase: "bootstrap",
      buildQueue: [],
      buildsPlaced: 0,
    };
  }
  return state.ai.colonyDirector;
}

export class ColonyDirectorSystem {
  constructor() {
    this.name = "ColonyDirectorSystem";
    this._buildSystem = new BuildSystem();
  }

  update(dt, state) {
    if (state.session?.phase !== "active") return;

    const director = ensureDirectorState(state);
    const nowSec = Number(state.metrics?.timeSec ?? 0);

    if (nowSec - director.lastEvalSec < EVAL_INTERVAL_SEC) return;
    director.lastEvalSec = nowSec;

    // Update phase
    director.phase = determinePhase(state.buildings ?? {});
    if (director.phase === "complete") return;

    // Select next build
    const nextBuild = selectNextBuild(state);
    if (!nextBuild) return;

    // Find placement
    const tile = findPlacementTile(state, this._buildSystem, nextBuild.type);
    if (!tile) return;

    // Place the building
    const result = this._buildSystem.placeToolAt(state, nextBuild.type, tile.ix, tile.iz, { recordHistory: false });
    if (result.ok) {
      state.buildings = rebuildBuildingStats(state.grid);
      director.buildsPlaced += 1;
      director.phase = determinePhase(state.buildings);
    }
  }
}
