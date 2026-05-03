// PS-late-game-stall (R8): invariant tests for the three sub-fixes that
// closed the late-game stall reviewer Run-3 trace.
//
// (a) BUILDER promotion bypasses roleChangeCooldownSec when sites unclaimed
//     — Run 3 had 0 builderId assignments across 53,675 sim-steps because
//       the v0.8.x role cooldown blocked FARM->BUILDER promotion after the
//       first manager interval set every worker to FARM.
// (b) Zombie-world session-end gate — workers=0 + no progress + 60s grace
//     forces session.phase="end" so the survival-score / leaderboard do
//     not accrue points to a corpse colony.
// (c) survivalScore worker-clamp — perSec accrual scales by
//     min(workers/4, 1) so a 0-worker colony scores 0/sec.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { updateSurvivalScore } from "../src/simulation/meta/ProgressionSystem.js";
import { ROLE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";

function placeOneBlueprint(state, buildSystem, tool) {
  for (let iz = 0; iz < state.grid.height; iz += 1) {
    for (let ix = 0; ix < state.grid.width; ix += 1) {
      const preview = buildSystem.previewToolAt(state, tool, ix, iz);
      if (!preview.ok) continue;
      const r = buildSystem.placeToolAt(state, tool, ix, iz);
      if (r?.ok && r.phase === "blueprint") return { ix, iz };
    }
  }
  return null;
}

// (a) — BUILDER promotion bypasses cooldown when sites are unclaimed.
//
// Pre-fix repro: pump RoleAssignmentSystem twice on a bare-init colony with
// blueprints; the first tick demotes everyone to FARM, the second tick
// SHOULD promote >=1 BUILDER but the cooldown suppresses the flip. Post-fix
// the cooldown bypass triggers when sitesUnclaimed=true.
test("PS-R8 (a): BUILDER promotion bypasses roleChangeCooldown when sites unclaimed", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  // Plenty of resources so blueprint placement isn't gated.
  state.resources.wood = 9999;
  state.resources.stone = 9999;
  state.resources.food = 200;

  const buildSystem = new BuildSystem();
  const placed = placeOneBlueprint(state, buildSystem, "warehouse");
  assert.ok(placed, "test setup expects a warehouse blueprint placed");
  assert.equal(state.constructionSites.length, 1);

  const workers = state.agents.filter((a) => a.type === "WORKER");
  assert.ok(workers.length >= 4, `expected at least 4 workers (got ${workers.length})`);

  // Pre-tick all workers to FARM and stamp _roleChangedAtSec=now so the
  // cooldown would normally block any role change for `roleChangeCooldownSec`.
  for (const w of workers) {
    w.role = ROLE.FARM;
    w._roleChangedAtSec = Number(state.metrics.timeSec ?? 0);
  }

  const roles = new RoleAssignmentSystem();
  // Tick once with dt < cooldown — without the bypass, BUILDER promotion
  // would be suppressed and we'd see 0 BUILDERs. With the bypass, the
  // BUILDER allocator should promote >= 1 worker because the lone site is
  // unclaimed (no builderId).
  const dt = 1.0;
  state.metrics.timeSec = (Number(state.metrics.timeSec ?? 0)) + dt;
  roles.update(dt, state);

  const builderCount = workers.filter((w) => w.role === ROLE.BUILDER).length;
  assert.ok(
    builderCount >= 1,
    `expected >= 1 BUILDER after one tick (sitesUnclaimed bypass should fire). Got ${builderCount}.`,
  );
});

// (c) — survivalScore worker-clamp: perSec accrual scales by min(workers/4, 1).
//
// 0 workers → 0 score; 4+ workers → full perSec accrual.
test("PS-R8 (c): survivalScore perSec accrual is clamped to 0 when workers=0", () => {
  const state = {
    metrics: {
      survivalScore: 0, timeSec: 0,
      birthsTotal: 0, deathsTotal: 0,
      survivalLastBirthsSeen: 0, survivalLastDeathsSeen: 0,
      populationStats: { workers: 0 },
    },
  };

  // Advance 60 sim-sec; without any productive buildings and with workers=0
  // the score must remain at 0.
  for (let i = 0; i < 60; i += 1) {
    updateSurvivalScore(state, 1);
  }
  assert.equal(
    state.metrics.survivalScore,
    0,
    `expected score=0 over 60s with workers=0 (corpse colony), got ${state.metrics.survivalScore}`,
  );
});

test("PS-R8 (c): survivalScore perSec accrual scales linearly with workers up to 4", () => {
  const perSec = Number(BALANCE.survivalScorePerSecond ?? 1);

  function accrue(workers) {
    const state = {
      metrics: {
        survivalScore: 0, timeSec: 0,
        birthsTotal: 0, deathsTotal: 0,
        survivalLastBirthsSeen: 0, survivalLastDeathsSeen: 0,
        populationStats: { workers },
      },
    };
    updateSurvivalScore(state, 10);
    return state.metrics.survivalScore;
  }

  // 1 worker → 25% of perSec; 4 workers → 100% (clamp); 8 workers → still 100%.
  const s1 = accrue(1);
  const s4 = accrue(4);
  const s8 = accrue(8);
  assert.ok(Math.abs(s1 - perSec * 10 * 0.25) < 1e-6, `expected ${perSec * 10 * 0.25}, got ${s1}`);
  assert.ok(Math.abs(s4 - perSec * 10 * 1.00) < 1e-6, `expected ${perSec * 10}, got ${s4}`);
  assert.ok(Math.abs(s8 - perSec * 10 * 1.00) < 1e-6, `expected ${perSec * 10} (clamped), got ${s8}`);
});

// (b) — Zombie-world gate. We can't easily exercise GameApp.#evaluateRunOutcome
// without bootstrapping a full headless DOM, so this test asserts the BALANCE
// constant exists with a sane value (the gate logic itself is exercised by
// the in-game smoke-test described in the plan §6 manual validation).
test("PS-R8 (b): zombieWorldGraceSec BALANCE constant exists and is sane", () => {
  const grace = Number(BALANCE.zombieWorldGraceSec);
  assert.ok(
    Number.isFinite(grace) && grace > 0,
    `BALANCE.zombieWorldGraceSec must be a positive finite number (got ${BALANCE.zombieWorldGraceSec})`,
  );
  // Default per the plan is 60s. Allow 30..600 for tunability.
  assert.ok(grace >= 30 && grace <= 600, `expected zombieWorldGraceSec in [30, 600], got ${grace}`);
});
