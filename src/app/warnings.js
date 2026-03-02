const MAX_WARNING_MESSAGES = 20;
const MAX_WARNING_EVENTS = 120;
let warningSeq = 0;

function normalizeMessage(message) {
  if (typeof message === "string") return message;
  if (message === null || message === undefined) return "";
  return String(message);
}

export function pushWarning(state, message, level = "warn", source = "runtime") {
  if (!state?.metrics) return;
  const text = normalizeMessage(message).trim();
  if (!text) return;
  const now = Number(state.metrics.timeSec ?? 0);
  warningSeq += 1;
  const event = {
    id: `${source}:${Math.floor(now * 1000)}:${warningSeq}`,
    sec: now,
    level,
    source,
    message: text,
  };

  state.metrics.warningLog ??= [];
  state.metrics.warningLog.push(event);
  if (state.metrics.warningLog.length > MAX_WARNING_EVENTS) {
    state.metrics.warningLog = state.metrics.warningLog.slice(-MAX_WARNING_EVENTS);
  }

  state.metrics.warnings ??= [];
  state.metrics.warnings.push(text);
  if (state.metrics.warnings.length > MAX_WARNING_MESSAGES) {
    state.metrics.warnings = state.metrics.warnings.slice(-MAX_WARNING_MESSAGES);
  }
}

export function getLatestWarning(state) {
  const list = state?.metrics?.warnings;
  if (!Array.isArray(list) || list.length === 0) return "";
  return list[list.length - 1] ?? "";
}

export function clearWarnings(state) {
  if (!state?.metrics) return;
  state.metrics.warnings = [];
  state.metrics.warningLog = [];
}
