import { BUILD_COST, BALANCE } from "../../config/balance.js";
import { emitEvent, EVENT_TYPES } from "./GameEventBus.js";
import { TILE } from "../../config/constants.js";
import { inBounds, getTile, listTilesByType, rebuildBuildingStats } from "../../world/grid/Grid.js";
import { canAfford } from "../construction/BuildAdvisor.js";
import { BuildSystem } from "../construction/BuildSystem.js";
import { getScenarioRuntime, hasInfrastructureConnection } from "../../world/scenarios/ScenarioFactory.js";
import { isFoodRunwayUnsafe } from "../economy/ResourceSystem.js";
import { RECOVERY_ESSENTIAL_TYPES, isRecoveryEssential } from "./ProgressionSystem.js";

const EVAL_INTERVAL_SEC = 2;
const HIGH_LOAD_WALL_EVAL_INTERVAL_SEC = 1.5;
const BASE_BUILDS_PER_TICK = 2;
const MAX_BUILDS_PER_TICK = 4;

// Phase thresholds for colony development
const PHASE_TARGETS = Object.freeze({
  bootstrap: { farms: 3, lumbers: 2, warehouses: 3, roads: 10 },
  logistics: { warehouses: 4, farms: 6, lumbers: 5, roads: 20 },
  processing: { quarries: 2, herbGardens: 2, kitchens: 1, smithies: 1, roads: 30 },
  fortification: { walls: 12, smithies: 1, clinics: 1 },
  expansion: { warehouses: 6, farms: 12, lumbers: 8, quarries: 3, kitchens: 2, roads: 50, walls: 20 },
});

// Protect economy while allowing steady building
const RESOURCE_BUFFER = Object.freeze({ wood: 8, food: 10 });

/**
 * Determine the current colony development phase based on building counts.
 * @param {object} buildings — result of rebuildBuildingStats
 * @returns {string} phase name
 */
function determinePhase(buildings) {
  const b = buildings ?? {};

  const bootstrapDone = (b.farms ?? 0) >= PHASE_TARGETS.bootstrap.farms
    && (b.lumbers ?? 0) >= PHASE_TARGETS.bootstrap.lumbers
    && (b.warehouses ?? 0) >= PHASE_TARGETS.bootstrap.warehouses
    && (b.roads ?? 0) >= PHASE_TARGETS.bootstrap.roads;

  if (!bootstrapDone) return "bootstrap";

  const logisticsDone = (b.warehouses ?? 0) >= PHASE_TARGETS.logistics.warehouses
    && (b.farms ?? 0) >= PHASE_TARGETS.logistics.farms
    && (b.lumbers ?? 0) >= PHASE_TARGETS.logistics.lumbers
    && (b.roads ?? 0) >= PHASE_TARGETS.logistics.roads;

  if (!logisticsDone) return "logistics";

  const processingDone = (b.quarries ?? 0) >= PHASE_TARGETS.processing.quarries
    && (b.herbGardens ?? 0) >= PHASE_TARGETS.processing.herbGardens
    && (b.kitchens ?? 0) >= PHASE_TARGETS.processing.kitchens
    && (b.smithies ?? 0) >= PHASE_TARGETS.processing.smithies
    && (b.roads ?? 0) >= PHASE_TARGETS.processing.roads;

  if (!processingDone) return "processing";

  const fortificationDone = (b.walls ?? 0) >= PHASE_TARGETS.fortification.walls
    && (b.smithies ?? 0) >= PHASE_TARGETS.fortification.smithies
    && (b.clinics ?? 0) >= PHASE_TARGETS.fortification.clinics;

  if (!fortificationDone) return "fortification";

  const expansionDone = (b.warehouses ?? 0) >= PHASE_TARGETS.expansion.warehouses
    && (b.farms ?? 0) >= PHASE_TARGETS.expansion.farms
    && (b.lumbers ?? 0) >= PHASE_TARGETS.expansion.lumbers
    && (b.quarries ?? 0) >= PHASE_TARGETS.expansion.quarries
    && (b.kitchens ?? 0) >= PHASE_TARGETS.expansion.kitchens
    && (b.roads ?? 0) >= PHASE_TARGETS.expansion.roads
    && (b.walls ?? 0) >= PHASE_TARGETS.expansion.walls;

  if (!expansionDone) return "expansion";

  return "complete";
}

/**
 * Assess colony needs and return a sorted list of build priorities.
 * Builds from ALL incomplete phases, not just the current one.
 * During logistics-1 objective, logistics buildings are boosted above processing
 * so the objective completes before optional infrastructure is built.
 * @param {object} state — game state
 * @returns {Array<{type: string, priority: number, reason: string}>}
 */
export function assessColonyNeeds(state) {
  const buildings = state.buildings ?? {};
  const resources = state.resources ?? {};
  const food = resources.food ?? 0;
  const wood = resources.wood ?? 0;

  const needs = [];

  const workers = (state.agents ?? []).filter(a => a.type === "WORKER" && a.alive !== false).length;
  const warehouseCount = buildings.warehouses ?? 0;

  // Emergency needs (bypass resource buffer checks)
  // Cap farms relative to workers — more farms than workers can operate is waste
  const maxFarmsEmergency = Math.max(5, workers);
  const currentFarms = buildings.farms ?? 0;

  // v0.10.1-r3-A5 P0-1: zero-farm safety net. Without this, the autopilot's
  // bootstrap phase emits warehouse@82 ahead of farm@80 — at t=0 wood=34
  // affords ~2 warehouses then drains, leaving the first farm un-placed
  // until food runway flips unsafe (~60-90s) and the recovery branch fires.
  // Pushing farm@99 the moment we see "0 farms exist" guarantees the colony
  // never starts a run without a single grain producer. Confined to the
  // first 180 sim-sec so the late-game expansion logic still owns farm
  // pacing once the bootstrap is done.
  if (currentFarms === 0 && Number(state.metrics?.timeSec ?? 0) < 180) {
    needs.push({ type: "farm", priority: 99, reason: "bootstrap: zero-farm safety net" });
  }

  // v0.10.1-hotfix-B (issue #7): stone-deficit safety net. Stone gates the
  // entire kitchen/smithy/clinic/bridge chain — without quarry coverage the
  // processing tier never lands. Late-game user reports "后期一直缺石头,
  // AI 不建造也不会去探索迷雾找资源点" trace back to: (a) zero quarry +
  // farm@80 spam outranks the existing quarry@77; (b) quarries exist but
  // their nodes are exhausted and no rule forces relocation. Push
  // quarry@95 (above bootstrap@82, below food@99/100) when stone is
  // critical AND no quarry exists, OR when stone is bone-dry (<5)
  // regardless of quarry count to force a relocation build onto the
  // next-best node tile. findPlacementTile already prefers nodeFlag tiles
  // (findNodeFlagTiles scans the WHOLE grid including hidden-fog tiles),
  // so the priority bump alone is enough to draw a worker to a
  // fog-occluded stone node — walking there reveals the fog implicitly.
  const stoneStock = Number(resources.stone ?? 0);
  const currentQuarries = buildings.quarries ?? 0;
  if ((currentQuarries === 0 && stoneStock < 15) || stoneStock < 5) {
    needs.push({ type: "quarry", priority: 95, reason: "safety net: stone deficit" });
  }

  // When food is low, prioritize warehouses if farm:warehouse ratio is high
  if (food < 30 && currentFarms >= 3 && warehouseCount > 0 && currentFarms / warehouseCount > 3) {
    // Too many farms per warehouse — logistics is the bottleneck
    needs.push({ type: "warehouse", priority: 100, reason: "emergency: food logistics bottleneck" });
  } else if (food < 30 && currentFarms < maxFarmsEmergency) {
    needs.push({ type: "farm", priority: 100, reason: "emergency food shortage" });
  } else if (food < 30 && warehouseCount < Math.floor(workers / 5) + 2) {
    needs.push({ type: "warehouse", priority: 100, reason: "emergency: need more warehouses" });
  }
  // Only request emergency lumber if there are actually few lumber tiles
  if (wood < 15 && (buildings.lumbers ?? 0) < 6) {
    needs.push({ type: "lumber", priority: 95, reason: "emergency wood shortage" });
  }
  // Warehouse scaling: aggressive — warehouses are the #1 factor for food production
  const prodCount = (buildings.farms ?? 0) + (buildings.lumbers ?? 0) + (buildings.quarries ?? 0) + (buildings.herbGardens ?? 0);
  const warehousesNeeded = Math.max(3, Math.floor(workers / 6) + 1, Math.floor(prodCount / 5) + 2);
  if (warehouseCount < warehousesNeeded) {
    needs.push({ type: "warehouse", priority: 92, reason: "logistics: warehouse coverage" });
  }

  const recoveryMode = Boolean(state.ai?.foodRecoveryMode) || isFoodRunwayUnsafe(state);
  if (recoveryMode) {
    if (currentFarms < maxFarmsEmergency) {
      needs.push({ type: "farm", priority: 98, reason: "recovery: restore food runway" });
    }
    if (warehouseCount < Math.floor(workers / 5) + 2) {
      needs.push({ type: "warehouse", priority: 96, reason: "recovery: restore food logistics" });
    }
    // v0.10.1-r3-A5 P0-1: also push lumber when wood is depleted, so the
    // recovery cycle can keep building farms (which cost wood). Pre-r3 the
    // recovery filter whitelisted lumber but the recovery branch never
    // pushed it, so wood=0 stalled farm placement until the bootstrap
    // branch fired again.
    if ((state.resources?.wood ?? 0) < 10 && (buildings.lumbers ?? 0) < 4) {
      needs.push({ type: "lumber", priority: 92, reason: "recovery: wood floor for farm builds" });
    }
    if ((buildings.roads ?? 0) < Math.max(6, workers)) {
      needs.push({ type: "road", priority: 88, reason: "recovery: reconnect food routes" });
    }
    needs.sort((a, b) => b.priority - a.priority);
    // v0.10.1-r3-A5 P0-1: source the whitelist from ProgressionSystem
    // (RECOVERY_ESSENTIAL_TYPES) so future edits live in one place. Same
    // set membership as before — farm/lumber/warehouse/road.
    const seenRecovery = new Set();
    return needs.filter((n) => {
      if (!isRecoveryEssential(n.type) || seenRecovery.has(n.type)) return false;
      seenRecovery.add(n.type);
      return true;
    });
  }

  // Bootstrap phase targets
  if ((buildings.warehouses ?? 0) < PHASE_TARGETS.bootstrap.warehouses) {
    needs.push({ type: "warehouse", priority: 82, reason: "bootstrap: need warehouses" });
  }
  if ((buildings.farms ?? 0) < PHASE_TARGETS.bootstrap.farms) {
    needs.push({ type: "farm", priority: 80, reason: "bootstrap: need farms" });
  }
  if ((buildings.lumbers ?? 0) < PHASE_TARGETS.bootstrap.lumbers) {
    needs.push({ type: "lumber", priority: 78, reason: "bootstrap: need lumbers" });
  }
  if ((buildings.roads ?? 0) < PHASE_TARGETS.bootstrap.roads) {
    needs.push({ type: "road", priority: 75, reason: "bootstrap: need roads" });
  }

  // Logistics phase targets
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

  // Processing buildings — build early so stone/herbs accumulate for smithy/clinic
  const needQuarry = (buildings.quarries ?? 0) < PHASE_TARGETS.processing.quarries
    || !hasAccessibleWorksite(state, [TILE.QUARRY]);
  const needHerbGarden = (buildings.herbGardens ?? 0) < PHASE_TARGETS.processing.herbGardens
    || !hasAccessibleWorksite(state, [TILE.HERB_GARDEN]);

  // v0.10.1-r1-A5 P0-4: early-game (t<300s) processing-chain boost so
  // quarry/herb_garden outrank the priority-80 farm spam in bootstrap.
  // Outside the early window the legacy 77/76 priorities are preserved.
  const earlyBoost = Number(state.metrics?.timeSec ?? 0) < 300
    ? Number(BALANCE.autopilotQuarryEarlyBoost ?? 0)
    : 0;
  if (needQuarry) {
    needs.push({ type: "quarry", priority: 77 + earlyBoost, reason: "processing: need accessible quarry" });
  }
  if (needHerbGarden) {
    needs.push({ type: "herb_garden", priority: 76 + earlyBoost, reason: "processing: need accessible herb garden" });
  }
  if ((buildings.kitchens ?? 0) < PHASE_TARGETS.processing.kitchens) {
    needs.push({ type: "kitchen", priority: 72, reason: "processing: need kitchen" });
  }
  // Smithy: highest priority after quarry — tools accelerate ALL resource production
  if ((buildings.smithies ?? 0) < PHASE_TARGETS.processing.smithies) {
    needs.push({ type: "smithy", priority: 74, reason: "processing: need smithy for tools" });
  }
  if ((buildings.roads ?? 0) < PHASE_TARGETS.processing.roads) {
    needs.push({ type: "road", priority: 55, reason: "processing: expand road network" });
  }
  if ((buildings.clinics ?? 0) < PHASE_TARGETS.fortification.clinics) {
    needs.push({ type: "clinic", priority: 68, reason: "processing: need clinic" });
  }
  if ((buildings.walls ?? 0) < PHASE_TARGETS.fortification.walls) {
    needs.push({ type: "wall", priority: 45, reason: "fortification: need walls" });
  }

  // Bridge: connect islands when water blocks logistics routes
  const waterTiles = listTilesByType(state.grid, [TILE.WATER]);
  if (waterTiles.length > 0) {
    needs.push({ type: "bridge", priority: 60, reason: "logistics: bridge water crossings" });
  }

  // Coverage-aware warehouse expansion: add warehouse if worksites are uncovered
  const worksiteTiles = listTilesByType(state.grid, [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN]);
  const warehouseTiles = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  if (worksiteTiles.length > 0 && warehouseTiles.length > 0) {
    let uncovered = 0;
    for (const ws of worksiteTiles) {
      const minDist = Math.min(...warehouseTiles.map(wh =>
        Math.abs(ws.ix - wh.ix) + Math.abs(ws.iz - wh.iz)));
      if (minDist > 12) uncovered++;
    }
    if (uncovered > 0 && uncovered / worksiteTiles.length > 0.10) {
      needs.push({ type: "warehouse", priority: 65, reason: "logistics: improve worksite coverage" });
    }
  }

  // Expansion phase targets
  if ((buildings.warehouses ?? 0) < PHASE_TARGETS.expansion.warehouses) {
    needs.push({ type: "warehouse", priority: 55, reason: "expansion: need more warehouses" });
  }
  if ((buildings.farms ?? 0) < PHASE_TARGETS.expansion.farms) {
    needs.push({ type: "farm", priority: 52, reason: "expansion: need more farms" });
  }
  if ((buildings.lumbers ?? 0) < PHASE_TARGETS.expansion.lumbers) {
    needs.push({ type: "lumber", priority: 50, reason: "expansion: need more lumbers" });
  }
  if ((buildings.quarries ?? 0) < PHASE_TARGETS.expansion.quarries) {
    needs.push({ type: "quarry", priority: 48, reason: "expansion: need more quarries" });
  }
  if ((buildings.kitchens ?? 0) < PHASE_TARGETS.expansion.kitchens) {
    needs.push({ type: "kitchen", priority: 46, reason: "expansion: need more kitchens" });
  }
  if ((buildings.roads ?? 0) < PHASE_TARGETS.expansion.roads) {
    needs.push({ type: "road", priority: 40, reason: "expansion: expand road network" });
  }
  if ((buildings.walls ?? 0) < PHASE_TARGETS.expansion.walls) {
    needs.push({ type: "wall", priority: 38, reason: "expansion: extend walls" });
  }

  // Continuous expansion — maintain balanced growth across all building types
  const farmCount = buildings.farms ?? 0;
  const lumberCount = buildings.lumbers ?? 0;
  const quarryCount = buildings.quarries ?? 0;
  const herbGardenCount = buildings.herbGardens ?? 0;
  const prodBuildings = farmCount + lumberCount + quarryCount + herbGardenCount;

  // Cap production buildings relative to workers to avoid overbuilding
  const maxFarmsForWorkers = Math.max(5, workers);
  const maxLumberForWorkers = Math.max(3, Math.floor(workers * 0.5));

  if (wood > 20 && food > 20) {
    // Balanced growth: farms and lumber should maintain ~2:1 ratio
    if (farmCount <= lumberCount * 2 && farmCount < maxFarmsForWorkers) {
      needs.push({ type: "farm", priority: 32, reason: "continuous: maintain farm:lumber ratio" });
    }
    if (lumberCount * 2 <= farmCount && lumberCount < maxLumberForWorkers) {
      needs.push({ type: "lumber", priority: 30, reason: "continuous: maintain farm:lumber ratio" });
    }
    // Quarry and herb garden every ~5 production buildings
    if (quarryCount < Math.floor(prodBuildings / 5) + 1) {
      needs.push({ type: "quarry", priority: 28, reason: "continuous: quarry scaling" });
    }
    if (herbGardenCount < Math.floor(prodBuildings / 6) + 1) {
      needs.push({ type: "herb_garden", priority: 27, reason: "continuous: herb garden scaling" });
    }
    needs.push({ type: "road", priority: 22, reason: "continuous: extra road" });
    needs.push({ type: "wall", priority: 20, reason: "continuous: extra wall" });
    // Warehouse every 10 production buildings
    const warehouseNeed = Math.floor(prodBuildings / 10) + 1;
    if ((buildings.warehouses ?? 0) < warehouseNeed) {
      needs.push({ type: "warehouse", priority: 35, reason: "continuous: warehouse coverage" });
    }
  } else if (food < 20 && farmCount < maxFarmsForWorkers) {
    // Low food: add farms only if farm:worker ratio allows
    needs.push({ type: "farm", priority: 35, reason: "continuous: food shortage" });
    // Also ensure lumber keeps up for building
    if (lumberCount < maxLumberForWorkers && lumberCount * 2 < farmCount) {
      needs.push({ type: "lumber", priority: 33, reason: "continuous: lumber for construction" });
    }
  } else if (food < 20) {
    // Too many farms but still no food — need more warehouses for logistics
    const warehouseNeed = Math.floor(prodBuildings / 8) + 2;
    if ((buildings.warehouses ?? 0) < warehouseNeed) {
      needs.push({ type: "warehouse", priority: 36, reason: "continuous: logistics bottleneck" });
    }
    // And more lumber since we can't add farms
    if (lumberCount < maxLumberForWorkers) {
      needs.push({ type: "lumber", priority: 33, reason: "continuous: diversify from farms" });
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
/**
 * Get preferred anchor types for a given building tool.
 * Worksites should be near warehouses; processing buildings near inputs.
 */
function getPreferredAnchors(state, tool) {
  const grid = state.grid;
  switch (tool) {
    case "farm":
    case "lumber":
    case "quarry":
    case "herb_garden":
      // Worksites near warehouses for short delivery paths
      return listTilesByType(grid, [TILE.WAREHOUSE]);
    case "kitchen":
      return listTilesByType(grid, [TILE.WAREHOUSE, TILE.FARM]);
    case "smithy":
      return listTilesByType(grid, [TILE.WAREHOUSE, TILE.QUARRY]);
    case "clinic":
      return listTilesByType(grid, [TILE.WAREHOUSE, TILE.HERB_GARDEN]);
    default:
      return null;
  }
}

function findPlacementTile(state, buildSystem, tool, services = null) {
  const { grid } = state;
  const tried = new Set();

  function tryTile(ix, iz) {
    if (!inBounds(ix, iz, grid)) return null;
    const key = `${ix},${iz}`;
    if (tried.has(key)) return null;
    tried.add(key);
    const preview = buildSystem.previewToolAt(state, tool, ix, iz, services);
    return preview.ok ? { ix, iz } : null;
  }

  // v0.9.3-balance — node-flag-priority placement for resource buildings.
  // Lumber/quarry/herb_garden have NODE_GATED_TOOLS gates that require an
  // adjacent FOREST/STONE/HERB nodeFlag. The legacy anchor-radius scan
  // would walk shells around existing roads/warehouses; if no such node
  // exists within radius-10 of infrastructure, AI silently dropped the
  // build. Fix: enumerate nodeFlag-bearing tiles directly first, sort by
  // distance to nearest warehouse, and try the closest. This is what
  // makes "采石场没有石头" go away — AI now seeks out stone deposits
  // wherever they are, not just where roads happen to reach.
  if (tool === "lumber" || tool === "quarry" || tool === "herb_garden") {
    const flag = tool === "lumber" ? 1 : tool === "quarry" ? 2 : 4;
    const nodeTiles = findNodeFlagTiles(grid, flag);
    const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
    if (nodeTiles.length > 0) {
      // Sort by distance to nearest warehouse so the AI builds a
      // node-near-infrastructure path even when nodes are far from roads.
      nodeTiles.sort((a, b) => {
        const da = warehouses.length > 0
          ? Math.min(...warehouses.map((w) => Math.abs(w.ix - a.ix) + Math.abs(w.iz - a.iz)))
          : 0;
        const db = warehouses.length > 0
          ? Math.min(...warehouses.map((w) => Math.abs(w.ix - b.ix) + Math.abs(w.iz - b.iz)))
          : 0;
        return da - db;
      });
      for (const t of nodeTiles) {
        const r = tryTile(t.ix, t.iz);
        if (r) return r;
      }
    }
  }

  // Phase 1: Try preferred anchors first (worksites near warehouses, etc.)
  const preferred = getPreferredAnchors(state, tool);
  if (preferred && preferred.length > 0) {
    for (let radius = 1; radius <= 4; radius += 1) {
      for (const anchor of preferred) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (Math.abs(dx) + Math.abs(dz) !== radius) continue;
            const result = tryTile(anchor.ix + dx, anchor.iz + dz);
            if (result) return result;
          }
        }
      }
    }
  }

  // Phase 2: Fall back to general infrastructure anchors (wider radius)
  const anchorTypes = [TILE.ROAD, TILE.WAREHOUSE, TILE.FARM, TILE.LUMBER, TILE.BRIDGE];
  const anchors = listTilesByType(grid, anchorTypes);

  for (let radius = 1; radius <= 10; radius += 1) {
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

  // No full grid scan — keep production buildings near existing infrastructure
  return null;
}

// v0.9.3-balance — enumerate every grid tile with a given nodeFlag bit
// set on its tileState. Used by the resource-building placement helper to
// site lumber/quarry/herb_garden directly on resource nodes regardless of
// where existing infrastructure happens to be.
function findNodeFlagTiles(grid, flag) {
  const out = [];
  if (!grid?.tileState) return out;
  const w = Number(grid.width ?? 0);
  for (const [idx, entry] of grid.tileState) {
    const flags = Number(entry?.nodeFlags ?? 0) | 0;
    if ((flags & flag) === 0) continue;
    // Only consider tiles that haven't been built on yet (oldType GRASS).
    // Tiles already converted to LUMBER/QUARRY/HERB_GARDEN preserve the
    // nodeFlag but rebuild would fail in previewToolAt anyway; skipping
    // them here keeps the loop short.
    if (Number(grid.tiles[idx]) !== TILE.GRASS) continue;
    const ix = idx % w;
    const iz = Math.floor(idx / w);
    out.push({ ix, iz });
  }
  return out;
}

// v0.9.3-balance — Bridge AI. The user reports "AI does not build bridges".
// Root cause: assessColonyNeeds proposes bridge at priority 60, which
// almost never wins when 6+ higher-priority needs are eligible. There is
// also no reachability-driven placement — workers stranded by water do
// not trigger a bridge.
//
// Fix: a small standalone proposer that runs once per ColonyDirector tick
// (independent of the priority queue). It identifies "narrow water
// crossings" — WATER tiles with ≥2 land neighbours on opposite sides —
// and places a bridge blueprint on the most useful one. Throttled by
// `lastBridgeProposalSec` so we don't spam.
function proposeBridgesForReachability(state, buildSystem, services = null) {
  const grid = state.grid;
  if (!grid) return 0;
  const director = ensureDirectorState(state);
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const lastSec = Number(director.lastBridgeProposalSec ?? -Infinity);
  if (nowSec - lastSec < 30) return 0; // throttle: at most one bridge / 30s

  const cost = BUILD_COST.bridge ?? {};
  if (!canAfford(state.resources ?? {}, cost)) return 0;

  // Find narrow water crossings: WATER tiles with passable land on at
  // least two opposite-axis neighbours. A 1-tile bridge there connects
  // two land regions across a river/strait.
  const w = Number(grid.width ?? 0);
  const h = Number(grid.height ?? 0);
  const candidates = [];
  for (let iz = 1; iz < h - 1; iz += 1) {
    for (let ix = 1; ix < w - 1; ix += 1) {
      if (grid.tiles[ix + iz * w] !== TILE.WATER) continue;
      const N = grid.tiles[ix + (iz - 1) * w];
      const S = grid.tiles[ix + (iz + 1) * w];
      const E = grid.tiles[(ix + 1) + iz * w];
      const W = grid.tiles[(ix - 1) + iz * w];
      const isLand = (t) => t !== TILE.WATER && t !== undefined;
      const NS = isLand(N) && isLand(S);
      const EW = isLand(E) && isLand(W);
      if (!NS && !EW) continue;
      // Distance to nearest warehouse — prefer crossings near the colony
      // so the bridge actually unlocks reachable production tiles.
      const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
      const distWh = warehouses.length > 0
        ? Math.min(...warehouses.map((wh) => Math.abs(wh.ix - ix) + Math.abs(wh.iz - iz)))
        : 999;
      candidates.push({ ix, iz, distWh });
    }
  }
  if (candidates.length === 0) return 0;
  candidates.sort((a, b) => a.distWh - b.distWh);

  for (const c of candidates) {
    const preview = buildSystem.previewToolAt(state, "bridge", c.ix, c.iz, services);
    if (!preview.ok) continue;
    const result = buildSystem.placeToolAt(state, "bridge", c.ix, c.iz, {
      recordHistory: false, services, owner: "autopilot", reason: "ai bridge — connect across narrow water",
    });
    if (result.ok) {
      state.buildings = rebuildBuildingStats(state.grid);
      director.lastBridgeProposalSec = nowSec;
      return 1;
    }
  }
  return 0;
}

/**
 * Find a placement tile near a specific target location.
 * @param {object} state
 * @param {BuildSystem} buildSystem
 * @param {string} tool
 * @param {{ix: number, iz: number}} target — center point to search from
 * @param {number} maxRadius
 * @returns {{ix: number, iz: number} | null}
 */
function findPlacementNear(state, buildSystem, tool, target, maxRadius = 4, services = null) {
  const { grid } = state;
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius > 0 && Math.abs(dx) + Math.abs(dz) !== radius) continue;
        const ix = target.ix + dx;
        const iz = target.iz + dz;
        if (!inBounds(ix, iz, grid)) continue;
        const preview = buildSystem.previewToolAt(state, tool, ix, iz, services);
        if (preview.ok) return { ix, iz };
      }
    }
  }
  return null;
}

/**
 * Compute a dynamic resource buffer based on the current objective.
 * After logistics-1, reserve resources for stockpile targets.
 */
function getObjectiveResourceBuffer(state) {
  const objectives = state.gameplay?.objectives ?? [];
  const objIdx = state.gameplay?.objectiveIndex ?? 0;
  const current = objectives[objIdx];
  if (!current || current.id === "logistics-1") return RESOURCE_BUFFER;

  // During stockpile/stability: reserve the full stockpile target so the Director
  // stops spending resources and lets them accumulate toward the objective
  const runtime = getScenarioRuntime(state);
  const stockpile = runtime.stockpileTargets ?? {};
  return {
    food: Math.max(RESOURCE_BUFFER.food, stockpile.food ?? 95),
    wood: Math.max(RESOURCE_BUFFER.wood, stockpile.wood ?? 90),
  };
}

// Only quarry and smithy bypass the stockpile buffer (they unlock tools
// which accelerate ALL production). Other processing buildings respect the buffer.
// Processing chain buildings bypass stockpile buffer — they unlock refined goods
const STRATEGIC_BUILD_TYPES = new Set(["quarry", "smithy", "kitchen", "herb_garden", "clinic"]);

/**
 * Select multiple affordable build actions, respecting resource buffer.
 * Strategic buildings (quarry, smithy, etc.) use the base buffer even during
 * stockpile phases, because they accelerate resource production.
 * @param {object} state
 * @param {number} maxCount
 * @param {object} buffer — override resource buffer
 * @returns {Array<{type: string, priority: number, reason: string}>}
 */
export function selectNextBuilds(state, maxCount = MAX_BUILDS_PER_TICK, buffer = RESOURCE_BUFFER) {
  const needs = assessColonyNeeds(state);
  const budgetResources = { ...(state.resources ?? {}) };
  const selected = [];

  // v0.10.1-r3-A7 P1 #5 — Goal-reached cap. Reviewer A7 observed the autopilot
  // continuing to push warehouse + farm builds well past the scenario's
  // logistics targets (warehouses 6/2, farms 17/6), turning a "victory" into a
  // sprawl. Read scenario.targets.logistics via the cached runtime view and
  // filter out any proposal whose tile-type count already meets/exceeds the
  // declared goal. We only cap NON-EMERGENCY proposals so a starvation /
  // recovery branch can still place a farm above the static goal when the
  // scenario goal is unrealistically low. The cap acts on the proposal layer
  // (not assessColonyNeeds) so existing planner unit tests stay green.
  let goalCap = null;
  try {
    const runtime = getScenarioRuntime(state);
    const targets = runtime?.logisticsTargets ?? null;
    const counts = runtime?.counts ?? null;
    if (targets && counts) {
      goalCap = {
        warehouse: { current: counts.warehouses ?? 0, goal: Number(targets.warehouses ?? 0) },
        farm:      { current: counts.farms ?? 0,      goal: Number(targets.farms ?? 0) },
        lumber:    { current: counts.lumbers ?? 0,    goal: Number(targets.lumbers ?? 0) },
        wall:      { current: counts.walls ?? 0,      goal: Number(targets.walls ?? 0) },
      };
    }
  } catch {
    // Scenario runtime unavailable (test states without scenario field) —
    // skip the cap silently and fall through to the legacy planner.
    goalCap = null;
  }
  const isGoalReached = (need) => {
    if (!goalCap) return false;
    const entry = goalCap[need.type];
    if (!entry || !(entry.goal > 0)) return false;
    return entry.current >= entry.goal;
  };

  for (const need of needs) {
    if (selected.length >= maxCount) break;
    const cost = BUILD_COST[need.type] ?? {};
    const isEmergency = need.priority >= 90;
    const isStrategic = STRATEGIC_BUILD_TYPES.has(need.type);

    // Goal-reached cap: skip non-emergency builds whose scenario goal is met.
    // Emergency-priority needs (food crisis, recovery) bypass the cap because
    // the colony's survival outranks "tidy goal counts".
    if (!isEmergency && isGoalReached(need)) continue;

    // Strategic builds use the base buffer (not the stockpile-inflated buffer)
    const effectiveBuffer = isStrategic ? RESOURCE_BUFFER : buffer;
    // Emergency builds still keep a small wood floor to prevent total depletion
    const emergencyFloor = { food: 3, wood: 5 };
    const checkResources = isEmergency ? {
      food: (budgetResources.food ?? 0) - emergencyFloor.food,
      wood: (budgetResources.wood ?? 0) - emergencyFloor.wood,
      stone: budgetResources.stone ?? 0,
      herbs: budgetResources.herbs ?? 0,
    } : {
      food: (budgetResources.food ?? 0) - effectiveBuffer.food,
      wood: (budgetResources.wood ?? 0) - effectiveBuffer.wood,
      stone: budgetResources.stone ?? 0,
      herbs: budgetResources.herbs ?? 0,
    };

    if (canAfford(checkResources, cost)) {
      selected.push(need);
      for (const [res, amount] of Object.entries(cost)) {
        budgetResources[res] = (budgetResources[res] ?? 0) - amount;
      }
    }
  }

  return selected;
}

// Keep backward-compatible export
export function selectNextBuild(state) {
  const builds = selectNextBuilds(state, 1);
  return builds.length > 0 ? builds[0] : null;
}

/**
 * Check if any tile of the given types is within reasonable distance of a warehouse.
 * If not, the Director should build new ones near existing infrastructure.
 */
function hasAccessibleWorksite(state, tileTypes, maxDistance = 12) {
  const tiles = listTilesByType(state.grid, tileTypes);
  if (tiles.length === 0) return false;
  const warehouses = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  if (warehouses.length === 0) return false;
  return tiles.some((t) =>
    warehouses.some((w) => Math.abs(w.ix - t.ix) + Math.abs(w.iz - t.iz) <= maxDistance),
  );
}

function ensureDirectorState(state) {
  if (!state.ai) state.ai = {};
  if (!state.ai.colonyDirector) {
    state.ai.colonyDirector = {
      lastEvalSec: -Infinity,
      lastEvalWallSec: -Infinity,
      phase: "bootstrap",
      buildQueue: [],
      buildsPlaced: 0,
      skippedByWallRate: 0,
    };
  }
  return state.ai.colonyDirector;
}

function getHighLoadPressure(state) {
  const entityCount = (state.agents?.length ?? 0) + (state.animals?.length ?? 0);
  const targetScale = Number(state.controls?.timeScale ?? 1);
  return {
    active: entityCount >= 700 || targetScale >= 7 || Boolean(state.controls?.longRunMode),
    entityCount,
    targetScale,
  };
}

/**
 * Check scenario route/depot requirements and place infrastructure to satisfy them.
 * Routes need connected road paths between anchors.
 * Depots need warehouses within radius of anchor points.
 */
function fulfillScenarioRequirements(state, buildSystem, services = null) {
  let placed = 0;
  const runtime = getScenarioRuntime(state);
  const resources = state.resources ?? {};

  // 1. Depot zones: place warehouses near unready depot anchors
  for (const depot of runtime.depots) {
    if (depot.ready) continue;
    const anchor = state.gameplay?.scenario?.anchors?.[depot.anchor];
    if (!anchor) continue;
    const cost = BUILD_COST.warehouse ?? {};
    if (!canAfford(resources, cost)) continue;

    const tile = findPlacementNear(state, buildSystem, "warehouse", anchor, depot.radius ?? 2, services);
    if (tile) {
      const result = buildSystem.placeToolAt(state, "warehouse", tile.ix, tile.iz, {
        recordHistory: false, services, owner: "scenario_repair", reason: "scenario depot requirement",
      });
      if (result.ok) {
        state.buildings = rebuildBuildingStats(state.grid);
        placed += 1;
      }
    }
  }

  // 2. Route links: fill gap tiles then Manhattan-walk to connect disconnected routes
  for (const route of runtime.routes) {
    if (route.connected) continue;
    const gaps = route.gapTiles ?? [];
    const cost = BUILD_COST.road ?? {};

    // 2a. Place roads on specified gap tiles
    for (const gap of gaps) {
      if (!canAfford(resources, cost)) break;
      if (!inBounds(gap.ix, gap.iz, state.grid)) continue;

      // If gap tile is blocked (wall, ruins, etc.), erase it first
      // Never erase warehouses or production buildings — too valuable
      const currentTile = getTile(state.grid, gap.ix, gap.iz);
      const protectedTiles = new Set([TILE.WAREHOUSE, TILE.FARM, TILE.LUMBER, TILE.QUARRY,
        TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC]);
      if (currentTile !== TILE.GRASS && currentTile !== TILE.ROAD && !protectedTiles.has(currentTile)) {
        const erasePreview = buildSystem.previewToolAt(state, "erase", gap.ix, gap.iz, services);
        if (erasePreview.ok) {
          buildSystem.placeToolAt(state, "erase", gap.ix, gap.iz, {
            recordHistory: false, services, owner: "scenario_repair", reason: "clear scenario route gap",
          });
          state.buildings = rebuildBuildingStats(state.grid);
        }
      }

      const preview = buildSystem.previewToolAt(state, "road", gap.ix, gap.iz, services);
      if (preview.ok) {
        const result = buildSystem.placeToolAt(state, "road", gap.ix, gap.iz, {
          recordHistory: false, services, owner: "scenario_repair", reason: "scenario route requirement",
        });
        if (result.ok) {
          state.buildings = rebuildBuildingStats(state.grid);
          placed += 1;
        }
      }
    }

    // 2b. Manhattan walk from→to to fill any remaining gaps
    const fromAnchor = state.gameplay?.scenario?.anchors?.[route.from];
    const toAnchor = state.gameplay?.scenario?.anchors?.[route.to];
    if (!fromAnchor || !toAnchor) continue;

    // Re-check connection after gap tile placement
    if (hasInfrastructureConnection(state.grid, fromAnchor, toAnchor)) continue;

    let current = { ...fromAnchor };
    const maxSteps = Math.abs(toAnchor.ix - fromAnchor.ix) + Math.abs(toAnchor.iz - fromAnchor.iz) + 4;
    for (let step = 0; step < maxSteps; step += 1) {
      if (!canAfford(resources, cost)) break;
      const dx = toAnchor.ix - current.ix;
      const dz = toAnchor.iz - current.iz;
      if (dx === 0 && dz === 0) break;

      const nextIx = current.ix + (Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 1 : -1) : 0);
      const nextIz = current.iz + (Math.abs(dz) > Math.abs(dx) ? (dz > 0 ? 1 : -1) : 0);
      if (!inBounds(nextIx, nextIz, state.grid)) break;

      const tile = getTile(state.grid, nextIx, nextIz);
      if (tile !== TILE.ROAD && tile !== TILE.WAREHOUSE && tile !== TILE.LUMBER && tile !== TILE.BRIDGE) {
        // Water tiles get bridges instead of roads
        if (tile === TILE.WATER) {
          const bridgeCost = BUILD_COST.bridge ?? {};
          if (canAfford(resources, bridgeCost)) {
            const preview = buildSystem.previewToolAt(state, "bridge", nextIx, nextIz, services);
            if (preview.ok) {
              const result = buildSystem.placeToolAt(state, "bridge", nextIx, nextIz, {
                recordHistory: false, services, owner: "scenario_repair", reason: "scenario route bridge",
              });
              if (result.ok) {
                state.buildings = rebuildBuildingStats(state.grid);
                placed += 1;
              }
            }
          }
        } else {
          // Erase non-buildable tiles first — never erase production buildings
          const protectedManhattan = new Set([TILE.WAREHOUSE, TILE.FARM, TILE.LUMBER, TILE.QUARRY,
            TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC]);
          if (tile !== TILE.GRASS && tile !== TILE.RUINS && !protectedManhattan.has(tile)) {
            const erasePreview = buildSystem.previewToolAt(state, "erase", nextIx, nextIz, services);
            if (erasePreview.ok) {
              buildSystem.placeToolAt(state, "erase", nextIx, nextIz, {
                recordHistory: false, services, owner: "scenario_repair", reason: "clear scenario route tile",
              });
              state.buildings = rebuildBuildingStats(state.grid);
            }
          }
          const preview = buildSystem.previewToolAt(state, "road", nextIx, nextIz, services);
          if (preview.ok) {
            const result = buildSystem.placeToolAt(state, "road", nextIx, nextIz, {
              recordHistory: false, services, owner: "scenario_repair", reason: "scenario route repair",
            });
            if (result.ok) {
              state.buildings = rebuildBuildingStats(state.grid);
              placed += 1;
            }
          }
        }
      }
      current = { ix: nextIx, iz: nextIz };
    }
  }

  return placed;
}

/**
 * Find the best placement for a coverage warehouse — near the centroid of uncovered worksites.
 */
function findCoverageWarehousePlacement(state, buildSystem, services = null) {
  const worksiteTiles = listTilesByType(state.grid, [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN]);
  const warehouseTiles = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  if (worksiteTiles.length === 0 || warehouseTiles.length === 0) return null;

  // Find uncovered worksites (> 10 Manhattan from any warehouse)
  const uncovered = worksiteTiles.filter(ws =>
    Math.min(...warehouseTiles.map(wh => Math.abs(ws.ix - wh.ix) + Math.abs(ws.iz - wh.iz))) > 10
  );
  if (uncovered.length === 0) return null;

  // Place warehouse near the centroid of uncovered worksites
  const cx = Math.round(uncovered.reduce((s, t) => s + t.ix, 0) / uncovered.length);
  const cz = Math.round(uncovered.reduce((s, t) => s + t.iz, 0) / uncovered.length);
  return findPlacementNear(state, buildSystem, "warehouse", { ix: cx, iz: cz }, 6, services);
}

/**
 * Build roads to connect isolated worksites to nearest warehouse.
 * Runs at most 2 road segments per tick to avoid resource drain.
 */
function connectWorksitesToWarehouses(state, buildSystem, services = null) {
  const resources = state.resources ?? {};
  const cost = BUILD_COST.road ?? {};
  // Only build connector roads when wood is sufficient (>20) to avoid resource drain
  if ((resources.wood ?? 0) < 20) return;

  const worksiteTiles = listTilesByType(state.grid, [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN]);
  const warehouseTiles = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  if (worksiteTiles.length === 0 || warehouseTiles.length === 0) return;

  let placed = 0;
  for (const ws of worksiteTiles) {
    if (placed >= 2) break;

    // Find nearest warehouse
    let nearestWh = null;
    let nearestDist = Infinity;
    for (const wh of warehouseTiles) {
      const d = Math.abs(ws.ix - wh.ix) + Math.abs(ws.iz - wh.iz);
      if (d < nearestDist) { nearestDist = d; nearestWh = wh; }
    }
    if (!nearestWh || nearestDist <= 3) continue; // already connected or adjacent

    // Check if there's a road gap — walk from worksite toward warehouse, look for first missing road tile
    const dx = nearestWh.ix - ws.ix;
    const dz = nearestWh.iz - ws.iz;
    const stepX = dx !== 0 ? (dx > 0 ? 1 : -1) : 0;
    const stepZ = dz !== 0 ? (dz > 0 ? 1 : -1) : 0;

    let cx = ws.ix;
    let cz = ws.iz;
    for (let step = 0; step < nearestDist && placed < 2; step++) {
      // Move toward warehouse (prefer longer axis)
      if (Math.abs(nearestWh.ix - cx) >= Math.abs(nearestWh.iz - cz)) {
        cx += stepX;
      } else {
        cz += stepZ;
      }
      if (!inBounds(cx, cz, state.grid)) break;

      const tile = getTile(state.grid, cx, cz);
      if (tile === TILE.GRASS) {
        if (!canAfford(resources, cost)) break;
        const preview = buildSystem.previewToolAt(state, "road", cx, cz, services);
        if (preview.ok) {
          const result = buildSystem.placeToolAt(state, "road", cx, cz, {
            recordHistory: false, services, owner: "rule_automation", reason: "connect isolated worksite",
          });
          if (result.ok) {
            state.buildings = rebuildBuildingStats(state.grid);
            placed++;
          }
        }
      }
      // Stop at first non-grass/non-road obstacle
      if (tile !== TILE.GRASS && tile !== TILE.ROAD && tile !== TILE.BRIDGE) break;
    }
  }
}

export class ColonyDirectorSystem {
  constructor() {
    this.name = "ColonyDirectorSystem";
    this._buildSystem = new BuildSystem();
  }

  update(dt, state, services) {
    if (state.session?.phase !== "active") return;

    const director = ensureDirectorState(state);
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const highLoad = getHighLoadPressure(state);
    const wallSec = Number(state.metrics?.wallTimeSec ?? 0);
    if (
      highLoad.active
      && Number.isFinite(wallSec)
      && wallSec - Number(director.lastEvalWallSec ?? -Infinity) < HIGH_LOAD_WALL_EVAL_INTERVAL_SEC
    ) {
      director.skippedByWallRate = Number(director.skippedByWallRate ?? 0) + 1;
      return;
    }

    if (nowSec - director.lastEvalSec < EVAL_INTERVAL_SEC) return;
    director.lastEvalSec = nowSec;
    director.lastEvalWallSec = wallSec;

    // Update phase
    director.phase = determinePhase(state.buildings ?? {});
    const autopilotEnabled = Boolean(state.ai?.enabled);
    const scenarioRepairAllowed = autopilotEnabled || Boolean(state.ai?.allowScenarioRepairWhenAutopilotOff);
    director.automation = {
      autopilotEnabled,
      scenarioRepairAllowed,
      phaseBuilder: autopilotEnabled ? "active" : "off",
      connectorBuilder: autopilotEnabled ? "active" : "off",
    };

    // Priority 1: fulfill scenario objectives (routes, depots)
    const scenarioBuilds = scenarioRepairAllowed
      ? fulfillScenarioRequirements(state, this._buildSystem, services)
      : 0;
    director.buildsPlaced += scenarioBuilds;

    if (!autopilotEnabled) return;

    // v0.9.3-balance — Priority 1.5: bridge AI. The user reports "AI does
    // not build bridges". Run a small reachability-driven proposer that
    // bypasses the priority queue (where bridge@60 routinely loses to
    // expansion@70+ needs). Throttled internally to ≤1 bridge / 30 sim-s
    // and only fires when affordable. Runs only when autopilot is on so
    // a manual player can still place bridges where they want.
    const bridgeBuilds = proposeBridgesForReachability(state, this._buildSystem, services);
    if (bridgeBuilds > 0) {
      director.buildsPlaced += bridgeBuilds;
      director.lastBuildSource = "fallback";
      director.lastBuildTimeSec = nowSec;
    }

    // Priority 2: phase-based colony development (including expansion after complete)
    // Scale build rate with colony resources — build faster when resources are abundant
    const wood = state.resources?.wood ?? 0;
    const food = state.resources?.food ?? 0;
    const normalBuildsPerTick = (wood > 50 && food > 30) ? MAX_BUILDS_PER_TICK
      : (wood > 20 && food > 15) ? 3 : BASE_BUILDS_PER_TICK;
    const buildsPerTick = highLoad.active
      ? Math.min(2, normalBuildsPerTick)
      : normalBuildsPerTick;
    const builds = selectNextBuilds(state, buildsPerTick, getObjectiveResourceBuffer(state));
    for (const build of builds) {
      let tile = null;

      // Smart placement: warehouses for coverage go near uncovered worksites
      if (build.type === "warehouse" && build.reason.includes("coverage")) {
        tile = findCoverageWarehousePlacement(state, this._buildSystem, services);
      }

      if (!tile) tile = findPlacementTile(state, this._buildSystem, build.type, services);
      if (!tile) continue;

      const result = this._buildSystem.placeToolAt(state, build.type, tile.ix, tile.iz, {
        recordHistory: false, services, owner: "autopilot", reason: build.reason,
      });
      if (result.ok) {
        state.buildings = rebuildBuildingStats(state.grid);
        // v0.8.6 Tier 0 LR-C3: only count COMPLETED placements toward
        // buildsPlaced. Pre-fix the counter incremented on every "blueprint"
        // submission so a 33-blueprint queue with 0 actual completions still
        // reported buildsPlaced=33 — confused autopilot diagnostics. Blueprint
        // submissions are tracked separately via blueprintsSubmitted.
        if (result.phase === "complete") {
          director.buildsPlaced += 1;
        } else {
          director.blueprintsSubmitted = Number(director.blueprintsSubmitted ?? 0) + 1;
        }
        // Phase B: attribute placement source so HUD/panels can distinguish
        // rule-based ColonyDirector builds from LLM-driven AgentDirector ones.
        // ColonyDirector is always the rule-based fallback path, so tag as
        // "fallback" here. AgentDirector tags its own LLM step placements.
        director.lastBuildSource = "fallback";
        director.lastBuildTimeSec = nowSec;
        emitEvent(state, EVENT_TYPES.BUILDING_PLACED, {
          buildingType: build.type, ix: tile.ix, iz: tile.iz, reason: build.reason, owner: "autopilot",
        });
      }
    }

    // Priority 3: connect isolated worksites to warehouses with roads
    connectWorksitesToWarehouses(state, this._buildSystem, services);

    // Update phase after all builds
    director.phase = determinePhase(state.buildings);
  }
}
