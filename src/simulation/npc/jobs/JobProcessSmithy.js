// v0.9.0-c — JobProcessSmithy: SMITH role + SMITHY tile. Consumes stone +
// wood → produces tools (cycle owned by ProcessingSystem). Sibling to
// JobProcessKitchen/Clinic (see JobProcessBase for shared mechanics).

import { ROLE, TILE } from "../../../config/constants.js";
import { BALANCE } from "../../../config/balance.js";
import { JobProcessBase } from "./JobProcessBase.js";

export class JobProcessSmithy extends JobProcessBase {
  static id = "process_smithy";
  static priority = 15;
  static targetTileTypes = [TILE.SMITHY];
  static intentLabel = "smith";
  static stateLabel = "Smith";
  static seekLabel = "Seek Smithy";
  static buildingCountKey = "smithies";
  static role = ROLE.SMITH;
  static inputs = [
    { resource: "stone", min: Number(BALANCE.smithyStoneCost ?? 3) },
    { resource: "wood", min: Number(BALANCE.smithyWoodCost ?? 2) },
  ];
  static output = "tools";
  static outputSoftTarget = 6;
}
