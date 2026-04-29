// v0.9.0-c — JobProcessKitchen: COOK role + KITCHEN tile. Consumes food
// → produces meals (cycle owned by ProcessingSystem). Sibling to
// JobProcessSmithy/Clinic (see JobProcessBase for shared mechanics).

import { ROLE, TILE } from "../../../config/constants.js";
import { BALANCE } from "../../../config/balance.js";
import { JobProcessBase } from "./JobProcessBase.js";

export class JobProcessKitchen extends JobProcessBase {
  static id = "process_kitchen";
  static priority = 15;
  static targetTileTypes = [TILE.KITCHEN];
  static intentLabel = "cook";
  static stateLabel = "Cook";
  static seekLabel = "Seek Kitchen";
  static buildingCountKey = "kitchens";
  static role = ROLE.COOK;
  static inputs = [
    { resource: "food", min: Number(BALANCE.kitchenFoodCost ?? 2) },
  ];
  static output = "meals";
  static outputSoftTarget = 8;
}
