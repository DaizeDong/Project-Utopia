import { EVENT_TYPE, TILE, WEATHER } from "../../config/constants.js";
import { countTilesByType } from "../grid/Grid.js";

const SCENARIO_FAMILY_BY_TEMPLATE = Object.freeze({
  temperate_plains: "frontier_repair",
  fertile_riverlands: "frontier_repair",
  rugged_highlands: "gate_chokepoints",
  fortified_basin: "gate_chokepoints",
  archipelago_isles: "island_relay",
  coastal_ocean: "island_relay",
});

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

function buildObjectivesForScenario(scenario) {
  return [
    {
      id: "logistics-1",
      title: scenario.objectiveCopy.logisticsTitle,
      description: scenario.objectiveCopy.logisticsDescription,
      completed: false,
      progress: 0,
      reward: "+18 food, +18 wood",
    },
    {
      id: "stockpile-1",
      title: scenario.objectiveCopy.stockpileTitle,
      description: scenario.objectiveCopy.stockpileDescription,
      completed: false,
      progress: 0,
      reward: "Spawn +4 workers",
    },
    {
      id: "stability-1",
      title: scenario.objectiveCopy.stabilityTitle,
      description: scenario.objectiveCopy.stabilityDescription,
      completed: false,
      progress: 0,
      reward: "Permanent doctrine bonus +8%",
    },
  ];
}

function buildFrontierRepairScenario(grid) {
  clearInfrastructure(grid);

  const center = findNearestScenarioAnchor(grid, Math.floor(grid.width / 2), Math.floor(grid.height / 2));
  const eastDepot = {
    ix: clamp(center.ix + 9, 3, grid.width - 4),
    iz: clamp(center.iz + 3, 3, grid.height - 4),
  };
  const westOutpost = {
    ix: clamp(center.ix - 9, 3, grid.width - 4),
    iz: clamp(center.iz - 3, 3, grid.height - 4),
  };
  const westWilds = {
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
  clearFootprint(grid, westWilds, 3, 3);

  stampRoad(grid, center.ix - 2, center.iz, center.ix + 2, center.iz);
  stampRoad(grid, center.ix, center.iz - 1, center.ix, center.iz + 2);
  stampRoad(grid, center.ix - 4, center.iz - 1, center.ix - 2, center.iz);
  stampRoad(grid, center.ix + 2, center.iz + 1, center.ix + 4, center.iz + 1);
  stampRoad(grid, westOutpost.ix, westOutpost.iz, westOutpost.ix + 2, westOutpost.iz);
  setTileDirect(grid, center.ix, center.iz, TILE.WAREHOUSE);

  stampCluster(grid, center, [{ x: 1, z: 2 }, { x: 2, z: 2 }], TILE.FARM);
  stampCluster(grid, westOutpost, [{ x: 0, z: 0 }], TILE.LUMBER);
  stampCluster(grid, westWilds, [{ x: 0, z: 0 }, { x: 1, z: 0 }], TILE.RUINS);

  setTileDirect(grid, westOutpost.ix + 3, westOutpost.iz, TILE.RUINS);
  setTileDirect(grid, eastDepot.ix + 1, eastDepot.iz, TILE.RUINS);
  setTileDirect(grid, eastDepot.ix + 2, eastDepot.iz, TILE.RUINS);

  stampCluster(grid, eastDepot, [{ x: 0, z: -1 }, { x: 0, z: 1 }, { x: 1, z: -1 }], TILE.WALL);
  grid.version = Number(grid.version ?? 0) + 1;

  return {
    id: "alpha_broken_frontier",
    family: "frontier_repair",
    title: "Broken Frontier",
    summary: "Reconnect the west lumber line, reclaim the east depot, then scale the colony.",
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
    targets: {
      logistics: { warehouses: 2, farms: 4, lumbers: 3, roads: 20, walls: 0 },
      stockpile: { food: 95, wood: 90 },
      stability: { walls: 12, prosperity: 58, threat: 44, holdSec: 30 },
    },
    objectiveCopy: {
      logisticsTitle: "Reconnect the Frontier",
      logisticsDescription: "Reconnect the west lumber outpost, reclaim the east depot with a warehouse, then reach 4 farms, 3 lumbers, and 20 roads.",
      stockpileTitle: "Refill the Stockpile",
      stockpileDescription: "Reach 95 food and 90 wood once the repaired frontier route is running.",
      stabilityTitle: "Fortify and Stabilize",
      stabilityDescription: "Build 12 walls, then hold prosperity >= 58 and threat <= 44 for 30 seconds.",
    },
    hintCopy: {
      initial: "Reconnect the west lumber route and reclaim the east depot before scaling up.",
      afterLogistics: "Starter logistics online. Refill the stockpile.",
      afterStockpile: "Fortify the colony and hold stability under pressure.",
      completed: "All objectives completed.",
    },
  };
}

function buildGateChokepointScenario(grid) {
  clearInfrastructure(grid);

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
  const westWilds = {
    ix: clamp(center.ix - 10, 2, grid.width - 3),
    iz: clamp(center.iz + 1, 2, grid.height - 3),
  };

  clearFootprint(grid, center, 8, 8);
  clearFootprint(grid, northTimber, 4, 4);
  clearFootprint(grid, southGranary, 5, 4);
  clearFootprint(grid, westWilds, 3, 3);

  setTileDirect(grid, center.ix, center.iz, TILE.WAREHOUSE);
  stampRoad(grid, center.ix - 2, center.iz, center.ix + 2, center.iz);
  stampRoad(grid, center.ix, center.iz - 2, center.ix, center.iz + 2);
  stampRoad(grid, northTimber.ix, northTimber.iz, northTimber.ix, northGate.iz - 2);
  stampRoad(grid, center.ix, center.iz - 1, center.ix, northGate.iz + 1);
  stampRoad(grid, southGranary.ix, southGranary.iz, southGranary.ix, southGate.iz + 2);
  stampRoad(grid, center.ix + 1, center.iz + 1, center.ix + 2, southGate.iz - 1);

  stampCluster(grid, center, [{ x: 1, z: 2 }], TILE.FARM);
  stampCluster(grid, southGranary, [{ x: 0, z: 0 }, { x: -1, z: 0 }], TILE.FARM);
  stampCluster(grid, northTimber, [{ x: 0, z: 0 }], TILE.LUMBER);
  stampCluster(grid, westWilds, [{ x: 0, z: 0 }, { x: 1, z: 0 }], TILE.RUINS);

  stampCluster(grid, center, [
    { x: -3, z: -2 }, { x: -3, z: -1 }, { x: -3, z: 0 },
    { x: 3, z: -2 }, { x: 3, z: -1 }, { x: 3, z: 0 },
    { x: -2, z: 3 }, { x: -1, z: 3 }, { x: 0, z: 3 },
  ], TILE.WALL);
  stampCluster(grid, northGate, [
    { x: -1, z: -1 }, { x: -1, z: 0 }, { x: -1, z: 1 },
    { x: 1, z: -1 }, { x: 1, z: 0 }, { x: 1, z: 1 },
  ], TILE.WALL);
  stampCluster(grid, southGate, [
    { x: -1, z: -1 }, { x: -1, z: 0 }, { x: -1, z: 1 },
    { x: 1, z: -1 }, { x: 1, z: 0 }, { x: 1, z: 1 },
  ], TILE.WALL);

  setTileDirect(grid, northGate.ix, northGate.iz, TILE.RUINS);
  setTileDirect(grid, northGate.ix, northGate.iz - 1, TILE.RUINS);
  setTileDirect(grid, southGate.ix, southGate.iz, TILE.RUINS);
  setTileDirect(grid, southGranary.ix - 1, southGranary.iz + 1, TILE.RUINS);
  grid.version = Number(grid.version ?? 0) + 1;

  return {
    id: "alpha_gate_bastion",
    family: "gate_chokepoints",
    title: "Gate Bastion",
    summary: "Reopen the north timber gate, reclaim the south granary, and stabilize two chokepoints.",
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
    targets: {
      logistics: { warehouses: 2, farms: 3, lumbers: 2, roads: 18, walls: 10 },
      stockpile: { food: 88, wood: 96 },
      stability: { walls: 14, prosperity: 56, threat: 40, holdSec: 26 },
    },
    objectiveCopy: {
      logisticsTitle: "Reopen the Basin Gates",
      logisticsDescription: "Repair the north timber gate, reclaim the south granary with a warehouse, then reach 10 walls, 3 farms, 2 lumbers, and 18 roads.",
      stockpileTitle: "Stock the Gatehouses",
      stockpileDescription: "Reach 88 food and 96 wood so the reopened basin can sustain both gates.",
      stabilityTitle: "Hold the Chokepoints",
      stabilityDescription: "Build 14 walls, then hold prosperity >= 56 and threat <= 40 for 26 seconds.",
    },
    hintCopy: {
      initial: "Repair the north gate, then reclaim the south granary before scaling up the bastion.",
      afterLogistics: "The gates are open. Stock food and wood before the next pressure wave.",
      afterStockpile: "Close the defense loop and hold both chokepoints.",
      completed: "All objectives completed.",
    },
  };
}

function buildIslandRelayScenario(grid) {
  clearInfrastructure(grid);

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
  const northIslet = {
    ix: clamp(northTimber.ix + 2, 3, grid.width - 4),
    iz: clamp(northTimber.iz - 2, 3, grid.height - 4),
  };

  clearFootprint(grid, harbor, 5, 4);
  clearFootprint(grid, relayDepot, 4, 4);
  clearFootprint(grid, eastFields, 5, 4);
  clearFootprint(grid, northTimber, 4, 4);
  clearFootprint(grid, northIslet, 3, 3);
  stampGrassCorridor(grid, harbor.ix + 2, harbor.iz, relayDepot.ix - 2, relayDepot.iz, 1);
  stampGrassCorridor(grid, relayDepot.ix + 2, relayDepot.iz, eastFields.ix - 2, eastFields.iz, 1);
  stampGrassCorridor(grid, relayDepot.ix, relayDepot.iz - 2, northTimber.ix, northTimber.iz + 2, 1);

  setTileDirect(grid, harbor.ix, harbor.iz, TILE.WAREHOUSE);
  stampRoad(grid, harbor.ix - 1, harbor.iz, harbor.ix + 1, harbor.iz);
  stampRoad(grid, eastFields.ix - 1, eastFields.iz, eastFields.ix + 1, eastFields.iz);
  stampRoad(grid, relayDepot.ix, relayDepot.iz - 1, relayDepot.ix, relayDepot.iz + 1);
  setTileDirect(grid, relayDepot.ix, relayDepot.iz, TILE.ROAD);

  stampCluster(grid, eastFields, [{ x: 0, z: 0 }, { x: 1, z: 0 }], TILE.FARM);
  stampCluster(grid, northTimber, [{ x: 0, z: 0 }], TILE.LUMBER);
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
    title: "Island Relay",
    summary: "Bridge two causeways, claim the relay depot, and connect the harbor to the outer fields.",
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
    targets: {
      logistics: { warehouses: 2, farms: 3, lumbers: 2, roads: 22, walls: 6 },
      stockpile: { food: 90, wood: 78 },
      stability: { walls: 8, prosperity: 54, threat: 48, holdSec: 24 },
    },
    objectiveCopy: {
      logisticsTitle: "Bridge the Island Relay",
      logisticsDescription: "Bridge the harbor relay and east fields causeways, build a warehouse on the relay depot, then reach 3 farms, 2 lumbers, and 22 roads.",
      stockpileTitle: "Supply the Relay",
      stockpileDescription: "Reach 90 food and 78 wood so the relay chain can feed both shores.",
      stabilityTitle: "Secure the Crossings",
      stabilityDescription: "Build 8 walls, then hold prosperity >= 54 and threat <= 48 for 24 seconds.",
    },
    hintCopy: {
      initial: "Bridge the harbor and east causeways, then claim the relay depot with a warehouse.",
      afterLogistics: "The relay is online. Push enough food and wood across the split map.",
      afterStockpile: "Secure the crossings and hold the outer shoreline.",
      completed: "All objectives completed.",
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

export function buildScenarioBundle(grid) {
  const family = getScenarioFamilyForTemplate(grid.templateId);
  const scenario = family === "gate_chokepoints"
    ? buildGateChokepointScenario(grid)
    : family === "island_relay"
      ? buildIslandRelayScenario(grid)
      : buildFrontierRepairScenario(grid);
  return {
    scenario,
    objectives: buildObjectivesForScenario(scenario),
    objectiveHint: scenario.hintCopy.initial,
  };
}

export function isInfrastructureNetworkTile(tileType) {
  return tileType === TILE.ROAD || tileType === TILE.WAREHOUSE || tileType === TILE.LUMBER;
}

export function hasInfrastructureConnection(grid, start, goal) {
  if (!start || !goal) return false;
  const startTile = grid.tiles[start.ix + start.iz * grid.width];
  const goalTile = grid.tiles[goal.ix + goal.iz * grid.width];
  if (!isInfrastructureNetworkTile(startTile) || !isInfrastructureNetworkTile(goalTile)) return false;

  const queue = [start];
  const visited = new Set([tileKey(start.ix, start.iz)]);
  const neighbors = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.ix === goal.ix && current.iz === goal.iz) return true;
    for (const neighbor of neighbors) {
      const ix = current.ix + neighbor.x;
      const iz = current.iz + neighbor.z;
      if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
      const key = tileKey(ix, iz);
      if (visited.has(key)) continue;
      const tile = grid.tiles[ix + iz * grid.width];
      if (!isInfrastructureNetworkTile(tile)) continue;
      visited.add(key);
      queue.push({ ix, iz });
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

export function getScenarioRuntime(state) {
  const scenario = state.gameplay?.scenario ?? {};
  const anchors = scenario.anchors ?? {};
  const routes = (scenario.routeLinks ?? []).map((route) => ({
    ...route,
    connected: hasInfrastructureConnection(state.grid, anchors[route.from], anchors[route.to]),
  }));
  const depots = (scenario.depotZones ?? []).map((depot) => ({
    ...depot,
    ready: hasWarehouseNear(state.grid, anchors[depot.anchor], depot.radius ?? 2),
  }));
  const counts = {
    warehouses: countTilesByType(state.grid, [TILE.WAREHOUSE]),
    farms: countTilesByType(state.grid, [TILE.FARM]),
    lumbers: countTilesByType(state.grid, [TILE.LUMBER]),
    roads: countTilesByType(state.grid, [TILE.ROAD]),
    walls: countTilesByType(state.grid, [TILE.WALL]),
  };
  const logisticsTargets = scenario.targets?.logistics ?? { warehouses: 2, farms: 4, lumbers: 3, roads: 20, walls: 0 };
  const stockpileTargets = scenario.targets?.stockpile ?? { food: 95, wood: 90 };
  const stabilityTargets = scenario.targets?.stability ?? { walls: 12, prosperity: 58, threat: 44, holdSec: 30 };
  const connectedRoutes = routes.filter((route) => route.connected).length;
  const readyDepots = depots.filter((depot) => depot.ready).length;

  return {
    scenario,
    routes,
    depots,
    counts,
    logisticsTargets,
    stockpileTargets,
    stabilityTargets,
    connectedRoutes,
    readyDepots,
  };
}
