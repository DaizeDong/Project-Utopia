import { TILE } from "../../config/constants.js";

export const TOOL_TO_TILE = Object.freeze({
  road: TILE.ROAD,
  farm: TILE.FARM,
  lumber: TILE.LUMBER,
  warehouse: TILE.WAREHOUSE,
  wall: TILE.WALL,
  erase: TILE.GRASS,
});

export function toolToTile(tool) {
  return TOOL_TO_TILE[tool] ?? TILE.GRASS;
}
