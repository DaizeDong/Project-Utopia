// v0.9.0-b — JobHarvestFarm: harvest food from FARM tiles. Sibling to
// JobHarvestLumber/Quarry/Herb (see JobHarvestBase for shared mechanics).

import { ROLE, TILE } from "../../../config/constants.js";
import { JobHarvestBase } from "./JobHarvestBase.js";

export class JobHarvestFarm extends JobHarvestBase {
  static id = "harvest_farm";
  static priority = 10;
  static targetTileTypes = [TILE.FARM];
  static produces = "food";
  static intentLabel = "farm";
  static stateLabel = "Harvest";
  static seekLabel = "Seek Task";
  static buildingCountKey = "farms";
  static pressureResource = "food";
  static pressureSoftTarget = 27; // ≈ foodEmergencyThreshold (18) × 1.5
  static roleFit = {
    [ROLE.FARM]: 1.0,
    [ROLE.HAUL]: 0.5,
    default: 0.1,
  };
}
