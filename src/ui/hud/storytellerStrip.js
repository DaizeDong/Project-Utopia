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
  let out = raw;
  const rules = [
    [/route repair and depot relief/gi, "rebuild the broken supply lane"],
    [/rebuild the broken supply lane/gi, "reconnect the broken supply lane"],
    [/cargo relief/gi, "clear the stalled cargo"],
    [/stockpile throughput/gi, "keep the larder filling"],
    [/safe frontier throughput/gi, "work the safe edge of the frontier"],
    [/sustain frontier buildout/gi, "sustain the frontier push"],
    [/frontier buildout/gi, "push the frontier outward"],
    [/push the frontier outward/gi, "push the frontier outward while keeping the rear supplied"],
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
 * @returns {{mode: "llm"|"fallback"|"idle", focusText: string, summaryText: string, prefix: string, beatText: string | null}}
 */
export function computeStorytellerStripModel(state) {
  const source = String(state?.ai?.lastPolicySource ?? "").toLowerCase();

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

  const prefix = mode === "llm"
    ? "WHISPER"
    : mode === "fallback"
      ? "DIRECTOR"
      : "DRIFT";

  // Idle copy communicates fallback-as-feature rather than going silent.
  // Keep the texts fully human-readable — no raw LLM debug tokens.
  const focusText = hasPolicy
    ? humaniseSummary(focus || "current directives")
    : "autopilot";
  const summaryText = hasPolicy
    ? humaniseSummary(summary || "colony on autopilot")
    : "colony holding steady — awaiting the next directive";

  // v0.8.2 Round-1 02d-roleplayer — fan-out salient event-trace beats into
  // the model so HUDController can render them into `#storytellerBeat`
  // without splicing into the main summary textContent (D4 arbitration).
  const beat = extractLatestNarrativeBeat(state);
  const beatText = formatBeatText(beat);

  return { mode, focusText, summaryText, prefix, beatText };
}
