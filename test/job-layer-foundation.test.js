// v0.9.0-a — Job-layer foundation tests. Phase 1 of 5 in the architectural
// rewrite per /tmp/utopia-worker-architecture.md A1 + A3.
//
// Asserts:
//   1. JobScheduler picks JobWander when it's the only registered Job.
//   2. worker.currentJob is set after first tickWorker call.
//   3. Hysteresis: incumbent score gets +stickyBonus (prevents one-tick
//      flap when alternative dips slightly).
//   4. Hysteresis decay: after 30 s the sticky bonus collapses to the
//      floor and a marginally-better alt wins.
//   5. onAbandon fires when switching jobs.
//   6. Determinism: same seed + same world state → same Job pick across
//      independent harness instances.
//   7. Feature flag OFF: WorkerAISystem.update does NOT instantiate
//      JobScheduler.
//   8. Feature flag ON: JobScheduler.tickWorker is invoked exactly once
//      per active worker per tick.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";
import { JobScheduler, _HYSTERESIS } from "../src/simulation/npc/jobs/JobScheduler.js";
import { JobWander } from "../src/simulation/npc/jobs/JobWander.js";
import { Job } from "../src/simulation/npc/jobs/Job.js";
import { ALL_JOBS } from "../src/simulation/npc/jobs/JobRegistry.js";
import { FEATURE_FLAGS, _testSetFeatureFlag } from "../src/config/constants.js";

function aliveWorkers(state) {
  return state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);
}

// Stub Job whose score is a function of (worker, state, services, target)
// so tests can drive the value over time without mutating the Job class
// itself. Tracks abandonCount so test 5 can spy on switches. Each call to
// `makeStubJob` returns an instance whose constructor is a fresh anonymous
// subclass with a unique static `id`, so JobScheduler._resolveIncumbent
// (which matches via `constructor.id`) treats two stubs as distinct Jobs.
function makeStubJob(idSuffix, { scoreFn, target = { ix: 0, iz: 0 }, takeFn = () => true } = {}) {
  class _Stub extends Job {
    constructor() {
      super();
      this._scoreFn = typeof scoreFn === "function" ? scoreFn : () => 0;
      this._target = target;
      this._takeFn = takeFn;
      this.tickCount = 0;
      this.abandonCount = 0;
    }
    canTake(worker, state, services) { return Boolean(this._takeFn(worker, state, services)); }
    findTarget() { return this._target; }
    score(worker, state, services, target_) {
      return this._scoreFn(worker, state, services, target_);
    }
    tick() { this.tickCount += 1; }
    isComplete() { return false; }
    onAbandon() { this.abandonCount += 1; }
  }
  Object.defineProperty(_Stub, "id", { value: `stub_${idSuffix}`, writable: false });
  return new _Stub();
}

test("v0.9.0-a #1: JobScheduler picks JobWander when it is the only registered Job", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  const services = createServices(state.world.mapSeed);
  const scheduler = new JobScheduler();
  const worker = aliveWorkers(state)[0];
  assert.ok(worker, "expected at least one worker in bare-init");

  scheduler.tickWorker(worker, state, services, 1 / 30);

  assert.equal(worker.currentJob.id, "wander", "JobWander should win as the only Job");
  // The registered Jobs array must contain exactly one entry in phase 0.9.0-a.
  assert.equal(ALL_JOBS.length, 1, "phase 0.9.0-a registers JobWander only");
  assert.ok(ALL_JOBS[0] instanceof JobWander, "JobRegistry holds a JobWander instance");
});

test("v0.9.0-a #2: worker.currentJob populated after first tickWorker call", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  const services = createServices(state.world.mapSeed);
  const scheduler = new JobScheduler();
  const worker = aliveWorkers(state)[0];

  assert.equal(worker.currentJob, null, "worker.currentJob is null on spawn");

  scheduler.tickWorker(worker, state, services, 1 / 30);

  assert.ok(worker.currentJob, "currentJob set after tickWorker");
  assert.equal(worker.currentJob.id, "wander");
  assert.ok(worker.currentJob.target, "target captured");
  assert.equal(typeof worker.currentJob.startSec, "number");
  assert.equal(typeof worker.currentJob.lastScore, "number");
});

test("v0.9.0-a #3: hysteresis — incumbent gets +stickyBonus and retains when alt drops slightly", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  const services = createServices(state.world.mapSeed);
  state.metrics.timeSec = 0;

  // High-scoring incumbent (0.30), terminal-floor wander (0.05).
  const stub = makeStubJob("hyst3", { scoreFn: () => 0.30 });
  const wander = new JobWander();
  const scheduler = new JobScheduler([stub, wander]);
  const worker = aliveWorkers(state)[0];

  // Tick 1 — stub wins (0.30 vs 0.05).
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "stub_hyst3", "stub should be incumbent");

  // Tick 2 — stub raw drops to 0.04 (below wander's 0.05). Without sticky
  // bonus, wander would win. With STICKY_BONUS_FRESH=0.25 applied to the
  // fresh incumbent (age ≈ 1 frame): adjusted = 0.04 + 0.25 = 0.29 > 0.05.
  stub._scoreFn = () => 0.04;
  state.metrics.timeSec += 1 / 30;
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "stub_hyst3", "fresh incumbent should be retained via sticky bonus");
});

test("v0.9.0-a #4: hysteresis decay — after 30 s incumbent loses to a marginally-better alt", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  const services = createServices(state.world.mapSeed);
  state.metrics.timeSec = 0;

  // Mutable scores so the test can tune raw values across the decay
  // boundary. Tick-1: incumbent raw 0.30 wins outright vs alt 0.10 (no
  // sticky needed). Then we bump alt to 0.50 and advance time past the
  // decay window. Incumbent post-decay = 0.30 + 0.05 (floor) = 0.35; alt
  // raw = 0.50 → switch.
  let incScore = 0.30;
  let altScore = 0.10;
  const incumbent = makeStubJob("hyst4_inc", { scoreFn: () => incScore });
  const alt = makeStubJob("hyst4_alt", { scoreFn: () => altScore });
  const scheduler = new JobScheduler([incumbent, alt]);
  const worker = aliveWorkers(state)[0];

  // Tick 1 — establish incumbent on raw scores alone (no incumbent yet).
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "stub_hyst4_inc", "incumbent wins outright on tick 1");

  // Tick 2 — within decay window, sticky still strong. Bump alt to 0.50
  // but keep us at fresh sticky time (≈ 0 s old): incumbent 0.30 + 0.25 =
  // 0.55 > alt 0.50, incumbent retains.
  altScore = 0.50;
  state.metrics.timeSec = 1 / 30;
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "stub_hyst4_inc", "fresh sticky retains incumbent vs alt 0.50");

  // Advance past decay window — bonus floors to 0.05. incumbent 0.35 < alt 0.50 → switch.
  state.metrics.timeSec = _HYSTERESIS.STICKY_DECAY_SEC + 1;
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(
    worker.currentJob.id,
    "stub_hyst4_alt",
    "post-decay incumbent floor (0.05) cannot outweigh alt's 0.20 raw advantage",
  );
});

test("v0.9.0-a #5: onAbandon fires when switching jobs", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  const services = createServices(state.world.mapSeed);
  state.metrics.timeSec = 0;

  // Tick 1 — incumbent wins on raw 0.40 vs 0.10 (no incumbent yet, so no
  // sticky bonus on tick 1).
  let incumbentScore = 0.40;
  let altScore = 0.10;
  const incumbent = makeStubJob("hyst5_inc", { scoreFn: () => incumbentScore });
  const alt = makeStubJob("hyst5_alt", { scoreFn: () => altScore });
  const scheduler = new JobScheduler([incumbent, alt]);
  const worker = aliveWorkers(state)[0];

  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "stub_hyst5_inc");
  assert.equal(incumbent.abandonCount, 0, "no abandon on first establishment");

  // Force switch by collapsing incumbent score and raising alt past sticky
  // floor + raw incumbent.
  incumbentScore = 0.0;
  altScore = 0.50;
  state.metrics.timeSec = _HYSTERESIS.STICKY_DECAY_SEC + 1;
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "stub_hyst5_alt", "alt should win when incumbent collapses");
  assert.equal(incumbent.abandonCount, 1, "onAbandon fires exactly once when switching away");
});

test("v0.9.0-a #6: determinism — same seed + same world state → same Job pick", () => {
  // Two independent harnesses constructed identically must produce
  // identical worker.currentJob outcomes (id + target tile) for a worker
  // chosen by stable id, ticked the same way.
  function buildAndTick() {
    const state = createInitialGameState({ seed: 1337, bareInitial: true });
    state.session.phase = "active";
    const services = createServices(state.world.mapSeed);
    const scheduler = new JobScheduler();
    const workers = aliveWorkers(state).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const worker = workers[0];
    scheduler.tickWorker(worker, state, services, 1 / 30);
    return {
      id: worker.currentJob.id,
      target: { ...worker.currentJob.target },
      score: worker.currentJob.lastScore,
    };
  }

  const runA = buildAndTick();
  const runB = buildAndTick();
  assert.deepEqual(runA, runB, "deterministic pick across identical harness instances");
});

test("v0.9.0-a #7: feature flag OFF — WorkerAISystem.update does NOT instantiate JobScheduler", () => {
  // Default flag value is false. Confirm WorkerAISystem leaves
  // _jobScheduler untouched.
  assert.equal(FEATURE_FLAGS.USE_JOB_LAYER, false, "default flag should be OFF");

  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  const services = createServices(state.world.mapSeed);
  const workerSystem = new WorkerAISystem();
  const boidsSystem = new BoidsSystem();

  assert.equal(workerSystem._jobScheduler, null, "scheduler is null pre-update");
  state.metrics.timeSec = (state.metrics.timeSec ?? 0) + 1 / 30;
  state.metrics.tick = (state.metrics.tick ?? 0) + 1;
  workerSystem.update(1 / 30, state, services);
  boidsSystem.update(1 / 30, state, services);

  assert.equal(workerSystem._jobScheduler, null, "scheduler must remain null while flag is OFF");
});

test("v0.9.0-a #8: feature flag ON — JobScheduler invoked once per worker per tick", () => {
  // Flip the flag, instrument JobScheduler.tickWorker, run one tick, count
  // invocations vs active worker count.
  _testSetFeatureFlag("USE_JOB_LAYER", true);
  try {
    const state = createInitialGameState({ seed: 1337, bareInitial: true });
    state.session.phase = "active";
    state.resources.food = 9999; // remove hunger as a confound
    const services = createServices(state.world.mapSeed);

    const workerSystem = new WorkerAISystem();
    const boidsSystem = new BoidsSystem();

    // Run one tick. Stride is 1 at scale=1 + 12-worker bare-init so every
    // worker is processed. The scheduler was lazily instantiated; spy on
    // its tickWorker before the second tick to count invocations.
    state.metrics.timeSec = (state.metrics.timeSec ?? 0) + 1 / 30;
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    workerSystem.update(1 / 30, state, services);
    boidsSystem.update(1 / 30, state, services);
    assert.ok(workerSystem._jobScheduler, "scheduler instantiated under flag ON");

    // Spy on the tickWorker method on the live scheduler instance and run
    // a second tick. The active worker count is captured AFTER the
    // _activeWorkers list rebuild inside update; we approximate by the
    // pre-tick alive worker count which equals it for non-stress workers.
    let invocations = 0;
    const sched = workerSystem._jobScheduler;
    const original = sched.tickWorker.bind(sched);
    sched.tickWorker = (...args) => {
      invocations += 1;
      return original(...args);
    };

    const expectedWorkers = aliveWorkers(state).filter((w) => !w.isStressWorker && w.role !== "GUARD").length;

    state.metrics.timeSec += 1 / 30;
    state.metrics.tick += 1;
    workerSystem.update(1 / 30, state, services);
    boidsSystem.update(1 / 30, state, services);

    assert.equal(
      invocations,
      expectedWorkers,
      `expected one tickWorker call per non-stress non-GUARD worker; got ${invocations} for ${expectedWorkers}`,
    );
  } finally {
    _testSetFeatureFlag("USE_JOB_LAYER", false);
  }
});
