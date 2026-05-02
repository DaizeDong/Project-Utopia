import { EVENT_TYPE, NODE_FLAGS, TILE, WEATHER } from "../../config/constants.js";
import { BALANCE } from "../../config/balance.js";
import { findNearestTileOfTypes, listTilesByType, setTileField, tileToWorld } from "../grid/Grid.js";

const SCENARIO_FAMILY_BY_TEMPLATE = Object.freeze({
  temperate_plains: "frontier_repair",
  fertile_riverlands: "frontier_repair",
  rugged_highlands: "gate_chokepoints",
  fortified_basin: "gate_chokepoints",
  archipelago_isles: "island_relay",
  coastal_ocean: "island_relay",
});

// v0.8.2 Round-1 02e-indie-critic — Template-specific scenario voice.
// The 6 map templates share only 3 scenario families (frontier_repair /
// gate_chokepoints / island_relay), which left player-facing copy
// template-agnostic: e.g. Fertile Riverlands opened to "Broken Frontier —
// Reconnect the west lumber line…" (indistinguishable from Temperate Plains).
// This table overrides title / summary / hintCopy per-template so each of the
// 6 templates tells a distinct opening story. Mechanical anchors, routes,
// depots, targets, and objectiveCopy are NOT touched — only player-facing
// strings. See Feedbacks/02e-indie-critic.md for reviewer phrasing.
const SCENARIO_VOICE_BY_TEMPLATE = Object.freeze({
  temperate_plains: Object.freeze({
    title: "Broken Frontier",
    // v0.8.2 Round-6 Wave-1 02b-casual (Step 7) — soften the OKR-speak
    // briefing copy. The mechanics (anchor IDs, target counts, route labels)
    // are unchanged; only the player-facing prose is rewritten so a casual
    // first-timer can name what they see on screen ("west forest is overgrown")
    // instead of decoding "lumber line" / "depot". Title stays as
    // "Broken Frontier" because tests pin it as the canonical name.
    summary: "Your colony just landed. The west forest is overgrown — clear a path back, then rebuild the east warehouse.",
    openingPressure: "The frontier is wide open, but the colony stalls fast if the west forest path and the broken east warehouse stay disconnected.",
    hintInitial: "Build a road to the west forest and put a warehouse on the broken east platform before scaling up.",
    hintAfterLogistics: "Starter logistics are online. Refill the stockpile before the first pressure wave.",
    hintAfterStockpile: "Fortify the colony and hold stability under pressure.",
    hintCompleted: "All objectives completed.",
  }),
  fertile_riverlands: Object.freeze({
    title: "Silted Hearth",
    summary: "Last year's flood buried the west road under silt — rebuild the lumber line before the river runs dry.",
    openingPressure: "The first threat is delay: silt, floodwater, and long haul lines can starve the hearth before the valley pays off.",
    hintInitial: "Dig the silted lumber road free and reclaim the flood-wrecked east granary.",
    hintAfterLogistics: "The hearth fires are lit again. Stockpile grain before the next rain-fed crest.",
    hintAfterStockpile: "Shore up the banks and hold the hearth through the autumn floods.",
    hintCompleted: "The valley is whole again — the river feeds a living colony.",
  }),
  rugged_highlands: Object.freeze({
    title: "Gate Bastion",
    summary: "Reopen the north timber gate, reclaim the south granary, and stabilize two chokepoints.",
    openingPressure: "The highlands reward careful timing: every cleared route also becomes a gate you must hold.",
    hintInitial: "Repair the north gate, then reclaim the south granary before scaling up the bastion.",
    hintAfterLogistics: "The gates are open. Stock food and wood before the next pressure wave.",
    hintAfterStockpile: "Close the defense loop and hold both chokepoints.",
    hintCompleted: "All objectives completed.",
  }),
  fortified_basin: Object.freeze({
    title: "Hollow Keep",
    summary: "The old keep's gates hang open — hold north and south before raiders find the breach.",
    openingPressure: "The danger is not distance but exposure: the basin already has hard gates, and every open one invites pressure.",
    hintInitial: "Wall off the north and south gates before the raiders learn the keep is hollow.",
    hintAfterLogistics: "The gates hold. Pack the larders before the siege tightens.",
    hintAfterStockpile: "Man the walls — the keep is only as strong as who watches the ramparts.",
    hintCompleted: "The keep is whole again, its gates manned and its larders full.",
  }),
  archipelago_isles: Object.freeze({
    title: "Island Relay",
    summary: "Bridge two causeways, claim the relay depot, and connect the harbor to the outer fields.",
    openingPressure: "The opening fight is over crossing water; one missed bridge leaves the island chain broken and idle.",
    hintInitial: "Bridge the harbor and east causeways, then claim the relay depot with a warehouse.",
    hintAfterLogistics: "The relay is online. Push enough food and wood across the split map.",
    hintAfterStockpile: "Secure the crossings and hold the outer shoreline.",
    hintCompleted: "All objectives completed.",
  }),
  coastal_ocean: Object.freeze({
    title: "Driftwood Harbor",
    summary: "A gale scattered the fleet — rebuild the harbor causeways before the autumn caravan arrives.",
    openingPressure: "The coast is generous only after the causeways exist; until then the harbor, fields, and depot run separately.",
    hintInitial: "Lash the harbor causeways back together and raise a depot on the relay spit.",
    hintAfterLogistics: "The harbor is re-strung. Lay in food and wood before the caravan tide turns.",
    hintAfterStockpile: "Brace the crossings — autumn storms will test every rope and plank.",
    hintCompleted: "The harbor sings with gulls and laden sails again.",
  }),
});

// Family-level defaults for unknown templateIds (defensive — prevents a
// missing entry from silently shipping "undefined · undefined" strings).
const DEFAULT_VOICE_FOR_FRONTIER_REPAIR = SCENARIO_VOICE_BY_TEMPLATE.temperate_plains;
const DEFAULT_VOICE_FOR_GATE_CHOKEPOINTS = SCENARIO_VOICE_BY_TEMPLATE.rugged_highlands;
const DEFAULT_VOICE_FOR_ISLAND_RELAY = SCENARIO_VOICE_BY_TEMPLATE.archipelago_isles;

export function getScenarioVoiceForTemplate(templateId) {
  return SCENARIO_VOICE_BY_TEMPLATE[templateId] ?? DEFAULT_VOICE_FOR_FRONTIER_REPAIR;
}

// v0.10.1-r4-A5 P0-3: per-template starting-resource overrides.
// Pre-r4 every map shared INITIAL_RESOURCES (food=320, wood=35, stone=15)
// regardless of opening biome. The A5 R3 audit measured Archipelago opens
// with effective wood ~2.35 (deltas after first-tick scenario stamping +
// island geography starves the initial lumber clusters of accessible
// neighbors) while Temperate kept the full 35. Result: 6 maps shared one
// BALANCE constant set so the first-3-min decisions on Archipelago and
// Coastal felt impossible while Temperate felt trivial.
//
// Resolution within freeze: a per-template `wood` override returned to
// EntityFactory.createInitialGameState. Defaults to INITIAL_RESOURCES when
// the templateId has no override entry (so legacy callers / tests are
// unaffected). Food + stone unchanged for now — opening food drain (0.60/s)
// is identical across maps so the 320 floor still maps to a ~6:30 runway.
//
// Numbers chosen to cover ALPHA_START + warehouse(10) + farm(5) + 1 spare
// on the wood-starved water maps so the first build cycle doesn't lock.
const STARTING_WOOD_BY_TEMPLATE = Object.freeze({
  temperate_plains: 35,    // unchanged — long-horizon benchmark baseline
  fertile_riverlands: 32,  // mild dip — river maps yield wood faster
  rugged_highlands: 38,    // slight bump — stone-rich, lumber clusters scarcer
  fortified_basin: 36,     // mild bump — wall-heavy opening
  archipelago_isles: 22,   // big bump from effective ~2 — see audit above
  coastal_ocean: 20,       // big bump — hardest water map
});

/**
 * Per-template starting resource overrides. Returns the wood floor to seed
 * `state.resources.wood` at colony creation; food and stone fall back to
 * the global INITIAL_RESOURCES values via the caller.
 * @param {string} templateId
 * @returns {{ wood: number }}
 */
export function getTemplateStartingResources(templateId) {
  const wood = STARTING_WOOD_BY_TEMPLATE[templateId];
  return Object.freeze({ wood: typeof wood === "number" ? wood : null });
}

// v0.10.1-r4-A5 P0-3: per-template early-game target hints. Surfaces a
// single distinct opening goal per map so the UI / objective layer can
// render "build 1 bridge" on Archipelago vs "build 2 farms" on Temperate.
// These are *additive* hints attached to scenario.targets — they do NOT
// replace the canonical logistics/stockpile/stability target structure
// the objective tracker counts against. A consumer (HUD / tutorial) is
// expected to surface earlyHint when scenario.targets.earlyHint exists.
const EARLY_TARGET_HINTS_BY_TEMPLATE = Object.freeze({
  temperate_plains: Object.freeze({ id: "firstFarms", count: 2, label: "Build 2 farms" }),
  fertile_riverlands: Object.freeze({ id: "firstHerbGardens", count: 1, label: "Build 1 herb garden" }),
  rugged_highlands: Object.freeze({ id: "firstQuarries", count: 1, label: "Build 1 quarry" }),
  fortified_basin: Object.freeze({ id: "firstWalls", count: 4, label: "Build 4 walls" }),
  archipelago_isles: Object.freeze({ id: "firstBridges", count: 1, label: "Build 1 bridge" }),
  coastal_ocean: Object.freeze({ id: "firstWarehouses", count: 2, label: "Build 2 warehouses" }),
});

/**
 * Per-template early-game first-build hint. Returns null when templateId
 * has no override (so legacy callers see no behavioural change).
 * @param {string} templateId
 * @returns {{ id: string, count: number, label: string } | null}
 */
export function getTemplateEarlyTargetHint(templateId) {
  return EARLY_TARGET_HINTS_BY_TEMPLATE[templateId] ?? null;
}

// v0.8.2 Round-5b (02e Step 3) — intro payload for scenario switch fade.
// GameApp.regenerateWorld writes this to state.ui.scenarioIntro after deepReplace;
// HUDController reads it to show a 1.5s opening-pressure overlay on the strip.
export function getScenarioIntroPayload(templateId) {
  const voice = getScenarioVoiceForTemplate(templateId);
  return Object.freeze({
    title: String(voice.title ?? ""),
    openingPressure: String(voice.openingPressure ?? ""),
    durationMs: 1500,
  });
}

/**
 * v0.8.2 Round-5b Wave-1 (01e Step 3) — export the per-template scenario
 * voice strings pre-packaged for HUD consumption. Returns a frozen map
 * keyed by phase tag (`phase:logistics`, `phase:stockpile`,
 * `phase:stability`, `phase:completed`, `phase:default`). Keeps the
 * authored text in a single location (SCENARIO_VOICE_BY_TEMPLATE) so a
 * future edit to `hintAfterLogistics` does not need to touch
 * storytellerStrip.js.
 * @param {string} templateId
 * @returns {{[phaseTag:string]: string}}
 */
export function exportScenarioVoiceForHUD(templateId) {
  const voice = getScenarioVoiceForTemplate(templateId);
  return Object.freeze({
    "phase:logistics": String(voice.hintInitial ?? ""),
    "phase:stockpile": String(voice.hintAfterLogistics ?? ""),
    "phase:stability": String(voice.hintAfterStockpile ?? ""),
    "phase:completed": String(voice.hintCompleted ?? ""),
    "phase:default": String(voice.openingPressure ?? voice.summary ?? ""),
  });
}

function buildScenarioNextActionContext(scenario = {}) {
  const objectiveCopy = scenario.objectiveCopy ?? {};
  const hintCopy = scenario.hintCopy ?? {};
  return Object.freeze({
    routeLabel: String(scenario.routeLinks?.[0]?.label ?? "supply route").trim(),
    depotLabel: String(scenario.depotZones?.[0]?.label ?? "depot").trim(),
    logisticsTitle: String(objectiveCopy.logisticsTitle ?? "Reconnect the logistics loop").trim(),
    logisticsDescription: String(objectiveCopy.logisticsDescription ?? "").trim(),
    stockpileTitle: String(objectiveCopy.stockpileTitle ?? "Refill the stockpile").trim(),
    stockpileDescription: String(objectiveCopy.stockpileDescription ?? "").trim(),
    stabilityTitle: String(objectiveCopy.stabilityTitle ?? "Fortify and stabilize").trim(),
    stabilityDescription: String(objectiveCopy.stabilityDescription ?? "").trim(),
    hintInitial: String(hintCopy.initial ?? "").trim(),
    hintAfterLogistics: String(hintCopy.afterLogistics ?? "").trim(),
    hintAfterStockpile: String(hintCopy.afterStockpile ?? "").trim(),
    hintCompleted: String(hintCopy.completed ?? "").trim(),
  });
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function toIndex(ix, iz, width) {
  return ix + iz * width;
}

function setTileDirect(grid, ix, iz, tileType) {
  if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) return false;
  grid.tiles[toIndex(ix, iz, grid.width)] = tileType;
  return true;
}

function tileAt(grid, ix, iz) {
  if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) return TILE.WATER;
  return grid.tiles[toIndex(ix, iz, grid.width)];
}

function isPassableBaseTile(tileType) {
  return tileType !== TILE.WATER;
}

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

function clearInfrastructure(grid) {
  for (let i = 0; i < grid.tiles.length; i += 1) {
    const tile = grid.tiles[i];
    if (
      tile === TILE.ROAD ||
      tile === TILE.FARM ||
      tile === TILE.LUMBER ||
      tile === TILE.WAREHOUSE ||
      tile === TILE.WALL ||
      tile === TILE.RUINS
    ) {
      grid.tiles[i] = TILE.GRASS;
    }
  }
}

function clearFootprint(grid, center, radiusX, radiusZ) {
  for (let iz = center.iz - radiusZ; iz <= center.iz + radiusZ; iz += 1) {
    for (let ix = center.ix - radiusX; ix <= center.ix + radiusX; ix += 1) {
      if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
      grid.tiles[toIndex(ix, iz, grid.width)] = TILE.GRASS;
    }
  }
}

function stampCluster(grid, center, offsets, tileType) {
  for (const offset of offsets) {
    setTileDirect(grid, center.ix + offset.x, center.iz + offset.z, tileType);
  }
}

function stampRoad(grid, x0, z0, x1, z1) {
  let ix = x0;
  let iz = z0;
  setTileDirect(grid, ix, iz, TILE.ROAD);
  while (ix !== x1) {
    ix += ix < x1 ? 1 : -1;
    setTileDirect(grid, ix, iz, TILE.ROAD);
  }
  while (iz !== z1) {
    iz += iz < z1 ? 1 : -1;
    setTileDirect(grid, ix, iz, TILE.ROAD);
  }
}

function stampGrassCorridor(grid, x0, z0, x1, z1, radius = 1) {
  let ix = x0;
  let iz = z0;
  while (true) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        setTileDirect(grid, ix + dx, iz + dz, TILE.GRASS);
      }
    }
    if (ix === x1 && iz === z1) break;
    if (ix !== x1) ix += ix < x1 ? 1 : -1;
    if (iz !== z1) iz += iz < z1 ? 1 : -1;
  }
}

function findNearestScenarioAnchor(grid, startIx, startIz, maxRadius = 24) {
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let iz = startIz - radius; iz <= startIz + radius; iz += 1) {
      for (let ix = startIx - radius; ix <= startIx + radius; ix += 1) {
        if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
        if (Math.max(Math.abs(ix - startIx), Math.abs(iz - startIz)) !== radius) continue;
        if (isPassableBaseTile(tileAt(grid, ix, iz))) return { ix, iz };
      }
    }
  }
  return {
    ix: clamp(startIx, 0, grid.width - 1),
    iz: clamp(startIz, 0, grid.height - 1),
  };
}

function inflateTiles(grid, seeds = [], radius = 1, options = {}) {
  const tiles = [];
  const seen = new Set();
  const allowWater = Boolean(options.allowWater);
  for (const seed of seeds) {
    if (!seed) continue;
    for (let iz = seed.iz - radius; iz <= seed.iz + radius; iz += 1) {
      for (let ix = seed.ix - radius; ix <= seed.ix + radius; ix += 1) {
        if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
        if (Math.abs(ix - seed.ix) + Math.abs(iz - seed.iz) > radius) continue;
        const key = tileKey(ix, iz);
        if (seen.has(key)) continue;
        const tile = grid.tiles[ix + iz * grid.width];
        if (!allowWater && tile === TILE.WATER) continue;
        seen.add(key);
        tiles.push({ ix, iz });
      }
    }
  }
  return tiles;
}

// v0.10.1-r3-A5 P0-3: per-template targets for the frontier_repair family.
// Pre-r3 both temperate_plains and fertile_riverlands shared one target
// table (warehouses 2, farms 6, lumbers 3, roads 20, walls 8) which
// erased the "wetland" identity Riverlands' name promises. The Reviewer's
// Round-3 audit flagged 3 maps × 3 seeds = 9 runs all funneling into the
// same goal stripe, so even Riverlands was being scored on a "go build
// 8 walls" contract. The Riverlands override below biases mechanical
// targets toward agriculture (+33% farms, -50% walls, +bridges) so the
// scenario goal stripe finally reads differently between Plains and
// Riverlands at game start.
const FRONTIER_REPAIR_TARGETS_BY_TEMPLATE = Object.freeze({
  temperate_plains: Object.freeze({
    logistics: { warehouses: 2, farms: 6, lumbers: 3, roads: 20, walls: 8 },
    stockpile: { food: 95, wood: 90 },
    stability: { walls: 12, prosperity: 58, threat: 44, holdSec: 30 },
  }),
  fertile_riverlands: Object.freeze({
    logistics: { warehouses: 2, farms: 8, lumbers: 2, roads: 18, walls: 4, bridges: 2 },
    stockpile: { food: 110, wood: 80 },
    stability: { walls: 6, prosperity: 60, threat: 42, holdSec: 30 },
  }),
});

const FRONTIER_REPAIR_OBJECTIVE_COPY_BY_TEMPLATE = Object.freeze({
  temperate_plains: Object.freeze({
    logisticsTitle: "Reconnect the Frontier",
    // v0.8.2 Round-6 Wave-1 02b-casual (Step 7) — drop the inventory-list
    // "Reconnect the west lumber outpost, reclaim the east depot with a
    // warehouse" prose for a casual goal sentence. Mechanical targets
    // (6 farms / 3 lumbers / 8 walls / 20 roads) stay verbatim because
    // the objective tracker counts them; only framing is rewritten.
    logisticsDescription: "Connect the west forest to your warehouse, plant a warehouse on the east platform, then build 6 farms, 3 lumbers, 8 walls, and 20 roads.",
    stockpileTitle: "Refill the Stockpile",
    stockpileDescription: "Reach 95 food and 90 wood once the repaired frontier route is running.",
    stabilityTitle: "Fortify and Stabilize",
    stabilityDescription: "Build 12 walls, then hold prosperity >= 58 and threat <= 44 for 30 seconds.",
  }),
  fertile_riverlands: Object.freeze({
    logisticsTitle: "Reclaim the Hearth",
    logisticsDescription: "Dig the silted lumber road free, plant a warehouse on the east granary, then sow 8 farms, 2 lumbers, 4 walls, 2 bridges, and 18 roads across the wetlands.",
    stockpileTitle: "Lay In the Harvest",
    stockpileDescription: "Reach 110 food and 80 wood — the river-fed valley is generous, so stockpile grain ahead of the autumn floods.",
    stabilityTitle: "Hold the Banks",
    stabilityDescription: "Build 6 walls, then hold prosperity >= 60 and threat <= 42 for 30 seconds while the river works for you.",
  }),
});

function getFrontierRepairTargets(templateId) {
  const base = FRONTIER_REPAIR_TARGETS_BY_TEMPLATE[templateId]
    ?? FRONTIER_REPAIR_TARGETS_BY_TEMPLATE.temperate_plains;
  // v0.10.1-r4-A5 P0-3: attach per-template early hint so HUD/UI can
  // surface a map-specific opening goal without changing canonical
  // logistics/stockpile/stability counters the objective tracker reads.
  const earlyHint = getTemplateEarlyTargetHint(templateId);
  return earlyHint ? { ...base, earlyHint } : base;
}

function getFrontierRepairObjectiveCopy(templateId) {
  return FRONTIER_REPAIR_OBJECTIVE_COPY_BY_TEMPLATE[templateId]
    ?? FRONTIER_REPAIR_OBJECTIVE_COPY_BY_TEMPLATE.temperate_plains;
}

function buildFrontierRepairScenario(grid) {
  clearInfrastructure(grid);

  const voice = SCENARIO_VOICE_BY_TEMPLATE[grid.templateId] ?? DEFAULT_VOICE_FOR_FRONTIER_REPAIR;
  const center = findNearestScenarioAnchor(grid, Math.floor(grid.width / 2), Math.floor(grid.height / 2));
  const eastDepot = {
    ix: clamp(center.ix + 9, 3, grid.width - 4),
    iz: clamp(center.iz + 3, 3, grid.height - 4),
  };
  const westOutpost = {
    ix: clamp(center.ix - 9, 3, grid.width - 4),
    iz: clamp(center.iz - 3, 3, grid.height - 4),
  };
  // v0.8.7 T4-1 (R7 / v0.8.6 T3-5 deferred): wildlife zone now anchors on
  // the nearest LUMBER cluster instead of a fixed offset from westOutpost.
  // Old behaviour: westWilds = westOutpost + (-2, -3). When the templated
  // offset clipped to the corner / overlapped a road / fell on water, the
  // wildlife label hung over a tile with no narrative context.
  // New behaviour: compute the fixed offset as a fallback, then snap to
  // the nearest LUMBER (preferred) or RUINS tile after the cluster stamps
  // run. If no such tile exists, keep the fallback.
  const westWildsFallback = {
    ix: clamp(westOutpost.ix - 2, 2, grid.width - 3),
    iz: clamp(westOutpost.iz - 3, 2, grid.height - 3),
  };
  const eastGate = {
    ix: clamp(eastDepot.ix - 2, 2, grid.width - 3),
    iz: eastDepot.iz,
  };

  clearFootprint(grid, center, 8, 6);
  clearFootprint(grid, eastDepot, 5, 4);
  clearFootprint(grid, westOutpost, 5, 4);
  clearFootprint(grid, westWildsFallback, 3, 3);

  stampRoad(grid, center.ix - 2, center.iz, center.ix + 2, center.iz);
  stampRoad(grid, center.ix, center.iz - 1, center.ix, center.iz + 2);
  stampRoad(grid, center.ix - 4, center.iz - 1, center.ix - 2, center.iz);
  stampRoad(grid, center.ix + 2, center.iz + 1, center.ix + 4, center.iz + 1);
  stampRoad(grid, westOutpost.ix, westOutpost.iz, westOutpost.ix + 2, westOutpost.iz);
  setTileDirect(grid, center.ix, center.iz, TILE.WAREHOUSE);

  stampCluster(grid, center, [{ x: 1, z: 2 }, { x: 2, z: 2 }, { x: -1, z: 2 }, { x: -2, z: 2 }], TILE.FARM);
  stampCluster(grid, center, [{ x: 3, z: -1 }], TILE.LUMBER);
  stampCluster(grid, westOutpost, [{ x: 0, z: 0 }], TILE.LUMBER);
  // Snap westWilds to the nearest LUMBER/RUINS cluster post-stamping.
  const centerWorld = tileToWorld(center.ix, center.iz, grid);
  const lumberNear = findNearestTileOfTypes(
    grid,
    { x: centerWorld.x, z: centerWorld.z },
    [TILE.LUMBER, TILE.RUINS],
  );
  const westWilds = lumberNear
    ? {
        ix: clamp(lumberNear.ix - 1, 2, grid.width - 3),
        iz: clamp(lumberNear.iz - 1, 2, grid.height - 3),
      }
    : westWildsFallback;
  stampCluster(grid, westWilds, [{ x: 0, z: 0 }, { x: 1, z: 0 }], TILE.RUINS);

  setTileDirect(grid, westOutpost.ix + 3, westOutpost.iz, TILE.RUINS);
  setTileDirect(grid, eastDepot.ix + 1, eastDepot.iz, TILE.RUINS);
  setTileDirect(grid, eastDepot.ix + 2, eastDepot.iz, TILE.RUINS);

  stampCluster(grid, eastDepot, [{ x: 0, z: -1 }, { x: 0, z: 1 }, { x: 1, z: -1 }], TILE.WALL);
  stampCluster(grid, center, [{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: -1, z: 3 }, { x: 1, z: 3 }], TILE.WALL);
  grid.version = Number(grid.version ?? 0) + 1;

  return {
    id: "alpha_broken_frontier",
    family: "frontier_repair",
    title: voice.title,
    summary: voice.summary,
    openingPressure: voice.openingPressure,
    anchors: {
      coreWarehouse: { ix: center.ix, iz: center.iz },
      westLumberOutpost: { ix: westOutpost.ix, iz: westOutpost.iz },
      eastDepot: { ix: eastDepot.ix, iz: eastDepot.iz },
      eastGate: { ix: eastGate.ix, iz: eastGate.iz },
      westWilds: { ix: westWilds.ix, iz: westWilds.iz },
    },
    routeLinks: [
      {
        id: "west-route",
        label: "west lumber route",
        from: "coreWarehouse",
        to: "westLumberOutpost",
        gapTiles: [
          { ix: center.ix - 5, iz: center.iz - 1 },
          { ix: center.ix - 6, iz: center.iz - 1 },
          { ix: westOutpost.ix + 3, iz: westOutpost.iz },
          { ix: westOutpost.ix + 4, iz: westOutpost.iz },
        ],
        radius: 1,
        hint: "Reconnect the west lumber route with roads.",
      },
    ],
    depotZones: [
      {
        id: "east-depot",
        label: "east ruined depot",
        anchor: "eastDepot",
        radius: 2,
        hint: "Place a warehouse near the east ruined depot.",
      },
    ],
    chokePoints: [
      {
        id: "east-gate",
        label: "east depot gate",
        anchor: "eastGate",
        radius: 2,
      },
    ],
    wildlifeZones: [
      {
        id: "west-wilds",
        label: "west frontier wilds",
        anchor: "westWilds",
        radius: 2,
      },
    ],
    weatherFocus: {
      [WEATHER.RAIN]: [{ kind: "route", id: "west-route" }, { kind: "depot", id: "east-depot" }],
      [WEATHER.STORM]: [{ kind: "route", id: "west-route" }, { kind: "depot", id: "east-depot" }, { kind: "wildlife", id: "west-wilds" }],
      [WEATHER.WINTER]: [{ kind: "route", id: "west-route" }, { kind: "wildlife", id: "west-wilds" }],
      [WEATHER.DROUGHT]: [{ kind: "farms", limit: 6 }],
    },
    eventFocus: {
      [EVENT_TYPE.BANDIT_RAID]: [{ kind: "route", id: "west-route" }, { kind: "depot", id: "east-depot" }],
      [EVENT_TYPE.TRADE_CARAVAN]: [{ kind: "depot", id: "east-depot" }],
      [EVENT_TYPE.ANIMAL_MIGRATION]: [{ kind: "wildlife", id: "west-wilds" }],
    },
    targets: getFrontierRepairTargets(grid.templateId),
    objectiveCopy: getFrontierRepairObjectiveCopy(grid.templateId),
    hintCopy: {
      initial: voice.hintInitial,
      afterLogistics: voice.hintAfterLogistics,
      afterStockpile: voice.hintAfterStockpile,
      completed: voice.hintCompleted,
    },
  };
}

function buildGateChokepointScenario(grid) {
  clearInfrastructure(grid);

  const voice = SCENARIO_VOICE_BY_TEMPLATE[grid.templateId] ?? DEFAULT_VOICE_FOR_GATE_CHOKEPOINTS;
  const center = findNearestScenarioAnchor(grid, Math.floor(grid.width / 2), Math.floor(grid.height / 2));
  const northTimber = {
    ix: clamp(center.ix - 1, 3, grid.width - 4),
    iz: clamp(center.iz - 11, 3, grid.height - 4),
  };
  const southGranary = {
    ix: clamp(center.ix + 6, 3, grid.width - 4),
    iz: clamp(center.iz + 9, 3, grid.height - 4),
  };
  const northGate = {
    ix: center.ix,
    iz: clamp(center.iz - 4, 2, grid.height - 3),
  };
  const southGate = {
    ix: clamp(center.ix + 3, 2, grid.width - 3),
    iz: clamp(center.iz + 4, 2, grid.height - 3),
  };
  // v0.8.7 T4-1: westWilds anchor snaps to nearest LUMBER/RUINS post-stamp.
  const westWildsFallback = {
    ix: clamp(center.ix - 10, 2, grid.width - 3),
    iz: clamp(center.iz + 1, 2, grid.height - 3),
  };

  clearFootprint(grid, center, 8, 8);
  clearFootprint(grid, northTimber, 4, 4);
  clearFootprint(grid, southGranary, 5, 4);
  clearFootprint(grid, westWildsFallback, 3, 3);

  stampRoad(grid, center.ix - 2, center.iz, center.ix + 2, center.iz);
  stampRoad(grid, center.ix, center.iz - 2, center.ix, center.iz + 2);
  stampRoad(grid, northTimber.ix, northTimber.iz, northTimber.ix, northGate.iz - 2);
  stampRoad(grid, center.ix, center.iz - 1, center.ix, northGate.iz + 1);
  stampRoad(grid, southGranary.ix, southGranary.iz, southGranary.ix, southGate.iz + 2);
  stampRoad(grid, center.ix + 1, center.iz + 1, center.ix + 2, southGate.iz - 1);
  setTileDirect(grid, center.ix, center.iz, TILE.WAREHOUSE);

  stampCluster(grid, center, [{ x: 1, z: 2 }], TILE.FARM);
  stampCluster(grid, southGranary, [{ x: 0, z: 0 }], TILE.FARM);
  stampCluster(grid, northTimber, [{ x: 0, z: 0 }], TILE.LUMBER);
  // Snap westWilds to nearest LUMBER/RUINS cluster.
  const centerWorld2 = tileToWorld(center.ix, center.iz, grid);
  const lumberNear2 = findNearestTileOfTypes(
    grid,
    { x: centerWorld2.x, z: centerWorld2.z },
    [TILE.LUMBER, TILE.RUINS],
  );
  const westWilds = lumberNear2
    ? {
        ix: clamp(lumberNear2.ix - 1, 2, grid.width - 3),
        iz: clamp(lumberNear2.iz - 1, 2, grid.height - 3),
      }
    : westWildsFallback;
  stampCluster(grid, westWilds, [{ x: 0, z: 0 }, { x: 1, z: 0 }], TILE.RUINS);

  stampCluster(grid, center, [
    { x: -2, z: 3 }, { x: -1, z: 3 }, { x: 0, z: 3 },
  ], TILE.WALL);
  stampCluster(grid, northGate, [
    { x: -1, z: 0 }, { x: 1, z: 0 },
  ], TILE.WALL);
  stampCluster(grid, southGate, [
    { x: -1, z: 0 }, { x: 1, z: 0 },
  ], TILE.WALL);

  setTileDirect(grid, northGate.ix, northGate.iz, TILE.RUINS);
  setTileDirect(grid, northGate.ix, northGate.iz - 1, TILE.RUINS);
  setTileDirect(grid, southGate.ix, southGate.iz, TILE.RUINS);
  setTileDirect(grid, southGranary.ix - 1, southGranary.iz + 1, TILE.RUINS);
  grid.version = Number(grid.version ?? 0) + 1;

  return {
    id: "alpha_gate_bastion",
    family: "gate_chokepoints",
    title: voice.title,
    summary: voice.summary,
    openingPressure: voice.openingPressure,
    anchors: {
      coreWarehouse: { ix: center.ix, iz: center.iz },
      northTimber: { ix: northTimber.ix, iz: northTimber.iz },
      southGranary: { ix: southGranary.ix, iz: southGranary.iz },
      northGate: { ix: northGate.ix, iz: northGate.iz },
      southGate: { ix: southGate.ix, iz: southGate.iz },
      westWilds: { ix: westWilds.ix, iz: westWilds.iz },
    },
    routeLinks: [
      {
        id: "north-gate-route",
        label: "north timber gate",
        from: "coreWarehouse",
        to: "northTimber",
        gapTiles: [
          { ix: northGate.ix, iz: northGate.iz },
          { ix: northGate.ix, iz: northGate.iz - 1 },
        ],
        radius: 1,
        hint: "Repair the north timber gate with roads.",
      },
    ],
    depotZones: [
      {
        id: "south-granary",
        label: "south granary",
        anchor: "southGranary",
        radius: 2,
        hint: "Place a warehouse near the south granary to hold the basin.",
      },
    ],
    chokePoints: [
      { id: "north-gate", label: "north gate", anchor: "northGate", radius: 2 },
      { id: "south-gate", label: "south gate", anchor: "southGate", radius: 2 },
    ],
    wildlifeZones: [
      { id: "west-wilds", label: "west ridge wilds", anchor: "westWilds", radius: 2 },
    ],
    weatherFocus: {
      [WEATHER.RAIN]: [{ kind: "route", id: "north-gate-route" }, { kind: "choke", id: "south-gate" }],
      [WEATHER.STORM]: [{ kind: "route", id: "north-gate-route" }, { kind: "choke", id: "north-gate" }, { kind: "depot", id: "south-granary" }],
      [WEATHER.WINTER]: [{ kind: "route", id: "north-gate-route" }, { kind: "choke", id: "north-gate" }],
      [WEATHER.DROUGHT]: [{ kind: "farms", limit: 6 }],
    },
    eventFocus: {
      [EVENT_TYPE.BANDIT_RAID]: [{ kind: "choke", id: "north-gate" }, { kind: "depot", id: "south-granary" }],
      [EVENT_TYPE.TRADE_CARAVAN]: [{ kind: "depot", id: "south-granary" }],
      [EVENT_TYPE.ANIMAL_MIGRATION]: [{ kind: "wildlife", id: "west-wilds" }],
    },
    // v0.10.1-r4-A5 P0-3: attach per-template earlyHint (Highlands → quarry,
    // Fortified → walls). HUD reads scenario.targets.earlyHint to surface a
    // map-specific opening goal; objective tracker still consumes the
    // canonical logistics/stockpile/stability triples.
    targets: (() => {
      const base = {
        logistics: { warehouses: 2, farms: 3, lumbers: 2, roads: 18, walls: 10 },
        stockpile: { food: 88, wood: 96 },
        stability: { walls: 14, prosperity: 56, threat: 40, holdSec: 26 },
      };
      const earlyHint = getTemplateEarlyTargetHint(grid.templateId);
      return earlyHint ? { ...base, earlyHint } : base;
    })(),
    objectiveCopy: {
      logisticsTitle: "Reopen the Basin Gates",
      logisticsDescription: "Repair the north timber gate, reclaim the south granary with a warehouse, then reach 10 walls, 3 farms, 2 lumbers, and 18 roads.",
      stockpileTitle: "Stock the Gatehouses",
      stockpileDescription: "Reach 88 food and 96 wood so the reopened basin can sustain both gates.",
      stabilityTitle: "Hold the Chokepoints",
      stabilityDescription: "Build 14 walls, then hold prosperity >= 56 and threat <= 40 for 26 seconds.",
    },
    hintCopy: {
      initial: voice.hintInitial,
      afterLogistics: voice.hintAfterLogistics,
      afterStockpile: voice.hintAfterStockpile,
      completed: voice.hintCompleted,
    },
  };
}

function buildIslandRelayScenario(grid) {
  clearInfrastructure(grid);

  const voice = SCENARIO_VOICE_BY_TEMPLATE[grid.templateId] ?? DEFAULT_VOICE_FOR_ISLAND_RELAY;
  const center = findNearestScenarioAnchor(grid, Math.floor(grid.width / 2), Math.floor(grid.height / 2));
  const harbor = {
    ix: clamp(center.ix - 10, 4, grid.width - 5),
    iz: clamp(center.iz + 2, 4, grid.height - 5),
  };
  const relayDepot = {
    ix: clamp(center.ix, 4, grid.width - 5),
    iz: clamp(center.iz, 4, grid.height - 5),
  };
  const eastFields = {
    ix: clamp(center.ix + 10, 4, grid.width - 5),
    iz: clamp(center.iz - 2, 4, grid.height - 5),
  };
  const northTimber = {
    ix: clamp(center.ix - 1, 4, grid.width - 5),
    iz: clamp(center.iz - 10, 4, grid.height - 5),
  };
  const westCauseway = {
    ix: clamp(center.ix - 5, 3, grid.width - 4),
    iz: clamp(center.iz + 1, 3, grid.height - 4),
  };
  const eastCauseway = {
    ix: clamp(center.ix + 5, 3, grid.width - 4),
    iz: clamp(center.iz - 1, 3, grid.height - 4),
  };
  // v0.8.7 T4-1: northIslet anchor snaps to nearest LUMBER/RUINS post-stamp.
  const northIsletFallback = {
    ix: clamp(northTimber.ix + 2, 3, grid.width - 4),
    iz: clamp(northTimber.iz - 2, 3, grid.height - 4),
  };

  clearFootprint(grid, harbor, 5, 4);
  clearFootprint(grid, relayDepot, 4, 4);
  clearFootprint(grid, eastFields, 5, 4);
  clearFootprint(grid, northTimber, 4, 4);
  clearFootprint(grid, northIsletFallback, 3, 3);
  stampGrassCorridor(grid, harbor.ix + 2, harbor.iz, relayDepot.ix - 2, relayDepot.iz, 1);
  stampGrassCorridor(grid, relayDepot.ix + 2, relayDepot.iz, eastFields.ix - 2, eastFields.iz, 1);
  stampGrassCorridor(grid, relayDepot.ix, relayDepot.iz - 2, northTimber.ix, northTimber.iz + 2, 1);

  stampRoad(grid, harbor.ix - 1, harbor.iz, harbor.ix + 1, harbor.iz);
  stampRoad(grid, eastFields.ix - 1, eastFields.iz, eastFields.ix + 1, eastFields.iz);
  stampRoad(grid, relayDepot.ix, relayDepot.iz - 1, relayDepot.ix, relayDepot.iz + 1);
  setTileDirect(grid, relayDepot.ix, relayDepot.iz, TILE.ROAD);
  setTileDirect(grid, harbor.ix, harbor.iz, TILE.WAREHOUSE);
  // v0.10.1-i: harbor subsistence patch — one garden tile on the harbor island
  // so workers have something to harvest before bridges are built.
  stampCluster(grid, harbor, [{ x: -3, z: 0 }], TILE.FARM);

  stampCluster(grid, eastFields, [{ x: 0, z: 0 }], TILE.FARM);
  stampCluster(grid, northTimber, [{ x: 0, z: 0 }], TILE.LUMBER);
  // Snap northIslet to nearest LUMBER/RUINS cluster from the relay depot.
  const relayDepotWorld = tileToWorld(relayDepot.ix, relayDepot.iz, grid);
  const lumberNear3 = findNearestTileOfTypes(
    grid,
    { x: relayDepotWorld.x, z: relayDepotWorld.z },
    [TILE.LUMBER, TILE.RUINS],
  );
  const northIslet = lumberNear3
    ? {
        ix: clamp(lumberNear3.ix + 1, 3, grid.width - 4),
        iz: clamp(lumberNear3.iz - 1, 3, grid.height - 4),
      }
    : northIsletFallback;
  stampCluster(grid, northIslet, [{ x: 0, z: 0 }, { x: 1, z: 0 }], TILE.RUINS);

  setTileDirect(grid, westCauseway.ix, westCauseway.iz, TILE.RUINS);
  setTileDirect(grid, westCauseway.ix + 1, westCauseway.iz, TILE.RUINS);
  setTileDirect(grid, eastCauseway.ix, eastCauseway.iz, TILE.RUINS);
  setTileDirect(grid, eastCauseway.ix - 1, eastCauseway.iz, TILE.RUINS);
  stampCluster(grid, relayDepot, [{ x: 1, z: -1 }, { x: 1, z: 1 }], TILE.WALL);
  grid.version = Number(grid.version ?? 0) + 1;

  return {
    id: "alpha_island_relay",
    family: "island_relay",
    title: voice.title,
    summary: voice.summary,
    openingPressure: voice.openingPressure,
    anchors: {
      coreWarehouse: { ix: harbor.ix, iz: harbor.iz },
      relayDepot: { ix: relayDepot.ix, iz: relayDepot.iz },
      eastFields: { ix: eastFields.ix, iz: eastFields.iz },
      northTimber: { ix: northTimber.ix, iz: northTimber.iz },
      westCauseway: { ix: westCauseway.ix, iz: westCauseway.iz },
      eastCauseway: { ix: eastCauseway.ix, iz: eastCauseway.iz },
      northIslet: { ix: northIslet.ix, iz: northIslet.iz },
    },
    routeLinks: [
      {
        id: "harbor-relay",
        label: "harbor relay causeway",
        from: "coreWarehouse",
        to: "relayDepot",
        gapTiles: [
          { ix: westCauseway.ix, iz: westCauseway.iz },
          { ix: westCauseway.ix + 1, iz: westCauseway.iz },
        ],
        radius: 1,
        hint: "Bridge the harbor relay causeway with roads.",
      },
      {
        id: "relay-east-fields",
        label: "east fields causeway",
        from: "relayDepot",
        to: "eastFields",
        gapTiles: [
          { ix: eastCauseway.ix, iz: eastCauseway.iz },
          { ix: eastCauseway.ix - 1, iz: eastCauseway.iz },
        ],
        radius: 1,
        hint: "Bridge the east fields causeway with roads.",
      },
    ],
    depotZones: [
      {
        id: "relay-depot",
        label: "central relay depot",
        anchor: "relayDepot",
        radius: 2,
        hint: "Build a warehouse on the central relay depot.",
      },
    ],
    chokePoints: [
      { id: "west-causeway", label: "west causeway", anchor: "westCauseway", radius: 2 },
      { id: "east-causeway", label: "east causeway", anchor: "eastCauseway", radius: 2 },
    ],
    wildlifeZones: [
      { id: "north-islet", label: "north islet wilds", anchor: "northIslet", radius: 2 },
    ],
    weatherFocus: {
      [WEATHER.RAIN]: [{ kind: "route", id: "harbor-relay" }, { kind: "route", id: "relay-east-fields" }],
      [WEATHER.STORM]: [{ kind: "route", id: "harbor-relay" }, { kind: "route", id: "relay-east-fields" }, { kind: "depot", id: "relay-depot" }],
      [WEATHER.WINTER]: [{ kind: "route", id: "harbor-relay" }, { kind: "choke", id: "east-causeway" }],
      [WEATHER.DROUGHT]: [{ kind: "farms", limit: 6 }],
    },
    eventFocus: {
      [EVENT_TYPE.BANDIT_RAID]: [{ kind: "choke", id: "west-causeway" }, { kind: "choke", id: "east-causeway" }],
      [EVENT_TYPE.TRADE_CARAVAN]: [{ kind: "depot", id: "relay-depot" }],
      [EVENT_TYPE.ANIMAL_MIGRATION]: [{ kind: "wildlife", id: "north-islet" }],
    },
    // v0.10.1-r4-A5 P0-3: attach per-template earlyHint (Archipelago →
    // bridge, Coastal → warehouse). See getTemplateEarlyTargetHint for
    // map → goal mapping.
    targets: (() => {
      const base = {
        logistics: { warehouses: 2, farms: 3, lumbers: 2, roads: 22, walls: 6 },
        stockpile: { food: 90, wood: 78 },
        stability: { walls: 8, prosperity: 54, threat: 48, holdSec: 24 },
      };
      const earlyHint = getTemplateEarlyTargetHint(grid.templateId);
      return earlyHint ? { ...base, earlyHint } : base;
    })(),
    objectiveCopy: {
      logisticsTitle: "Bridge the Island Relay",
      logisticsDescription: "Bridge the harbor relay and east fields causeways, build a warehouse on the relay depot, then reach 3 farms, 2 lumbers, and 22 roads.",
      stockpileTitle: "Supply the Relay",
      stockpileDescription: "Reach 90 food and 78 wood so the relay chain can feed both shores.",
      stabilityTitle: "Secure the Crossings",
      stabilityDescription: "Build 8 walls, then hold prosperity >= 54 and threat <= 48 for 24 seconds.",
    },
    hintCopy: {
      initial: voice.hintInitial,
      afterLogistics: voice.hintAfterLogistics,
      afterStockpile: voice.hintAfterStockpile,
      completed: voice.hintCompleted,
    },
  };
}

function getScenarioRefLabel(scenario, ref) {
  if (!ref || !scenario) return "unknown";
  if (ref.kind === "route") return scenario.routeLinks?.find((entry) => entry.id === ref.id)?.label ?? ref.id;
  if (ref.kind === "depot") return scenario.depotZones?.find((entry) => entry.id === ref.id)?.label ?? ref.id;
  if (ref.kind === "choke") return scenario.chokePoints?.find((entry) => entry.id === ref.id)?.label ?? ref.id;
  if (ref.kind === "wildlife") return scenario.wildlifeZones?.find((entry) => entry.id === ref.id)?.label ?? ref.id;
  if (ref.kind === "anchor") return ref.anchor ?? "anchor";
  if (ref.kind === "farms") return "farm belt";
  return ref.id ?? ref.kind ?? "unknown";
}

function resolveScenarioRefTiles(state, ref) {
  const scenario = state.gameplay?.scenario ?? {};
  const anchors = scenario.anchors ?? {};

  if (!ref) return [];
  if (ref.kind === "route") {
    const route = scenario.routeLinks?.find((entry) => entry.id === ref.id);
    if (!route) return [];
    if (Array.isArray(route.gapTiles) && route.gapTiles.length > 0) {
      return inflateTiles(state.grid, route.gapTiles, route.radius ?? 1);
    }
    return inflateTiles(state.grid, [anchors[route.from], anchors[route.to]], route.radius ?? 1);
  }
  if (ref.kind === "depot") {
    const depot = scenario.depotZones?.find((entry) => entry.id === ref.id);
    return depot ? inflateTiles(state.grid, [anchors[depot.anchor]], depot.radius ?? 2) : [];
  }
  if (ref.kind === "choke") {
    const choke = scenario.chokePoints?.find((entry) => entry.id === ref.id);
    return choke ? inflateTiles(state.grid, [anchors[choke.anchor]], choke.radius ?? 2) : [];
  }
  if (ref.kind === "wildlife") {
    const wildlife = scenario.wildlifeZones?.find((entry) => entry.id === ref.id);
    return wildlife ? inflateTiles(state.grid, [anchors[wildlife.anchor]], wildlife.radius ?? 2) : [];
  }
  if (ref.kind === "anchor") {
    return inflateTiles(state.grid, [anchors[ref.anchor]], ref.radius ?? 1);
  }
  if (ref.kind === "farms") {
    const out = [];
    const seen = new Set();
    const limit = Math.max(1, Number(ref.limit) || 6);
    for (let iz = 0; iz < state.grid.height && out.length < limit; iz += 1) {
      for (let ix = 0; ix < state.grid.width && out.length < limit; ix += 1) {
        if (state.grid.tiles[ix + iz * state.grid.width] !== TILE.FARM) continue;
        const key = tileKey(ix, iz);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ix, iz });
      }
    }
    return inflateTiles(state.grid, out, 1);
  }
  return [];
}

export function getScenarioFamilyForTemplate(templateId) {
  return SCENARIO_FAMILY_BY_TEMPLATE[templateId] ?? "frontier_repair";
}

// --- Phase 3 M1a resource node seeding ---
// Seeds forest, stone, and herb nodes on GRASS tiles of a freshly-generated
// map. Each seeded tile receives a node-flag bitmask and an initial yieldPool
// on its tileState entry. Uses services.rng for determinism; callers can also
// pass a bare `{ next }` object or a raw function for test ergonomics.

function asRngFn(services) {
  // v0.8.0 Phase 3 M1a — deterministic world-gen. Silent fallback to Math.random
  // would break benchmark reproducibility (silent-failure C1), so refuse rather
  // than drift. Callers are responsible for supplying a seeded source.
  if (typeof services === "function") return services;
  if (services && typeof services.next === "function") return () => services.next();
  const rng = services?.rng;
  if (rng && typeof rng.next === "function") return () => rng.next();
  if (typeof rng === "function") return rng;
  throw new Error("seedResourceNodes: deterministic RNG required (pass fn, { next }, or services with .rng.next)");
}

function getGrid(target) {
  if (!target) return null;
  if (target.tiles && typeof target.width === "number") return target;
  return target.grid ?? null;
}

function gridIndex(grid, ix, iz) {
  return ix + iz * grid.width;
}

function isGrassAt(grid, ix, iz) {
  if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) return false;
  return grid.tiles[gridIndex(grid, ix, iz)] === TILE.GRASS;
}

function collectGrassTiles(grid) {
  const out = [];
  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      if (grid.tiles[gridIndex(grid, ix, iz)] === TILE.GRASS) out.push({ ix, iz });
    }
  }
  return out;
}

function shuffleInPlace(arr, rngFn) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rngFn() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function rangeInt(rngFn, range, fallbackMin = 0, fallbackMax = 0) {
  const lo = Number(Array.isArray(range) ? range[0] : fallbackMin) | 0;
  const hi = Number(Array.isArray(range) ? range[1] : fallbackMax) | 0;
  const lowBound = Math.min(lo, hi);
  const highBound = Math.max(lo, hi);
  if (highBound <= lowBound) return lowBound;
  return lowBound + Math.floor(rngFn() * (highBound - lowBound + 1));
}

function setNodeOnTile(grid, ix, iz, flag, yieldPool) {
  // Read existing tileState entry (may be null for bare grass tiles) and OR
  // the new flag in. Also seed the yieldPool so tests / harvest flow can read
  // it immediately via getTileState.
  const idx = gridIndex(grid, ix, iz);
  const prev = grid.tileState?.get?.(idx) ?? null;
  const prevFlags = Number(prev?.nodeFlags ?? 0) | 0;
  setTileField(grid, ix, iz, "nodeFlags", (prevFlags | flag) >>> 0);
  setTileField(grid, ix, iz, "yieldPool", Number(yieldPool) || 0);
}

function seedForestNodes(grid, rngFn) {
  // Poisson-disk-ish sampling with min-distance 3 tiles. Walk a list of GRASS
  // tiles SORTED by score so the best candidates are tried first.
  // v0.8.6 Tier 3 R1: bias toward moist mid-elevation tiles. Pre-fix the
  // candidate list was uniform-random; FOREST nodes ended up scattered across
  // any random GRASS tile regardless of moisture/elevation. The score
  // formula prefers high moisture + mid elevation (peak at 0.55) + a small
  // jitter so two adjacent candidates with identical fields don't always tie.
  const MIN_DIST = 3;
  const count = rangeInt(rngFn, BALANCE.forestNodeCountRange, 18, 32);
  const grass = collectGrassTiles(grid);
  const moisture = grid.moisture;
  const elevation = grid.elevation;
  const width = grid.width;
  if (moisture && elevation) {
    // v0.8.7 T0-1: arrays are Float32Array in [0,1], NOT Uint8Array. The v0.8.6
    // /255 divisor + ?? 128 fallback was a bug — divided already-normalized
    // floats and produced near-zero scores so all candidates ranked ~equal.
    // Read floats directly with ?? 0.5 fallback. Clamp elev-penalty term to
    // Math.max(0, ...) before scaling: |elev-0.55|*2 can exceed 1 and produce
    // a negative contribution that depresses near-edge candidates twice.
    grass.sort((a, b) => {
      const ai = a.ix + a.iz * width;
      const bi = b.ix + b.iz * width;
      const aMoist = Number(moisture[ai] ?? 0.5);
      const bMoist = Number(moisture[bi] ?? 0.5);
      const aElev = Number(elevation[ai] ?? 0.5);
      const bElev = Number(elevation[bi] ?? 0.5);
      const aElevTerm = Math.max(0, 1 - Math.abs(aElev - 0.55) * 2);
      const bElevTerm = Math.max(0, 1 - Math.abs(bElev - 0.55) * 2);
      const aScore = 0.7 * aMoist + 0.3 * aElevTerm + rngFn() * 0.1;
      const bScore = 0.7 * bMoist + 0.3 * bElevTerm + rngFn() * 0.1;
      return bScore - aScore;
    });
  } else {
    shuffleInPlace(grass, rngFn);
  }
  const accepted = [];
  for (const tile of grass) {
    if (accepted.length >= count) break;
    let ok = true;
    for (const other of accepted) {
      const dx = other.ix - tile.ix;
      const dz = other.iz - tile.iz;
      if (dx * dx + dz * dz < MIN_DIST * MIN_DIST) { ok = false; break; }
    }
    if (!ok) continue;
    accepted.push(tile);
    setNodeOnTile(grid, tile.ix, tile.iz, NODE_FLAGS.FOREST, BALANCE.nodeYieldPoolForest ?? 80);
  }
  return accepted.length;
}

function seedStoneNodes(grid, rngFn) {
  // Cluster-walk from N seed GRASS tiles; each seed walks 3-6 steps in random
  // 4-directional moves, laying a STONE flag on each GRASS step.
  // v0.8.6 Tier 3 R2: filter seeds to ridge>0.5 OR elevation>0.6 so STONE
  // nodes cluster on rocky / mountainous terrain instead of uniform random.
  // Pre-fix Quarry buildings used elevation gating but the underlying STONE
  // nodes did not, leading to "quarry on a flat field" UX dissonance.
  const count = rangeInt(rngFn, BALANCE.stoneNodeCountRange, 10, 18);
  const grassRaw = collectGrassTiles(grid);
  const ridge = grid.ridge;
  const elevation = grid.elevation;
  const width = grid.width;
  let grass;
  if (ridge && elevation) {
    // v0.8.7 T0-1: ridge and elevation are Float32Array in [0,1]. The v0.8.6
    // /255 divisor on `e` made the elevation>0.6 branch unreachable in practice
    // (real values divided by 255 → ~0). Read floats directly with ?? 0.5
    // fallback so the ridge OR elevation OR fallback all behave correctly.
    grass = grassRaw.filter((t) => {
      const i = t.ix + t.iz * width;
      const r = Number(ridge[i] ?? 0);
      const e = Number(elevation[i] ?? 0.5);
      return r > 0.5 || e > 0.6;
    });
    if (grass.length === 0) grass = grassRaw; // safe fallback
  } else {
    grass = grassRaw;
  }
  shuffleInPlace(grass, rngFn);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let placed = 0;
  const seeds = grass.slice(0, count);
  for (const seed of seeds) {
    const steps = 3 + Math.floor(rngFn() * 4); // 3..6 inclusive
    let cx = seed.ix;
    let cz = seed.iz;
    if (isGrassAt(grid, cx, cz)) {
      setNodeOnTile(grid, cx, cz, NODE_FLAGS.STONE, BALANCE.nodeYieldPoolStone ?? 120);
      placed += 1;
    }
    for (let step = 0; step < steps; step += 1) {
      const [dx, dz] = dirs[Math.floor(rngFn() * dirs.length)];
      const nx = cx + dx;
      const nz = cz + dz;
      if (!isGrassAt(grid, nx, nz)) continue;
      cx = nx; cz = nz;
      setNodeOnTile(grid, cx, cz, NODE_FLAGS.STONE, BALANCE.nodeYieldPoolStone ?? 120);
      placed += 1;
    }
  }
  return placed;
}

function seedHerbNodes(grid, rngFn) {
  // v0.8.6 Tier 3 R3: rank candidates by moisture (descending) with bonus for
  // WATER-adjacent. Drop the FARM-adjacency criterion — FARMs are placed by
  // scenario stamping later, so seeding HERB nodes against farms only worked
  // for a tiny minority of cases. Real herb meadows correlate with water and
  // moist soil, not adjacent farmland.
  const count = rangeInt(rngFn, BALANCE.herbNodeCountRange, 12, 22);
  const grass = collectGrassTiles(grid);
  const moisture = grid.moisture;
  const width = grid.width;
  const isWaterAt = (ix, iz) => {
    if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) return false;
    return grid.tiles[gridIndex(grid, ix, iz)] === TILE.WATER;
  };
  if (moisture) {
    // v0.8.7 T0-1: moisture is Float32Array in [0,1]. Drop the v0.8.6 /255
    // divisor + ?? 128 fallback (legacy Uint8Array assumption that did not
    // match Grid.js reality) so HERB nodes actually rank by real moisture.
    grass.sort((a, b) => {
      const ai = a.ix + a.iz * width;
      const bi = b.ix + b.iz * width;
      const aMoist = Number(moisture[ai] ?? 0.5);
      const bMoist = Number(moisture[bi] ?? 0.5);
      const aWaterAdj = (isWaterAt(a.ix + 1, a.iz) || isWaterAt(a.ix - 1, a.iz)
        || isWaterAt(a.ix, a.iz + 1) || isWaterAt(a.ix, a.iz - 1)) ? 0.2 : 0;
      const bWaterAdj = (isWaterAt(b.ix + 1, b.iz) || isWaterAt(b.ix - 1, b.iz)
        || isWaterAt(b.ix, b.iz + 1) || isWaterAt(b.ix, b.iz - 1)) ? 0.2 : 0;
      const aScore = aMoist + aWaterAdj + rngFn() * 0.05;
      const bScore = bMoist + bWaterAdj + rngFn() * 0.05;
      return bScore - aScore;
    });
  } else {
    shuffleInPlace(grass, rngFn);
  }
  let placed = 0;
  for (const tile of grass) {
    if (placed >= count) break;
    setNodeOnTile(grid, tile.ix, tile.iz, NODE_FLAGS.HERB, BALANCE.nodeYieldPoolHerb ?? 60);
    placed += 1;
  }
  return placed;
}

// v0.8.0 Phase 3 M1a — world-seeded LUMBER/QUARRY/HERB_GARDEN tiles predate the
// node layer and would otherwise read nodeFlags=0 (BuildAdvisor would then
// correctly forbid rebuilding on them after demolish, a jarring UX regression).
// Auto-tag them so the map is internally consistent — player-visible gating is
// then uniform: a LUMBER tile is always sitting on a FOREST node.
function autoFlagExistingProductionTiles(grid) {
  const pairs = [
    [TILE.LUMBER, NODE_FLAGS.FOREST, Number(BALANCE.nodeYieldPoolForest ?? 80)],
    [TILE.QUARRY, NODE_FLAGS.STONE, Number(BALANCE.nodeYieldPoolStone ?? 120)],
    [TILE.HERB_GARDEN, NODE_FLAGS.HERB, Number(BALANCE.nodeYieldPoolHerb ?? 60)],
  ];
  // FARM tiles don't use nodeFlags (no corresponding NODE_FLAGS entry), but they
  // still need a seeded yieldPool or the M1 harvest-cap branch will clamp the
  // refund to zero. Scenario-placed FARMs bypass setTile() and therefore skip
  // the Grid.js init-loop pre-seed, so reconcile here.
  const farmPoolInit = Number(BALANCE.farmYieldPoolInitial ?? 120);
  let flagged = 0;
  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      const type = grid.tiles[gridIndex(grid, ix, iz)];
      if (type === TILE.FARM) {
        const prev = grid.tileState?.get?.(gridIndex(grid, ix, iz)) ?? null;
        // Only reconcile scenario-stamped FARMs that have no tileState yet
        // (prev == null). A live depleted FARM (yieldPool === 0 from soil
        // exhaustion) still has a tileState entry and must NOT be silently
        // refilled — that would mask the M1 salinization gameplay loop.
        if (prev == null) {
          setTileField(grid, ix, iz, "yieldPool", farmPoolInit);
          // Mirror the setTile(TILE.FARM) path: fixed 0.9 fertility. Grid.js
          // init uses 0.8 + random*0.2; scenario-stamped FARMs get this
          // deterministic floor so M1 harvest math doesn't zero out before
          // the 0.2 clamp (animal-ecology.test.js).
          setTileField(grid, ix, iz, "fertility", 0.9);
          flagged += 1;
        }
        continue;
      }
      for (const [tileType, flag, initialPool] of pairs) {
        if (type !== tileType) continue;
        const prev = grid.tileState?.get?.(gridIndex(grid, ix, iz)) ?? null;
        const prevFlags = Number(prev?.nodeFlags ?? 0) | 0;
        if ((prevFlags & flag) !== 0) break;
        setTileField(grid, ix, iz, "nodeFlags", (prevFlags | flag) >>> 0);
        // Only seed yieldPool if not already populated (preserve mid-game saves).
        if (!prev || Number(prev.yieldPool ?? 0) <= 0) {
          setTileField(grid, ix, iz, "yieldPool", initialPool);
        }
        flagged += 1;
        break;
      }
    }
  }
  return flagged;
}

export function seedResourceNodes(target, services) {
  const grid = getGrid(target);
  if (!grid) return { forest: 0, stone: 0, herb: 0, autoFlagged: 0 };
  const rngFn = asRngFn(services);
  const forest = seedForestNodes(grid, rngFn);
  const stone = seedStoneNodes(grid, rngFn);
  const herb = seedHerbNodes(grid, rngFn);
  const autoFlagged = autoFlagExistingProductionTiles(grid);
  return { forest, stone, herb, autoFlagged };
}

export function buildScenarioBundle(grid) {
  const family = getScenarioFamilyForTemplate(grid.templateId);
  const scenario = family === "gate_chokepoints"
    ? buildGateChokepointScenario(grid)
    : family === "island_relay"
      ? buildIslandRelayScenario(grid)
      : buildFrontierRepairScenario(grid);
  scenario.nextActionContext = buildScenarioNextActionContext(scenario);
  // v0.8.6 Tier 0 LR-C2: bootstrap safety net. After scenario stamping, ensure
  // at least 1 warehouse + 1 farm exist somewhere on the grid. Without this,
  // a scenario that ships with 0 warehouses (or has them destroyed pre-tick)
  // produces an unwinnable colony — workers harvest into carry but can never
  // deposit, and the food cache never accumulates. Place at coreWarehouse if
  // missing.
  ensureBootstrapInfrastructure(grid, scenario);
  // Scenario stamping uses setTileDirect, which writes grid.tiles but skips
  // tileState — so any FARM/LUMBER/HERB_GARDEN/QUARRY placed by scenario has no
  // yieldPool. Reconcile now so M1 harvest-gating sees a seeded pool from tick 0.
  autoFlagExistingProductionTiles(grid);
  return {
    scenario,
    // v0.8.0 Phase 4 — Survival Mode. Objectives no longer drive a "win" outcome;
    // kept as an empty array for legacy readers (HUD, telemetry, tests).
    objectives: [],
    objectiveHint: scenario.hintCopy.initial,
  };
}

/**
 * v0.8.6 Tier 0 LR-C2 — Bootstrap safety net.
 *
 * Guarantees at least 1 WAREHOUSE and 1 FARM exist on the grid post-scenario
 * stamping. The fix mounts at the coreWarehouse anchor when present (so
 * scenarios like Broken Frontier that name their core but somehow lose the
 * warehouse tile recover deterministically). Falls back to map center.
 */
function ensureBootstrapInfrastructure(grid, scenario) {
  const anchor = scenario?.anchors?.coreWarehouse
    ?? { ix: Math.floor(grid.width / 2), iz: Math.floor(grid.height / 2) };
  const cx = clamp(Number(anchor.ix ?? Math.floor(grid.width / 2)), 1, grid.width - 2);
  const cz = clamp(Number(anchor.iz ?? Math.floor(grid.height / 2)), 1, grid.height - 2);

  let hasWarehouse = false;
  let hasFarm = false;
  for (let i = 0; i < grid.tiles.length; i += 1) {
    if (grid.tiles[i] === TILE.WAREHOUSE) hasWarehouse = true;
    if (grid.tiles[i] === TILE.FARM) hasFarm = true;
    if (hasWarehouse && hasFarm) return;
  }

  if (!hasWarehouse) {
    setTileDirect(grid, cx, cz, TILE.WAREHOUSE);
  }
  if (!hasFarm) {
    // Place farm 2 tiles east of the warehouse anchor; fall back to other
    // adjacent tiles if east is blocked (water/wall/etc).
    const candidates = [
      { ix: cx + 2, iz: cz },
      { ix: cx - 2, iz: cz },
      { ix: cx, iz: cz + 2 },
      { ix: cx, iz: cz - 2 },
      { ix: cx + 1, iz: cz + 1 },
    ];
    for (const c of candidates) {
      if (c.ix < 0 || c.iz < 0 || c.ix >= grid.width || c.iz >= grid.height) continue;
      const cur = grid.tiles[toIndex(c.ix, c.iz, grid.width)];
      if (cur === TILE.WATER || cur === TILE.WALL || cur === TILE.WAREHOUSE) continue;
      setTileDirect(grid, c.ix, c.iz, TILE.FARM);
      hasFarm = true;
      break;
    }
    // Last resort — overwrite the anchor itself if every candidate failed.
    if (!hasFarm) setTileDirect(grid, cx, cz === grid.height - 2 ? cz - 1 : cz + 1, TILE.FARM);
  }
  grid.version = Number(grid.version ?? 0) + 1;
}

export function isInfrastructureNetworkTile(tileType) {
  return tileType === TILE.ROAD || tileType === TILE.WAREHOUSE || tileType === TILE.LUMBER || tileType === TILE.BRIDGE;
}

/**
 * v0.10.1-n A3 — route-endpoint diagnostic for honest road-toast copy.
 * Returns whether each route anchor sits on the infrastructure network and
 * whether the BFS connects them. Read-only diagnostic — no mechanic shift.
 *
 * @param {object} grid
 * @param {{ix:number, iz:number}|null|undefined} anchorFrom
 * @param {{ix:number, iz:number}|null|undefined} anchorTo
 * @returns {{ fromOnNetwork: boolean, toOnNetwork: boolean, connected: boolean }}
 */
export function getRouteEndpointStatus(grid, anchorFrom, anchorTo) {
  const width = Number(grid?.width ?? 0);
  const tiles = grid?.tiles ?? [];
  const onNetwork = (anchor) => {
    if (!anchor) return false;
    const idx = anchor.ix + anchor.iz * width;
    return isInfrastructureNetworkTile(tiles[idx]);
  };
  const fromOnNetwork = onNetwork(anchorFrom);
  const toOnNetwork = onNetwork(anchorTo);
  const connected = (fromOnNetwork && toOnNetwork)
    ? hasInfrastructureConnection(grid, anchorFrom, anchorTo)
    : false;
  return { fromOnNetwork, toOnNetwork, connected };
}

export function hasInfrastructureConnection(grid, start, goal) {
  if (!start || !goal) return false;
  const width = Number(grid.width ?? 0);
  const height = Number(grid.height ?? 0);
  const tiles = grid.tiles ?? [];
  const startIdx = start.ix + start.iz * width;
  const goalIdx = goal.ix + goal.iz * width;
  const startTile = tiles[startIdx];
  const goalTile = tiles[goalIdx];
  if (!isInfrastructureNetworkTile(startTile) || !isInfrastructureNetworkTile(goalTile)) return false;

  const queueIx = [start.ix];
  const queueIz = [start.iz];
  const visited = new Uint8Array(width * height);
  visited[startIdx] = 1;
  let head = 0;
  const dx = [1, -1, 0, 0];
  const dz = [0, 0, 1, -1];

  while (head < queueIx.length) {
    const currentIx = queueIx[head];
    const currentIz = queueIz[head];
    head += 1;
    if (currentIx === goal.ix && currentIz === goal.iz) return true;
    for (let i = 0; i < 4; i += 1) {
      const ix = currentIx + dx[i];
      const iz = currentIz + dz[i];
      if (ix < 0 || iz < 0 || ix >= width || iz >= height) continue;
      const idx = ix + iz * width;
      if (visited[idx]) continue;
      const tile = tiles[idx];
      if (!isInfrastructureNetworkTile(tile)) continue;
      visited[idx] = 1;
      queueIx.push(ix);
      queueIz.push(iz);
    }
  }

  return false;
}

export function hasWarehouseNear(grid, anchor, radius = 2) {
  if (!anchor) return false;
  for (let iz = anchor.iz - radius; iz <= anchor.iz + radius; iz += 1) {
    for (let ix = anchor.ix - radius; ix <= anchor.ix + radius; ix += 1) {
      if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
      if (Math.abs(ix - anchor.ix) + Math.abs(iz - anchor.iz) > radius) continue;
      if (grid.tiles[ix + iz * grid.width] === TILE.WAREHOUSE) return true;
    }
  }
  return false;
}

export function resolveScenarioFocusTiles(state, refs = []) {
  const out = [];
  const seen = new Set();
  for (const ref of refs) {
    for (const tile of resolveScenarioRefTiles(state, ref)) {
      const key = tileKey(tile.ix, tile.iz);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tile);
    }
  }
  return out;
}

export function getScenarioFocusZones(state, refs = []) {
  const scenario = state.gameplay?.scenario ?? {};
  return refs
    .map((ref) => ({
      ref,
      kind: ref?.kind ?? "unknown",
      label: getScenarioRefLabel(scenario, ref),
      tiles: resolveScenarioRefTiles(state, ref),
    }))
    .filter((entry) => entry.tiles.length > 0);
}

export function getScenarioEventCandidates(state, eventType) {
  const scenario = state.gameplay?.scenario ?? {};
  const refs = scenario.eventFocus?.[eventType] ?? [];
  return getScenarioFocusZones(state, refs);
}

function countScenarioRuntimeTiles(grid) {
  const counts = { warehouses: 0, farms: 0, lumbers: 0, roads: 0, walls: 0 };
  for (const tile of grid.tiles ?? []) {
    if (tile === TILE.WAREHOUSE) counts.warehouses += 1;
    else if (tile === TILE.FARM) counts.farms += 1;
    else if (tile === TILE.LUMBER) counts.lumbers += 1;
    else if (tile === TILE.ROAD) counts.roads += 1;
    else if (tile === TILE.WALL) counts.walls += 1;
  }
  return counts;
}

function setScenarioRuntimeCache(state, cache) {
  Object.defineProperty(state, "_scenarioRuntimeCache", {
    value: cache,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

function buildScenarioRuntimeTileSignature(grid, scenario) {
  const width = Number(grid?.width ?? 0);
  const height = Number(grid?.height ?? 0);
  const tiles = grid?.tiles ?? [];
  if (width <= 0 || height <= 0 || !tiles.length) return "0:0";

  const anchors = scenario?.anchors ?? {};
  const seen = new Set();
  let hash = 2166136261;

  const addTile = (ix, iz) => {
    const x = Number(ix);
    const z = Number(iz);
    if (!Number.isInteger(x) || !Number.isInteger(z) || x < 0 || z < 0 || x >= width || z >= height) return;
    const idx = x + z * width;
    if (seen.has(idx)) return;
    seen.add(idx);
    hash = Math.imul(hash ^ (idx + 1), 16777619);
    hash = Math.imul(hash ^ (Number(tiles[idx] ?? 0) + 31), 16777619);
  };

  const addRadius = (anchor, radius = 1) => {
    if (!anchor) return;
    const centerX = Number(anchor.ix);
    const centerZ = Number(anchor.iz);
    const r = Math.max(0, Math.floor(Number(radius ?? 1)));
    for (let iz = centerZ - r; iz <= centerZ + r; iz += 1) {
      for (let ix = centerX - r; ix <= centerX + r; ix += 1) {
        if (Math.abs(ix - centerX) + Math.abs(iz - centerZ) > r) continue;
        addTile(ix, iz);
      }
    }
  };

  for (const route of scenario?.routeLinks ?? []) {
    addRadius(anchors[route.from], 1);
    addRadius(anchors[route.to], 1);
    for (const tile of route.gapTiles ?? []) addTile(tile.ix, tile.iz);
  }
  for (const depot of scenario?.depotZones ?? []) {
    addRadius(anchors[depot.anchor], depot.radius ?? 2);
  }

  return `${seen.size}:${hash >>> 0}`;
}

export function getScenarioRuntime(state) {
  const scenario = state.gameplay?.scenario ?? {};
  const gridVersion = Number(state.grid?.version ?? 0);
  const tileSignature = buildScenarioRuntimeTileSignature(state.grid, scenario);
  const cached = state._scenarioRuntimeCache;
  if (
    cached
    && cached.scenario === scenario
    && cached.grid === state.grid
    && cached.gridVersion === gridVersion
    && cached.routeLinks === scenario.routeLinks
    && cached.depotZones === scenario.depotZones
    && cached.targets === scenario.targets
    && cached.anchors === scenario.anchors
    && cached.nextActionContext === scenario.nextActionContext
    && cached.tileSignature === tileSignature
  ) {
    return cached.runtime;
  }

  const nextActionContext = scenario.nextActionContext ?? buildScenarioNextActionContext(scenario);
  const anchors = scenario.anchors ?? {};
  const routes = (scenario.routeLinks ?? []).map((route) => ({
    ...route,
    connected: hasInfrastructureConnection(state.grid, anchors[route.from], anchors[route.to]),
  }));
  const depots = (scenario.depotZones ?? []).map((depot) => ({
    ...depot,
    ready: hasWarehouseNear(state.grid, anchors[depot.anchor], depot.radius ?? 2),
  }));
  const counts = countScenarioRuntimeTiles(state.grid);
  const logisticsTargets = scenario.targets?.logistics ?? { warehouses: 2, farms: 4, lumbers: 3, roads: 20, walls: 0 };
  const stockpileTargets = scenario.targets?.stockpile ?? { food: 95, wood: 90 };
  const stabilityTargets = scenario.targets?.stability ?? { walls: 12, prosperity: 58, threat: 44, holdSec: 30 };
  const connectedRoutes = routes.filter((route) => route.connected).length;
  const readyDepots = depots.filter((depot) => depot.ready).length;

  const runtime = {
    scenario,
    nextActionContext,
    routes,
    depots,
    counts,
    logisticsTargets,
    stockpileTargets,
    stabilityTargets,
    connectedRoutes,
    readyDepots,
  };
  setScenarioRuntimeCache(state, {
    scenario,
    grid: state.grid,
    gridVersion,
    routeLinks: scenario.routeLinks,
    depotZones: scenario.depotZones,
    targets: scenario.targets,
    anchors: scenario.anchors,
    nextActionContext: scenario.nextActionContext,
    tileSignature,
    runtime,
  });
  return runtime;
}
