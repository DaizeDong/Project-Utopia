import { TILE } from "../../config/constants.js";

export const TOOL_TO_TILE = Object.freeze({
  road: TILE.ROAD,
  farm: TILE.FARM,
  lumber: TILE.LUMBER,
  warehouse: TILE.WAREHOUSE,
  wall: TILE.WALL,
  erase: TILE.GRASS,
  quarry: TILE.QUARRY,
  herb_garden: TILE.HERB_GARDEN,
  kitchen: TILE.KITCHEN,
  smithy: TILE.SMITHY,
  clinic: TILE.CLINIC,
  bridge: TILE.BRIDGE,
  // v0.8.4 strategic walls + GATE (Agent C). The gate tool produces a TILE.GATE
  // tile — passable for the colony, blocked for hostile factions. Faction
  // logic lives in src/simulation/navigation/Faction.js.
  gate: TILE.GATE,
});

export function toolToTile(tool) {
  return TOOL_TO_TILE[tool] ?? TILE.GRASS;
}
