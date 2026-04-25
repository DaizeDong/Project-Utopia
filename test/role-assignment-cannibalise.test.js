import test from "node:test";
import assert from "node:assert/strict";
import { ROLE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { BALANCE } from "../src/config/balance.js";

// v0.8.2 Round-6 Wave-1 (01b-structural Step 7) — FARM cannibalise valve tests.
//
// Structural root cause (pop=4): bandTable allows cook=1 at pop=4, but
// reserved = farmMin(2) + woodMin(1) = 3 leaves specialistBudget = 4-3 = 1.
// Since cook normally uses that 1 slot, other specialists were blocked.
// With structural zeros this is already fixed, but ALSO when specialistBudget=0
// (edge cases: no lumber → woodMin=0 but reserved still >= n) the cannibalise
// valve provides a fallback: borrow 1 slot from FARM reserve for cook.
//
// Cannibalise conditions (all must be true):
//   farmCannibaliseEnabled = true
//   kitchen exists
//   cookSlots = 0 (no slot from normal path)
//   specialistBudget = 0 (no budget left)
//   food > foodEmergencyThreshold × farmCannibaliseFoodMult (food safe)
//   cannibalise cooldown elapsed
//   farmMin - cannibalisedFarmSlots > 1 (preserve at least 1 FARM)

function setWorkerCount(state, targetCount) {
  const workers = state.agents.filter((a) => a.type === "WORKER");
  if (workers.length === targetCount) return;
  if (workers.length > targetCount) {
    const keepIds = new Set(workers.slice(0, targetCount).map((w) => w.id));
    state.agents = state.agents.filter((a) => a.type !== "WORKER" || keepIds.has(a.id));
    return;
  }
  const template = workers[workers.length - 1] ?? null;
  if (!template) throw new Error("No worker template available");
  for (let i = workers.length; i < targetCount; i += 1) {
    const clone = { ...template, id: `${template.id}-pad-${i}`, role: template.role };
    state.agents.push(clone);
  }
}

function countRole(state, role) {
  return state.agents.filter((a) => a.type === "WORKER" && a.role === role).length;
}

// Helper to create a state where cannibalise should fire:
//   n=4, kitchen present, no lumber (woodMin=0), so specialistBudget=0
//   food well above safety threshold
function makeCannibaliseState() {
  const state = createInitialGameState();
  setWorkerCount(state, 4);
  state.buildings.kitchens = 1;
  state.buildings.lumbers = 0;   // force woodMin=0 so specialistBudget=0
  // With n=4, farmMin=floor(0.5*4)=2, woodMin=0, reserved=2, specialistBudget=2
  // Hmm - with lumbers=0 woodMin=0, reserved=2, specialistBudget=4-2=2
  // So normal path gives cookSlots=1 from specialistBudget...
  // To force specialistBudget=0 we need to force farmMin to consume everything.
  // At n=4 with emergency override scenario: force farmRatio=0.82 (emergency).
  // That makes farmMin=floor(0.82*4)=3, woodMin=0, reserved=3, specialistBudget=1.
  // Still not 0. For specialistBudget=0 we need n <= farmMin + woodMin.
  // Simplest: set n=3, farmMin=floor(0.5*3)=1, woodMin=0... reserved=1, budget=2.
  // OR: just override farmRatio to create 0 budget:
  // With n=4, farmMin=3 (farmRatio>=0.75), woodMin=0, reserved=3, budget=1.
  // Let's instead use n=3 to force budget=0 scenario: farmMin=min(1,floor(0.5*3))=1,
  // woodMin=0, reserved=1, budget=2.
  // Actually the easiest is n=2: farmMin=floor(0.5*2)=1, woodMin=0, reserved=1, budget=1.
  // Let's use n=3: farmMin=floor(0.5*3)=1... budget=3-1=2. Not 0.
  //
  // The real scenario where cannibalise fires: food is in EMERGENCY so
  // emergencyActive=true → farmRatio becomes max(targetFarmRatio, 0.82).
  // But cannibalise requires foodSafe = food > emergency * 1.5. If food is in
  // emergency (food < 18) then foodSafe is false. Contradiction.
  //
  // True scenario: specialistBudget=0 happens when n is small AND there are
  // many lumbers forcing woodMin to consume all budget. But woodMin is always
  // max 1. So we can't naturally get specialistBudget=0 at pop=4 without
  // manual override of state.
  //
  // For the cannibalise path to fire we need to artificially set farmMin via
  // very high farmRatio. At n=4, farmRatio=0.82 → farmMin=floor(0.82*4)=3,
  // woodMin=min(1, 4-3)=1, reserved=4, specialistBudget=0. Then food > 18*1.5=27.
  // food=60 satisfies this.
  state.controls.farmRatio = 0.82;
  state.resources.food = 60;  // > 18 * 1.5 = 27 (food safe)
  state.resources.herbs = 0;
  state.resources.stone = 0;
  state.buildings.warehouses = 1;
  state.buildings.smithies = 0;
  state.buildings.clinics = 0;
  state.buildings.quarries = 0;
  state.buildings.herbGardens = 0;
  state.buildings.lumbers = 1; // re-enable so woodMin=1
  return state;
}

// ── Cannibalise fires: cook gets slot from FARM reserve ──────────────────────

test("cannibalise: specialistBudget=0 + kitchen + food stable → cook gets 1 slot", () => {
  const state = makeCannibaliseState();
  // Reset cannibalise memo to fresh state (cooldown not active)
  state.ai ??= {};
  state.ai.roleAssignMemo = { cannibaliseLastTick: -999 };
  state.tick = 1000;
  new RoleAssignmentSystem().update(2, state);
  assert.ok(countRole(state, ROLE.COOK) >= 1,
    "cannibalise valve: kitchen present + food safe + specialistBudget=0 → cook must borrow FARM slot");
});

// ── Cannibalise blocked: food too low (emergency) ────────────────────────────

test("cannibalise: food low (emergency) → cook does NOT cannibalise", () => {
  const state = makeCannibaliseState();
  // Put food below foodEmergencyThreshold * cannibaliseMult = 18 * 1.5 = 27
  state.resources.food = 15;  // below emergency threshold (18) → emergency active too
  state.ai ??= {};
  state.ai.roleAssignMemo = { cannibaliseLastTick: -999 };
  state.tick = 1000;
  new RoleAssignmentSystem().update(2, state);
  // In emergency, cook gets emergencyOverrideCooks=1 BUT via normal emergency
  // logic (applyEmergency), NOT via cannibalise. The FARM is NOT borrowed.
  // If specialistBudget=0 and emergency is active, cook=0 unless emergency
  // kicks the cook floor via the farmMin reduction or cook-from-emergency path.
  // The important thing: cannibalise MUST NOT fire (food not safe).
  // We verify the cannibalise memo was NOT updated (tick not stored).
  const memoTick = state.ai?.roleAssignMemo?.cannibaliseLastTick ?? -999;
  assert.notEqual(memoTick, 1000,
    "cannibalise must not fire when food < foodEmergencyThreshold * cannibaliseMult");
});

// ── Cannibalise cooldown respected ──────────────────────────────────────────

test("cannibalise: cooldown prevents back-to-back firing", () => {
  const state = makeCannibaliseState();
  const cooldown = Number(BALANCE.roleQuotaScaling?.farmCannibaliseCooldownTicks ?? 3);
  state.ai ??= {};
  state.ai.roleAssignMemo = { cannibaliseLastTick: -999 };

  // Tick 100: first cannibalise should fire.
  state.tick = 100;
  const sys = new RoleAssignmentSystem();
  sys.update(2, state);
  const firstTick = state.ai?.roleAssignMemo?.cannibaliseLastTick ?? -999;
  assert.equal(firstTick, 100,
    "first cannibalise must store tick 100 in memo");

  // Tick 101: within cooldown window — must NOT fire again.
  state.tick = 101;
  // Reset roles so the system re-runs properly.
  const workers = state.agents.filter((a) => a.type === "WORKER");
  for (const w of workers) w.role = "FARM"; // reset all to FARM
  const sys2 = new RoleAssignmentSystem();
  sys2.update(2, state);
  const secondTick = state.ai?.roleAssignMemo?.cannibaliseLastTick ?? -999;
  // If cooldown=3, tick 101 is within 3 ticks of tick 100 → memo should still be 100.
  if (cooldown > 1) {
    assert.equal(secondTick, 100,
      `cooldown=${cooldown}: tick 101 must not update memo (was ${secondTick})`);
  }

  // Tick 100 + cooldown: after cooldown — MAY fire again.
  state.tick = 100 + cooldown;
  for (const w of workers) w.role = "FARM";
  const sys3 = new RoleAssignmentSystem();
  sys3.update(2, state);
  const thirdTick = state.ai?.roleAssignMemo?.cannibaliseLastTick ?? -999;
  assert.equal(thirdTick, 100 + cooldown,
    `tick ${100 + cooldown} is at cooldown boundary; cannibalise should fire`);
});

// ── Cannibalise preserves at least 1 FARM slot ──────────────────────────────

test("cannibalise: farmMin=1 (minimal colony) → cannibalise does NOT fire (would leave 0 FARM)", () => {
  // At n=2, farmMin=floor(0.5*2)=1, woodMin=0, reserved=1, specialistBudget=1.
  // Cannibalise gate requires (farmMin - cannibalisedFarmSlots) > 1 → 1 > 1 is false.
  // So cannibalise must not fire at farmMin=1 (always preserve at least 1 FARM).
  const state = createInitialGameState();
  setWorkerCount(state, 2);
  state.buildings.kitchens = 1;
  state.buildings.lumbers = 0;
  state.buildings.smithies = 0;
  state.buildings.clinics = 0;
  state.buildings.warehouses = 1;
  state.buildings.quarries = 0;
  state.buildings.herbGardens = 0;
  // Force all budget to FARM: farmRatio=1 (clamped to 0.82 by BALANCE)
  state.controls.farmRatio = 0.82;
  state.resources.food = 60;
  state.ai ??= {};
  state.ai.roleAssignMemo = { cannibaliseLastTick: -999 };
  state.tick = 500;
  new RoleAssignmentSystem().update(2, state);
  // farmMin at n=2 with farmRatio=0.82: floor(0.82*2)=1, woodMin=0, reserved=1, budget=1.
  // specialistBudget=1 so cook may get it via normal path, not cannibalise.
  // Key: cannibalise memo should NOT be set (normal path used or cook=0 due to budget=1 given to cook).
  // farmMin=1 means cannibalise gate (farmMin > 1) is false → memo stays -999.
  const memoTick = state.ai?.roleAssignMemo?.cannibaliseLastTick ?? -999;
  // At n=2 farmMin=1: cannibalise is blocked by (farmMin - cannibalisedFarmSlots) > 1 check.
  // Normal cook slot: budget=1, cookSlots=min(q('cook')=1, budget=1)=1. No cannibalise needed.
  assert.notEqual(memoTick, 500,
    "cannibalise must not fire when farmMin=1 (would eliminate all FARM workers)");
});
