import {
  BALANCE,
  BUILD_COST,
  BUILD_COST_ESCALATOR,
  CONSTRUCTION_BALANCE,
  RUIN_SALVAGE,
  TERRAIN_MECHANICS,
  computeEscalatedBuildCost,
  isBuildKindHardCapped,
  pluralBuildingKey,
} from "../../config/balance.js";
// v0.8.0 Phase 3 M1c post-review — thread services.rng through salvage rolls
// for seeded reproducibility (silent-failure C2, reviewer #5).
import { FOG_STATE, NODE_FLAGS, TILE } from "../../config/constants.js";
import { getTile, getTileState, inBounds, listTilesByType, toIndex } from "../../world/grid/Grid.js";
import { toolToTile } from "../../world/grid/TileTypes.js";

// v0.8.0 Phase 3 M1a: node-gated tools. Tool must match a node flag on the
// target tileState to be placeable.
export const NODE_GATED_TOOLS = Object.freeze({
  lumber: NODE_FLAGS.FOREST,
  quarry: NODE_FLAGS.STONE,
  herb_garden: NODE_FLAGS.HERB,
});

const TOOL_INFO = Object.freeze({
  road: {
    label: "Road",
    summary: "Stitches the broken supply line; every road tile is a haul that never has to happen.",
    rules: "Place on grass or ruins. Roads must extend from existing infrastructure or repair a scenario gap.",
    allowedOldTypes: [TILE.GRASS, TILE.RUINS],
  },
  farm: {
    label: "Farm",
    summary: "Adds food production but only works when it can feed back into the road / warehouse network.",
    rules: "Place on grass, roads, or ruins. Farms need nearby logistics access.",
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.RUINS],
  },
  lumber: {
    label: "Lumber",
    summary: "Adds wood production and is strongest when the route back to storage is short and defensible.",
    rules: "Place on grass, roads, or ruins. Lumber sites need nearby logistics access.",
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.RUINS],
  },
  warehouse: {
    label: "Warehouse",
    summary: "Anchors the colony stockpile; without it, grain rots in the field while the kitchen sits empty.",
    rules: "Place on grass, roads, or ruins. Warehouses need road access and should be spread apart.",
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.RUINS],
  },
  wall: {
    label: "Wall",
    summary: "Shapes chokepoints, protects depots, and turns layout into visible defensive geometry.",
    rules: "Place on grass, roads, or ruins. Walls must extend from a defense anchor or scenario chokepoint.",
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.RUINS],
  },
  quarry: {
    label: "Quarry",
    summary: "Extracts stone from rocky deposits for advanced construction.",
    rules: "Place on grass, roads, or ruins. Quarries need nearby logistics access.",
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.RUINS],
  },
  herb_garden: {
    label: "Herb Garden",
    summary: "Cultivates medicinal herbs for clinic treatments and colony health.",
    rules: "Place on grass, roads, or ruins. Herb gardens need nearby logistics access.",
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.RUINS],
  },
  kitchen: {
    label: "Kitchen",
    summary: "Turns raw grain into meals; the difference between a stocked warehouse and workers starving beside it.",
    rules: "Place on grass, roads, or ruins. Kitchens need nearby logistics access.",
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.RUINS],
  },
  smithy: {
    label: "Smithy",
    summary: "Hammers stone and wood into tools; one Smithy late and the lumber camp saws with its hands.",
    rules: "Place on grass, roads, or ruins. Smithies need nearby logistics access.",
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.RUINS],
  },
  clinic: {
    label: "Clinic",
    summary: "Brews herbs into medicine; the last room between a bitten hauler and a name on the obituary strip.",
    rules: "Place on grass, roads, or ruins. Clinics need nearby logistics access.",
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.RUINS],
  },
  bridge: {
    label: "Bridge",
    summary: "Creates a crossing over water, enabling logistics routes across rivers and channels.",
    rules: "Place on water tiles. Bridges must extend from roads, warehouses, or other bridges.",
    allowedOldTypes: [TILE.WATER],
  },
  // v0.8.4 strategic walls + GATE (Agent C). Gate = passable doorway in a
  // wall line. Workers and traders pass through; raiders, predators, and
  // saboteurs cannot. Cost mirrors a small structure (4w + 1s) and the
  // build escalator hardcaps at 24 to prevent gate-spam wall workarounds.
  gate: {
    label: "Gate",
    summary: "A passable doorway in a wall line. Workers and traders pass through; raiders and predators cannot.",
    rules: "Place on grass, roads, or ruins. Best placed adjacent to a wall line so the gate seals the gap.",
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.RUINS],
  },
  erase: {
    label: "Demolish",
    // v0.8.4 (Agent B) — relabelled from "Erase" to match the new
    // construction-in-progress flow: workers travel to the site and dismantle
    // the structure over time (~3s of labor) rather than the tile vanishing
    // instantly. Right-click on a blueprint-in-progress cancels for full
    // refund; clicking a built structure or RUINS commissions a demolish job
    // for partial salvage.
    summary: "Workers will dismantle this structure over ~3s and return partial salvage. Right-click a blueprint to cancel for a full refund.",
    rules: "Demolish any built structure or RUINS tile. Costs 1 wood to commission. Workers must travel to the site to apply labor.",
    // v0.8.4 strategic walls + GATE (Agent C) — TILE.GATE is demolishable.
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE, TILE.WALL, TILE.RUINS, TILE.QUARRY, TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC, TILE.BRIDGE, TILE.GATE],
  },
});

const BUILDABLE_TILE_LABEL = Object.freeze(
  Object.entries(TILE).reduce((acc, [name, value]) => {
    acc[value] = name.toLowerCase();
    return acc;
  }, {}),
);

const TILE_TO_TOOL = Object.freeze({
  [TILE.ROAD]: "road",
  [TILE.FARM]: "farm",
  [TILE.LUMBER]: "lumber",
  [TILE.WAREHOUSE]: "warehouse",
  [TILE.WALL]: "wall",
  [TILE.QUARRY]: "quarry",
  [TILE.HERB_GARDEN]: "herb_garden",
  [TILE.KITCHEN]: "kitchen",
  [TILE.SMITHY]: "smithy",
  [TILE.CLINIC]: "clinic",
  [TILE.BRIDGE]: "bridge",
  // v0.8.4 strategic walls + GATE (Agent C) — gate counts via the
  // BUILD_COST_ESCALATOR.gate path (existing-count lookup goes through
  // pluralBuildingKey → "gates"). The TILE→tool reverse map lets
  // demolish/refund logic recognise GATE structures.
  [TILE.GATE]: "gate",
});

const LOGISTICS_PRODUCER_TOOLS = new Set([
  "farm",
  "lumber",
  "quarry",
  "herb_garden",
  "kitchen",
  "smithy",
  "clinic",
]);

const RESOURCE_LABELS = Object.freeze({
  food: "food",
  wood: "wood",
  stone: "stone",
  herbs: "herbs",
});

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

function addTileCost(a = {}, b = {}) {
  return {
    food: (a.food ?? 0) + (b.food ?? 0),
    wood: (a.wood ?? 0) + (b.wood ?? 0),
    stone: (a.stone ?? 0) + (b.stone ?? 0),
    herbs: (a.herbs ?? 0) + (b.herbs ?? 0),
  };
}

function subtractTileCost(a = {}, b = {}) {
  return {
    food: Math.max(0, (a.food ?? 0) - (b.food ?? 0)),
    wood: Math.max(0, (a.wood ?? 0) - (b.wood ?? 0)),
    stone: Math.max(0, (a.stone ?? 0) - (b.stone ?? 0)),
    herbs: Math.max(0, (a.herbs ?? 0) - (b.herbs ?? 0)),
  };
}

function formatCost(cost = {}) {
  const parts = [];
  if ((cost.food ?? 0) > 0) parts.push(`${cost.food}f`);
  if ((cost.wood ?? 0) > 0) parts.push(`${cost.wood}w`);
  if ((cost.stone ?? 0) > 0) parts.push(`${cost.stone}s`);
  if ((cost.herbs ?? 0) > 0) parts.push(`${cost.herbs}h`);
  return parts.length > 0 ? parts.join(" ") : "free";
}

function formatResourceShortfalls(cost = {}, resources = {}) {
  const parts = [];
  for (const [key, label] of Object.entries(RESOURCE_LABELS)) {
    const need = Number(cost[key] ?? 0);
    const have = Number(resources?.[key] ?? 0);
    const gap = need - have;
    if (gap > 0) parts.push(`${gap} more ${label}`);
  }
  return parts;
}

// v0.8.2 Round0 02b-casual — expanded, human-friendly cost label. The
// compact form (`5w`) carries over from the v0.7 engineering HUD; casual
// players consistently report reading it as "5 food" ("Insufficient
// resources" surprise) per reviewer `player-02-casual`. This formatter
// is reachable via `describeBuildCostExpanded` / `getBuildToolPanelState`
// so the BuildToolbar can switch on `state.controls.uiProfile`.
export function formatCostExpanded(cost = {}) {
  const parts = [];
  if ((cost.food ?? 0) > 0) parts.push(`${cost.food} ${cost.food === 1 ? "food" : "food"}`);
  if ((cost.wood ?? 0) > 0) parts.push(`${cost.wood} ${cost.wood === 1 ? "wood" : "wood"}`);
  if ((cost.stone ?? 0) > 0) parts.push(`${cost.stone} ${cost.stone === 1 ? "stone" : "stone"}`);
  if ((cost.herbs ?? 0) > 0) parts.push(`${cost.herbs} ${cost.herbs === 1 ? "herb" : "herbs"}`);
  return parts.length > 0 ? parts.join(" + ") : "free";
}

function manhattan(a, b) {
  return Math.abs(a.ix - b.ix) + Math.abs(a.iz - b.iz);
}

function isWithinRadius(a, b, radius = 1) {
  return manhattan(a, b) <= radius;
}

function hasTypeWithinRadius(grid, tile, targetTypes, radius) {
  const set = new Set(targetTypes);
  for (let iz = tile.iz - radius; iz <= tile.iz + radius; iz += 1) {
    for (let ix = tile.ix - radius; ix <= tile.ix + radius; ix += 1) {
      if (Math.abs(ix - tile.ix) + Math.abs(iz - tile.iz) > radius) continue;
      if (!inBounds(ix, iz, grid)) continue;
      const nextType = getTile(grid, ix, iz);
      if (set.has(nextType)) return true;
    }
  }
  return false;
}

function findNearestDistance(grid, tile, targetTypes, maxRadius = 12) {
  const candidates = listTilesByType(grid, targetTypes);
  let best = Infinity;
  for (const candidate of candidates) {
    const distance = manhattan(tile, candidate);
    if (distance < best) best = distance;
    if (best <= 0) break;
  }
  return best;
}

function formatTileDistance(distance) {
  return Number.isFinite(distance) ? `${distance} ${distance === 1 ? "tile" : "tiles"}` : "no known depot";
}

function formatTilePoint(ix, iz) {
  return `(${ix},${iz})`;
}

function addLogisticsPreview({ tool, warehouseDistance, hasRoadAccess, hasRoadTouch, effects, warnings }) {
  const hasWarehouse = Number.isFinite(warehouseDistance);
  if (LOGISTICS_PRODUCER_TOOLS.has(tool)) {
    if (!hasWarehouse) {
      warnings.push("No warehouse exists yet; production will stall until storage is built.");
      return;
    }
    if (hasRoadAccess) {
      effects.push(`Short haul to nearest warehouse (${formatTileDistance(warehouseDistance)}).`);
      return;
    }
    if (warehouseDistance <= BALANCE.worksiteCoverageSoftRadius) {
      warnings.push(`Nearest warehouse is ${formatTileDistance(warehouseDistance)} away but no road touches this worksite.`);
      return;
    }
    warnings.push(`Nearest warehouse is ${formatTileDistance(warehouseDistance)} away; build a road or depot first.`);
    return;
  }

  if (tool === "warehouse") {
    if (hasWarehouse) {
      effects.push(`Extends depot coverage; nearest warehouse is ${formatTileDistance(warehouseDistance)} away.`);
    } else {
      effects.push("Creates the first delivery anchor for the colony.");
    }
    if (!hasRoadTouch) {
      warnings.push("No road touches this depot yet; connect a road to shorten worker delivery trips.");
    }
    return;
  }

  if (tool === "road") {
    if (hasRoadTouch) {
      effects.push("Connects directly into the current road and warehouse network.");
    } else if (hasWarehouse) {
      effects.push(`Starts a connector toward the nearest warehouse (${formatTileDistance(warehouseDistance)}).`);
    }
  }
}

function getScenarioTileTags(state, tile) {
  const scenario = state.gameplay?.scenario ?? {};
  const anchors = scenario.anchors ?? {};
  const routeLinks = (scenario.routeLinks ?? []).filter((route) => (route.gapTiles ?? []).some((gap) => gap.ix === tile.ix && gap.iz === tile.iz));
  const depotZones = (scenario.depotZones ?? []).filter((zone) => {
    const anchor = anchors[zone.anchor];
    return anchor && isWithinRadius(tile, anchor, zone.radius ?? 2);
  });
  const chokePoints = (scenario.chokePoints ?? []).filter((zone) => {
    const anchor = anchors[zone.anchor];
    return anchor && isWithinRadius(tile, anchor, zone.radius ?? 2);
  });
  const wildlifeZones = (scenario.wildlifeZones ?? []).filter((zone) => {
    const anchor = anchors[zone.anchor];
    return anchor && isWithinRadius(tile, anchor, zone.radius ?? 2);
  });
  const inCoreZone = anchors.coreWarehouse ? isWithinRadius(tile, anchors.coreWarehouse, 2) : false;
  return { routeLinks, depotZones, chokePoints, wildlifeZones, inCoreZone };
}

function applyTerrainCostModifiers(baseCost, grid, ix, iz, oldType, tool) {
  if (tool === "erase") return { ...baseCost };
  const idx = toIndex(ix, iz, grid.width);
  const elev = grid.elevation?.[idx] ?? 0.5;
  const moist = grid.moisture?.[idx] ?? 0.5;
  const adjusted = {};
  const elevMult = 1 + elev * TERRAIN_MECHANICS.elevationBuildCostPerLevel;
  const ruinDiscount = oldType === TILE.RUINS ? (1 - TERRAIN_MECHANICS.ruinsBuildDiscount) : 1;
  for (const [res, amt] of Object.entries(baseCost)) {
    adjusted[res] = Math.max(1, Math.round(amt * elevMult * ruinDiscount));
  }
  if (moist < TERRAIN_MECHANICS.lowMoistureStoneCostThreshold && tool !== "road" && tool !== "wall" && tool !== "bridge") {
    adjusted.stone = (adjusted.stone ?? 0) + TERRAIN_MECHANICS.lowMoistureStoneCostFlat;
  }
  return adjusted;
}

function resolveRng(services) {
  if (typeof services === "function") return services;
  const rng = services?.rng;
  if (rng && typeof rng.next === "function") return () => rng.next();
  if (typeof rng === "function") return rng;
  return Math.random;
}

function rollRuinSalvage(rngFn = Math.random) {
  const rolls = RUIN_SALVAGE.rolls;
  let totalWeight = 0;
  for (const r of rolls) totalWeight += r.weight;
  let pick = rngFn() * totalWeight;
  for (const r of rolls) {
    pick -= r.weight;
    if (pick <= 0) {
      const result = { food: 0, wood: 0, stone: 0, herbs: 0, tools: 0, medicine: 0 };
      for (const [key, [lo, hi]] of Object.entries(r.rewards)) {
        result[key] = lo + Math.floor(rngFn() * (hi - lo + 1));
      }
      return result;
    }
  }
  return { food: 0, wood: 0, stone: 0, herbs: 0 };
}

function getTileRefund(oldType, rngFn = Math.random) {
  if (oldType === TILE.RUINS) return rollRuinSalvage(rngFn);
  const oldTool = TILE_TO_TOOL[oldType];
  if (!oldTool) return { food: 0, wood: 0, stone: 0, herbs: 0 };
  const baseCost = BUILD_COST[oldTool] ?? { food: 0, wood: 0 };
  // Living World v0.8.0 Phase 3 M1c — type-specific recovery fractions applied
  // to the ORIGINAL build cost. Stone 35%, wood 25%, food/herbs 0% (biodegrade).
  const stoneFrac = Number(BALANCE.demoStoneRecovery ?? 0);
  const woodFrac = Number(BALANCE.demoWoodRecovery ?? 0);
  const foodFrac = Number(BALANCE.demoFoodRecovery ?? 0);
  const herbsFrac = Number(BALANCE.demoHerbsRecovery ?? 0);
  return {
    food: Math.floor((baseCost.food ?? 0) * foodFrac),
    wood: Math.floor((baseCost.wood ?? 0) * woodFrac),
    stone: Math.floor((baseCost.stone ?? 0) * stoneFrac),
    herbs: Math.floor((baseCost.herbs ?? 0) * herbsFrac),
  };
}

function buildFailure(reason, oldType, newType, cost, refund, tool, ix, iz, info, effects = [], warnings = [], context = {}) {
  const recoveryContext = { ...context, oldType, newType, cost, refund, tool, ix, iz, info };
  return {
    ok: false,
    reason,
    reasonText: explainBuildReason(reason, { oldType, tool }),
    recoveryText: explainBuildRecovery(reason, recoveryContext),
    shortfalls: reason === "insufficientResource"
      ? formatResourceShortfalls(cost, context.resources)
      : [],
    oldType,
    newType,
    cost,
    refund,
    netCost: subtractTileCost(cost, refund),
    tool,
    ix,
    iz,
    info,
    effects,
    warnings,
  };
}

export function getBuildToolInfo(tool) {
  return TOOL_INFO[tool] ?? TOOL_INFO.road;
}

export function describeBuildCost(tool) {
  return formatCost(BUILD_COST[tool] ?? {});
}

export function canAfford(resources, cost) {
  return resources.food >= (cost.food ?? 0)
    && resources.wood >= (cost.wood ?? 0)
    && (resources.stone ?? 0) >= (cost.stone ?? 0)
    && (resources.herbs ?? 0) >= (cost.herbs ?? 0);
}

export function spend(resources, cost) {
  resources.food = Math.max(0, resources.food - (cost.food ?? 0));
  resources.wood = Math.max(0, resources.wood - (cost.wood ?? 0));
  resources.stone = Math.max(0, (resources.stone ?? 0) - (cost.stone ?? 0));
  resources.herbs = Math.max(0, (resources.herbs ?? 0) - (cost.herbs ?? 0));
}

export function refund(resources, amount) {
  resources.food += amount.food ?? 0;
  resources.wood += amount.wood ?? 0;
  resources.stone += amount.stone ?? 0;
  resources.herbs += amount.herbs ?? 0;
}

export function explainBuildReason(reason, context = {}) {
  if (reason === "unchanged") return "Target tile is unchanged.";
  if (reason === "waterBlocked") return "Cannot build on water tile.";
  if (reason === "occupiedTile") return `Clear the ${BUILDABLE_TILE_LABEL[context.oldType] ?? "existing structure"} before building here.`;
  if (reason === "insufficientResource") return "Insufficient resources.";
  if (reason === "warehouseTooClose") return "Warehouses are too close together. Spread depots to widen logistics coverage.";
  if (reason === "hidden_tile") return "Cannot build on unexplored terrain. Scout this area first.";
  if (reason === "hardCap") return "Build limit reached for this structure type.";
  if (reason === "missing_resource_node") {
    if (context.tool === "lumber") return "No forest node on this tile. Lumber camps must be sited on a forest.";
    if (context.tool === "quarry") return "No stone node on this tile. Quarries must be sited on a stone deposit.";
    if (context.tool === "herb_garden") return "No herb node on this tile. Herb gardens must be sited on a herb patch.";
    return "Required resource node is missing on this tile.";
  }
  return "Build action failed.";
}

export function explainBuildRecovery(reason, context = {}) {
  if (reason === "unchanged") {
    return "Pick a different tile or extend toward the highlighted route/depot instead.";
  }
  if (reason === "waterBlocked") {
    return "Use Bridge on water, or move this build onto grass, road, or ruins.";
  }
  if (reason === "occupiedTile") {
    return "Use Erase first, or place the new structure on open grass, road, or ruins.";
  }
  if (reason === "insufficientResource") {
    const shortfalls = formatResourceShortfalls(context.cost, context.resources);
    if (shortfalls.length > 0) {
      return `Recover ${shortfalls.join(", ")} before placing this. Reclaim ruins or build the cheaper route first.`;
    }
    return "Wait for production or reclaim ruins for salvage before placing this.";
  }
  if (reason === "warehouseTooClose") {
    return "Move the warehouse farther from the existing depot unless the target is inside a marked depot zone.";
  }
  if (reason === "hidden_tile") {
    return "Build roads from visible ground toward this area to scout it first.";
  }
  if (reason === "missing_resource_node") {
    if (context.tool === "lumber") return "Find a forest-marked tile first; roads can connect it back after placement.";
    if (context.tool === "quarry") return "Find a stone deposit first; roads or depots can shorten the haul after placement.";
    if (context.tool === "herb_garden") return "Find an herb patch first; roads or depots can shorten the medicine chain.";
    return "Move this building onto the matching resource node.";
  }
  if (reason === "hardCap") {
    return "Improve the existing network or erase an older copy before building another.";
  }
  return "Try another nearby tile or inspect the route/stockpile requirement before placing again.";
}

// Phase 3 / M1b — reject placement on fog-HIDDEN tiles.
function isTileHidden(state, ix, iz) {
  const vis = state?.fog?.visibility;
  if (!(vis instanceof Uint8Array)) return false;
  const width = Number(state?.grid?.width ?? 0);
  const height = Number(state?.grid?.height ?? 0);
  if (ix < 0 || iz < 0 || ix >= width || iz >= height) return false;
  return vis[ix + iz * width] === FOG_STATE.HIDDEN;
}

export function evaluateBuildPreview(state, tool, ix, iz, services = null) {
  const info = getBuildToolInfo(tool);
  const oldType = getTile(state.grid, ix, iz);
  // Erasing a bridge restores water, not grass
  const newType = (tool === "erase" && oldType === TILE.BRIDGE) ? TILE.WATER : toolToTile(tool);
  const tile = { ix, iz };
  // v0.8.2 Round-5 Wave-3 (02c Step 3) — soft-cost escalator. For tools in
  // BUILD_COST_ESCALATOR, the base cost scales with the current building
  // count; road/bridge/erase fall through to flat cost. The post-terrain
  // step (applyTerrainCostModifiers) then layers moisture/elevation on top,
  // so escalator × terrain multipliers compose as the player expects.
  // v0.8.6 Tier 2 BM1: also count in-flight construction sites of the same
  // tool so queueing N farm blueprints in rapid succession can't dodge the
  // escalator (all charged base cost). Pre-fix the escalator only saw
  // already-built tiles, letting a player/AI submit 5 farm blueprints at flat
  // cost before any completed.
  const placedCount = Number(state?.buildings?.[pluralBuildingKey(tool)] ?? 0);
  const sites = Array.isArray(state?.constructionSites) ? state.constructionSites : [];
  let inFlightCount = 0;
  for (const site of sites) {
    if (!site || site.kind !== "build") continue;
    if (String(site.tool ?? "") === tool) inFlightCount += 1;
  }
  const existingCount = placedCount + inFlightCount;
  const baseCost = BUILD_COST_ESCALATOR[tool]
    ? computeEscalatedBuildCost(tool, existingCount)
    : (BUILD_COST[tool] ?? { wood: 0, food: 0 });
  const cost = applyTerrainCostModifiers(baseCost, state.grid, ix, iz, oldType, tool);
  const rngFn = resolveRng(services);
  const salvage = getTileRefund(oldType, rngFn);
  const activeRefund = tool === "erase" ? salvage : { food: 0, wood: 0, stone: 0, herbs: 0 };
  const effects = [];
  const warnings = [];

  if (newType === oldType || (tool === "erase" && oldType === TILE.GRASS)) {
    return buildFailure("unchanged", oldType, newType, cost, activeRefund, tool, ix, iz, info);
  }
  if (isTileHidden(state, ix, iz)) {
    return buildFailure("hidden_tile", oldType, newType, cost, activeRefund, tool, ix, iz, info);
  }
  if (oldType === TILE.WATER && tool !== "bridge") {
    return buildFailure("waterBlocked", oldType, newType, cost, activeRefund, tool, ix, iz, info);
  }
  if (!info.allowedOldTypes.includes(oldType)) {
    return buildFailure("occupiedTile", oldType, newType, cost, activeRefund, tool, ix, iz, info);
  }
  // v0.8.0 Phase 3 M1a: gate LUMBER / QUARRY / HERB_GARDEN on the presence
  // of the corresponding resource-node flag on the target tileState.
  const requiredFlag = NODE_GATED_TOOLS[tool];
  if (requiredFlag) {
    const entry = getTileState(state.grid, ix, iz);
    const flags = Number(entry?.nodeFlags ?? 0) | 0;
    if ((flags & requiredFlag) === 0) {
      return buildFailure("missing_resource_node", oldType, newType, cost, activeRefund, tool, ix, iz, info);
    }
  }
  if (tool !== "erase") {
    const hc = isBuildKindHardCapped(tool, existingCount);
    if (hc.capped) {
      return buildFailure("hardCap", oldType, newType, cost, activeRefund, tool, ix, iz, info);
    }
  }
  if (tool !== "erase" && !canAfford(state.resources, cost)) {
    return buildFailure("insufficientResource", oldType, newType, cost, activeRefund, tool, ix, iz, info, [], [], {
      resources: state.resources,
    });
  }

  const tags = getScenarioTileTags(state, tile);
  const hasRoadAccess = hasTypeWithinRadius(state.grid, tile, [TILE.ROAD, TILE.WAREHOUSE], CONSTRUCTION_BALANCE.worksiteAccessRadius);
  const hasRoadTouch = hasTypeWithinRadius(state.grid, tile, [TILE.ROAD, TILE.WAREHOUSE], CONSTRUCTION_BALANCE.warehouseRoadRadius);
  const warehouseDistance = findNearestDistance(state.grid, tile, [TILE.WAREHOUSE]);

  if (tool === "warehouse") {
    if (warehouseDistance <= CONSTRUCTION_BALANCE.warehouseSpacingRadius && tags.depotZones.length === 0) {
      return buildFailure("warehouseTooClose", oldType, newType, cost, activeRefund, tool, ix, iz, info);
    }
  }

  if (tags.routeLinks.length > 0 && tool === "road") {
    effects.push(`Advances ${tags.routeLinks[0].label}.`);
  }
  if (tags.depotZones.length > 0 && tool === "warehouse") {
    effects.push(`Counts toward reclaiming ${tags.depotZones[0].label}.`);
  }
  if (tags.chokePoints.length > 0 && tool === "wall") {
    effects.push(`Fortifies ${tags.chokePoints[0].label}.`);
  }
  addLogisticsPreview({ tool, warehouseDistance, hasRoadAccess, hasRoadTouch, effects, warnings });
  if (tool === "erase" && (activeRefund.food > 0 || activeRefund.wood > 0 || activeRefund.stone > 0 || activeRefund.herbs > 0)) {
    effects.push(`Returns ${formatCost(activeRefund)} in salvage.`);
  }

  if (tags.wildlifeZones.length > 0 && (tool === "farm" || tool === "lumber")) {
    warnings.push(`Wildlife pressure is high near ${tags.wildlifeZones[0].label}.`);
  }
  const hazardKey = tileKey(ix, iz);
  const hazardSet = state.weather.hazardTileSet instanceof Set
    ? state.weather.hazardTileSet
    : new Set((state.weather.hazardTiles ?? []).map((entry) => tileKey(entry.ix, entry.iz)));
  if (hazardSet.has(hazardKey)) {
    warnings.push(`This tile sits inside the ${state.weather.hazardLabel ?? state.weather.current} hazard zone.`);
  }

  const tilePoint = formatTilePoint(ix, iz);
  const hasWarehouse = Number.isFinite(warehouseDistance);
  let summary;
  if (tool === "erase") {
    summary = activeRefund.food > 0 || activeRefund.wood > 0 || activeRefund.stone > 0 || activeRefund.herbs > 0
      ? `Clear ${BUILDABLE_TILE_LABEL[oldType] ?? "tile"} at ${tilePoint} for ${formatCost(activeRefund)} salvage.`
      : `Clear ${BUILDABLE_TILE_LABEL[oldType] ?? "tile"} at ${tilePoint} back to grass.`;
  } else if (tags.routeLinks.length > 0 && tool === "road") {
    summary = `Road at ${tilePoint} reconnects ${tags.routeLinks[0].label}.`;
  } else if (tags.depotZones.length > 0 && tool === "warehouse") {
    summary = `Warehouse at ${tilePoint} reopens ${tags.depotZones[0].label}.`;
  } else if (LOGISTICS_PRODUCER_TOOLS.has(tool)) {
    if (!hasWarehouse) {
      summary = `${info.label} at ${tilePoint}; no warehouse exists yet, so production will stall.`;
    } else if (hasRoadAccess) {
      summary = `${info.label} at ${tilePoint}; Short haul to nearest warehouse (${formatTileDistance(warehouseDistance)}).`;
    } else if (warehouseDistance <= BALANCE.worksiteCoverageSoftRadius) {
      summary = `${info.label} at ${tilePoint}; nearest warehouse is ${formatTileDistance(warehouseDistance)} away but no road touches this worksite.`;
    } else {
      summary = `${info.label} at ${tilePoint}; nearest warehouse is ${formatTileDistance(warehouseDistance)} away, so build a road or depot first.`;
    }
  } else if (tool === "warehouse") {
    summary = `Warehouse at ${tilePoint} creates the first delivery anchor for the colony.`;
  } else if (tool === "road") {
    if (hasRoadTouch) {
      summary = `Road at ${tilePoint} connects directly into the current network.`;
    } else if (hasWarehouse) {
      summary = `Road at ${tilePoint} starts a connector toward the nearest warehouse (${formatTileDistance(warehouseDistance)}).`;
    } else {
      summary = `Road at ${tilePoint} extends the first network line.`;
    }
  } else {
    summary = `Build ${info.label.toLowerCase()} at ${tilePoint}. ${effects[0] ?? info.summary}`;
  }
  if (effects[0] && !summary.includes(effects[0])) {
    summary = `${summary} ${effects[0]}`;
  }

  return {
    ok: true,
    reason: "",
    reasonText: "",
    oldType,
    newType,
    cost,
    refund: activeRefund,
    netCost: subtractTileCost(cost, activeRefund),
    tool,
    ix,
    iz,
    info,
    effects,
    warnings,
    summary,
  };
}

export function summarizeBuildPreview(preview) {
  if (!preview) return "";
  if (!preview.ok) {
    const reason = preview.reasonText || explainBuildReason(preview.reason, preview);
    const recovery = String(preview.recoveryText ?? "").trim();
    return [reason, recovery].filter(Boolean).join(" ");
  }
  const parts = [preview.summary];
  if (preview.effects?.length > 1) parts.push(preview.effects[1]);
  if (preview.warnings?.length > 0) parts.push(`Warning: ${preview.warnings[0]}`);
  return parts.join(" ");
}

export function getBuildToolPanelState(state) {
  const tool = state.controls.tool;
  const info = getBuildToolInfo(tool);
  const preview = state.controls.buildPreview ?? null;
  // v0.8.2 Round-5 Wave-3 (02c Step 4) — show the escalated cost in the
  // price label so speedrunners see exactly what the Nth copy will consume
  // before they click. When the tool is in BUILD_COST_ESCALATOR and the
  // colony has already built more than softTarget copies, append the
  // multiplier (×1.2, ×2.5cap, etc.) so the label reads e.g. "16w (×1.6)".
  const existingCount = Number(state?.buildings?.[pluralBuildingKey(tool)] ?? 0);
  const baseCost = BUILD_COST[tool] ?? {};
  const esc = BUILD_COST_ESCALATOR[tool];
  const escalatedCost = esc ? computeEscalatedBuildCost(tool, existingCount) : baseCost;
  let multiplierSuffix = "";
  if (esc) {
    const over = Math.max(0, existingCount - Number(esc.softTarget ?? 0));
    if (over > 0) {
      const rawMultiplier = 1 + Number(esc.perExtra ?? 0) * over;
      const multiplier = Math.min(Number(esc.cap ?? rawMultiplier), rawMultiplier);
      const atCap = rawMultiplier >= Number(esc.cap ?? Infinity);
      multiplierSuffix = atCap
        ? ` (\u00D7${multiplier.toFixed(2)} cap)`
        : ` (\u00D7${multiplier.toFixed(2)})`;
    }
  }
  // v0.8.2 Round0 02b-casual — the BuildToolbar renders `costLabelExpanded`
  // when `state.controls.uiProfile === "casual"` to avoid the "5w means 5
  // food" confusion first-timers report. The compact `costLabel` is kept
  // for power users (full profile) + developer-facing surfaces.
  // v0.8.7 T3-6 (QA2-F11): when the active tool is "erase" and there is no
  // hovered tile preview, surface the demolish commission cost (1 wood from
  // BALANCE.demolishToolCost) on the label so players know up-front. The
  // legacy formatter showed "0w" because BUILD_COST.erase = { wood: 0 } —
  // misleading since BuildSystem charges 1 wood on commission.
  let costLabel = `${formatCost(escalatedCost)}${multiplierSuffix}`;
  let costLabelExpanded = `${formatCostExpanded(escalatedCost)}${multiplierSuffix}`;
  if (tool === "erase" && !preview) {
    const demoCost = BALANCE.demolishToolCost ?? { wood: 1 };
    costLabel = `${formatCost(demoCost)} (commission)`;
    costLabelExpanded = `${formatCostExpanded(demoCost)} (commission)`;
  }
  return {
    tool,
    label: info.label,
    summary: info.summary,
    rules: info.rules,
    costLabel,
    costLabelExpanded,
    previewSummary: preview ? summarizeBuildPreview(preview) : "Hover a tile to preview cost, rules, and scenario impact.",
  };
}
