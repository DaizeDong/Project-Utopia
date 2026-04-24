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
  const text = enabled
    ? `Autopilot ON - ${aiMode}/${coverageTarget} - next policy in ${remainingSec.toFixed(1)}s`
    : "Autopilot off. Manual control is active; fallback is ready.";
  const title = enabled
    ? `Autopilot ON: mode=${aiMode}, coverage=${coverageTarget}, next policy in ${remainingSec.toFixed(1)}s.`
    : "Autopilot off. Manual control is active and fallback is ready.";

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
