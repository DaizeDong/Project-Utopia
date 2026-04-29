// v0.9.0-c — JobProcessClinic: HERBALIST role + CLINIC tile. Consumes
// herbs → produces medicine (cycle owned by ProcessingSystem). Sibling
// to JobProcessKitchen/Smithy (see JobProcessBase for shared mechanics).

import { ROLE, TILE } from "../../../config/constants.js";
import { BALANCE } from "../../../config/balance.js";
import { JobProcessBase } from "./JobProcessBase.js";

export class JobProcessClinic extends JobProcessBase {
  static id = "process_clinic";
  static priority = 15;
  static targetTileTypes = [TILE.CLINIC];
  static intentLabel = "heal";
  static stateLabel = "Heal";
  static seekLabel = "Seek Clinic";
  static buildingCountKey = "clinics";
  static role = ROLE.HERBALIST;
  static inputs = [
    { resource: "herbs", min: Number(BALANCE.clinicHerbsCost ?? 2) },
  ];
  static output = "medicine";
  static outputSoftTarget = 6;
}
