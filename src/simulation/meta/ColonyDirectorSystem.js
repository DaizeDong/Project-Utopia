import { BALANCE, BUILD_COST } from "../../config/balance.js";
import { emitEvent, EVENT_TYPES } from "./GameEventBus.js";
import { TILE } from "../../config/constants.js";
import { inBounds, getTile, listTilesByType, rebuildBuildingStats } from "../../world/grid/Grid.js";
import { canAfford } from "../construction/BuildAdvisor.js";
import { BuildSystem } from "../construction/BuildSystem.js";
import { getScenarioRuntime, hasInfrastructureConnection } from "../../world/scenarios/ScenarioFactory.js";
import { isRecoveryEssential } from "./ProgressionSystem.js";
import {
  runProposers,
  DEFAULT_BUILD_PROPOSERS,
  WAVE_2_BUILD_PROPOSERS,
  isRecoveryMode,
} from "../ai/colony/BuildProposer.js";
import { proposeBridgesForReachability } from "../ai/colony/proposers/BridgeProposer.js";
import { proposeScoutRoadTowardFoggedStone } from "../ai/colony/proposers/ScoutRoadProposer.js";

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

  // v0.10.1 R5 wave-1 (C1-build-proposer refactor):
  // The four priority-95+ "safety net" if-blocks (zero-farm @99,
  // zero-lumber @95, zero-quarry @95, emergency-shortage food/wood) +
  // R6 WarehouseNeedProposer @90 are emitted by DEFAULT_BUILD_PROPOSERS
  // (locked by test/build-proposer-orchestration.test.js).
  //
  // v0.10.1 R6 wave-2 (C1-code-architect refactor):
  // The recovery / bootstrap / logistics / processing branches were
  // extracted into WAVE_2_BUILD_PROPOSERS. Recovery short-circuit
  // semantics (sort + RECOVERY_ESSENTIAL_TYPES filter + early return)
  // are preserved by the orchestrator: when isRecoveryMode(state) is
  // true we ONLY run RecoveryProposer, then sort+filter+return — same
  // as the legacy `if (recoveryMode) { ... return; }` block.
  const proposerCtx = {
    workers,
    food,
    wood,
    buildings,
    resources,
    timeSec: Number(state.metrics?.timeSec ?? 0),
  };
  const earlyNeeds = runProposers(DEFAULT_BUILD_PROPOSERS, state, proposerCtx);
  needs.push(...earlyNeeds);
  // Warehouse scaling: aggressive — warehouses are the #1 factor for food production
  const prodCount = (buildings.farms ?? 0) + (buildings.lumbers ?? 0) + (buildings.quarries ?? 0) + (buildings.herbGardens ?? 0);
  const warehousesNeeded = Math.max(3, Math.floor(workers / 6) + 1, Math.floor(prodCount / 5) + 2);
  if (warehouseCount < warehousesNeeded) {
    needs.push({ type: "warehouse", priority: 92, reason: "logistics: warehouse coverage" });
  }

  // Recovery short-circuit (legacy lines 130-159). When recovery mode is
  // on, only RecoveryProposer's needs are kept, sorted, dedup'd against
  // RECOVERY_ESSENTIAL_TYPES, and returned. The phase-block proposers
  // (bootstrap/logistics/processing) are skipped entirely.
  if (isRecoveryMode(state)) {
    const recoveryNeeds = runProposers([WAVE_2_BUILD_PROPOSERS[0]], state, proposerCtx);
    needs.push(...recoveryNeeds);
    needs.sort((a, b) => b.priority - a.priority);
    const seenRecovery = new Set();
    return needs.filter((n) => {
      if (!isRecoveryEssential(n.type) || seenRecovery.has(n.type)) return false;
      seenRecovery.add(n.type);
      return true;
    });
  }

  // Phase-block proposers: bootstrap → logistics → processing. Recovery
  // is skipped (returns [] anyway when !isRecoveryMode). This replaces
  // the 6 if-chains that previously occupied lines 161-222.
  const phaseNeeds = runProposers(WAVE_2_BUILD_PROPOSERS, state, proposerCtx);
  needs.push(...phaseNeeds);

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

// v0.10.1 R6 wave-2 (C1-code-architect refactor):
// `proposeBridgesForReachability` and `proposeScoutRoadTowardFoggedStone`
// were extracted to `proposers/BridgeProposer.js` and
// `proposers/ScoutRoadProposer.js`. They keep their side-effecting
// shape (place a blueprint, mutate state.buildings) so they don't fit
// the pure {evaluate} BuildProposer contract — they're imported from
// the proposers/ directory as standalone functions. ColonyDirector
// passes the `director` (state.ai.colonyDirector) explicitly so the
// throttle bookkeeping (lastBridgeProposalSec / lastStoneScoutProposalSec)
// lives where the original ensureDirectorState() helper expected it.

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

// v0.10.1 R6 wave-2 (C1-code-architect refactor):
// `hasAccessibleWorksite` was the only consumer of the processing-branch
// quarry/herb_garden accessibility check; it moved into
// `ProcessingProposer.js` as a private helper alongside the rest of the
// processing block. No remaining call site here, so the function was
// deleted.

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

    // R13 Plan-R13-autopilot-wait-llm (#6 P1) — startup readiness gate.
    // Hold off phase-builder placement when autopilot is ON until either
    // a first /api/ai/plan response (LLM or fallback) flipped
    // state.ai.autopilotReady (handled in app/aiRuntimeStats.js) OR the
    // safety timeout (BALANCE.autopilotReadyTimeoutSec, sim-sec from
    // session start) fires here. Without the timeout a silent network
    // hang would stall autopilot indefinitely. Scenario repair below
    // honours the same gate so the colony's first placement on tick 1
    // (warehouse, road) does not race the LLM's strategic guidance.
    //
    // Back-compat: only the explicit `false` (set by EntityFactory's
    // initial state) gates. Tests / older saves that never wrote the
    // field (undefined) are treated as ready, matching the legacy
    // immediate-build behaviour they were written against.
    if (autopilotEnabled && state.ai && state.ai.autopilotReady === false) {
      const timeoutSec = Number(BALANCE.autopilotReadyTimeoutSec ?? 10);
      if (nowSec >= timeoutSec) {
        state.ai.autopilotReady = true;
        state.ai.fallbackMode = true;
        state.ai.autopilotReadyReason = "timeout";
      } else {
        // Awaiting first plan response — return early so no proposers
        // run. director.lastEvalSec already advanced so we don't tighten
        // the cadence after the gate clears.
        director.automation = {
          autopilotEnabled,
          scenarioRepairAllowed: false,
          phaseBuilder: "awaiting-first-plan",
          connectorBuilder: "awaiting-first-plan",
          autopilotReady: false,
        };
        return;
      }
    }
    const scenarioRepairAllowed = autopilotEnabled || Boolean(state.ai?.allowScenarioRepairWhenAutopilotOff);
    director.automation = {
      autopilotEnabled,
      scenarioRepairAllowed,
      phaseBuilder: autopilotEnabled ? "active" : "off",
      connectorBuilder: autopilotEnabled ? "active" : "off",
      autopilotReady: state.ai?.autopilotReady !== false,
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
    const bridgeBuilds = proposeBridgesForReachability(state, this._buildSystem, director, services);
    if (bridgeBuilds > 0) {
      director.buildsPlaced += bridgeBuilds;
      director.lastBuildSource = "fallback";
      director.lastBuildTimeSec = nowSec;
    }

    // v0.10.1-hotfix-iter2 (issue #7): scout-road-toward-fogged-stone. The
    // assessColonyNeeds quarry@95 safety net only helps when at least one
    // STONE node is in EXPLORED/VISIBLE fog — otherwise evaluateBuildPreview
    // rejects every quarry placement with `hidden_tile` and the colony
    // starves of stone forever. This proposer extends a single road segment
    // toward the closest fog-hidden STONE node when stone is critical and
    // no visible STONE exists; the worker walking that road reveals the
    // fog as a side-effect, so the next director tick can land the quarry.
    const scoutBuilds = proposeScoutRoadTowardFoggedStone(state, this._buildSystem, director, services);
    if (scoutBuilds > 0) {
      director.blueprintsSubmitted = Number(director.blueprintsSubmitted ?? 0) + scoutBuilds;
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
    // R13 Plan-R13-fog-aware-build (#5+#7) — track whether any of this tick's
    // build candidates failed because `findPlacementTile` couldn't find a
    // visible tile. If we tried to place at least one building but none had
    // even one visible candidate, latch `state.ai.scoutNeeded` so the IDLE
    // worker fog-edge bias kicks in next tick.
    let attemptedBuilds = 0;
    let buildsWithNoVisibleTile = 0;
    for (const build of builds) {
      let tile = null;

      // Smart placement: warehouses for coverage go near uncovered worksites
      if (build.type === "warehouse" && build.reason.includes("coverage")) {
        tile = findCoverageWarehousePlacement(state, this._buildSystem, services);
      }

      if (!tile) tile = findPlacementTile(state, this._buildSystem, build.type, services);
      attemptedBuilds += 1;
      if (!tile) { buildsWithNoVisibleTile += 1; continue; }

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

    // R13 Plan-R13-fog-aware-build (#5+#7) — latch `state.ai.scoutNeeded`
    // when every attempted build this tick failed because no visible tile
    // was found. The IDLE worker wander biases toward fog-edge tiles when
    // this flag is true, so workers proactively reveal terrain so the next
    // director tick can place. Cleared by any successful placement (any
    // tile-finder hit clears via the inverse condition below).
    if (state.ai && typeof state.ai === "object") {
      if (attemptedBuilds > 0 && buildsWithNoVisibleTile === attemptedBuilds) {
        state.ai.scoutNeeded = true;
        state.ai.scoutNeededReason = "no-buildable-visible-terrain";
      } else if (attemptedBuilds > 0) {
        state.ai.scoutNeeded = false;
        state.ai.scoutNeededReason = null;
      }
    }

    // Priority 3: connect isolated worksites to warehouses with roads
    connectWorksitesToWarehouses(state, this._buildSystem, services);

    // Update phase after all builds
    director.phase = determinePhase(state.buildings);
  }
}
