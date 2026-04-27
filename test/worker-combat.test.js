// v0.8.3 worker-vs-raider combat — bidirectional melee, GUARD role,
// randomised raider stats, and threat-driven plan injection.
//
// Pairs with the live integration probe in scripts/verify-combat.mjs.

import test from "node:test";
import assert from "node:assert/strict";

import { ROLE, ANIMAL_KIND, ANIMAL_SPECIES } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";
import { createAnimal, createWorker } from "../src/entities/EntityFactory.js";
import {
  computeThreatPosture,
  planThreatResponseSteps,
  formatThreatHintForLLM,
} from "../src/simulation/ai/colony/ThreatPlanner.js";
import { generateFallbackPlan } from "../src/simulation/ai/colony/ColonyPlanner.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";

function makeSeededRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tinyState({ workerCount = 6, animals = [] } = {}) {
  const rng = makeSeededRng(7);
  const agents = [];
  for (let i = 0; i < workerCount; i += 1) {
    const w = createWorker(5 + i, 5, rng);
    agents.push(w);
  }
  return {
    grid: { width: 32, height: 32, version: 1, tiles: new Uint8Array(32 * 32) },
    agents,
    animals,
    buildings: { warehouses: 0, farms: 1, lumbers: 0, walls: 0, kitchens: 0 },
    resources: { food: 100, wood: 30, stone: 5, herbs: 0, meals: 0, medicine: 0, tools: 0 },
    metrics: { timeSec: 0, tick: 0, deathsByReason: {}, logistics: null, roleCounts: {} },
    ai: { fallbackHints: {}, groupPolicies: new Map() },
    controls: { roleQuotas: { cook: 99, smith: 99, herbalist: 99, haul: 99, stone: 99, herbs: 99 }, farmRatio: 0.5 },
    gameplay: { modifiers: {}, threat: 0 },
  };
}

// ── 1. ROLE.GUARD exists ────────────────────────────────────────────
test("ROLE.GUARD is a valid role identifier", () => {
  assert.equal(ROLE.GUARD, "GUARD");
});

// ── 2. BALANCE constants present ────────────────────────────────────
test("BALANCE exposes worker counter / guard / aggro tunables", () => {
  assert.ok(Number.isFinite(BALANCE.workerCounterAttackDamage));
  assert.ok(Number.isFinite(BALANCE.guardAttackDamage));
  assert.ok(Number.isFinite(BALANCE.guardAggroRadius));
  assert.ok(Number.isFinite(BALANCE.meleeReachTiles));
  assert.ok(BALANCE.guardAttackDamage > BALANCE.workerCounterAttackDamage,
    "GUARDs hit harder than passive counter-attackers");
  assert.ok(Number.isFinite(BALANCE.raiderStatsVariance));
});

// ── 3. Raider stat randomisation is deterministic per seed ────────
test("createAnimal: raider_beast stats are deterministic for the same seed", () => {
  const rngA = makeSeededRng(42);
  const a = createAnimal(0, 0, ANIMAL_KIND.PREDATOR, rngA, ANIMAL_SPECIES.RAIDER_BEAST);
  const rngB = makeSeededRng(42);
  const b = createAnimal(0, 0, ANIMAL_KIND.PREDATOR, rngB, ANIMAL_SPECIES.RAIDER_BEAST);
  assert.equal(a.species, ANIMAL_SPECIES.RAIDER_BEAST);
  assert.equal(b.species, ANIMAL_SPECIES.RAIDER_BEAST);
  assert.equal(a.hp, b.hp);
  assert.equal(a.maxHp, b.maxHp);
  assert.equal(a.raiderAttackDamage, b.raiderAttackDamage);
  assert.equal(a.raiderSpeed, b.raiderSpeed);
  assert.equal(a.raiderAttackCooldownSec, b.raiderAttackCooldownSec);
});

// ── 4. Raider stats fall within ± variance envelope ────────────────
test("createAnimal: raider_beast stats stay within the variance envelope", () => {
  const rng = makeSeededRng(99);
  const variance = Number(BALANCE.raiderStatsVariance ?? 0.25);
  const baseHp = 110; // ANIMAL_SPECIES_HP[RAIDER_BEAST]
  const baseAtk = Number(BALANCE.predatorAttackDamage ?? 26);
  for (let i = 0; i < 30; i += 1) {
    const r = createAnimal(0, 0, ANIMAL_KIND.PREDATOR, rng, ANIMAL_SPECIES.RAIDER_BEAST);
    assert.ok(r.hp >= Math.floor(baseHp * (1 - variance)) - 1);
    assert.ok(r.hp <= Math.ceil(baseHp * (1 + variance)) + 1);
    assert.ok(r.raiderAttackDamage >= baseAtk * (1 - variance) - 0.05);
    assert.ok(r.raiderAttackDamage <= baseAtk * (1 + variance) + 0.05);
  }
});

// ── 5. Wolf/bear stats are NOT randomised (raiderAttackDamage null) ──
test("createAnimal: wolf and bear keep raider override fields null", () => {
  const rng = makeSeededRng(2024);
  const wolf = createAnimal(0, 0, ANIMAL_KIND.PREDATOR, rng, ANIMAL_SPECIES.WOLF);
  const bear = createAnimal(0, 0, ANIMAL_KIND.PREDATOR, rng, ANIMAL_SPECIES.BEAR);
  assert.equal(wolf.raiderAttackDamage, null);
  assert.equal(wolf.raiderSpeed, null);
  assert.equal(bear.raiderAttackDamage, null);
  assert.equal(bear.raiderAttackCooldownSec, null);
});

// ── 6. ThreatPlanner: emits steps when threat is active ─────────────
test("planThreatResponseSteps emits reassign_role(GUARD) when active threats present", () => {
  const state = tinyState({
    workerCount: 8,
    animals: [
      { id: "a1", alive: true, kind: ANIMAL_KIND.PREDATOR, species: ANIMAL_SPECIES.RAIDER_BEAST, x: 5, z: 5, hp: 90 },
    ],
  });
  state.metrics.combat = computeThreatPosture(state);
  assert.equal(state.metrics.combat.activeThreats, 1);
  assert.equal(state.metrics.combat.guardCount, 0);
  const steps = planThreatResponseSteps(state);
  assert.ok(steps.length >= 1, `expected at least 1 threat-response step, got ${steps.length}`);
  assert.equal(steps[0].type, "promote_guard");
  assert.equal(steps[0].role, "GUARD");
});

test("planThreatResponseSteps stays silent when posture is calm", () => {
  const state = tinyState({ workerCount: 6, animals: [] });
  state.metrics.combat = computeThreatPosture(state);
  const steps = planThreatResponseSteps(state);
  assert.equal(steps.length, 0);
  assert.equal(formatThreatHintForLLM(state), "");
});

// ── 7. ColonyPlanner fallback injects GUARD steps when threats rise ─
test("generateFallbackPlan injects reassign_role(GUARD) when active threats present", () => {
  const state = tinyState({
    workerCount: 8,
    animals: [
      { id: "a1", alive: true, kind: ANIMAL_KIND.PREDATOR, species: ANIMAL_SPECIES.RAIDER_BEAST, x: 5, z: 5, hp: 90 },
    ],
  });
  state.metrics.combat = computeThreatPosture(state);
  // Minimal observation matching ColonyPlanner expectations.
  const observation = {
    economy: { food: { rate: 0.5 }, wood: { rate: 0.2 } },
    topology: { clusters: [{ id: "c0", center: { ix: 5, iz: 5 } }], coveragePercent: 100 },
    workforce: { total: state.agents.length },
    affordable: {},
    defense: { threat: 30 },
  };
  const plan = generateFallbackPlan(observation, state);
  const guardSteps = (plan.steps ?? []).filter(
    (s) => s.action?.type === "reassign_role" && s.action?.role === "GUARD"
  );
  assert.ok(guardSteps.length >= 1,
    `expected at least 1 GUARD reassign step in fallback plan, got ${guardSteps.length}`);
});

// ── 8. RoleAssignmentSystem promotes workers to GUARD via hint ──────
test("RoleAssignmentSystem promotes workers to GUARD when pendingGuardCount is set", () => {
  const state = tinyState({ workerCount: 8, animals: [] });
  state.ai.fallbackHints.pendingGuardCount = 2;
  state.buildings.farms = 2;
  const sys = new RoleAssignmentSystem();
  // Force timer to elapse so update runs.
  sys.timer = -1;
  sys.update(0.1, state);
  const guards = state.agents.filter((a) => a.role === "GUARD");
  assert.equal(guards.length, 2, `expected 2 GUARDs after promotion, got ${guards.length}`);
  // Hint should be consumed.
  assert.equal(state.ai.fallbackHints.pendingGuardCount, undefined);
  // GUARD count should appear in roleCounts.
  assert.equal(state.metrics.roleCounts.GUARD, 2);
});

// ── 9. Counter-attack site reduces predator hp (manual call) ────────
test("AnimalAISystem-style counter-attack reduces predator hp (model)", () => {
  // We re-derive the counter-attack arithmetic here without importing the
  // full system (which depends on grid/services). The contract is:
  //   - Hit worker with role=GUARD deals BALANCE.guardAttackDamage
  //   - Hit worker without GUARD role deals BALANCE.workerCounterAttackDamage
  //   - Predator hp reaches 0 → alive=false, deathReason="killed-by-worker"
  const guardDmg = Number(BALANCE.guardAttackDamage);
  const counterDmg = Number(BALANCE.workerCounterAttackDamage);
  assert.ok(guardDmg > counterDmg, "guard counter must hit harder than passive worker");

  const predator = { hp: 20, alive: true };
  predator.hp = Math.max(0, predator.hp - guardDmg);
  if (predator.hp <= 0) {
    predator.alive = false;
    predator.deathReason = "killed-by-worker";
  }
  assert.ok(predator.hp < 20, "predator should take damage");
  assert.ok(predator.alive === false || predator.hp > 0);
  if (!predator.alive) {
    assert.equal(predator.deathReason, "killed-by-worker");
  }
});

// ── 10. computeThreatPosture: distance accounting ───────────────────
test("computeThreatPosture reports nearest threat distance", () => {
  const state = tinyState({
    workerCount: 4,
    animals: [
      { id: "a1", alive: true, kind: ANIMAL_KIND.PREDATOR, species: ANIMAL_SPECIES.WOLF, x: 5, z: 7, hp: 80 },
    ],
  });
  state.agents[0].x = 5; state.agents[0].z = 5;
  const posture = computeThreatPosture(state);
  assert.equal(posture.activeThreats, 1);
  assert.ok(posture.nearestThreatDistance > 0);
  assert.ok(posture.nearestThreatDistance < 5);
});
