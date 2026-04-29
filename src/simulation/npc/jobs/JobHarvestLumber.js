// v0.9.0-b — JobHarvestLumber: harvest wood from LUMBER tiles. Sibling to
// JobHarvestFarm/Quarry/Herb (see JobHarvestBase for shared mechanics).

import { ROLE, TILE } from "../../../config/constants.js";
import { JobHarvestBase } from "./JobHarvestBase.js";

export class JobHarvestLumber extends JobHarvestBase {
  static id = "harvest_lumber";
  static priority = 10;
  static targetTileTypes = [TILE.LUMBER];
  static produces = "wood";
  static intentLabel = "lumber";
  static stateLabel = "Harvest";
  static seekLabel = "Seek Task";
  static buildingCountKey = "lumbers";
  static pressureResource = "wood";
  static pressureSoftTarget = 25;
  static roleFit = {
    [ROLE.WOOD]: 1.0,
    [ROLE.HAUL]: 0.5,
    default: 0.1,
  };
}
