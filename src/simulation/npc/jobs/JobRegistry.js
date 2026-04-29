// v0.9.0-c — JobRegistry: frozen list of Job *instances* the scheduler
// considers each tick. Phase a registered only JobWander; phase b added
// the four harvest Jobs; phase c lands the remaining 8 — Deliver, Build,
// Eat, Rest, Process×3, GuardEngage. After phase d the legacy
// chooseWorkerIntent + commitmentCycle dispatch is removed and the
// registry becomes the *only* source of worker behaviour.
//
// Order convention: priority high (combat, survival) first, terminal-floor
// wander last. The scheduler scores all eligible Jobs per tick so order
// doesn't affect outcomes — but the consistent ordering aids determinism
// and readability of debug snapshots.
//
// Tests can construct an alternate registry (with stub Jobs) and inject it
// into a fresh JobScheduler; the production scheduler reads from this
// frozen array.

import { JobBuildSite } from "./JobBuildSite.js";
import { JobDeliverWarehouse } from "./JobDeliverWarehouse.js";
import { JobEat } from "./JobEat.js";
import { JobGuardEngage } from "./JobGuardEngage.js";
import { JobHarvestFarm } from "./JobHarvestFarm.js";
import { JobHarvestHerb } from "./JobHarvestHerb.js";
import { JobHarvestLumber } from "./JobHarvestLumber.js";
import { JobHarvestQuarry } from "./JobHarvestQuarry.js";
import { JobProcessClinic } from "./JobProcessClinic.js";
import { JobProcessKitchen } from "./JobProcessKitchen.js";
import { JobProcessSmithy } from "./JobProcessSmithy.js";
import { JobRest } from "./JobRest.js";
import { JobWander } from "./JobWander.js";

export const ALL_JOBS = Object.freeze([
  // Priority 100 — combat preempts everything.
  new JobGuardEngage(),
  // Priority 80 — survival (eat).
  new JobEat(),
  // Priority 70 — survival (rest).
  new JobRest(),
  // Priority 30 — economy: construction.
  new JobBuildSite(),
  // Priority 20 — economy: deliver carry.
  new JobDeliverWarehouse(),
  // Priority 15 — economy: process raw → refined.
  new JobProcessKitchen(),
  new JobProcessSmithy(),
  new JobProcessClinic(),
  // Priority 10 — economy: harvest raw resources.
  new JobHarvestFarm(),
  new JobHarvestLumber(),
  new JobHarvestQuarry(),
  new JobHarvestHerb(),
  // Priority 0 — terminal floor.
  new JobWander(),
]);
