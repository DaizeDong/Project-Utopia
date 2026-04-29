// v0.9.0-b — JobHarvestQuarry: harvest stone from QUARRY tiles. Sibling to
// JobHarvestFarm/Lumber/Herb (see JobHarvestBase for shared mechanics).

import { ROLE, TILE } from "../../../config/constants.js";
import { JobHarvestBase } from "./JobHarvestBase.js";

export class JobHarvestQuarry extends JobHarvestBase {
  static id = "harvest_quarry";
  static priority = 10;
  static targetTileTypes = [TILE.QUARRY];
  static produces = "stone";
  static intentLabel = "quarry";
  static stateLabel = "Harvest";
  static seekLabel = "Seek Task";
  static buildingCountKey = "quarries";
  static pressureResource = "stone";
  static pressureSoftTarget = 25;
  static roleFit = {
    [ROLE.STONE]: 1.0,
    [ROLE.HAUL]: 0.5,
    default: 0.1,
  };
}
