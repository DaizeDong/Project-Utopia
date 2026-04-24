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
    actionMessage: "Autopilot off. You are steering manually; fallback is ready.",
    title: "Autopilot is off. Manual control is active and fallback is ready.",
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

export function getAutopilotStatus(state) {
  const enabled = Boolean(state?.ai?.enabled);
  const aiMode = normalizeMode(state?.ai?.mode);
  const coverageTarget = normalizeMode(state?.ai?.coverageTarget);
  const remainingSec = getAutopilotRemainingSec(state);
  const modeLabel = enabled ? "ON" : "OFF";
  const dataMode = enabled ? "on" : "off";
  // v0.8.2 Round-5 Wave-3 (01e Step 4) — render "fallback/fallback" as the
  // player-facing phrase "rule-based". This is not a mode rename — internally
  // the state still carries the literal "fallback" strings; only the HUD
  // banner surface collapses the double-word. Mixed cases like fallback/llm
  // keep the compact "fallback/llm" form so developers can still diagnose.
  const combinedModeLabel = (aiMode === "fallback" && coverageTarget === "fallback")
    ? "rule-based"
    : `${aiMode}/${coverageTarget}`;
  // v0.8.2 Round-5 Wave-3 (01e Step 4) — degraded-state suffix: when the
  // runtime is actively routed through the fallback path AND the most
  // recent LLM attempt errored (or never got wired), the HUD spells it out
  // so the player can answer "why isn't WHISPER on right now?" at a glance.
  const lastPolicySource = String(state?.ai?.lastPolicySource ?? "").toLowerCase();
  const lastError = String(state?.ai?.lastError ?? "").trim();
  const proxyHealth = String(state?.metrics?.proxyHealth ?? "").toLowerCase();
  const llmOffline = lastPolicySource === "fallback"
    && (lastError.length > 0 || proxyHealth === "error");
  const baseText = enabled
    ? `Autopilot ON - ${combinedModeLabel} - next policy in ${remainingSec.toFixed(1)}s`
    : "Autopilot off. Manual control is active; fallback is ready.";
  const baseTitle = enabled
    ? `Autopilot ON: mode=${aiMode}, coverage=${coverageTarget}, next policy in ${remainingSec.toFixed(1)}s.`
    : "Autopilot off. Manual control is active and fallback is ready.";
  const text = enabled && llmOffline
    ? `${baseText} | LLM offline \u2014 DIRECTOR steering`
    : baseText;
  const title = enabled && llmOffline
    ? `${baseTitle} \u2014 LLM unavailable, rule-based DIRECTOR in charge.`
    : baseTitle;

  return {
    enabled,
    modeLabel,
    dataMode,
    aiMode,
    coverageTarget,
    remainingSec,
    text,
    title,
  };
}
