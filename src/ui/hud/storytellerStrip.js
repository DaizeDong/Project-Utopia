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

/**
 * Normalise a raw LLM/rule focus+summary pair into slightly more
 * human-readable prose. Keeps the function pure and side-effect free
 * (no DOM, no i/o) — just a small lookup table swap used by the model
 * builder below. We deliberately keep the table tiny (<=6 rules) so a
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
    [/sustain frontier buildout/gi, "sustain buildout across the frontier"],
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
  const focusText = focus || "current directives";
  const summaryText = summary || "colony on autopilot";
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
 * @returns {{mode: "llm"|"fallback"|"idle", focusText: string, summaryText: string, prefix: string}}
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
    ? (focus || "current directives")
    : "autopilot";
  const summaryText = hasPolicy
    ? humaniseSummary(summary || "colony on autopilot")
    : "colony holding steady — awaiting the next directive";

  return { mode, focusText, summaryText, prefix };
}
