import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractSkillFromPlan,
  inferTerrainPreference,
  computeExpectedEffect,
  generateSkillName,
  signatureSimilarity,
  LearnedSkillLibrary,
} from "../src/simulation/ai/colony/LearnedSkillLibrary.js";
import { SKILL_LIBRARY } from "../src/simulation/ai/colony/SkillLibrary.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeGrid(w = 20, h = 20) {
  const tiles = new Uint8Array(w * h);
  const moisture = new Float32Array(w * h).fill(0.5);
  const elevation = new Float32Array(w * h).fill(0.4);
  return { width: w, height: h, tiles, moisture, elevation };
}

function makePlan(stepOverrides = []) {
  const defaults = [
    { id: 1, action: { type: "farm", hint: null }, status: "completed", groundedTile: { ix: 10, iz: 10 }, predicted_effect: { food_rate_delta: "+0.4/s" } },
    { id: 2, action: { type: "farm", hint: null }, status: "completed", groundedTile: { ix: 11, iz: 10 }, predicted_effect: { food_rate_delta: "+0.4/s" } },
    { id: 3, action: { type: "lumber", hint: null }, status: "completed", groundedTile: { ix: 12, iz: 10 }, predicted_effect: { wood_rate_delta: "+0.5/s" } },
    { id: 4, action: { type: "road", hint: null }, status: "completed", groundedTile: { ix: 13, iz: 10 }, predicted_effect: { logistics: "improved" } },
  ];
  const steps = stepOverrides.length > 0 ? stepOverrides : defaults;
  return { goal: "boost food and wood", horizon_sec: 60, steps, source: "fallback" };
}

function makeEvaluation(score = 0.85, success = true) {
  return {
    overallScore: score,
    success,
    completed: 4,
    failed: 0,
    total: 4,
    completionRatio: 1.0,
    resourceChanges: { food: 5, wood: -15 },
    elapsedSec: 30,
    horizonSec: 60,
    timeEfficiency: 1.0,
  };
}

function makeStepEvals(plan) {
  return plan.steps.map(s => ({
    stepId: s.id,
    action: s.action.type,
    buildSuccess: s.status === "completed",
    success: s.status === "completed",
    score: s.status === "completed" ? 0.8 : 0,
    predicted: s.predicted_effect ?? {},
    actual: {},
    deviations: {},
    diagnosis: [],
  }));
}

// ── extractSkillFromPlan ─────────────────────────────────────────────

describe("extractSkillFromPlan", () => {
  it("extracts skill from high-scoring plan", () => {
    const plan = makePlan();
    const evaluation = makeEvaluation(0.85, true);
    const stepEvals = makeStepEvals(plan);
    const grid = makeGrid();
    const skill = extractSkillFromPlan(plan, evaluation, stepEvals, grid);

    assert.ok(skill, "should extract a skill");
    assert.equal(skill.steps.length, 4);
    assert.deepEqual(skill.steps[0].offset, [0, 0]); // anchor offset
    assert.deepEqual(skill.steps[1].offset, [1, 0]); // relative to anchor
    assert.ok(skill.name.startsWith("learned_"));
    assert.ok(skill.description.includes("boost food and wood"));
  });

  it("rejects low-scoring plan", () => {
    const plan = makePlan();
    const evaluation = makeEvaluation(0.5, false);
    const stepEvals = makeStepEvals(plan);
    const grid = makeGrid();
    const skill = extractSkillFromPlan(plan, evaluation, stepEvals, grid);
    assert.equal(skill, null);
  });

  it("rejects plan with too few completed steps", () => {
    const steps = [
      { id: 1, action: { type: "farm", hint: null }, status: "completed", groundedTile: { ix: 10, iz: 10 }, predicted_effect: {} },
      { id: 2, action: { type: "farm", hint: null }, status: "failed", groundedTile: null, predicted_effect: {} },
    ];
    const plan = makePlan(steps);
    const evaluation = makeEvaluation(0.9, true);
    evaluation.completed = 1;
    const stepEvals = makeStepEvals(plan);
    const grid = makeGrid();
    const skill = extractSkillFromPlan(plan, evaluation, stepEvals, grid);
    assert.equal(skill, null);
  });

  it("skips skill steps (only learns atomic builds)", () => {
    const steps = [
      { id: 1, action: { type: "skill", skill: "logistics_hub", hint: null }, status: "completed", groundedTile: { ix: 10, iz: 10 }, predicted_effect: {} },
      { id: 2, action: { type: "farm", hint: null }, status: "completed", groundedTile: { ix: 11, iz: 10 }, predicted_effect: {} },
      { id: 3, action: { type: "farm", hint: null }, status: "completed", groundedTile: { ix: 12, iz: 10 }, predicted_effect: {} },
    ];
    const plan = makePlan(steps);
    const evaluation = makeEvaluation(0.9, true);
    evaluation.completed = 3;
    const stepEvals = makeStepEvals(plan);
    const grid = makeGrid();
    const skill = extractSkillFromPlan(plan, evaluation, stepEvals, grid);
    // Only 2 atomic steps → below MIN_COMPLETED_STEPS (3)
    assert.equal(skill, null);
  });

  it("computes correct relative offsets from anchor", () => {
    const plan = makePlan();
    const evaluation = makeEvaluation(0.85, true);
    const stepEvals = makeStepEvals(plan);
    const grid = makeGrid();
    const skill = extractSkillFromPlan(plan, evaluation, stepEvals, grid);

    // Anchor = (10,10), so offsets should be [0,0], [1,0], [2,0], [3,0]
    assert.deepEqual(skill.steps[0].offset, [0, 0]);
    assert.deepEqual(skill.steps[1].offset, [1, 0]);
    assert.deepEqual(skill.steps[2].offset, [2, 0]);
    assert.deepEqual(skill.steps[3].offset, [3, 0]);
  });
});

// ── inferTerrainPreference ───────────────────────────────────────────

describe("inferTerrainPreference", () => {
  it("infers minMoisture from high-moisture placements", () => {
    const grid = makeGrid();
    // Set high moisture at placement positions
    const steps = [
      { groundedTile: { ix: 5, iz: 5 } },
      { groundedTile: { ix: 6, iz: 5 } },
    ];
    grid.moisture[5 * 20 + 5] = 0.7;
    grid.moisture[5 * 20 + 6] = 0.8;
    const pref = inferTerrainPreference(steps, grid);
    assert.ok(pref.minMoisture > 0, `minMoisture should be set, got ${JSON.stringify(pref)}`);
  });

  it("infers maxElevation from low-elevation placements", () => {
    const grid = makeGrid();
    grid.elevation.fill(0.25);
    const steps = [
      { groundedTile: { ix: 5, iz: 5 } },
      { groundedTile: { ix: 6, iz: 5 } },
    ];
    const pref = inferTerrainPreference(steps, grid);
    assert.ok(pref.maxElevation != null, `should infer maxElevation`);
    assert.ok(pref.maxElevation < 0.6);
  });

  it("returns empty for missing grid data", () => {
    const pref = inferTerrainPreference([{ groundedTile: { ix: 5, iz: 5 } }], {});
    assert.deepEqual(pref, {});
  });

  it("returns empty for empty steps", () => {
    const grid = makeGrid();
    const pref = inferTerrainPreference([], grid);
    assert.deepEqual(pref, {});
  });
});

// ── computeExpectedEffect ────────────────────────────────────────────

describe("computeExpectedEffect", () => {
  it("computes effects from building type counts", () => {
    const steps = [
      { action: { type: "farm" }, status: "completed" },
      { action: { type: "farm" }, status: "completed" },
      { action: { type: "lumber" }, status: "completed" },
    ];
    const effect = computeExpectedEffect(steps, []);
    assert.equal(effect.food_rate, "+0.8/s");
    assert.equal(effect.wood_rate, "+0.5/s");
  });

  it("handles walls and warehouses", () => {
    const steps = [
      { action: { type: "wall" }, status: "completed" },
      { action: { type: "wall" }, status: "completed" },
      { action: { type: "warehouse" }, status: "completed" },
    ];
    const effect = computeExpectedEffect(steps, []);
    assert.equal(effect.threat_reduction, "-4");
    assert.equal(effect.coverage, "+1 anchor");
  });

  it("handles processing buildings", () => {
    const steps = [
      { action: { type: "kitchen" }, status: "completed" },
      { action: { type: "smithy" }, status: "completed" },
      { action: { type: "clinic" }, status: "completed" },
    ];
    const effect = computeExpectedEffect(steps, []);
    assert.ok(effect.meals_rate);
    assert.ok(effect.tools_rate);
    assert.ok(effect.medicine_rate);
  });
});

// ── generateSkillName ────────────────────────────────────────────────

describe("generateSkillName", () => {
  it("generates name from action counts", () => {
    const name = generateSkillName({ farm: 3, lumber: 1 }, "food boost");
    assert.ok(name.includes("3xfarm"), `name should include 3xfarm, got: ${name}`);
    assert.ok(name.startsWith("learned_"));
  });

  it("handles single-count actions", () => {
    const name = generateSkillName({ quarry: 1, smithy: 1, road: 1 }, "processing");
    assert.ok(name.startsWith("learned_"));
    assert.ok(!name.includes("1x"), `single counts should not have 1x prefix, got: ${name}`);
  });

  it("returns default for empty counts", () => {
    const name = generateSkillName({}, "");
    assert.equal(name, "learned_pattern");
  });
});

// ── signatureSimilarity ──────────────────────────────────────────────

describe("signatureSimilarity", () => {
  it("returns 1.0 for identical signatures", () => {
    assert.equal(signatureSimilarity("farm,farm,lumber", "farm,farm,lumber"), 1.0);
  });

  it("returns 0 for completely different signatures", () => {
    assert.equal(signatureSimilarity("farm", "wall"), 0);
  });

  it("computes partial similarity", () => {
    const sim = signatureSimilarity("farm,lumber", "farm,quarry");
    assert.ok(sim > 0 && sim < 1, `sim should be partial, got ${sim}`);
  });

  it("handles empty signatures", () => {
    // empty string split gives [""] which is length 1
    assert.equal(signatureSimilarity("", ""), 1.0);
  });
});

// ── LearnedSkillLibrary class ────────────────────────────────────────

describe("LearnedSkillLibrary", () => {
  it("constructs with zero skills", () => {
    const lib = new LearnedSkillLibrary();
    assert.equal(lib.size, 0);
    assert.deepEqual(lib.stats, { skillsExtracted: 0, skillsDeduplicated: 0, skillsEvicted: 0 });
  });

  it("learns a skill from a good plan", () => {
    const lib = new LearnedSkillLibrary();
    const plan = makePlan();
    const evaluation = makeEvaluation(0.85, true);
    const stepEvals = makeStepEvals(plan);
    const grid = makeGrid();

    const id = lib.maybeLearnSkill(plan, evaluation, stepEvals, grid);
    assert.ok(id, "should return skill id");
    assert.equal(lib.size, 1);
    assert.equal(lib.stats.skillsExtracted, 1);
  });

  it("rejects a bad plan", () => {
    const lib = new LearnedSkillLibrary();
    const plan = makePlan();
    const evaluation = makeEvaluation(0.3, false);
    const stepEvals = makeStepEvals(plan);
    const grid = makeGrid();

    const id = lib.maybeLearnSkill(plan, evaluation, stepEvals, grid);
    assert.equal(id, null);
    assert.equal(lib.size, 0);
  });

  it("deduplicates similar skills (keeps higher score)", () => {
    const lib = new LearnedSkillLibrary();
    const grid = makeGrid();

    // First plan — same action types
    const plan1 = makePlan();
    const eval1 = makeEvaluation(0.75, true);
    const stepEvals1 = makeStepEvals(plan1);
    const id1 = lib.maybeLearnSkill(plan1, eval1, stepEvals1, grid);
    assert.ok(id1);

    // Second plan — same types, higher score → should replace
    const plan2 = makePlan();
    const eval2 = makeEvaluation(0.95, true);
    const stepEvals2 = makeStepEvals(plan2);
    const id2 = lib.maybeLearnSkill(plan2, eval2, stepEvals2, grid);
    assert.ok(id2);
    assert.equal(lib.size, 1, "should have replaced, not added");
    assert.equal(lib.stats.skillsDeduplicated, 1);
  });

  it("deduplicates similar skills (rejects lower score)", () => {
    const lib = new LearnedSkillLibrary();
    const grid = makeGrid();

    // First plan — high score
    const plan1 = makePlan();
    const eval1 = makeEvaluation(0.95, true);
    lib.maybeLearnSkill(plan1, eval1, makeStepEvals(plan1), grid);

    // Second plan — same types, lower score → should be rejected
    const plan2 = makePlan();
    const eval2 = makeEvaluation(0.75, true);
    const id2 = lib.maybeLearnSkill(plan2, eval2, makeStepEvals(plan2), grid);
    assert.equal(id2, null, "should reject lower score duplicate");
    assert.equal(lib.size, 1);
  });

  it("records usage and success", () => {
    const lib = new LearnedSkillLibrary();
    const plan = makePlan();
    const evaluation = makeEvaluation(0.85, true);
    const id = lib.maybeLearnSkill(plan, evaluation, makeStepEvals(plan), makeGrid());

    lib.recordUsage(id, true);
    lib.recordUsage(id, false);
    const skill = lib.getSkill(id);
    assert.equal(skill._meta.uses, 2);
    assert.equal(skill._meta.successes, 1);
  });

  it("lists learned skills with affordability", () => {
    const lib = new LearnedSkillLibrary();
    const plan = makePlan();
    const evaluation = makeEvaluation(0.85, true);
    lib.maybeLearnSkill(plan, evaluation, makeStepEvals(plan), makeGrid());

    const list = lib.listLearnedSkills({ wood: 100, stone: 50 });
    assert.equal(list.length, 1);
    assert.equal(list[0].affordable, true);

    const poorList = lib.listLearnedSkills({ wood: 0 });
    assert.equal(poorList[0].affordable, false);
  });

  it("formats for prompt", () => {
    const lib = new LearnedSkillLibrary();
    const plan = makePlan();
    const evaluation = makeEvaluation(0.85, true);
    lib.maybeLearnSkill(plan, evaluation, makeStepEvals(plan), makeGrid());

    const text = lib.formatForPrompt({ wood: 100 });
    assert.ok(text.includes("Learned Skills"));
    assert.ok(text.includes("learned_"));
  });

  it("returns empty prompt when no skills", () => {
    const lib = new LearnedSkillLibrary();
    assert.equal(lib.formatForPrompt({}), "");
  });

  it("allSkillIds includes both built-in and learned", () => {
    const lib = new LearnedSkillLibrary();
    const plan = makePlan();
    const evaluation = makeEvaluation(0.85, true);
    lib.maybeLearnSkill(plan, evaluation, makeStepEvals(plan), makeGrid());

    const all = lib.allSkillIds();
    assert.ok(all.has("logistics_hub"), "should include built-in");
    assert.ok(all.has("medical_center"), "should include new built-in");
    assert.ok([...all].some(id => id.startsWith("learned_")), "should include learned");
  });

  it("evicts weakest when at capacity", () => {
    const lib = new LearnedSkillLibrary();
    const grid = makeGrid();

    // Fill with 10 different skills (different action types to avoid dedup)
    const types = ["farm", "lumber", "quarry", "wall", "road", "herb_garden", "kitchen", "smithy", "clinic", "warehouse"];
    for (let i = 0; i < 10; i++) {
      const steps = [];
      for (let j = 0; j < 3; j++) {
        steps.push({
          id: j + 1,
          action: { type: types[i], hint: null },
          status: "completed",
          groundedTile: { ix: 10 + j, iz: 10 + i },
          predicted_effect: {},
        });
      }
      const plan = { goal: `test ${i}`, horizon_sec: 60, steps, source: "fallback" };
      const evaluation = makeEvaluation(0.7 + i * 0.01, true);
      evaluation.completed = 3;
      lib.maybeLearnSkill(plan, evaluation, makeStepEvals(plan), grid);
    }

    assert.equal(lib.size, 10, "should be at capacity");

    // Add one more — should evict weakest
    const extraSteps = [
      { id: 1, action: { type: "bridge", hint: null }, status: "completed", groundedTile: { ix: 5, iz: 5 }, predicted_effect: {} },
      { id: 2, action: { type: "bridge", hint: null }, status: "completed", groundedTile: { ix: 6, iz: 5 }, predicted_effect: {} },
      { id: 3, action: { type: "bridge", hint: null }, status: "completed", groundedTile: { ix: 7, iz: 5 }, predicted_effect: {} },
    ];
    const extraPlan = { goal: "bridge chain", horizon_sec: 60, steps: extraSteps, source: "fallback" };
    const extraEval = makeEvaluation(0.9, true);
    extraEval.completed = 3;
    lib.maybeLearnSkill(extraPlan, extraEval, makeStepEvals(extraPlan), grid);

    assert.equal(lib.size, 10, "should still be at capacity after eviction");
    assert.equal(lib.stats.skillsEvicted, 1);
  });
});

// ── New built-in skills ──────────────────────────────────────────────

describe("New built-in skills in SKILL_LIBRARY", () => {
  it("medical_center is defined", () => {
    const skill = SKILL_LIBRARY.medical_center;
    assert.ok(skill);
    assert.equal(skill.name, "Medical Center");
    assert.equal(skill.steps.length, 3);
    assert.ok(skill.steps.some(s => s.type === "clinic"));
    assert.ok(skill.steps.some(s => s.type === "herb_garden"));
  });

  it("resource_hub is defined", () => {
    const skill = SKILL_LIBRARY.resource_hub;
    assert.ok(skill);
    assert.equal(skill.name, "Resource Hub");
    assert.equal(skill.steps.length, 4);
    assert.ok(skill.steps.some(s => s.type === "quarry"));
    assert.ok(skill.steps.some(s => s.type === "lumber"));
  });

  it("rapid_farms is defined", () => {
    const skill = SKILL_LIBRARY.rapid_farms;
    assert.ok(skill);
    assert.equal(skill.name, "Rapid Farms");
    assert.equal(skill.steps.length, 3);
    assert.ok(skill.steps.every(s => s.type === "farm"));
  });

  it("all new skills are frozen", () => {
    for (const id of ["medical_center", "resource_hub", "rapid_farms"]) {
      assert.ok(Object.isFrozen(SKILL_LIBRARY[id]), `${id} should be frozen`);
    }
  });

  it("preconditions are correct", () => {
    assert.deepEqual(SKILL_LIBRARY.medical_center.preconditions, Object.freeze({ wood: 11, herbs: 4 }));
    assert.deepEqual(SKILL_LIBRARY.resource_hub.preconditions, Object.freeze({ wood: 15 }));
    assert.deepEqual(SKILL_LIBRARY.rapid_farms.preconditions, Object.freeze({ wood: 15 }));
  });
});
