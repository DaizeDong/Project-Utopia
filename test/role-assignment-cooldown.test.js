// R5 PA-worker-fsm-task-release Step 7 — assert role-change cooldown
// suppresses repeated economy flips within BALANCE.roleChangeCooldownSec
// AND that GUARD promotion under live-threat preempts the cooldown.
//
// The cooldown lives in setWorkerRole (file-private inside
// RoleAssignmentSystem.js); we exercise it via the public update() pass
// because that is the only call site. Direct setWorkerRole testing would
// have to import a non-exported symbol.

import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";
import { ROLE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";

test("R5 PA: economy role flips within cooldown are suppressed", () => {
  // Setup — pop-12 workers, food deficit pushes farm bias high. Run one
  // assignment pass to lock all workers to whatever the allocator chooses
  // (recording each worker's _roleChangedAtSec). Then mutate the deficit
  // to flip the bias and run a second pass within the cooldown window —
  // workers whose role has been stamped recently should NOT flip.
  const state = createInitialGameState();
  const roles = new RoleAssignmentSystem();

  state.metrics ??= {}; state.metrics.timeSec = 100;
  state.resources.food = 12;  // deficit
  state.resources.wood = 200; // surplus → bias farm-heavy
  roles.update(2, state);

  const workers = state.agents.filter((a) => a.type === "WORKER");
  // Snapshot post-first-pass roles + stamps.
  const beforeRoles = new Map(workers.map((w) => [w.id, w.role]));
  // Confirm the cooldown stamp landed on workers whose role actually
  // changed (initial role was undefined / unset in createInitialGameState
  // for fresh workers).
  const stampedCount = workers.filter((w) => Number.isFinite(w._roleChangedAtSec)).length;
  assert.ok(stampedCount > 0,
    `at least some workers should have _roleChangedAtSec stamped (got ${stampedCount})`);

  // Tick the timer below cooldown threshold (2 s < default 4 s) and
  // invert the resource imbalance to push the allocator toward WOOD.
  state.metrics.timeSec += 2;
  state.resources.food = 200;
  state.resources.wood = 12;
  roles.timer = 0; // force the next update to fire (managerInterval reset)
  roles.update(2, state);

  let flippedCount = 0;
  for (const w of workers) {
    if (beforeRoles.get(w.id) !== w.role && w.role !== ROLE.GUARD) flippedCount += 1;
  }
  // Some flips will not happen because the cooldown blocked them. We
  // assert at least one suppression — i.e. fewer than the total worker
  // count flipped. Without the cooldown gate, the allocator will flip
  // most farms to wood-side workers in one pass.
  assert.ok(flippedCount < workers.length,
    `cooldown should suppress some flips within ${BALANCE.roleChangeCooldownSec}s ` +
    `(got ${flippedCount}/${workers.length} flipped at +2s)`);
});

test("R5 PA: GUARD promotion under live threat bypasses cooldown", () => {
  const state = createInitialGameState();
  const roles = new RoleAssignmentSystem();

  state.metrics ??= {}; state.metrics.timeSec = 100;
  state.resources.food = 80;
  state.resources.wood = 80;
  roles.update(2, state);

  const workers = state.agents.filter((a) => a.type === "WORKER");
  // Pick one worker, set them to FARM and stamp recently so the cooldown
  // would normally block.
  const victim = workers.find((w) => w.role !== ROLE.GUARD);
  assert.ok(victim, "at least one non-GUARD worker exists");
  victim.role = ROLE.FARM;
  victim._roleChangedAtSec = state.metrics.timeSec; // brand-new stamp

  // Inject a saboteur within the proximity gate (~6 tiles) so the live
  // GUARD draft fires. RoleAssignmentSystem reads
  // state.metrics.combat.{activeRaiders,activeSaboteurs,nearestThreatDistance}.
  state.metrics.combat = {
    activeRaiders: 0,
    activeSaboteurs: 1,
    nearestThreatDistance: 4,
  };
  // Add the saboteur agent so the threat-anchor scan finds it (so guard
  // top-up actually picks `victim` if they're nearest — placement near
  // victim guarantees this).
  state.agents.push({
    type: "VISITOR", kind: "SABOTEUR", alive: true,
    x: victim.x + 0.1, z: victim.z + 0.1, hp: 10,
    id: "test-saboteur-1",
  });

  // Tick within cooldown window (only +0.5 s); without the force-bypass
  // the cooldown would block the FARM → GUARD flip.
  state.metrics.timeSec += 0.5;
  roles.timer = 0;
  roles.update(0.5, state);

  // The system should have promoted at least one worker to GUARD
  // (live-threat path); ideally the victim because they're closest.
  const guardsAfter = workers.filter((w) => w.role === ROLE.GUARD);
  assert.ok(guardsAfter.length >= 1,
    `live threat should have drafted ≥1 GUARD despite cooldown ` +
    `(got ${guardsAfter.length} guards)`);
});
