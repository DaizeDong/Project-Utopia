/**
 * StrategicAnalytics — pure functions that pre-score the strategic
 * decision space so the LLM picks priority/phase/focus from a ranked
 * candidate menu instead of inventing them.
 *
 * Round 2 of LLM tuning for the Strategic Director.
 *
 * All functions are pure and side-effect free. They take a game state
 * and emit ranked candidates plus reasoning. The LLM prompt embeds the
 * formatted output and asks the model to "pick from this menu".
 *
 * Validation contract: every candidate's `value` MUST be a member of
 * the corresponding STRATEGIC_ENUMS list in LLMClient (priority,
 * phase, resourceFocus). The post-validator falls back to the top-1
 * candidate if the LLM picks something outside the menu.
 */

const PRIORITY_VALUES = ["survive", "grow", "defend", "complete_objective"];
const PHASE_VALUES = ["bootstrap", "growth", "industrialize", "process", "fortify", "optimize"];
const FOCUS_VALUES = ["food", "wood", "stone", "balanced"];

const PHASE_RANK = { bootstrap: 0, growth: 1, industrialize: 2, process: 3, fortify: 1.5, optimize: 4 };

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

function readBuildings(state) {
  const b = state?.buildings ?? {};
  return {
    farms: Number(b.farms ?? 0),
    warehouses: Number(b.warehouses ?? 0),
    lumbers: Number(b.lumbers ?? 0),
    quarries: Number(b.quarries ?? 0),
    smithies: Number(b.smithies ?? 0),
    kitchens: Number(b.kitchens ?? 0),
    clinics: Number(b.clinics ?? 0),
    herbGardens: Number(b.herbGardens ?? 0),
  };
}

function readResources(state) {
  const r = state?.resources ?? {};
  return {
    food: Number(r.food ?? 0),
    wood: Number(r.wood ?? 0),
    stone: Number(r.stone ?? 0),
    herbs: Number(r.herbs ?? 0),
    tools: Number(r.tools ?? 0),
    medicine: Number(r.medicine ?? 0),
    meals: Number(r.meals ?? 0),
  };
}

function readMetrics(state) {
  const m = state?.metrics ?? {};
  const pop = m.populationStats ?? {};
  let workers = Number(pop.workers ?? 0);
  if (!workers && Array.isArray(state?.agents)) {
    // Fallback for bench harness / pre-first-tick: count live workers directly.
    workers = state.agents.filter((a) => a?.type === "WORKER" && a?.alive !== false).length;
  }
  return {
    workers,
    deathsTotal: Number(m.deathsTotal ?? 0),
    timeSec: Number(m.timeSec ?? 0),
  };
}

function readGameplay(state) {
  const g = state?.gameplay ?? {};
  return {
    threat: Number(g.threat ?? 0),
    devIndex: Number(g.devIndex ?? 0),
    devIndexSmoothed: Number(g.devIndexSmoothed ?? g.devIndex ?? 0),
    raidTier: Number(g.raidEscalation?.tier ?? 0),
    objectives: Array.isArray(g.objectives) ? g.objectives : [],
    objectiveIndex: Number(g.objectiveIndex ?? 0),
  };
}

/**
 * Compute constraint flags from gameplay state. These force-override
 * priority/phase choices regardless of LLM output. Surfaced to the LLM
 * so it doesn't try to override.
 *
 * @param {object} state
 * @returns {{forceSurvive:boolean, forceDefend:boolean, forceFortify:boolean, reasons:Array<string>}}
 */
export function computeConstraintFlags(state) {
  const reasons = [];
  const r = readResources(state);
  const m = readMetrics(state);
  const g = readGameplay(state);

  const foodCrisis = r.food < 15 || m.workers <= 3;
  const heavyThreat = g.threat > 75 || g.raidTier >= 3;
  const moderateThreat = g.threat > 50 && g.threat <= 75;

  if (foodCrisis) reasons.push(`food_crisis (food=${Math.round(r.food)} workers=${m.workers})`);
  if (heavyThreat) reasons.push(`active_raid (threat=${Math.round(g.threat)} tier=${g.raidTier})`);
  if (moderateThreat) reasons.push(`elevated_threat (threat=${Math.round(g.threat)})`);

  return {
    forceSurvive: foodCrisis,
    forceDefend: heavyThreat,
    forceFortify: heavyThreat,
    reasons,
  };
}

/**
 * Score each strategic priority based on current state. Returns top-3
 * candidates with reasons.
 *
 * Scoring:
 *   - "survive" — peaks when food/workers low, deaths rising
 *   - "defend" — peaks when threat rising or raid active
 *   - "grow" — peaks in nominal state with no crises
 *   - "complete_objective" — peaks late-game with prosperity high
 *
 * @param {object} state
 * @returns {Array<{value:string, score:number, reasons:Array<string>}>}
 */
export function computePriorityCandidates(state) {
  const r = readResources(state);
  const m = readMetrics(state);
  const g = readGameplay(state);
  const flags = computeConstraintFlags(state);

  const scores = [];

  // SURVIVE
  {
    const reasons = [];
    let s = 0;
    if (r.food < 15) { s += 0.5; reasons.push(`food=${Math.round(r.food)} below 15`); }
    if (r.food < 30) { s += 0.15; reasons.push(`food low (${Math.round(r.food)})`); }
    if (m.workers <= 3) { s += 0.4; reasons.push(`workers=${m.workers} critical`); }
    if (m.workers <= 6) { s += 0.1; reasons.push(`workers=${m.workers} thin`); }
    if (m.deathsTotal > 5) { s += Math.min(0.2, m.deathsTotal * 0.02); reasons.push(`deaths=${m.deathsTotal}`); }
    if (g.devIndexSmoothed < 25) { s += 0.1; reasons.push(`devIndex low ${Math.round(g.devIndexSmoothed)}`); }
    if (flags.forceSurvive) s = Math.max(s, 0.95);
    scores.push({ value: "survive", score: clamp01(s), reasons });
  }

  // DEFEND
  {
    const reasons = [];
    let s = 0;
    if (g.threat > 75) { s += 0.6; reasons.push(`threat=${Math.round(g.threat)}`); }
    else if (g.threat > 50) { s += 0.3; reasons.push(`threat=${Math.round(g.threat)} elevated`); }
    else if (g.threat > 30) { s += 0.1; reasons.push(`threat=${Math.round(g.threat)} mild`); }
    if (g.raidTier >= 3) { s += 0.4; reasons.push(`raid tier ${g.raidTier}`); }
    else if (g.raidTier >= 2) { s += 0.15; reasons.push(`raid tier ${g.raidTier}`); }
    if (flags.forceDefend) s = Math.max(s, 0.95);
    scores.push({ value: "defend", score: clamp01(s), reasons });
  }

  // GROW (default — penalised when crises active)
  {
    const reasons = [];
    let s = 0.55;
    if (r.food >= 30) { s += 0.1; reasons.push(`food=${Math.round(r.food)} adequate`); }
    if (m.workers >= 8) { s += 0.1; reasons.push(`workers=${m.workers} healthy`); }
    if (g.threat <= 30) { s += 0.1; reasons.push(`threat low ${Math.round(g.threat)}`); }
    if (g.devIndexSmoothed < 60) { s += 0.1; reasons.push(`headroom: dev=${Math.round(g.devIndexSmoothed)}/100`); }
    if (flags.forceSurvive) s -= 0.5;
    if (flags.forceDefend) s -= 0.5;
    scores.push({ value: "grow", score: clamp01(s), reasons });
  }

  // COMPLETE_OBJECTIVE
  {
    const reasons = [];
    let s = 0;
    const total = g.objectives.length;
    if (total > 0) {
      const remain = total - g.objectiveIndex;
      if (remain <= 1 && g.devIndexSmoothed >= 60) {
        s = 0.7;
        reasons.push(`final objective + dev=${Math.round(g.devIndexSmoothed)}`);
      } else if (remain <= 1) {
        s = 0.3;
        reasons.push(`final objective but dev=${Math.round(g.devIndexSmoothed)}`);
      }
    }
    scores.push({ value: "complete_objective", score: clamp01(s), reasons });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 3).map((s) => ({ ...s, score: round2(s.score) }));
}

/**
 * Score each phase by readiness. Returns reachable phases (score > 0)
 * sorted descending. Bootstrap is always reachable.
 *
 * Readiness rules:
 *  - bootstrap: 1 - min(1, (farms/4 + warehouses/1)/2)
 *    (drops as basics come online)
 *  - growth: requires bootstrap met (farms>=4 AND warehouses>=1)
 *  - industrialize: requires bootstrap met + (quarry==0 OR smithy==0)
 *  - process: requires industrialize partially met (quarry>=1) + (kitchen==0 OR clinic==0)
 *  - fortify: requires threat>50 OR raidTier>=2
 *  - optimize: requires devSmoothed>=60 AND chains complete
 *
 * @param {object} state
 * @returns {Array<{value:string, score:number, reasons:Array<string>}>}
 */
export function computePhaseCandidates(state) {
  const b = readBuildings(state);
  const m = readMetrics(state);
  const r = readResources(state);
  const g = readGameplay(state);

  const bootstrapMet = b.farms >= 4 && b.warehouses >= 1;
  const chainsComplete = b.quarries > 0 && b.smithies > 0 && b.kitchens > 0;

  const out = [];

  // BOOTSTRAP
  {
    const reasons = [];
    let s = 0.05;  // near-zero once met — don't keep the LLM idling here
    if (!bootstrapMet) {
      s = 1.0 - Math.min(1, (b.farms / 4) * 0.6 + Math.min(b.warehouses, 1) * 0.4);
      if (b.farms < 4) reasons.push(`farms=${b.farms}/4`);
      if (b.warehouses < 1) reasons.push(`no warehouse`);
    } else {
      reasons.push(`bootstrap met — exit recommended`);
    }
    if (r.food < 15 || m.workers <= 3) {
      s = Math.max(s, 0.85);
      reasons.push(`survival floor`);
    }
    out.push({ value: "bootstrap", score: clamp01(s), reasons });
  }

  // GROWTH
  {
    const reasons = [];
    let s = 0;
    if (bootstrapMet) {
      s = 0.5;
      reasons.push(`bootstrap met`);
      if (b.quarries > 0 && b.smithies > 0) { s += 0.2; reasons.push(`tool chain online`); }
      if (g.devIndexSmoothed < 60) { s += 0.1; reasons.push(`dev headroom`); }
    } else {
      s = 0.05;
    }
    out.push({ value: "growth", score: clamp01(s), reasons });
  }

  // INDUSTRIALIZE
  {
    const reasons = [];
    let s = 0;
    if (bootstrapMet) {
      if (b.quarries === 0) { s = 0.95; reasons.push(`no quarry — top ROI`); }
      else if (b.smithies === 0) { s = 0.9; reasons.push(`quarry up, build smithy`); }
      else if (b.tools !== undefined && r.tools < m.workers / 2 && m.workers > 4) {
        s = 0.6;
        reasons.push(`tools/worker=${round2(r.tools / Math.max(1, m.workers))} low`);
      } else {
        s = 0.25;
        reasons.push(`chain online — secondary`);
      }
    }
    out.push({ value: "industrialize", score: clamp01(s), reasons });
  }

  // PROCESS
  {
    const reasons = [];
    let s = 0;
    if (bootstrapMet && b.quarries > 0) {
      if (b.kitchens === 0 && b.farms >= 6) { s = 0.85; reasons.push(`farm surplus → kitchen`); }
      else if (b.clinics === 0 && b.herbGardens > 0) { s = 0.7; reasons.push(`herbs → clinic`); }
      else if (b.kitchens > 0 && b.clinics > 0) { s = 0.3; reasons.push(`process online`); }
      else { s = 0.15; reasons.push(`process partial`); }
    }
    out.push({ value: "process", score: clamp01(s), reasons });
  }

  // FORTIFY
  {
    const reasons = [];
    let s = 0;
    if (g.threat > 75 || g.raidTier >= 3) { s = 0.95; reasons.push(`threat=${Math.round(g.threat)} raid=${g.raidTier}`); }
    else if (g.threat > 50 || g.raidTier >= 2) { s = 0.55; reasons.push(`threat=${Math.round(g.threat)} elevated`); }
    else if (g.threat > 30) { s = 0.15; reasons.push(`threat mild`); }
    out.push({ value: "fortify", score: clamp01(s), reasons });
  }

  // OPTIMIZE
  {
    const reasons = [];
    let s = 0;
    if (chainsComplete && g.devIndexSmoothed >= 60) {
      s = 0.85;
      reasons.push(`chains complete + dev=${Math.round(g.devIndexSmoothed)}`);
    } else if (chainsComplete) {
      s = 0.35;
      reasons.push(`chains complete but dev=${Math.round(g.devIndexSmoothed)}`);
    }
    out.push({ value: "optimize", score: clamp01(s), reasons });
  }

  out.sort((a, b) => b.score - a.score);
  // Filter unreachable (score==0) but keep at least the top 3
  const filtered = out.filter((c) => c.score > 0);
  const result = (filtered.length >= 3 ? filtered : out).slice(0, 4);
  return result.map((c) => ({ ...c, score: round2(c.score) }));
}

/**
 * Compute bottleneck rank — score each candidate bottleneck (workers,
 * food, wood, stone, tools, medicine, defense) by how much it currently
 * drags growth. Top-3 returned.
 *
 * Used to populate `resourceFocus` candidates (food/wood/stone/balanced)
 * — non-resource bottlenecks (workers, tools, defense) are still surfaced
 * so the LLM can see the overall picture.
 *
 * @param {object} state
 * @returns {Array<{value:string, score:number, reasons:Array<string>, focus:string|null}>}
 *   `focus` maps the bottleneck to a STRATEGIC_ENUMS resourceFocus value
 *   when applicable, else null.
 */
export function computeBottleneckRank(state) {
  const b = readBuildings(state);
  const r = readResources(state);
  const m = readMetrics(state);
  const g = readGameplay(state);

  const items = [];

  // FOOD
  {
    const reasons = [];
    let s = 0;
    if (r.food < 15) { s += 0.6; reasons.push(`food=${Math.round(r.food)} crisis`); }
    else if (r.food < 30) { s += 0.3; reasons.push(`food=${Math.round(r.food)} low`); }
    else if (r.food < 60) { s += 0.1; reasons.push(`food=${Math.round(r.food)} ok`); }
    if (b.farms < 4) { s += 0.2; reasons.push(`farms=${b.farms}/4`); }
    items.push({ value: "food", score: clamp01(s), reasons, focus: "food" });
  }

  // WOOD
  {
    const reasons = [];
    let s = 0;
    if (r.wood < 10) { s += 0.5; reasons.push(`wood=${Math.round(r.wood)} crisis`); }
    else if (r.wood < 25) { s += 0.25; reasons.push(`wood=${Math.round(r.wood)} low`); }
    if (b.lumbers === 0) { s += 0.2; reasons.push(`no lumber mill`); }
    items.push({ value: "wood", score: clamp01(s), reasons, focus: "wood" });
  }

  // STONE
  {
    const reasons = [];
    let s = 0;
    if (b.quarries === 0 && b.farms >= 4 && b.warehouses >= 1) {
      s += 0.65;
      reasons.push(`no quarry — gates smithy`);
    } else if (r.stone < 5 && b.smithies > 0) {
      s += 0.4;
      reasons.push(`stone=${Math.round(r.stone)} starves smithy`);
    } else if (r.stone < 10) {
      s += 0.15;
      reasons.push(`stone=${Math.round(r.stone)} thin`);
    }
    items.push({ value: "stone", score: clamp01(s), reasons, focus: "stone" });
  }

  // WORKERS — non-resource bottleneck
  {
    const reasons = [];
    let s = 0;
    if (m.workers <= 3) { s += 0.7; reasons.push(`workers=${m.workers} critical`); }
    else if (m.workers <= 6) { s += 0.35; reasons.push(`workers=${m.workers} thin`); }
    else if (m.workers <= 10 && b.farms >= 4) { s += 0.1; reasons.push(`workers=${m.workers} could grow`); }
    items.push({ value: "workers", score: clamp01(s), reasons, focus: "balanced" });
  }

  // TOOLS — non-resource bottleneck
  {
    const reasons = [];
    let s = 0;
    if (b.smithies === 0 && b.quarries > 0) {
      s += 0.55;
      reasons.push(`smithy missing — +15% production locked`);
    } else if (m.workers > 4 && r.tools < m.workers / 2) {
      s += 0.4;
      reasons.push(`tools/worker=${round2(r.tools / Math.max(1, m.workers))}`);
    }
    items.push({ value: "tools", score: clamp01(s), reasons, focus: "stone" });
  }

  // MEDICINE — non-resource bottleneck
  {
    const reasons = [];
    let s = 0;
    if (m.deathsTotal >= 5 && b.clinics === 0) {
      s += 0.4;
      reasons.push(`deaths=${m.deathsTotal}, no clinic`);
    } else if (b.clinics === 0 && b.herbGardens > 0) {
      s += 0.2;
      reasons.push(`herbs idle, no clinic`);
    }
    items.push({ value: "medicine", score: clamp01(s), reasons, focus: "balanced" });
  }

  // DEFENSE — non-resource bottleneck
  {
    const reasons = [];
    let s = 0;
    if (g.threat > 75 || g.raidTier >= 3) { s += 0.7; reasons.push(`threat=${Math.round(g.threat)}`); }
    else if (g.threat > 50) { s += 0.35; reasons.push(`threat=${Math.round(g.threat)} elevated`); }
    items.push({ value: "defense", score: clamp01(s), reasons, focus: "balanced" });
  }

  items.sort((a, b) => b.score - a.score);
  return items.slice(0, 4).map((it) => ({ ...it, score: round2(it.score) }));
}

/**
 * For the top-N bottlenecks, compute a heuristic ROI projection:
 * "if you focus on X for the next 60s, expected benefit is +Y devIndex".
 *
 * Heuristic: severity × leverage_multiplier. Higher-leverage bottlenecks
 * (smithy, tools, food crisis) have multipliers >1.
 *
 * @param {object} state
 * @param {Array<{value:string, score:number}>} bottlenecks
 * @returns {Array<{value:string, expectedDevIndexGain:number, horizonSec:number, rationale:string}>}
 */
export function computeROIProjections(state, bottlenecks) {
  if (!Array.isArray(bottlenecks)) return [];

  // Leverage multipliers for "60s focused investment"
  const LEVERAGE = {
    food: 6,       // crisis food fix preserves workers — high
    wood: 3,
    stone: 4,
    workers: 5,
    tools: 8,      // +15% all production = highest leverage
    medicine: 4,
    defense: 5,
  };

  const RATIONALES = {
    food: "stabilize harvest, prevent worker death cascade",
    wood: "unblock build queue (most buildings need wood)",
    stone: "unblock smithy/quarry chain",
    workers: "raise headcount for parallel job throughput",
    tools: "+15% multiplier across all harvest jobs",
    medicine: "reduce mortality, protect worker investment",
    defense: "neutralise raid loss, protect 60s of progress",
  };

  return bottlenecks.slice(0, 3).map((bn) => {
    const lev = LEVERAGE[bn.value] ?? 2;
    // Heuristic: severity (0..1) × leverage gives projected dev gain over 60s.
    // Cap at 25 because devIndex is 0..100 and we don't claim half-the-game.
    const raw = (bn.score ?? 0) * lev;
    const expectedDevIndexGain = round2(Math.min(25, raw));
    return {
      value: bn.value,
      expectedDevIndexGain,
      horizonSec: 60,
      rationale: RATIONALES[bn.value] ?? "address current drag on growth",
    };
  });
}

/**
 * Format the analytics bundle into a markdown block the LLM can read.
 *
 * @param {object} analytics
 * @returns {string}
 */
export function formatStrategicAnalyticsForLLM(analytics) {
  if (!analytics) return "";
  const { priorities = [], phases = [], bottlenecks = [], roi = [], constraints = {} } = analytics;

  const lines = [];
  lines.push("## Computed Signals");
  lines.push("(Pick `priority`, `phase`, and `resourceFocus` from the menus below.)");
  lines.push("");

  if (constraints.reasons?.length) {
    lines.push("### Constraint Flags (force-overrides)");
    for (const reason of constraints.reasons) lines.push(`- ${reason}`);
    if (constraints.forceSurvive) lines.push("- forceSurvive: priority MUST be 'survive'");
    if (constraints.forceDefend) lines.push("- forceDefend: priority MUST be 'defend'");
    if (constraints.forceFortify) lines.push("- forceFortify: phase MUST be 'fortify'");
    lines.push("");
  }

  lines.push("### Priority Candidates (top-3 by fitness)");
  for (const p of priorities) {
    lines.push(`- ${p.value} (score=${p.score}): ${p.reasons.join("; ") || "default"}`);
  }
  lines.push("");

  lines.push("### Phase Candidates (reachable, top-4 by readiness)");
  for (const p of phases) {
    lines.push(`- ${p.value} (score=${p.score}): ${p.reasons.join("; ") || "n/a"}`);
  }
  lines.push("");

  lines.push("### Bottleneck Rank (top-4 by drag — pick `resourceFocus` from a focus column)");
  for (const b of bottlenecks) {
    lines.push(`- ${b.value} (score=${b.score}, focus=${b.focus ?? "n/a"}): ${b.reasons.join("; ") || "ok"}`);
  }
  lines.push("");

  if (roi.length > 0) {
    lines.push("### ROI Projections (60s focused investment)");
    for (const p of roi) {
      lines.push(`- ${p.value}: +${p.expectedDevIndexGain} devIndex over ${p.horizonSec}s — ${p.rationale}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Bundle all analytics for embedding in the prompt.
 * @param {object} state
 * @returns {object}
 */
export function buildStrategicAnalytics(state) {
  const constraints = computeConstraintFlags(state);
  const priorities = computePriorityCandidates(state);
  const phases = computePhaseCandidates(state);
  const bottlenecks = computeBottleneckRank(state);
  const roi = computeROIProjections(state, bottlenecks);
  return { constraints, priorities, phases, bottlenecks, roi };
}

/**
 * Validate an LLM-picked strategy against the candidate menus. Falls
 * back to the top-1 candidate per field on violation.
 *
 * Returns `{ strategy, picks }` where `picks` reports per-field whether
 * the LLM choice was honored or rolled back.
 *
 * @param {object} strategy
 * @param {object} analytics
 * @returns {{strategy:object, picks:{priority:string, phase:string, resourceFocus:string}}}
 */
export function validateStrategicPick(strategy, analytics) {
  const out = { ...strategy };
  const picks = { priority: "candidate", phase: "candidate", resourceFocus: "candidate" };

  const priorityValues = (analytics.priorities ?? []).map((p) => p.value);
  if (!priorityValues.includes(out.priority)) {
    if (PRIORITY_VALUES.includes(out.priority)) {
      // valid enum but not in menu — accept but mark as off-menu
      picks.priority = "off-menu";
    } else {
      out.priority = priorityValues[0] ?? "grow";
      picks.priority = "fallback";
    }
  }

  const phaseValues = (analytics.phases ?? []).map((p) => p.value);
  if (!phaseValues.includes(out.phase)) {
    if (PHASE_VALUES.includes(out.phase)) {
      picks.phase = "off-menu";
    } else {
      out.phase = phaseValues[0] ?? "growth";
      picks.phase = "fallback";
    }
  }

  // Constraint forcing
  if (analytics.constraints?.forceFortify) {
    out.phase = "fortify";
    picks.phase = "forced";
  }
  if (analytics.constraints?.forceSurvive) {
    out.priority = "survive";
    picks.priority = "forced";
  } else if (analytics.constraints?.forceDefend) {
    out.priority = "defend";
    picks.priority = "forced";
  }

  // resourceFocus must be a STRATEGIC_ENUMS value AND should match a
  // bottleneck.focus when one exists. "balanced" is always honored as
  // a valid candidate (it's the safe default for non-resource bottlenecks
  // like workers/medicine/defense).
  const focusFromBottlenecks = (analytics.bottlenecks ?? []).map((b) => b.focus).filter(Boolean);
  const topFocus = focusFromBottlenecks[0] ?? "balanced";
  const allowedFocus = new Set([...focusFromBottlenecks, "balanced"]);
  if (!FOCUS_VALUES.includes(out.resourceFocus)) {
    out.resourceFocus = topFocus;
    picks.resourceFocus = "fallback";
  } else if (!allowedFocus.has(out.resourceFocus)) {
    // Off-menu but valid enum — keep but mark
    picks.resourceFocus = "off-menu";
  }

  return { strategy: out, picks };
}

/**
 * Compute "candidate use rate": fraction of the 3 picks (priority,
 * phase, resourceFocus) that came directly from the candidate menu
 * (not fallback, not off-menu, not forced).
 *
 * @param {{priority:string, phase:string, resourceFocus:string}} picks
 * @returns {number} 0..1
 */
export function candidateUseRate(picks) {
  if (!picks) return 0;
  const fields = ["priority", "phase", "resourceFocus"];
  let hits = 0;
  for (const f of fields) {
    if (picks[f] === "candidate" || picks[f] === "forced") hits += 1;
  }
  return hits / fields.length;
}

export const _internal = { PRIORITY_VALUES, PHASE_VALUES, FOCUS_VALUES, PHASE_RANK };
