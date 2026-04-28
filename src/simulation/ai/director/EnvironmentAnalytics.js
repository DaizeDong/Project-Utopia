// src/simulation/ai/director/EnvironmentAnalytics.js
//
// Round-2 LLM tuning for the Environment Director.
//
// Round 1 surfaced graded fragility/raid posture and an allow/ban list of
// events. The model picked from a coarse menu, but it still had to weigh
// every legal weather/event itself. Round 2 pre-rates EVERY legal option
// (5 weathers x 6 events) against the current colony state and surfaces a
// ranked menu, a storyteller posture (calm/building_tension/climax/recovery),
// and a "next safe storm window" hint. The LLM picks from the menu instead
// of inventing scores; deviations must be justified.
//
// Why this beats Round 1:
// 1. Pre-computation removes the model's degree of freedom on numerics.
//    LLMs are unreliable at composing 5 different signals into a single
//    rating, but excellent at picking the top-1 of a ranked list.
// 2. Storyteller posture is sticky across calls — the previous Round 1
//    `progressionHint` was a single sentence, not a state machine. Round 2
//    explicitly forbids escalation during `recovery`.
// 3. Threat windows give a forward-looking signal: "no safe storm window
//    yet" is a much stronger constraint than "fragilityLevel=fragile".
//
// All exports are pure (state in, data out) so they compose with
// buildEnvironmentPerception and stay easy to unit-test.

import { EVENT_TYPE, WEATHER } from "../../../config/constants.js";

const ALL_WEATHERS = Object.freeze([
  WEATHER.CLEAR,
  WEATHER.RAIN,
  WEATHER.STORM,
  WEATHER.DROUGHT,
  WEATHER.WINTER,
]);

const ALL_EVENTS = Object.freeze([
  EVENT_TYPE.TRADE_CARAVAN,
  EVENT_TYPE.ANIMAL_MIGRATION,
  EVENT_TYPE.BANDIT_RAID,
  EVENT_TYPE.MORALE_BREAK,
  EVENT_TYPE.DISEASE_OUTBREAK,
  EVENT_TYPE.WILDFIRE,
]);

function getWorld(summary) {
  return summary?.world ?? summary ?? {};
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// 1. Weather candidate ranking
// ---------------------------------------------------------------------------
//
// Each weather option starts at score 50 and gains/loses points for every
// signal it interacts with. Higher = better fit. Reasons are surfaced so the
// LLM (and tests) can see WHY a weather was ranked where it is.
export function rateWeatherCandidates(summary, perception) {
  const world = getWorld(summary);
  const food = Number(world.resources?.food ?? 0);
  const meals = Number(world.resources?.meals ?? 0);
  const farms = Number(world.buildings?.farms ?? 0);
  const wood = Number(world.resources?.wood ?? 0);
  const threat = Number(world.gameplay?.threat ?? 0);
  const prosperity = Number(world.gameplay?.prosperity ?? 50);
  const collapseRisk = Number(world.gameplay?.recovery?.collapseRisk ?? 0);
  const season = String(world.weather?.season ?? "").toLowerCase();
  const currentWeather = String(world.weather?.current ?? "clear");
  const weatherTimeLeft = Number(world.weather?.timeLeftSec ?? 0);
  const fragilityLevel = perception?.fragilityLevel ?? "stable";
  const raidPosture = perception?.raidPosture ?? "calm";

  const candidates = ALL_WEATHERS.map((weather) => {
    let score = 50;
    const reasons = [];

    // ---- Universal fragility penalties / bonuses ----
    if (weather === WEATHER.CLEAR) {
      if (fragilityLevel === "critical") { score += 35; reasons.push("crit→clear is recovery"); }
      else if (fragilityLevel === "fragile") { score += 25; reasons.push("fragile prefers calm"); }
      else if (fragilityLevel === "watchful") { score += 10; reasons.push("watchful → calm bias"); }
      else if (fragilityLevel === "thriving") { score -= 5; reasons.push("thriving wants challenge"); }
      if (raidPosture === "active") { score += 15; reasons.push("no insult-to-injury during raid"); }
    } else if (weather === WEATHER.RAIN) {
      if (fragilityLevel === "critical") { score -= 25; reasons.push("rain pressures fragile colony"); }
      else if (fragilityLevel === "fragile") { score -= 15; reasons.push("rain on fragile → bad"); }
      else if (fragilityLevel === "watchful") { score += 5; reasons.push("rain ok at watchful"); }
      else if (fragilityLevel === "stable") { score += 10; reasons.push("rain is mild challenge"); }
      else if (fragilityLevel === "thriving") { score += 8; reasons.push("rain refills moisture"); }
      if (raidPosture === "active") { score -= 15; reasons.push("rain stacks on active raid"); }
    } else if (weather === WEATHER.STORM) {
      if (fragilityLevel === "critical") { score -= 60; reasons.push("storm on critical = death"); }
      else if (fragilityLevel === "fragile") { score -= 40; reasons.push("storm on fragile = death"); }
      else if (fragilityLevel === "watchful") { score -= 15; reasons.push("storm risky at watchful"); }
      else if (fragilityLevel === "stable") { score -= 5; reasons.push("storm slight risk"); }
      else if (fragilityLevel === "thriving") { score += 15; reasons.push("storm rewards thriving"); }
      if (raidPosture === "active") { score -= 30; reasons.push("storm on raid = compounding"); }
      else if (raidPosture === "elevated") { score -= 10; reasons.push("storm with elevated threat"); }
    } else if (weather === WEATHER.DROUGHT) {
      // Drought is hardest on food. Penalize when farms or food are scarce.
      if (food < 100) { score -= 30; reasons.push(`drought + food=${food.toFixed(0)}`); }
      if (farms < 3) { score -= 20; reasons.push(`drought + farms=${farms}`); }
      if (fragilityLevel === "critical" || fragilityLevel === "fragile") {
        score -= 30; reasons.push("drought + fragile = death spiral");
      }
      if (season === "summer") { score += 8; reasons.push("drought thematic in summer"); }
      else if (season === "winter") { score -= 25; reasons.push("drought in winter unrealistic"); }
      if (fragilityLevel === "thriving" && farms >= 4) { score += 10; reasons.push("thriving + many farms tolerate drought"); }
    } else if (weather === WEATHER.WINTER) {
      if (food < 80 || meals < 2) { score -= 25; reasons.push("winter without food reserve"); }
      if (wood < 30) { score -= 20; reasons.push("winter without wood"); }
      if (fragilityLevel === "critical") { score -= 40; reasons.push("winter on critical kills"); }
      else if (fragilityLevel === "fragile") { score -= 20; reasons.push("winter on fragile"); }
      if (season === "winter") { score += 12; reasons.push("winter season match"); }
      else if (season === "summer") { score -= 30; reasons.push("winter in summer = jarring"); }
      if (fragilityLevel === "thriving") { score += 5; reasons.push("thriving handles winter"); }
    }

    // ---- Continuity bonus: don't thrash. ----
    // Iteration 2: STRONG continuity reinforcement when current weather
    // is calm AND colony is fragile/critical. The R1→R2 iter1 bench
    // showed only ~35% thrash drop — too many weather flips between
    // LLM calls. Boost continuity hard so the LLM sticks with clear.
    if (weather === currentWeather) {
      if (fragilityLevel === "critical" || fragilityLevel === "fragile") {
        score += 20; reasons.push("continuity strongly reinforced for fragile");
      } else if (weatherTimeLeft > 5) {
        score += 12; reasons.push("continuity (in-progress)");
      } else {
        score += 5; reasons.push("continuity (just-fired)");
      }
    }

    // ---- Collapse-risk failsafe: at very high collapse risk, ALL non-clear
    // weathers take a hard penalty so clear is essentially forced.
    if (collapseRisk >= 70 && weather !== WEATHER.CLEAR) {
      score -= 25;
      reasons.push(`collapseRisk=${collapseRisk.toFixed(0)} forces clear`);
    }

    // ---- Prosperity-driven thriving bonus ----
    if (prosperity >= 75 && threat <= 25 && weather === WEATHER.RAIN) {
      score += 5; reasons.push("prosperity-rich → light pressure ok");
    }

    return {
      weather,
      score: clamp(score, 0, 100),
      reasons: reasons.slice(0, 3),
      legal: true, // weather enum is always legal at the schema level
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  // Tag rank for downstream use.
  candidates.forEach((c, i) => { c.rank = i + 1; });
  return candidates;
}

// ---------------------------------------------------------------------------
// 2. Event candidate ranking
// ---------------------------------------------------------------------------
//
// Filters out events appearing in `bannedEventsThisCall` (mark them illegal,
// but keep them in the list with score=0 so the LLM can see why), then ranks
// the legal subset by appropriateness.
export function rateEventCandidates(summary, perception) {
  const world = getWorld(summary);
  const food = Number(world.resources?.food ?? 0);
  const threat = Number(world.gameplay?.threat ?? 0);
  const prosperity = Number(world.gameplay?.prosperity ?? 50);
  const events = Array.isArray(world.events) ? world.events : [];
  const activeRaids = events.filter((e) => e?.type === "banditRaid").length;
  const activeWildfire = events.some((e) => e?.type === "wildfire");
  const activeDisease = events.some((e) => e?.type === "diseaseOutbreak");
  const activeMorale = events.some((e) => e?.type === "moraleBreak");
  const fragilityLevel = perception?.fragilityLevel ?? "stable";
  const allowed = new Set(perception?.allowedEventsThisCall ?? []);
  const banned = new Set(perception?.bannedEventsThisCall ?? []);

  const candidates = ALL_EVENTS.map((eventType) => {
    const legal = allowed.size > 0 ? allowed.has(eventType) : !banned.has(eventType);
    let score = legal ? 50 : 0;
    const reasons = [];

    if (!legal) {
      reasons.push(`banned at fragility=${fragilityLevel}`);
      return { event: eventType, score, reasons, legal };
    }

    if (eventType === EVENT_TYPE.TRADE_CARAVAN) {
      // Always good. Boost when food short / fragile.
      score += 15; reasons.push("relief event always welcome");
      if (food < 100) { score += 15; reasons.push(`food=${food.toFixed(0)} → caravan helps`); }
      if (fragilityLevel === "critical" || fragilityLevel === "fragile") {
        score += 10; reasons.push("fragile → caravan is top relief");
      }
    } else if (eventType === EVENT_TYPE.ANIMAL_MIGRATION) {
      // Mild challenge. Score scales with prosperity.
      if (prosperity >= 60) { score += 10; reasons.push("prosperity supports migration"); }
      if (food >= 200) { score += 5; reasons.push("food cushion absorbs herd"); }
      if (fragilityLevel === "watchful") { score -= 5; reasons.push("watchful → less migration"); }
    } else if (eventType === EVENT_TYPE.BANDIT_RAID) {
      // Real challenge. Only fires for thriving runs in Round 1 allowlist.
      if (fragilityLevel !== "thriving") { score -= 30; reasons.push("non-thriving rejects raid"); }
      else { score += 5; reasons.push("thriving can absorb raid"); }
      if (threat >= 50) { score -= 25; reasons.push(`threat=${threat.toFixed(0)} already high`); }
      if (activeRaids > 0) { score -= 40; reasons.push("raid already active"); }
    } else if (eventType === EVENT_TYPE.MORALE_BREAK) {
      if (fragilityLevel !== "thriving") { score -= 25; reasons.push("morale break punishes weak"); }
      if (activeMorale) { score -= 35; reasons.push("morale break already active"); }
    } else if (eventType === EVENT_TYPE.DISEASE_OUTBREAK) {
      if (fragilityLevel !== "thriving") { score -= 40; reasons.push("disease too punishing"); }
      if (activeDisease) { score -= 50; reasons.push("disease already active"); }
    } else if (eventType === EVENT_TYPE.WILDFIRE) {
      if (fragilityLevel !== "thriving") { score -= 40; reasons.push("wildfire too punishing"); }
      if (activeWildfire) { score -= 50; reasons.push("wildfire already active"); }
    }

    return {
      event: eventType,
      score: clamp(score, 0, 100),
      reasons: reasons.slice(0, 3),
      legal: true,
    };
  });

  // Sort by score, illegal entries naturally trail.
  candidates.sort((a, b) => b.score - a.score);
  candidates.forEach((c, i) => { c.rank = i + 1; });
  return candidates;
}

// ---------------------------------------------------------------------------
// 3. Storyteller posture
// ---------------------------------------------------------------------------
//
// A 4-state machine derived from current state. The LLM is told NOT to
// escalate during `recovery`; the validation step downgrades aggressive
// directives that appear during recovery posture.
export function classifyStoryteller(summary, perception) {
  const world = getWorld(summary);
  const food = Number(world.resources?.food ?? 0);
  const threat = Number(world.gameplay?.threat ?? 0);
  const prosperity = Number(world.gameplay?.prosperity ?? 50);
  const collapseRisk = Number(world.gameplay?.recovery?.collapseRisk ?? 0);
  const fragilityLevel = perception?.fragilityLevel ?? "stable";
  const raidPosture = perception?.raidPosture ?? "calm";

  const reasons = [];
  let posture = "calm";

  if (fragilityLevel === "critical" || collapseRisk >= 60) {
    posture = "recovery";
    reasons.push(`fragility=${fragilityLevel}`);
    if (collapseRisk >= 60) reasons.push(`collapseRisk=${collapseRisk.toFixed(0)}`);
  } else if (fragilityLevel === "fragile" && raidPosture === "active") {
    posture = "climax";
    reasons.push("fragile + active raid → climax beat");
  } else if (raidPosture === "active") {
    posture = "climax";
    reasons.push("active raid in progress");
  } else if (fragilityLevel === "fragile" || raidPosture === "elevated" || threat >= 50) {
    posture = "building_tension";
    if (fragilityLevel === "fragile") reasons.push("fragile baseline");
    if (raidPosture === "elevated") reasons.push("elevated threat posture");
    if (threat >= 50) reasons.push(`threat=${threat.toFixed(0)}`);
  } else if (fragilityLevel === "watchful") {
    posture = "building_tension";
    reasons.push("watchful baseline");
  } else if (fragilityLevel === "thriving" && prosperity >= 70) {
    posture = "calm";
    reasons.push("thriving and steady");
  } else {
    posture = "calm";
    reasons.push("default calm");
  }

  // The canonical guidance the LLM must respect.
  const directive = (() => {
    switch (posture) {
      case "recovery":
        return "Do NOT escalate. Pick clear weather; pick tradeCaravan or no event. Justify any deviation explicitly.";
      case "climax":
        return "Do not pile on. Reuse current weather if survivable; pick at most one mild event.";
      case "building_tension":
        return "Light pressure ok. Prefer rain over storm; prefer animalMigration over banditRaid.";
      case "calm":
      default:
        return "Stable cadence. Match weather to season; mild events welcome.";
    }
  })();

  return { posture, reasons, directive, food, threat, prosperity, collapseRisk };
}

// ---------------------------------------------------------------------------
// 4. Threat windows — "next safe-to-storm window in N sim sec"
// ---------------------------------------------------------------------------
//
// Returns one of:
//   { safeNow: true, reason: "...", nextSafeSec: 0 }                     — storm OK now
//   { safeNow: false, reason: "...", nextSafeSec: N|null }               — wait N sim sec, or never
//
// Used by the LLM as a forward-looking constraint: if `nextSafeSec=null`,
// the LLM should pick `clear` regardless of seasonality.
export function computeThreatWindows(summary, perception) {
  const world = getWorld(summary);
  const food = Number(world.resources?.food ?? 0);
  const threat = Number(world.gameplay?.threat ?? 0);
  const collapseRisk = Number(world.gameplay?.recovery?.collapseRisk ?? 0);
  const farms = Number(world.buildings?.farms ?? 0);
  const fragilityLevel = perception?.fragilityLevel ?? "stable";
  const raidPosture = perception?.raidPosture ?? "calm";

  // Hard blockers — no safe storm window predictable from pure state.
  if (fragilityLevel === "critical") {
    return { safeNow: false, nextSafeSec: null, reason: "fragility=critical — no safe storm window" };
  }
  if (raidPosture === "active") {
    return { safeNow: false, nextSafeSec: null, reason: "raid active — no safe storm window" };
  }
  if (collapseRisk >= 60) {
    return { safeNow: false, nextSafeSec: null, reason: `collapseRisk=${collapseRisk.toFixed(0)} blocks storm` };
  }

  // Soft blockers — can predict an approximate recovery window from food
  // ramp. Each farm produces ~6 food/30s; estimate sec-to-recover.
  if (fragilityLevel === "fragile") {
    if (farms === 0) {
      return { safeNow: false, nextSafeSec: null, reason: "fragile + 0 farms — needs build action" };
    }
    const foodGap = Math.max(0, 150 - food);
    // ~0.2 food/farm/sec when uncontested; very rough estimate.
    const ramp = Math.max(1, farms * 0.2);
    const sec = Math.ceil(foodGap / ramp);
    // Clamp to reasonable bound.
    const nextSafeSec = clamp(sec, 30, 600);
    return { safeNow: false, nextSafeSec, reason: `fragile — wait ~${nextSafeSec}s for food ramp` };
  }

  if (fragilityLevel === "watchful") {
    return { safeNow: false, nextSafeSec: 60, reason: "watchful — wait ~60s, prefer rain over storm" };
  }

  // Thriving / stable with low threat
  if (threat <= 35 && fragilityLevel === "thriving") {
    return { safeNow: true, nextSafeSec: 0, reason: "thriving + low threat — safe to storm" };
  }
  if (threat <= 45 && fragilityLevel === "stable") {
    return { safeNow: true, nextSafeSec: 0, reason: "stable + low threat — light storm ok" };
  }

  // Stable but elevated threat
  return { safeNow: false, nextSafeSec: 30, reason: "elevated threat — wait ~30s" };
}

// Iteration 3: recommend a concrete relief event spawn for fragile/critical
// posture. The fallback's secret sauce is `{tradeCaravan, intensity=1.2,
// durationSec=16}` — without explicitly telling the LLM these magnitudes,
// it tends to pick weak relief (intensity=0.5) which doesn't pull the
// colony out of starvation. Returning null means "no spawn recommended".
export function recommendRelief(perception) {
  const fragilityLevel = perception?.fragilityLevel ?? "stable";
  if (fragilityLevel === "critical" || fragilityLevel === "fragile") {
    return { type: "tradeCaravan", intensity: 1.2, durationSec: 16 };
  }
  if (fragilityLevel === "watchful") {
    return { type: "tradeCaravan", intensity: 0.9, durationSec: 14 };
  }
  return null;
}

// Iteration 2: recommend a durationSec for the chosen weather. Longer
// durations on clear weather reduce thrash because the WeatherSystem's
// auto-cycler doesn't fire until duration expires. Fragile/critical
// states should ASK FOR longer clear weather to stabilize.
export function recommendDurationSec(topWeather, perception) {
  const fragilityLevel = perception?.fragilityLevel ?? "stable";
  if (topWeather === WEATHER.CLEAR) {
    if (fragilityLevel === "critical") return 35;
    if (fragilityLevel === "fragile") return 30;
    if (fragilityLevel === "watchful") return 25;
    return 22;
  }
  if (topWeather === WEATHER.RAIN) return 18;
  if (topWeather === WEATHER.STORM) return 12;
  if (topWeather === WEATHER.DROUGHT) return 16;
  if (topWeather === WEATHER.WINTER) return 18;
  return 20;
}

// ---------------------------------------------------------------------------
// 5. Format the menu for the LLM prompt
// ---------------------------------------------------------------------------
//
// Returns a markdown block. Embedded into the JSON prompt as a single string
// field — LLMs follow rendered markdown rules better than nested JSON.
export function formatEnvironmentMenuForLLM(weatherCandidates, eventCandidates, posture, threatWindow, perception) {
  const lines = [];
  lines.push("## Pre-rated Options");
  lines.push("");
  lines.push(`**Storyteller Posture:** \`${posture.posture}\` — ${posture.directive}`);
  if (posture.reasons?.length) {
    lines.push(`Posture reasons: ${posture.reasons.join("; ")}`);
  }
  lines.push("");
  lines.push("**Threat Window:**");
  if (threatWindow.safeNow) {
    lines.push(`- safeNow=true (${threatWindow.reason})`);
  } else if (threatWindow.nextSafeSec === null) {
    lines.push(`- safeNow=false; nextSafeSec=null — DO NOT pick storm. (${threatWindow.reason})`);
  } else {
    lines.push(`- safeNow=false; nextSafeSec=~${threatWindow.nextSafeSec}s. (${threatWindow.reason})`);
  }
  lines.push("");

  const topWeather = weatherCandidates[0]?.weather ?? "clear";
  const recommendedDuration = recommendDurationSec(topWeather, perception);
  lines.push(`**Recommended durationSec for top weather (\`${topWeather}\`):** ${recommendedDuration}s`);
  lines.push("Longer durations reduce weather thrash. Use this value unless you have a specific reason.");
  lines.push("");

  const reliefRec = recommendRelief(perception);
  if (reliefRec) {
    lines.push(`**Recommended relief spawn:** \`${reliefRec.type}\` intensity=${reliefRec.intensity} durationSec=${reliefRec.durationSec}`);
    lines.push("This is the proven-magnitude relief for current fragility — use it as your eventSpawns[0].");
    lines.push("");
  }

  lines.push("**Weather Candidates (rank, score, reasons):**");
  for (const c of weatherCandidates) {
    const reasons = c.reasons.length > 0 ? ` — ${c.reasons.join("; ")}` : "";
    lines.push(`${c.rank}. \`${c.weather}\` score=${c.score}${reasons}`);
  }
  lines.push("");

  const legalEvents = eventCandidates.filter((c) => c.legal);
  const illegalEvents = eventCandidates.filter((c) => !c.legal);
  lines.push("**Event Candidates (legal subset, ranked):**");
  if (legalEvents.length === 0) {
    lines.push("- (none — pick eventSpawns=[])");
  } else {
    for (const c of legalEvents) {
      const reasons = c.reasons.length > 0 ? ` — ${c.reasons.join("; ")}` : "";
      lines.push(`${c.rank}. \`${c.event}\` score=${c.score}${reasons}`);
    }
  }
  if (illegalEvents.length > 0) {
    lines.push("");
    lines.push(`Illegal/banned events: ${illegalEvents.map((c) => `\`${c.event}\``).join(", ")}`);
  }
  lines.push("");

  lines.push("**Selection Rules:**");
  lines.push("- Pick `weather` from the top-3 ranked weather candidates. If you choose anything below rank 3, justify it in `summary` (one sentence).");
  lines.push("- STRONGLY prefer rank-1 weather. Only deviate if you have a stage-specific narrative reason.");
  lines.push("- Pick events ONLY from the legal subset above. Cap eventSpawns to 1 unless posture is `calm`.");
  lines.push("- During `recovery` posture, you MUST NOT escalate: weather=`clear` and eventSpawns=[] or [tradeCaravan] only.");
  lines.push("- During `climax` posture, prefer reusing the current weather to avoid thrashing.");
  lines.push("- For weather durationSec, use the recommended value above. Shorter durations cause weather thrash, which the player perceives as chaotic.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 6. Post-validation — verify the LLM's chosen weather/event came from the menu.
// ---------------------------------------------------------------------------
//
// Returns: { valid, weatherFromMenu, eventsFromMenu, fixed, candidateUseRate, reasons }
//   - valid: true iff weather is in top-3 AND every event is legal
//   - fixed: a sanitized copy of `directive` (clamped to top-1 if violated)
//   - candidateUseRate: 0..1 — fraction of (1 weather + N events) that came from menu
//
// Always returns a sane directive — never throws. Designed to be called
// from EnvironmentDirectorSystem AFTER the schema validator runs.
export function validateEnvironmentPick(directive, weatherCandidates, eventCandidates, posture, recommendedDurationSecValue = null, recommendedReliefSpawn = null) {
  const reasons = [];
  const weather = directive?.weather ?? null;
  const eventSpawns = Array.isArray(directive?.eventSpawns) ? directive.eventSpawns : [];

  const top3Weathers = new Set(weatherCandidates.slice(0, 3).map((c) => c.weather));
  const legalEventSet = new Set(eventCandidates.filter((c) => c.legal).map((c) => c.event));
  const top1Weather = weatherCandidates[0]?.weather ?? "clear";
  const top1Event = eventCandidates.find((c) => c.legal)?.event ?? null;

  let weatherFromMenu = top3Weathers.has(weather);
  let weatherFixed = weather;
  if (!weatherFromMenu) {
    reasons.push(`weather=${weather} not in top-3 menu; downgrading to ${top1Weather}`);
    weatherFixed = top1Weather;
  }

  // Recovery posture override: force clear, no events.
  if (posture?.posture === "recovery") {
    if (weatherFixed !== "clear") {
      reasons.push("recovery posture forces weather=clear");
      weatherFixed = "clear";
    }
  }

  // Iteration 2: enforce a minimum duration when we strongly recommend
  // longer weather windows. If the LLM picked a duration far below the
  // recommendation, clamp it up. This is the primary lever for
  // weatherThrash reduction.
  let durationFixed = directive?.durationSec;
  if (recommendedDurationSecValue !== null && Number.isFinite(durationFixed)) {
    const minAcceptable = Math.max(8, recommendedDurationSecValue * 0.6);
    if (durationFixed < minAcceptable) {
      reasons.push(`durationSec=${durationFixed} below recommended ${recommendedDurationSecValue}s; clamping`);
      durationFixed = recommendedDurationSecValue;
    }
  }

  let eventsFromMenuCount = 0;
  const fixedSpawns = [];
  for (const spawn of eventSpawns) {
    if (legalEventSet.has(spawn?.type)) {
      eventsFromMenuCount += 1;
      // In recovery, keep only tradeCaravan even if legal list is broader.
      if (posture?.posture === "recovery" && spawn.type !== "tradeCaravan") {
        reasons.push(`recovery posture drops event=${spawn.type}`);
        continue;
      }
      fixedSpawns.push(spawn);
    } else {
      reasons.push(`event=${spawn?.type} not legal; dropping`);
    }
  }
  // Cap event count: 1 outside calm posture, 2 in calm.
  const cap = (posture?.posture === "calm") ? 2 : 1;
  if (fixedSpawns.length > cap) {
    reasons.push(`event count ${fixedSpawns.length} > cap ${cap}; trimming`);
    fixedSpawns.length = cap;
  }
  // Recovery posture extra rule: at most 1 event total, must be tradeCaravan.
  if (posture?.posture === "recovery" && fixedSpawns.length > 1) {
    fixedSpawns.length = 1;
  }

  // Iteration 3: ensure relief is delivered during recovery/climax. If the
  // LLM picked NO event during these postures (or picked an underpowered
  // tradeCaravan) and we have a relief recommendation, inject/upgrade it.
  // This prevents the LLM's "play it safe = no events" instinct from
  // starving the colony.
  if (recommendedReliefSpawn && (posture?.posture === "recovery" || posture?.posture === "climax")) {
    const existingCaravan = fixedSpawns.find((s) => s.type === recommendedReliefSpawn.type);
    if (!existingCaravan) {
      // Inject relief — only if there's room under the cap.
      if (fixedSpawns.length < cap) {
        fixedSpawns.push({ ...recommendedReliefSpawn });
        reasons.push(`injected recommended relief: ${recommendedReliefSpawn.type}@${recommendedReliefSpawn.intensity}`);
      }
    } else {
      // Upgrade intensity if the LLM chose weak relief.
      if (existingCaravan.intensity < recommendedReliefSpawn.intensity * 0.7) {
        existingCaravan.intensity = recommendedReliefSpawn.intensity;
        existingCaravan.durationSec = recommendedReliefSpawn.durationSec;
        reasons.push(`upgraded relief intensity to ${recommendedReliefSpawn.intensity}`);
      }
    }
  }

  // candidateUseRate: 1 (weather) + per-event indicators.
  const totalSlots = 1 + eventSpawns.length;
  const usedSlots = (weatherFromMenu ? 1 : 0) + eventsFromMenuCount;
  const candidateUseRate = totalSlots > 0 ? usedSlots / totalSlots : 1;

  const valid = reasons.length === 0;

  return {
    valid,
    weatherFromMenu,
    eventsFromMenu: eventsFromMenuCount === eventSpawns.length,
    fixed: {
      ...directive,
      weather: weatherFixed,
      durationSec: durationFixed ?? directive?.durationSec,
      eventSpawns: fixedSpawns,
    },
    candidateUseRate: Number(candidateUseRate.toFixed(3)),
    reasons,
    top1Weather,
    top1Event,
  };
}

// Helper to produce a single composite payload — used by the director.
export function buildEnvironmentMenu(summary, perception) {
  const weatherCandidates = rateWeatherCandidates(summary, perception);
  const eventCandidates = rateEventCandidates(summary, perception);
  const posture = classifyStoryteller(summary, perception);
  const threatWindow = computeThreatWindows(summary, perception);
  const menuMarkdown = formatEnvironmentMenuForLLM(
    weatherCandidates,
    eventCandidates,
    posture,
    threatWindow,
    perception,
  );
  const recommendedDurationSecValue = recommendDurationSec(weatherCandidates[0]?.weather ?? "clear", perception);
  const recommendedReliefSpawn = recommendRelief(perception);
  return {
    weatherCandidates,
    eventCandidates,
    posture,
    threatWindow,
    menuMarkdown,
    recommendedDurationSec: recommendedDurationSecValue,
    recommendedReliefSpawn,
  };
}
