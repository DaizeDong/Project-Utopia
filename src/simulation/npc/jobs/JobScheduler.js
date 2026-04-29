// v0.9.0-a — JobScheduler: per-worker dispatcher with utility hysteresis.
//
// Contract:
//   - The scheduler **never holds a global lock**. Every tick it re-scores
//     all eligible Jobs. The sticky bonus is the only mechanism preventing
//     flapping.
//   - `worker.currentJob` is the source of truth for what the worker is
//     currently doing. The legacy `worker.stateLabel` and
//     `worker.blackboard.intent` are set by individual Jobs' `tick()`
//     methods (JobWander already does this; later Jobs will too) for
//     UI/test backward compat.
//   - Determinism: `worker.currentJob` is retained across ticks → an
//     identical seed produces identical Job picks given identical world
//     state.
//
// Hysteresis (replaces v0.8.x commitmentCycle / TASK_LOCK_STATES):
//   - The currently-chosen Job's score is augmented by `stickyBonus` when
//     the scheduler re-evaluates. Bonus starts at STICKY_BONUS_FRESH (0.25)
//     and decays linearly to STICKY_BONUS_FLOOR (0.05) over STICKY_DECAY_SEC
//     (30 s). After 30 s the floor (0.05) keeps the incumbent ahead of
//     a tied competitor without locking the worker out of switching when
//     the alternative is meaningfully better.
//   - A Job that completes (returns true from isComplete) clears
//     `worker.currentJob` so the next tick re-picks fresh.
//
// Phase 0.9.0-a hard constraints:
//   - WorkerAISystem.update calls `tickWorker` only when
//     FEATURE_FLAGS.USE_JOB_LAYER is true. Default OFF → zero behaviour
//     change in this commit.

import { ALL_JOBS } from "./JobRegistry.js";

const STICKY_BONUS_FRESH = 0.25; // bonus when current job is brand new
const STICKY_BONUS_FLOOR = 0.05; // floor after decay
const STICKY_DECAY_SEC = 30; // linear decay window

export class JobScheduler {
  constructor(jobs = null) {
    this._jobs = Array.isArray(jobs) && jobs.length > 0 ? jobs : ALL_JOBS;
    this._stats = { pickCount: 0, switchCount: 0, abandonCount: 0 };
  }

  /**
   * Drive one tick for one worker.
   *
   * Side effects: writes
   *   worker.currentJob = { id, target, startSec, lastScore }
   * unless no Job passes canTake (which JobWander prevents in production).
   * Calls the winning Job's `tick(worker, state, services, dt)` after
   * resolution. Calls `onAbandon` on the previous Job when switching, and
   * again (plus clears currentJob) when the new winner reports
   * `isComplete()` after its tick.
   */
  tickWorker(worker, state, services, dt) {
    const nowSec = Number(state?.metrics?.timeSec ?? 0);
    const incumbent = this._resolveIncumbent(worker);
    const incumbentAgeSec = incumbent
      ? Math.max(0, nowSec - Number(worker.currentJob?.startSec ?? nowSec))
      : 0;
    const stickyBonus = this._stickyBonus(incumbentAgeSec);

    let bestJob = null;
    let bestTarget = null;
    let bestScore = -Infinity;

    for (const job of this._jobs) {
      if (!job.canTake(worker, state, services)) continue;
      const target = job.findTarget(worker, state, services);
      if (!target) continue;
      const raw = Number(job.score(worker, state, services, target) ?? 0);
      const isIncumbent = incumbent && job.constructor === incumbent.constructor;
      const adjusted = isIncumbent ? raw + stickyBonus : raw;
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestJob = job;
        bestTarget = target;
      }
    }

    if (!bestJob) {
      // No eligible Job — leave worker.currentJob alone (incumbent ticks
      // once more to gracefully complete) or noop. JobWander always passes
      // canTake so this branch should be unreachable in practice.
      return;
    }

    const switching = !incumbent || bestJob.constructor !== incumbent.constructor;
    if (switching) {
      if (incumbent) {
        incumbent.onAbandon(worker, state, services);
        this._stats.abandonCount += 1;
      }
      worker.currentJob = {
        id: bestJob.constructor.id,
        target: bestTarget,
        startSec: nowSec,
        lastScore: bestScore,
      };
      this._stats.switchCount += 1;
    } else {
      // Incumbent retained; refresh lastScore/target for telemetry.
      worker.currentJob.lastScore = bestScore;
      worker.currentJob.target = bestTarget;
    }
    this._stats.pickCount += 1;

    bestJob.tick(worker, state, services, dt);
    if (bestJob.isComplete(worker, state, services)) {
      bestJob.onAbandon(worker, state, services);
      this._stats.abandonCount += 1;
      worker.currentJob = null; // next tick re-picks fresh
    }
  }

  _resolveIncumbent(worker) {
    if (!worker?.currentJob) return null;
    return this._jobs.find((j) => j.constructor.id === worker.currentJob.id) ?? null;
  }

  _stickyBonus(ageSec) {
    if (ageSec >= STICKY_DECAY_SEC) return STICKY_BONUS_FLOOR;
    const t = ageSec / STICKY_DECAY_SEC;
    return STICKY_BONUS_FRESH + (STICKY_BONUS_FLOOR - STICKY_BONUS_FRESH) * t;
  }

  getStats() {
    return { ...this._stats };
  }
}

// Exported so tests can assert exact decay arithmetic without re-deriving
// the constants.
export const _HYSTERESIS = Object.freeze({
  STICKY_BONUS_FRESH,
  STICKY_BONUS_FLOOR,
  STICKY_DECAY_SEC,
});
