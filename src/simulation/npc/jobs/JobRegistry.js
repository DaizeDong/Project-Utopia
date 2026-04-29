// v0.9.0-a — JobRegistry: frozen list of Job *instances* the scheduler
// considers each tick. Phase a registers only JobWander (the terminal
// floor). Phases b/c append JobHarvest, JobDeliver, JobEat, JobProcess,
// JobConstruct, JobSeekConstruct, JobRest, JobGuardCombat. After phase d
// the legacy chooseWorkerIntent + commitmentCycle dispatch is removed and
// the registry becomes the *only* source of worker behaviour.
//
// Tests can construct an alternate registry (with stub Jobs) and inject it
// into a fresh JobScheduler; the production scheduler reads from this
// frozen array.

import { JobWander } from "./JobWander.js";

export const ALL_JOBS = Object.freeze([
  new JobWander(),
]);
