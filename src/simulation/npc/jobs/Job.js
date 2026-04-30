/**
 * Job base contract — phase 0.9.0-a (foundation, behind FEATURE_FLAGS.USE_JOB_LAYER).
 *
 * Each Job represents a discrete worker activity (wander, harvest, deliver,
 * eat, build, ...). Subclasses declare:
 *   - static id: string                              // unique key
 *   - canTake(worker, state, services): boolean     // role + buildings gate; cheap
 *   - findTarget(worker, state, services): {ix, iz, meta} | null
 *   - score(worker, state, services, target): number ∈ [0, 1]
 *   - tick(worker, state, services, dt): void       // execute one step
 *   - isComplete(worker, state, services): boolean
 *   - onAbandon(worker, state, services): void      // optional cleanup
 *
 * The scheduler invokes `canTake` first (filter), then `findTarget` (only if
 * `canTake` passes), then `score` (only if `findTarget` non-null). This means
 * `findTarget` can assume `canTake` passed; `score` can assume `target` is
 * concrete.
 *
 * Phase plan:
 *   0.9.0-a (this commit) — Job + JobScheduler + JobWander only.
 *   0.9.0-b/c — port harvest / deliver / eat / process / build / rest / guard
 *               jobs. Each new Job is a single class consuming the existing
 *               handle* helpers in WorkerAISystem.js (no behaviour change
 *               while flag stays OFF).
 *   0.9.0-d   — flip FEATURE_FLAGS.USE_JOB_LAYER to true and retire the
 *               commitmentCycle / TASK_LOCK_STATES / chooseWorkerIntent
 *               legacy dispatch.
 *   0.9.0-e   — delete legacy dispatch + tests pinned to it.
 */
export class Job {
  static id = "abstract";
  static priority = 0;

  // eslint-disable-next-line no-unused-vars
  canTake(worker, state, services) {
    return false;
  }

  // eslint-disable-next-line no-unused-vars
  findTarget(worker, state, services) {
    return null;
  }

  // eslint-disable-next-line no-unused-vars
  score(worker, state, services, target) {
    return 0;
  }

  // eslint-disable-next-line no-unused-vars
  tick(worker, state, services, dt) {}

  // eslint-disable-next-line no-unused-vars
  isComplete(worker, state, services) {
    return false;
  }

  // eslint-disable-next-line no-unused-vars
  onAbandon(worker, state, services) {}

  /**
   * v0.9.4 — survival-bypass predicate.
   *
   * When the scheduler is comparing this Job (as a candidate, not the
   * incumbent) and `isSurvivalCritical` returns true, the incumbent's
   * sticky bonus is ignored — i.e. raw-vs-raw comparison. This makes
   * survival jobs (JobEat below the seek threshold, JobRest below the
   * death threshold) preempt productive incumbents whose decayed-bonus
   * scores would otherwise pin a starving worker on a harvest tile.
   *
   * Default false: only Jobs that explicitly opt in (JobEat, JobRest)
   * trigger preemption. This preserves v0.9.0/v0.9.3 hysteresis for
   * every other Job swap (harvest → deliver → harvest, etc.).
   */
  // eslint-disable-next-line no-unused-vars
  isSurvivalCritical(worker, state, services) {
    return false;
  }
}
