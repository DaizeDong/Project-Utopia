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

// R13 sanity Plan-R13-sanity-toast-dedup (P2) — centralized cooldown helper.
//
// Three R13 plans introduce new pushWarning emit sites (event-mitigation
// "Bandit raid incoming" + A1-P2 deprecation + future fog scout toast).
// Without a shared dedup contract, two raids 5s apart would double-fire and
// the deprecation warning could re-emit on every legacy-key call. This helper
// stamps the last-emit time per dedupKey on `state.__toastCooldowns` (Map,
// LRU-capped) and short-circuits emits within `cooldownSec` of the previous
// one. Insertion-ordered Map iteration gives free LRU eviction at the cap.
//
// Mirrors the v0.8.7 Tier 1 SceneRenderer `_lastToastTextMap` cap pattern at
// the persistent-warning layer.
const TOAST_COOLDOWN_LRU_CAP = 64;

export function pushToastWithCooldown(state, message, level = "warn", options = {}) {
  if (!state?.metrics) return;
  const dedupKey = options.dedupKey;
  const source = options.source ?? "runtime";
  if (!dedupKey) {
    pushWarning(state, message, level, source);
    return;
  }
  const cooldownSec = Number.isFinite(Number(options.cooldownSec))
    ? Number(options.cooldownSec)
    : 30;
  state.__toastCooldowns ??= new Map();
  const now = Number(state.metrics.timeSec ?? 0);
  const last = state.__toastCooldowns.get(dedupKey);
  if (last !== undefined && now - last < cooldownSec) {
    return; // still in cooldown — suppress
  }
  // Evict oldest entry if at cap (Map iteration is insertion-ordered → LRU).
  if (state.__toastCooldowns.size >= TOAST_COOLDOWN_LRU_CAP
      && !state.__toastCooldowns.has(dedupKey)) {
    const oldestKey = state.__toastCooldowns.keys().next().value;
    if (oldestKey !== undefined) state.__toastCooldowns.delete(oldestKey);
  }
  // Move-to-end on refresh: delete + set so the same key bumps to MRU.
  state.__toastCooldowns.delete(dedupKey);
  state.__toastCooldowns.set(dedupKey, now);
  pushWarning(state, message, level, source);
}
