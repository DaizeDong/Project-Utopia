// v0.9.0-b — JobHarvestHerb: harvest herbs from HERB_GARDEN tiles. Sibling
// to JobHarvestFarm/Lumber/Quarry (see JobHarvestBase for shared mechanics).

import { ROLE, TILE } from "../../../config/constants.js";
import { JobHarvestBase } from "./JobHarvestBase.js";

export class JobHarvestHerb extends JobHarvestBase {
  static id = "harvest_herb";
  static priority = 10;
  static targetTileTypes = [TILE.HERB_GARDEN];
  static produces = "herbs";
  static intentLabel = "gather_herbs";
  static stateLabel = "Harvest";
  static seekLabel = "Seek Task";
  static buildingCountKey = "herbGardens";
  static pressureResource = "herbs";
  static pressureSoftTarget = 20;
  static roleFit = {
    [ROLE.HERBS]: 1.0,
    [ROLE.HAUL]: 0.5,
    default: 0.1,
  };
}
