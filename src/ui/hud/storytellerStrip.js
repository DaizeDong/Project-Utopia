// v0.8.2 Round-0 01e-innovation — Pure computation for the HUD Storyteller
// strip. Extracted from HUDController so the computation is trivially
// testable without a DOM: given a GameState-like object, return the
// already-formatted single-line string that #storytellerStrip should show.
//
// The resulting string is prefixed with the policy source so players can
// tell at a glance whether the colony is driven by the live LLM agent or
// the deterministic rule-based fallback — both of which are legitimate
// "storytellers" in the Project Utopia design. When no workers policy is
// available (menu phase, before the first decision tick), we render the
// idle copy that still communicates fallback-as-feature instead of silence.
//
// v0.8.2 Round-1 01e-innovation — augmented with `computeStorytellerStripModel`,
// a DOM-friendly { mode, focusText, summaryText, prefix } shape that
// HUDController renders as a colored badge + focus + summary triplet. The
// legacy `computeStorytellerStripText` single-line function is kept
// unchanged for the fallback path + existing test coverage.
//
// D3 arbitration (Plans/summary.md) — badge copy is player-facing:
//   mode "llm"      → prefix "WHISPER"  (live LLM model in charge)
//   mode "fallback" → prefix "DIRECTOR" (deterministic rule-based fallback)
//   mode "idle"     → prefix "DRIFT"    (no policy yet — menu / first tick)
//
// v0.8.2 Round-1 02d-roleplayer — model now also surfaces `beatText`: the
// latest salient event-trace line (SABOTAGE / SHORTAGE / VISITOR / WEATHER /
// death / warehouse fire) within a 15-second horizon. HUDController renders
// this into a dedicated `#storytellerBeat` child span (D4 arbitration),
// **not** spliced into the main summary textContent — so the legacy pure
// function `computeStorytellerStripText` is left untouched. When no salient
// beat is present, `beatText` is `null` and the HUD simply hides the span.

// v0.8.2 Round-1 02d-roleplayer — salient event-trace filters. We only
// surface the 6 tag families that move the player's story forward
// (sabotage / shortage / visitor arrival / weather shift / death / fire).
// Anything else (routine event lifecycle transitions, raid cooldown drops,
// spawn/drop bookkeeping) stays buried in the DeveloperPanel.
import { describeMapTemplate } from "../../world/grid/Grid.js";

const SALIENT_BEAT_PATTERNS = Object.freeze([
  /\[SABOTAGE\]/i,
  /\[SHORTAGE\]/i,
  /\[VISITOR\]/i,
  /\[WEATHER\]/i,
  /\bdied \(/i,
  /warehouse fire/i,
]);

const NARRATIVE_BEAT_MAX_AGE_SEC = 15;
const NARRATIVE_BEAT_MAX_LEN = 140;

/**
 * Strip the leading `[12.3s]` timestamp prefix from an eventTrace line so
 * the player-facing beat reads cleanly. Returns both the cleaned line and
 * the parsed age (now - traceSec); if the prefix is malformed we fall
 * back to age=0 (render as "just now").
 *
 * @param {string} rawLine
 * @param {number} nowSec
 * @returns {{ line: string, ageSec: number }}
 */
function parseBeatLine(rawLine, nowSec) {
  const src = String(rawLine ?? "");
  const m = src.match(/^\[([\d.]+)s\]\s*(.+)$/);
  if (!m) return { line: src.trim(), ageSec: 0 };
  const traceSec = Number(m[1]);
  const body = String(m[2] ?? "").trim();
  if (!Number.isFinite(traceSec)) return { line: body, ageSec: 0 };
  const age = Math.max(0, Number(nowSec ?? 0) - traceSec);
  return { line: body, ageSec: age };
}

/**
 * Pull the latest salient narrative beat out of `state.debug.eventTrace`.
 * The trace is maintained newest-first (via `unshift`), so we scan forward
 * and return the first entry whose body matches one of the 6 salient
 * tag patterns AND whose age is within NARRATIVE_BEAT_MAX_AGE_SEC.
 *
 * Pure function — no DOM, no side effects. Returns `null` when nothing
 * salient is within the horizon, which signals HUDController to hide the
 * `#storytellerBeat` child span.
 *
 * @param {object} state GameState-like with optional `debug.eventTrace` and
 *   `metrics.timeSec`.
 * @param {number} [nowSec] Override clock (for tests). Defaults to
 *   `state.metrics.timeSec ?? 0`.
 * @returns {{ line: string, ageSec: number } | null}
 */
export function extractLatestNarrativeBeat(state, nowSec) {
  const trace = Array.isArray(state?.debug?.eventTrace) ? state.debug.eventTrace : null;
  if (!trace || trace.length === 0) return null;
  const clockSec = Number.isFinite(nowSec)
    ? Number(nowSec)
    : Number(state?.metrics?.timeSec ?? 0);
  // Scan oldest index=0 first (which is actually newest given unshift()).
  for (let i = 0; i < trace.length; i += 1) {
    const parsed = parseBeatLine(trace[i], clockSec);
    // Age gate — skip stale beats. `ageSec === 0` (no parseable timestamp)
    // is treated as "just now" and passes the gate.
    if (parsed.ageSec > NARRATIVE_BEAT_MAX_AGE_SEC) continue;
    // Tag gate — must match one of the salient patterns.
    let salient = false;
    for (const pat of SALIENT_BEAT_PATTERNS) {
      if (pat.test(parsed.line)) { salient = true; break; }
    }
    if (!salient) continue;
    return parsed;
  }
  return null;
}

/**
 * Format an extracted beat into the single-line copy HUDController writes
 * into `#storytellerBeat`. Exported for testing; HUDController uses the
 * `beatText` field on `computeStorytellerStripModel`'s return value.
 *
 * @param {{ line: string, ageSec: number } | null} beat
 * @returns {string | null}
 */
function formatBeatText(beat) {
  if (!beat) return null;
  let body = String(beat.line ?? "").trim();
  if (!body) return null;
  // Clamp line length — event messages can be long (impact coordinates,
  // target labels); avoid overflowing the single-line strip.
  if (body.length > NARRATIVE_BEAT_MAX_LEN) {
    body = `${body.slice(0, NARRATIVE_BEAT_MAX_LEN - 1)}\u2026`;
  }
  const ageSec = Number(beat.ageSec ?? 0);
  // Round to nearest second; ageSec < 0.5 reads as "just now".
  const ageRounded = Math.max(0, Math.round(ageSec));
  const ageFrag = ageRounded <= 0 ? "just now" : `${ageRounded}s ago`;
  return `Last: ${body} (${ageFrag})`;
}

/**
 * Normalise a raw LLM/rule focus+summary pair into slightly more
 * human-readable prose. Keeps the function pure and side-effect free
 * (no DOM, no i/o) — just a small lookup table swap used by the model
 * builder below. We deliberately keep the table compact so a
 * future LLM output expansion doesn't silently bit-rot: anything
 * unrecognised falls through as-is.
 *
 * @param {string} raw
 * @returns {string}
 */
function humaniseSummary(raw) {
  if (!raw) return raw;
  let out = String(raw);
  // v0.8.2 Round-5 Wave-3 (01e Step 2 + 02e Step 1) — entry forecast that
  // swallows any leftover "(the colony should )?sustain " prefix immediately
  // followed by another verb (rebuild/reconnect/clear/keep/run/hug/strike/push/
  // work/disrupt/harass). This happens when upstream templates or older
  // cached payloads still carry the deprecated "sustain <verb-phrase>"
  // grammar trap. Kill the residue before any of the rewrite rules can
  // amplify it (Round-0 rebuild→reconnect cascade observed in Feedback §3).
  out = out.replace(
    /\b(?:the colony should |workers should )?sustain (?=(?:rebuild|reconnect|clear|keep|run|hug|strike|push|work|disrupt|harass)\b)/gi,
    "",
  );
  const rules = [
    [/route repair and depot relief/gi, "rebuild the broken supply lane"],
    // Round-5 Wave-3 (01e Step 2) — removed rebuild→reconnect double-rewrite:
    // the upstream focus word is already "rebuild"; collapsing it here gave
    // the HUD the "sustain reconnect …" observation in Feedbacks/01e §3.
    [/cargo relief/gi, "clear the stalled cargo"],
    [/stockpile throughput/gi, "keep the larder filling"],
    [/safe frontier throughput/gi, "work the safe edge of the frontier"],
    [/sustain frontier buildout/gi, "sustain the frontier push"],
    [/frontier buildout/gi, "push the frontier outward"],
    // Round-5 Wave-3 (02e Step 1) — removed "push the frontier outward →
    // push … while keeping the rear supplied": rule stacked with upstream
    // summary template to produce the double-clause sentence the HUD
    // clipped into the "reroute pres…" residue (Feedbacks/02e §3).
    [/forward depot trade/gi, "run trade to the forward depot"],
    [/defended warehouse lanes/gi, "hug the warehouse lanes"],
    [/warehouse circulation/gi, "keep goods moving between warehouses"],
    [/soft frontier corridor hits/gi, "strike a soft frontier corridor"],
    [/depot disruption/gi, "disrupt a frontier depot"],
    [/economic harassment/gi, "harass the supply chain"],
    [/stabilization/gi, "let the colony breathe"],
    [/hunger and carried cargo/gi, "empty bellies and full backpacks"],
    [/keep hunger (under control|low)/gi, "keep hunger in check"],
    [/workers should /gi, "the colony should "],
    [/depot throughput/gi, "warehouse throughput"],
    [/stretched worksites?/gi, "thinly-staffed worksites"],
    [/harvest loops? stall/gi, "harvest chain stalls"],
  ];
  for (const [pat, repl] of rules) out = out.replace(pat, repl);
  return out;
}

// v0.8.2 Round-5 Wave-3 (02e Step 2) — Authorial voice pack.
//
// All strings below are direct reuses of text already written elsewhere in
// the repository (scenario.meta openingPressure, Kitchen BuildAdvisor
// tooltip). No new authored prose is added — this is a transport layer that
// reinjects the author's voice into the HUD strip so players finally read
// those sentences during play instead of only in menu/help/tooltip surfaces.
//
// Keyed by (mapTemplateId × focusTag). focusTag is derived from the raw
// focus text via deriveFocusTag() below. The default bucket (*) is the
// fallback when no mapTemplate-specific override exists.
//
// Sources:
//   - temperate_plains / fertile_riverlands / rugged_highlands /
//     fortified_basin / archipelago_isles / coastal_ocean openingPressure
//     strings are from src/world/scenarios/ScenarioFactory.js:27-77.
//   - Default "Kitchen" line is from src/simulation/construction/
//     BuildAdvisor.js:61 ("the difference between a stocked warehouse and
//     workers starving beside it").
const AUTHOR_VOICE_PACK = Object.freeze({
  temperate_plains: Object.freeze({
    "broken-routes": "The frontier is wide open, but the colony stalls fast if the west lumber line and east depot stay disconnected.",
    "cargo-stall": "The difference between a stocked warehouse and workers starving beside it — clear the cargo before that gap opens.",
    default: "The frontier is wide open, but the colony stalls fast if the west lumber line and east depot stay disconnected.",
  }),
  fertile_riverlands: Object.freeze({
    "broken-routes": "The first threat is delay: silt, floodwater, and long haul lines can starve the hearth before the valley pays off.",
    default: "The first threat is delay: silt, floodwater, and long haul lines can starve the hearth before the valley pays off.",
  }),
  rugged_highlands: Object.freeze({
    frontier: "The highlands reward careful timing: every cleared route also becomes a gate you must hold.",
    "broken-routes": "The highlands reward careful timing: every cleared route also becomes a gate you must hold.",
    default: "The highlands reward careful timing: every cleared route also becomes a gate you must hold.",
  }),
  fortified_basin: Object.freeze({
    "broken-routes": "The danger is not distance but exposure: the basin already has hard gates, and every open one invites pressure.",
    safety: "The danger is not distance but exposure: the basin already has hard gates, and every open one invites pressure.",
    default: "The danger is not distance but exposure: the basin already has hard gates, and every open one invites pressure.",
  }),
  archipelago_isles: Object.freeze({
    stockpile: "The opening fight is over crossing water; one missed bridge leaves the island chain broken and idle.",
    "broken-routes": "The opening fight is over crossing water; one missed bridge leaves the island chain broken and idle.",
    default: "The opening fight is over crossing water; one missed bridge leaves the island chain broken and idle.",
  }),
  coastal_ocean: Object.freeze({
    "broken-routes": "The coast is generous only after the causeways exist; until then the harbor, fields, and depot run separately.",
    default: "The coast is generous only after the causeways exist; until then the harbor, fields, and depot run separately.",
  }),
  "*": Object.freeze({
    default: "The difference between a stocked warehouse and workers starving beside it — keep the chain reinforcing itself.",
  }),
});

/**
 * Derive a coarse focusTag from the focus text. Used only to index
 * AUTHOR_VOICE_PACK — non-matching focus falls through to the template's
 * `default` bucket, which in turn falls through to the `*` default.
 *
 * @param {string} focus
 * @returns {string}
 */
function deriveFocusTag(focus) {
  const f = String(focus ?? "").toLowerCase();
  if (!f) return "default";
  if (/(broken|supply lane|rebuild|reconnect|route repair)/.test(f)) return "broken-routes";
  if (/(cargo|stalled cargo|cargo relief)/.test(f)) return "cargo-stall";
  if (/(stockpile|larder|food recovery)/.test(f)) return "stockpile";
  if (/(frontier buildout|push the frontier|safe edge of the frontier)/.test(f)) return "frontier";
  if (/(safety|defend|hold the gates|wall)/.test(f)) return "safety";
  return "default";
}

/**
 * Look up an author-voice line by (mapTemplateId, focusTag). Returns
 * `{ text, hit: true }` on success (template → focusTag match, with
 * default-bucket + global-fallback cascades) or `{ text: "", hit: false }`
 * when nothing in the pack is applicable.
 *
 * @param {string} mapTemplateId
 * @param {string} focusTag
 * @returns {{ text: string, hit: boolean }}
 */
function lookupAuthorVoice(mapTemplateId, focusTag) {
  const tplBucket = AUTHOR_VOICE_PACK[String(mapTemplateId ?? "")] ?? null;
  if (tplBucket && typeof tplBucket === "object") {
    if (typeof tplBucket[focusTag] === "string" && tplBucket[focusTag]) {
      return { text: tplBucket[focusTag], hit: true };
    }
    if (typeof tplBucket.default === "string" && tplBucket.default) {
      return { text: tplBucket.default, hit: true };
    }
  }
  const globalBucket = AUTHOR_VOICE_PACK["*"];
  if (globalBucket && typeof globalBucket.default === "string" && globalBucket.default) {
    return { text: globalBucket.default, hit: true };
  }
  return { text: "", hit: false };
}

function buildTemplateTag(state) {
  const title = String(state?.gameplay?.scenario?.title ?? "").trim();
  const templateId = String(state?.world?.mapTemplateId ?? "").trim();
  if (!title || !templateId) return "";
  const templateName = String(describeMapTemplate(templateId)?.name ?? "").trim();
  if (!templateName) return "";
  return `${title} - ${templateName}`;
}

/**
 * @param {object} state GameState or minimal shape with `ai.groupPolicies`
 *   (a Map keyed by group id) and `ai.lastPolicySource` (string).
 * @returns {string} Single-line human-readable storyteller ribbon text.
 */
export function computeStorytellerStripText(state) {
  const source = String(state?.ai?.lastPolicySource ?? "").toLowerCase();
  // Only the "llm" source counts as live LLM storytelling; "fallback",
  // "none", and any unrecognised source fall under Rule-based storyteller.
  const prefix = source === "llm" ? "LLM Storyteller" : "Rule-based Storyteller";

  let focus = "";
  let summary = "";
  const groupPolicies = state?.ai?.groupPolicies;
  if (groupPolicies) {
    // Map#get — supports both real Maps and test stubs that mimic Map API.
    const entry = typeof groupPolicies.get === "function"
      ? groupPolicies.get("workers")
      : (groupPolicies.workers ?? null);
    const data = entry?.data ?? entry ?? null;
    if (data && typeof data === "object") {
      focus = String(data.focus ?? "").trim();
      const rawSummary = String(data.summary ?? "").trim();
      // Keep the first sentence of summary; avoids overflowing the single-line
      // strip when the LLM returns a paragraph.
      const firstSentenceEnd = rawSummary.search(/[.!?](\s|$)/);
      summary = firstSentenceEnd > 0
        ? rawSummary.slice(0, firstSentenceEnd + 1)
        : rawSummary;
    }
  }

  if (!focus && !summary) {
    return "Rule-based storyteller idle — colony on autopilot";
  }
  const focusText = humaniseSummary(focus || "current directives");
  const summaryText = humaniseSummary(summary || "colony on autopilot");
  return `[${prefix}] ${focusText}: ${summaryText}`;
}

/**
 * Structured model for the storyteller strip, used by HUDController to
 * populate the badge + focus + summary spans. The badge copy (`prefix`)
 * follows the D3 arbitration in Round-1 Plans/summary.md:
 *
 *   mode "llm"      → prefix "WHISPER"
 *   mode "fallback" → prefix "DIRECTOR"
 *   mode "idle"     → prefix "DRIFT"
 *
 * @param {object} state GameState or minimal shape.
 * @returns {{mode: "llm"|"fallback"|"idle", focusText: string, summaryText: string, prefix: string, beatText: string | null, templateTag: string}}
 */
export function computeStorytellerStripModel(state) {
  const source = String(state?.ai?.lastPolicySource ?? "").toLowerCase();
  const lastPolicyError = String(state?.ai?.lastPolicyError ?? "").trim();
  const proxyHealth = String(state?.metrics?.proxyHealth ?? "").toLowerCase();

  let focus = "";
  let summary = "";
  let hasPolicy = false;
  const groupPolicies = state?.ai?.groupPolicies;
  if (groupPolicies) {
    const entry = typeof groupPolicies.get === "function"
      ? groupPolicies.get("workers")
      : (groupPolicies.workers ?? null);
    const data = entry?.data ?? entry ?? null;
    if (data && typeof data === "object") {
      focus = String(data.focus ?? "").trim();
      const rawSummary = String(data.summary ?? "").trim();
      const firstSentenceEnd = rawSummary.search(/[.!?](\s|$)/);
      summary = firstSentenceEnd > 0
        ? rawSummary.slice(0, firstSentenceEnd + 1)
        : rawSummary;
      if (focus || summary) hasPolicy = true;
    }
  }

  // Mode derivation:
  //   - source === "llm"                → mode llm     → prefix WHISPER
  //   - any policy data present         → mode fallback→ prefix DIRECTOR
  //   - no policy data yet              → mode idle    → prefix DRIFT
  let mode;
  if (source === "llm") mode = "llm";
  else if (hasPolicy) mode = "fallback";
  else mode = "idle";

  // v0.8.2 Round-5 Wave-3 (02e Step 4) — badgeState four-way split so the
  // HUD can differentiate a healthy live-LLM tick from a stale / degraded
  // fallback. WHISPER only lights up when we are both sourcing from the LLM
  // AND do NOT carry a lastPolicyError: previously any `source==="llm"` tick
  // unconditionally showed WHISPER, making the badge a promise the runtime
  // could not keep when the proxy flipped to error mid-session.
  let badgeState;
  if (mode === "llm" && !lastPolicyError) badgeState = "llm-live";
  else if (mode === "llm" && lastPolicyError) badgeState = "llm-stale";
  else if (mode === "fallback" && (proxyHealth === "error" || lastPolicyError)) badgeState = "fallback-degraded";
  else if (mode === "fallback") badgeState = "fallback-healthy";
  else badgeState = "idle";

  // Prefix: WHISPER only for healthy live LLM; stale LLM falls back to
  // DIRECTOR so players are not misled into thinking the model is driving
  // the colony when the last tick errored. idle → DRIFT (unchanged).
  const prefix = badgeState === "llm-live"
    ? "WHISPER"
    : mode === "idle"
      ? "DRIFT"
      : "DIRECTOR";

  // Idle copy communicates fallback-as-feature rather than going silent.
  // Keep the texts fully human-readable — no raw LLM debug tokens.
  let focusText = hasPolicy
    ? humaniseSummary(focus || "current directives")
    : "autopilot";

  // v0.8.2 Round-5 Wave-3 (02e Step 3) — voice-pack lookup. Only applies
  // in the fallback path (mode === "fallback"): the LLM-driven path stays
  // verbatim so authored model output is never overwritten. Idle keeps its
  // "holding steady" copy. See AUTHOR_VOICE_PACK comment for source origins.
  const mapTemplateId = String(state?.world?.mapTemplateId ?? "").trim();
  // v0.8.2 Round-5b (02e Step 2) — prefer policy.authorVoiceHintTag written by
  // PromptBuilder when available; fall back to deriveFocusTag heuristic.
  const policyTag = String(state?.ai?.groupPolicies?.get?.("workers")?.authorVoiceHintTag ?? "");
  const focusTag = policyTag || deriveFocusTag(focus);
  let summaryText;
  let voicePackHit = false;
  // v0.8.2 Round-5b (02e Step 1) — LLM-live overlay. Fallback path unchanged.
  // LLM path: voice-pack lookup runs independently of summaryText; if it hits,
  // voicePrefixText carries the authored short-sentence (rendered before summary
  // by HUDController). summaryText remains the humanised LLM output unchanged.
  let voicePrefixText = "";
  let voicePackOverlayHit = false;
  if (hasPolicy) {
    if (mode === "fallback") {
      const vp = lookupAuthorVoice(mapTemplateId, focusTag);
      if (vp.hit) {
        summaryText = vp.text;
        voicePackHit = true;
      } else {
        summaryText = humaniseSummary(summary || "colony on autopilot");
      }
    } else {
      summaryText = humaniseSummary(summary || "colony on autopilot");
      // LLM-live overlay: add author prefix if focusTag is specific (non-default).
      if (mode === "llm" && focusTag && focusTag !== "default") {
        const vp = lookupAuthorVoice(mapTemplateId, focusTag);
        if (vp.hit) {
          voicePrefixText = vp.text;
          voicePackOverlayHit = true;
        }
      }
    }
  } else {
    summaryText = "colony holding steady \u2014 awaiting the next directive";
  }

  // v0.8.2 Round-5 Wave-3 (01e Step 3) — in the fallback path, prefix the
  // focusText with "DIRECTOR picks " so the HUD strip makes the decision-
  // maker explicit. Only applies when the focus is not already "autopilot"
  // and does not already lead with "DIRECTOR"; the llm path is untouched so
  // WHISPER text stays coherent (R4 in the Plan Risks section).
  if (mode === "fallback" && focusText && focusText !== "autopilot"
      && !/^DIRECTOR\s+/i.test(focusText)) {
    focusText = `DIRECTOR picks ${focusText}`;
  }

  // v0.8.2 Round-1 02d-roleplayer — fan-out salient event-trace beats into
  // the model so HUDController can render them into `#storytellerBeat`
  // without splicing into the main summary textContent (D4 arbitration).
  const beat = extractLatestNarrativeBeat(state);
  const beatText = formatBeatText(beat);
  const templateTag = buildTemplateTag(state);

  // v0.8.2 Round-5b Wave-1 (01e Step 1) — LLM state diagnostic overlay.
  // Surfaces "Why no WHISPER?" answer string synthesised from existing state
  // fields (no new sim signals). HUDController pipes whisperBlockedReason
  // into the storyteller tooltip so players stop asking "is this AI on?".
  //
  // v0.8.2 Round-6 Wave-1 01b-playability (Step 4) — the player-facing
  // whisperBlockedReason is now in-fiction (no "LLM"/"WHISPER" jargon). The
  // raw diagnostic strings are kept on `diagnostic.whisperBlockedReasonDev`
  // so dev-mode HUD overlays and existing tests can still read them. Per
  // summary.md §3 D2, the *dev* field name is locked across Wave-1 plans
  // (01b/01c/02b) — Wave-2/3 must not rename it.
  const policyLlmCount = Number(state?.ai?.policyLlmCount ?? 0);
  const policyTotalCount = Number(state?.ai?.policyDecisionCount ?? 0);
  let whisperBlockedReason;
  let whisperBlockedReasonDev;
  if (badgeState === "llm-live") {
    whisperBlockedReason = "Story Director: speaking";
    whisperBlockedReasonDev = "LLM live \u2014 WHISPER active";
  } else if (badgeState === "llm-stale") {
    whisperBlockedReason = "Story Director: catching breath";
    whisperBlockedReasonDev = "LLM stale \u2014 last tick failed guardrail";
  } else if (badgeState === "fallback-degraded") {
    const errKind = proxyHealth === "error" ? "http" : (lastPolicyError ? "error" : "unknown");
    whisperBlockedReason = "Story Director: relying on rule-set";
    whisperBlockedReasonDev = `LLM errored (${errKind})`;
  } else if (badgeState === "fallback-healthy") {
    if (policyLlmCount === 0) {
      whisperBlockedReason = "Story Director: settling in";
      whisperBlockedReasonDev = "LLM never reached";
    } else {
      whisperBlockedReason = "Story Director: pondering";
      whisperBlockedReasonDev = "LLM quiet \u2014 fallback steering";
    }
  } else {
    whisperBlockedReason = "Story Director: warming up";
    whisperBlockedReasonDev = "No policy yet";
  }

  const diagnostic = {
    llmAvailable: badgeState === "llm-live" || badgeState === "llm-stale",
    llmEverFired: policyLlmCount > 0,
    llmLastErrorKind: lastPolicyError ? "error" : (proxyHealth === "error" ? "http" : "none"),
    llmLastErrorMessage: String(lastPolicyError ?? "").slice(0, 80),
    policyLlmCount,
    policyTotalCount,
    whisperBlockedReason,
    whisperBlockedReasonDev,
  };

  return {
    mode,
    focusText,
    summaryText,
    voicePrefixText,
    prefix,
    beatText,
    templateTag,
    badgeState,
    voicePackHit,
    voicePackOverlayHit,
    diagnostic,
  };
}
