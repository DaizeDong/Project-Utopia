import { BALANCE, BUILD_COST, CONSTRUCTION_BALANCE, RUIN_SALVAGE, TERRAIN_MECHANICS } from "../../config/balance.js";
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
  erase: {
    label: "Erase",
    summary: "Clears the tile back to grass (or water for bridges) and salvages part of the old structure cost.",
    rules: "Erase any non-water tile. Built structures return partial salvage.",
    allowedOldTypes: [TILE.GRASS, TILE.ROAD, TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE, TILE.WALL, TILE.RUINS, TILE.QUARRY, TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC, TILE.BRIDGE],
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

function buildFailure(reason, oldType, newType, cost, refund, tool, ix, iz, info, effects = [], warnings = []) {
  return {
    ok: false,
    reason,
    reasonText: explainBuildReason(reason, { oldType, tool }),
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
  if (reason === "missing_resource_node") {
    if (context.tool === "lumber") return "No forest node on this tile. Lumber camps must be sited on a forest.";
    if (context.tool === "quarry") return "No stone node on this tile. Quarries must be sited on a stone deposit.";
    if (context.tool === "herb_garden") return "No herb node on this tile. Herb gardens must be sited on a herb patch.";
    return "Required resource node is missing on this tile.";
  }
  return "Build action failed.";
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
  const baseCost = BUILD_COST[tool] ?? { wood: 0, food: 0 };
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
  if (tool !== "erase" && !canAfford(state.resources, cost)) {
    return buildFailure("insufficientResource", oldType, newType, cost, activeRefund, tool, ix, iz, info);
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
  if ((tool === "farm" || tool === "lumber" || tool === "quarry" || tool === "herb_garden" || tool === "kitchen" || tool === "smithy" || tool === "clinic") && hasRoadAccess) {
    effects.push("Within haul range of the current logistics network.");
  }
  if (tool === "warehouse" && hasRoadTouch) {
    effects.push("Creates a shorter delivery anchor for nearby workers.");
  }
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

  const summary = tool === "erase"
    ? activeRefund.food > 0 || activeRefund.wood > 0 || activeRefund.stone > 0 || activeRefund.herbs > 0
      ? `Clear ${BUILDABLE_TILE_LABEL[oldType] ?? "tile"} for ${formatCost(activeRefund)} salvage.`
      : `Clear ${BUILDABLE_TILE_LABEL[oldType] ?? "tile"} back to grass.`
    : `Build ${info.label.toLowerCase()}. ${effects[0] ?? info.summary}`;

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
  if (!preview.ok) return preview.reasonText || explainBuildReason(preview.reason, preview);
  const parts = [preview.summary];
  if (preview.effects?.length > 1) parts.push(preview.effects.slice(1).join(" "));
  if (preview.warnings?.length > 0) parts.push(`Warning: ${preview.warnings.join(" ")}`);
  return parts.join(" ");
}

export function getBuildToolPanelState(state) {
  const tool = state.controls.tool;
  const info = getBuildToolInfo(tool);
  const preview = state.controls.buildPreview ?? null;
  const cost = BUILD_COST[tool] ?? {};
  // v0.8.2 Round0 02b-casual — the BuildToolbar renders `costLabelExpanded`
  // when `state.controls.uiProfile === "casual"` to avoid the "5w means 5
  // food" confusion first-timers report. The compact `costLabel` is kept
  // for power users (full profile) + developer-facing surfaces.
  return {
    tool,
    label: info.label,
    summary: info.summary,
    rules: info.rules,
    costLabel: formatCost(cost),
    costLabelExpanded: formatCostExpanded(cost),
    previewSummary: preview ? summarizeBuildPreview(preview) : "Hover a tile to preview cost, rules, and scenario impact.",
  };
}
