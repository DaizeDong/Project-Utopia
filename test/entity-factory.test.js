// v0.8.2 Round-0 01e-innovation — Worker identity unit tests.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/01e-innovation.md
//
// createWorker now draws a name from WORKER_NAME_BANK using the deterministic
// RNG passed in by the caller (see EntityFactory.createInitialGameState →
// createInitialEntitiesWithRandom → createWorker). These tests guard the
// three invariants that keep the feature useful:
//   (a) displayName is no longer the generic "Worker-N" — it picks from the
//       curated bank and still carries the id suffix so two workers drawn
//       with the same name remain distinguishable in the HUD;
//   (b) the worker carries a non-empty, human-readable backstory built from
//       their argmax skill + first trait;
//   (c) the same deterministic RNG stream yields identical names, which is
//       the contract snapshot/replay relies on (v0.8.0 Phase-10 determinism
//       hardening). Math.random() is explicitly NOT used.

import test from "node:test";
import assert from "node:assert/strict";

import {
  createWorker,
  createVisitor,
  createAnimal,
  WORKER_NAME_BANK,
  SURNAME_BANK,
  buildWorkerBackstory,
} from "../src/entities/EntityFactory.js";
import { VISITOR_KIND, ANIMAL_KIND } from "../src/config/constants.js";
import { resetIdsForTest } from "../src/app/id.js";
import { setActiveUiProfile } from "../src/app/uiProfileState.js";

// Tiny deterministic LCG matching EntityFactory's internal seed function.
function seededRandom(seed = 1337) {
  let s = Number(seed) >>> 0;
  if (!s) s = 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("WORKER_NAME_BANK is a frozen, non-empty array of capitalised short names", () => {
  assert.ok(Array.isArray(WORKER_NAME_BANK));
  assert.ok(Object.isFrozen(WORKER_NAME_BANK));
  assert.ok(WORKER_NAME_BANK.length >= 30, `bank too small: ${WORKER_NAME_BANK.length}`);
  for (const name of WORKER_NAME_BANK) {
    assert.match(name, /^[A-Z][a-z]+$/, `bank entry "${name}" must be capitalised + lowercase tail`);
  }
});

test("createWorker.displayName (full profile) matches /^[A-Z][a-z]+-\\d+$/ and is distinct from id", () => {
  setActiveUiProfile("full");
  resetIdsForTest();
  const rng = seededRandom(42);
  const worker = createWorker(0, 0, rng);
  setActiveUiProfile("casual"); // restore default
  assert.match(worker.displayName, /^[A-Z][a-z]+-\d+$/);
  assert.notStrictEqual(worker.displayName, worker.id);
  // id itself should still be the canonical worker_N so downstream systems
  // keyed by id keep working.
  assert.match(worker.id, /^worker_\d+$/);
});

test("createWorker.backstory is a non-empty string following the '<skill> specialist, <trait> temperament' schema", () => {
  resetIdsForTest();
  const rng = seededRandom(7);
  const worker = createWorker(0, 0, rng);
  assert.strictEqual(typeof worker.backstory, "string");
  assert.ok(worker.backstory.length > 0);
  assert.match(worker.backstory, /\w+ specialist, \w+ temperament/);
});

test("createWorker is deterministic: identical seed → identical displayName + backstory", () => {
  resetIdsForTest();
  const rngA = seededRandom(2026);
  const rngB = seededRandom(2026);
  const wA = createWorker(0, 0, rngA);
  resetIdsForTest();
  const wB = createWorker(0, 0, rngB);
  assert.strictEqual(wA.displayName, wB.displayName);
  assert.strictEqual(wA.backstory, wB.backstory);
});

test("buildWorkerBackstory picks the argmax skill and first trait", () => {
  const skills = { farming: 0.42, woodcutting: 0.91, mining: 0.31, cooking: 0.55, crafting: 0.12 };
  const traits = ["swift", "careful"];
  const bio = buildWorkerBackstory(skills, traits);
  assert.strictEqual(bio, "woodcutting specialist, swift temperament");
});

test("buildWorkerBackstory falls back gracefully on empty input", () => {
  const bio = buildWorkerBackstory({}, []);
  assert.ok(typeof bio === "string" && bio.length > 0);
  assert.match(bio, /specialist/);
  assert.match(bio, /temperament/);
});

test("createVisitor and createAnimal carry a stock backstory so EntityFocusPanel can always render the line", () => {
  resetIdsForTest();
  const rng = seededRandom(9);
  const trader = createVisitor(0, 0, VISITOR_KIND.TRADER, rng);
  const saboteur = createVisitor(1, 1, VISITOR_KIND.SABOTEUR, rng);
  const predator = createAnimal(0, 0, ANIMAL_KIND.PREDATOR, rng);
  const herbivore = createAnimal(1, 1, ANIMAL_KIND.HERBIVORE, rng);
  assert.strictEqual(trader.backstory, "wandering trader");
  assert.strictEqual(saboteur.backstory, "roaming saboteur");
  assert.strictEqual(predator.backstory, "lone predator");
  assert.strictEqual(herbivore.backstory, "wild forager");
});

// v0.8.2 Round-5b (02e Step 7) — case (f): casual profile humanised name.
test("(f) casual profile displayName is 'FirstName Surname' form", () => {
  setActiveUiProfile("casual");
  resetIdsForTest();
  const rng = seededRandom(42);
  const worker = createWorker(0, 0, rng);
  setActiveUiProfile("casual"); // keep default
  assert.match(worker.displayName, /^[A-Z][a-z]+ [A-Z][a-z]+$/,
    `casual displayName should be "Name Surname", got: ${worker.displayName}`);
  assert.notStrictEqual(worker.displayName, worker.id);
});

// v0.8.2 Round-5b (02e Step 7) — case (g): full profile keeps old format.
test("(g) full profile displayName keeps /^[A-Z][a-z]+-\\d+$/ format", () => {
  setActiveUiProfile("full");
  resetIdsForTest();
  const rng = seededRandom(42);
  const worker = createWorker(0, 0, rng);
  setActiveUiProfile("casual"); // restore default
  assert.match(worker.displayName, /^[A-Z][a-z]+-\d+$/,
    `full profile displayName should be "Name-N", got: ${worker.displayName}`);
});

// v0.8.2 Round-5b (02e Step 7) — SURNAME_BANK shape guard.
test("SURNAME_BANK is frozen with 40 capitalized entries", () => {
  assert.ok(Array.isArray(SURNAME_BANK));
  assert.ok(Object.isFrozen(SURNAME_BANK));
  assert.strictEqual(SURNAME_BANK.length, 40);
  for (const name of SURNAME_BANK) {
    assert.match(name, /^[A-Z][a-z]+$/, `SURNAME_BANK entry "${name}" must be capitalized`);
  }
});
