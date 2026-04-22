// v0.8.2 Round-1 02e-indie-critic — guards the per-template scenario voice
// table added to ScenarioFactory. Reviewer quote: "Fertile Riverlands 里抽到
// 的 scenario 居然又是 'Broken Frontier · frontier repair'，和 Temperate
// Plains 完全一样" — this test pins the fix by asserting 6 distinct titles
// and a non-empty hint per template. Mechanical metadata (routes/depots/
// anchors) is deliberately NOT asserted here — covered by scenario-family.test.js.
import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";

const TEMPLATE_IDS = Object.freeze([
  "temperate_plains",
  "rugged_highlands",
  "archipelago_isles",
  "coastal_ocean",
  "fertile_riverlands",
  "fortified_basin",
]);

function getScenarioFor(templateId) {
  const state = createInitialGameState({ templateId, seed: 1337 });
  return state.gameplay.scenario;
}

test("each of the 6 templates ships a distinct scenario title and summary", () => {
  const scenarios = TEMPLATE_IDS.map((tpl) => ({ tpl, scenario: getScenarioFor(tpl) }));

  const titles = new Set();
  const summaries = new Set();
  for (const { tpl, scenario } of scenarios) {
    assert.ok(typeof scenario.title === "string" && scenario.title.length >= 3,
      `${tpl}: scenario.title missing or too short`);
    assert.ok(typeof scenario.summary === "string" && scenario.summary.length >= 20,
      `${tpl}: scenario.summary missing or too short`);
    titles.add(scenario.title);
    summaries.add(scenario.summary);
  }
  assert.equal(titles.size, TEMPLATE_IDS.length,
    `expected ${TEMPLATE_IDS.length} unique titles, got ${titles.size}: ${[...titles].join(" / ")}`);
  assert.equal(summaries.size, TEMPLATE_IDS.length,
    `expected ${TEMPLATE_IDS.length} unique summaries, got ${summaries.size}`);
});

test("fertile_riverlands no longer renders the temperate 'Broken Frontier' title", () => {
  const fertile = getScenarioFor("fertile_riverlands");
  const plains = getScenarioFor("temperate_plains");

  assert.notEqual(fertile.title, "Broken Frontier",
    "fertile_riverlands must get its own voice, not fall through to the temperate plains default");
  assert.notEqual(fertile.title, plains.title,
    "fertile_riverlands and temperate_plains must ship distinct titles despite sharing the frontier_repair family");
  assert.notEqual(fertile.summary, plains.summary,
    "fertile_riverlands and temperate_plains must ship distinct summaries");
});

test("every template's scenario exposes a non-empty opening hint", () => {
  for (const tpl of TEMPLATE_IDS) {
    const scenario = getScenarioFor(tpl);
    const initial = scenario?.hintCopy?.initial;
    assert.ok(typeof initial === "string" && initial.length >= 30,
      `${tpl}: hintCopy.initial must be >= 30 chars, got ${JSON.stringify(initial)}`);
    // Cheap smoke check: hint shouldn't still be a TODO / placeholder.
    assert.ok(!/TODO|FIXME|undefined/i.test(initial),
      `${tpl}: hintCopy.initial looks like a placeholder: ${JSON.stringify(initial)}`);
  }
});

test("sibling templates inside the same family still get separate voices", () => {
  // frontier_repair: temperate_plains + fertile_riverlands
  const plains = getScenarioFor("temperate_plains");
  const fertile = getScenarioFor("fertile_riverlands");
  assert.notEqual(plains.hintCopy.initial, fertile.hintCopy.initial,
    "temperate_plains vs fertile_riverlands share a family but must diverge in hint voice");

  // gate_chokepoints: rugged_highlands + fortified_basin
  const rugged = getScenarioFor("rugged_highlands");
  const basin = getScenarioFor("fortified_basin");
  assert.notEqual(rugged.title, basin.title,
    "rugged_highlands vs fortified_basin share a family but must diverge in title");

  // island_relay: archipelago_isles + coastal_ocean
  const isles = getScenarioFor("archipelago_isles");
  const coastal = getScenarioFor("coastal_ocean");
  assert.notEqual(isles.title, coastal.title,
    "archipelago_isles vs coastal_ocean share a family but must diverge in title");
});
