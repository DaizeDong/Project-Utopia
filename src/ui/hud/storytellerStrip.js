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
