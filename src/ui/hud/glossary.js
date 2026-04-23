// v0.8.2 Round-1 01a-onboarding — HUD glossary tooltips.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round1/Plans/01a-onboarding.md
//
// Pure-data mapping from in-HUD abbreviations / KPI tokens to one-line
// plain-language explanations. Consumed by HUDController.render() and
// BuildToolbar.sync() which call `explainTerm(key)` and attach the result
// to `title` attributes on already-existing DOM nodes. Zero new DOM, zero
// new CSS, zero RNG access — safe to import from any render path.
//
// Each value MUST be a non-empty string ≤ 120 chars; the unit test in
// test/ui/hud-glossary.test.js enforces this and also pins the key set so
// future edits don't silently drop coverage of feedback §2.6 terms.

export const HUD_GLOSSARY = Object.freeze({
  // Top-line KPI / DevIndex family
  dev: "Dev Index: 0-100 composite of production, infra, safety, morale — higher = healthier colony.",
  devIndex: "Dev Index: 0-100 composite of production, infra, safety, morale — higher = healthier colony.",
  survivedScore: "Survival Score: accumulates +1/sec survived, +5 per birth, -10 per death in endless mode.",
  autopilotOff: "Autopilot OFF: workers wait for your clicks; AI director stays paused until you turn it on.",
  autopilotOn: "Autopilot ON: AI director schedules workers automatically. Toggle off to retake control.",

  // Scenario-progress ribbon tokens
  routes: "Supply routes completed vs. scenario target (warehouses linked by roads).",
  depots: "Depots built vs. scenario target (collection points near raw-resource nodes).",
  wh: "Warehouse count vs. scenario target; colony-wide storage used by all haulers.",
  farms: "Farms built vs. scenario target; soil-based Food producers.",
  lumbers: "Lumber camps built vs. scenario target; harvest Wood from nearby Forest tiles.",
  walls: "Walls built vs. scenario target; raise defense rating and slow raiders.",

  // Headline gameplay stats
  prosperity: "Prosperity: morale / growth driver (0-100); high prosperity boosts births and visitors.",
  threat: "Threat: external pressure (0-100) set by storyteller; drives raid chance and wildlife aggression.",
  storyteller: "AI Storyteller: adaptive director that shifts threat & events based on colony state.",

  // Role labels used in Colony panel / role-quota sliders
  haul: "Hauler: moves goods between warehouses (requires >=10 workers and a warehouse).",
  cook: "Cook: staffs Kitchen to turn raw Food into Meals (requires a built Kitchen).",
  smith: "Smith: staffs Smithy to turn Wood + Stone into Tools (requires a built Smithy).",
  herbalist: "Herbalist: staffs Clinic to brew Herbs into Medicine (requires a built Clinic).",

  // Lens / mode toggles
  heatLens: "Heat Lens: red = surplus producers, blue = starved processors or idle storage; tile color shows where to fix flow.",

  // Score breakdown decomposition
  scenarioGap: "Gap between current scenario progress and target; zero means this objective is complete.",
  perSec: "+1 survival score per in-game second you stay alive.",
  perBirth: "+5 survival score each time a new colonist is born.",
  perDeath: "-10 survival score each time a colonist dies (starvation, predation, raid).",
});

/**
 * Look up a glossary explanation by key. Defensive: returns empty string
 * (never throws) for unknown or null keys so render paths don't need to
 * guard every call site.
 *
 * @param {string | null | undefined} key
 * @returns {string}
 */
export function explainTerm(key) {
  if (key == null) return "";
  const k = String(key);
  if (!Object.prototype.hasOwnProperty.call(HUD_GLOSSARY, k)) return "";
  return HUD_GLOSSARY[k];
}
