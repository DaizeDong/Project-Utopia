// v0.9.0-b — JobRegistry: frozen list of Job *instances* the scheduler
// considers each tick. Phase a registered only JobWander; phase b adds
// the four harvest Jobs. Phases c/d will append JobDeliver, JobEat,
// JobProcess, JobConstruct, JobSeekConstruct, JobRest, JobGuardCombat. After
// phase d the legacy chooseWorkerIntent + commitmentCycle dispatch is
// removed and the registry becomes the *only* source of worker behaviour.
//
// Order convention: priority-10 harvest Jobs first, terminal-floor wander
// last. The scheduler scores all eligible Jobs per tick so order doesn't
// affect outcomes — but the consistent ordering aids determinism and
// readability of debug snapshots.
//
// Tests can construct an alternate registry (with stub Jobs) and inject it
// into a fresh JobScheduler; the production scheduler reads from this
// frozen array.

import { JobHarvestFarm } from "./JobHarvestFarm.js";
import { JobHarvestHerb } from "./JobHarvestHerb.js";
import { JobHarvestLumber } from "./JobHarvestLumber.js";
import { JobHarvestQuarry } from "./JobHarvestQuarry.js";
import { JobWander } from "./JobWander.js";

export const ALL_JOBS = Object.freeze([
  new JobHarvestFarm(),
  new JobHarvestLumber(),
  new JobHarvestQuarry(),
  new JobHarvestHerb(),
  new JobWander(),
]);
