import { BALANCE } from "../../config/balance.js";

function normalizeMode(value, fallback = "fallback") {
  const text = String(value ?? "").trim().toLowerCase();
  return text || fallback;
}

function buildAutopilotToggleCopy(enabled) {
  if (enabled) {
    return {
      actionMessage: "AI enabled. Waiting for next decision cycle.",
      title: "Autopilot is on and will keep steering until you turn it off.",
    };
  }
  return {
    actionMessage: "Autopilot off. Manual guidance active; rule builders and directors are idle.",
    title: "Autopilot is off. You choose actions; automatic phase builders and connector builders are idle.",
  };
}

export function describeAutopilotToggle(enabled) {
  return buildAutopilotToggleCopy(Boolean(enabled));
}

export function getAutopilotRemainingSec(state) {
  const intervalSec = Math.max(1, Number(BALANCE.policyDecisionIntervalSec ?? 10));
  const now = Number(state?.metrics?.timeSec ?? 0);
  const last = Number(state?.ai?.lastPolicyResultSec ?? NaN);
  if (!Number.isFinite(last) || last < 0) return intervalSec;
  return Math.max(0, intervalSec - Math.max(0, now - last));
}

export function getAutomationModeSummary(state) {
  const enabled = Boolean(state?.ai?.enabled);
  const allowRepair = Boolean(state?.ai?.allowScenarioRepairWhenAutopilotOff);
  const liveLlm = String(state?.ai?.lastPolicySource ?? "").toLowerCase() === "llm"
    || String(state?.ai?.lastEnvironmentSource ?? "").toLowerCase() === "llm";
  const proxyHealth = String(state?.metrics?.proxyHealth ?? "").toLowerCase();
  const lastError = String(state?.ai?.lastError ?? state?.ai?.lastPolicyError ?? "").trim();
  const llmLabel = liveLlm && proxyHealth !== "error" ? "LLM live" : "rules/fallback";
  const directorLabel = enabled
    ? "director active"
    : allowRepair ? "scenario repair only" : "director idle";
  const builderLabel = enabled ? "builders active" : "builders idle";
  const recoveryLabel = state?.ai?.foodRecoveryMode ? "food recovery" : "normal";
  return {
    llmLabel,
    directorLabel,
    builderLabel,
    recoveryLabel,
    text: `${builderLabel}; ${directorLabel}; ${llmLabel}`,
    title: `Automation subsystems: Autopilot=${enabled ? "on" : "off"}, ${builderLabel}, ${directorLabel}, NPC policy=${llmLabel}, recovery=${recoveryLabel}${lastError ? `, last AI error=${lastError}` : ""}.`,
  };
}

export function getAutopilotStatus(state, options = {}) {
  // v0.8.2 Round-6 Wave-1 (01c-ui Step 4) — second-arg options bag with
  // `devMode` flag. Non-dev (default) suppresses the engineer-facing
  // "next policy in 9.8s" countdown and the "LLM offline — DIRECTOR
  // steering" suffix from the topbar text; both stay in the tooltip
  // (`title`) for power users who hover. Dev mode preserves the legacy
  // verbose copy so engineers can still glance at the policy cadence.
  const devMode = Boolean(options?.devMode);
  const enabled = Boolean(state?.ai?.enabled);
  const aiMode = normalizeMode(state?.ai?.mode);
  const coverageTarget = normalizeMode(state?.ai?.coverageTarget);
  const remainingSec = getAutopilotRemainingSec(state);
  const modeLabel = enabled ? "ON" : "OFF";
  const dataMode = enabled ? "on" : "off";
  // v0.8.2 Round-5b Wave-1 (01a Step 6) — pausedByCrisis short-circuit.
  // When ResourceSystem emits FOOD_CRISIS_DETECTED and GameApp.js clamps
  // the colony, return a hard-stop teaching string instead of the
  // optimistic "Autopilot ON · rule-based" banner.
  const pausedByCrisis = Boolean(state?.ai?.pausedByCrisis);
  const automationSummary = getAutomationModeSummary(state);
  if (pausedByCrisis) {
    return {
      enabled,
      modeLabel: "PAUSED",
      dataMode: "paused-crisis",
      aiMode,
      coverageTarget,
      remainingSec,
      pausedByCrisis: true,
      text: "Autopilot PAUSED \u00b7 food crisis \u2014 press Space or toggle to resume",
      title: `Autopilot paused: food crisis. Check Farm/Warehouse connectivity and resume when food is steady. ${automationSummary.title}`,
    };
  }
  // v0.8.2 Round-5 Wave-3 (01e Step 4) — render "fallback/fallback" as the
  // player-facing phrase "rule-based". This is not a mode rename — internally
  // the state still carries the literal "fallback" strings; only the HUD
  // banner surface collapses the double-word. Mixed cases like fallback/llm
  // keep the compact "fallback/llm" form so developers can still diagnose.
  const combinedModeLabel = (aiMode === "fallback" && coverageTarget === "fallback")
    ? "rule-based"
    : `${aiMode}/${coverageTarget}`;
  // v0.8.2 Round-6 Wave-1 (01c-ui Step 4) — casual short label (no
  // countdown). Used by the topbar chip in non-dev-mode. The "rules"
  // alias swaps the engineer string "rule-based" for a friendlier
  // single-word version ("rules") on the chip face; tooltip retains
  // "rule-based" + dev info for hover.
  const casualMode = (combinedModeLabel === "rule-based") ? "rules" : combinedModeLabel;
  // v0.8.2 Round-5 Wave-3 (01e Step 4) — degraded-state suffix: when the
  // runtime is actively routed through the fallback path AND the most
  // recent LLM attempt errored (or never got wired), the HUD spells it out
  // so the player can answer "why isn't WHISPER on right now?" at a glance.
  const lastPolicySource = String(state?.ai?.lastPolicySource ?? "").toLowerCase();
  const lastError = String(state?.ai?.lastError ?? "").trim();
  const proxyHealth = String(state?.metrics?.proxyHealth ?? "").toLowerCase();
  const llmOffline = lastPolicySource === "fallback"
    && (lastError.length > 0 || proxyHealth === "error");
  // Dev banner keeps the verbose engineer copy: countdown + offline tag.
  const devBaseText = enabled
    ? `Autopilot ON - ${combinedModeLabel} - next policy in ${remainingSec.toFixed(1)}s`
    : "Autopilot OFF - manual; builders/director idle.";
  // Casual banner: short, no countdown. Strips the engineer cadence
  // (per reviewer feedback #2 "Autopilot ON - rule-based - next policy in
  // 9.8s ..." was visually overwhelming on the 1024×768 chip).
  const casualBaseText = enabled
    ? `Autopilot ON \u00b7 ${casualMode}`
    : "Autopilot OFF \u00b7 manual; builders/director idle";
  const baseText = devMode ? devBaseText : casualBaseText;
  const baseTitle = enabled
    ? `Autopilot ON: mode=${aiMode}, coverage=${coverageTarget}, next policy in ${remainingSec.toFixed(1)}s. ${automationSummary.title}`
    : `Autopilot off. You choose actions; automatic phase builders are idle. ${automationSummary.title}`;
  // Dev-only: append the LLM-offline → DIRECTOR steering tag to the chip.
  // Casual players already see the ⚠ Storyteller badge for that signal.
  const llmText = (devMode && enabled && llmOffline)
    ? `${baseText} | LLM offline \u2014 DIRECTOR steering`
    : baseText;
  const llmTitle = enabled && llmOffline
    ? `${baseTitle} \u2014 LLM unavailable, rule-based DIRECTOR in charge.`
    : baseTitle;

  const food = Number(state?.resources?.food ?? 0);
  const emergency = Number(state?.services?.balance?.foodEmergencyThreshold ?? 18);
  const starvRisk = Number(state?.metrics?.starvationRiskCount ?? 0);
  const enableSec = Number(state?.ai?.enabledSinceSec ?? 0);
  const nowSec = Number(state?.metrics?.timeSec ?? 0);
  const graceSec = Number(state?.services?.balance?.casualUx?.struggleBannerGraceSec ?? 20);
  const struggleFoodFloor = emergency * Number(state?.services?.balance?.casualUx?.struggleFoodPctOfEmergency ?? 1.1);
  const struggling = enabled
    && (food <= struggleFoodFloor || starvRisk > 0)
    && (nowSec - enableSec) >= graceSec;

  const recoveryText = enabled && state?.ai?.foodRecoveryMode
    ? `${llmText} | Recovery: food runway - expansion paused`
    : llmText;
  const text = struggling
    ? `${recoveryText} | Autopilot struggling \u2014 manual takeover recommended`
    : recoveryText;
  const title = struggling
    ? `${llmTitle} \u2014 colony food is below emergency line; consider disabling autopilot and rebuilding farms manually.`
    : llmTitle;

  return {
    enabled,
    modeLabel,
    dataMode,
    aiMode,
    coverageTarget,
    remainingSec,
    pausedByCrisis: false,
    struggling,
    text,
    title,
  };
}
