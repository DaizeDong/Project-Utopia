import {
  AI_CONFIG,
  DEFAULT_GROUP_POLICIES,
  LEGACY_GROUP_IDS,
  POLICY_TEXT_LIMITS,
  canonicalizeAiGroupId,
  getGroupPolicyContract,
  listAllowedPolicyIntents,
  listAllowedTargetPriorities,
} from "../../../config/aiConfig.js";
import { BALANCE } from "../../../config/balance.js";
import { WEATHER } from "../../../config/constants.js";
import { listGroupStates } from "../../npc/state/StateGraph.js";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function sanitizeText(value, limit) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function sanitizeNotes(notes, fallback = []) {
  const list = Array.isArray(notes) && notes.length > 0 ? notes : fallback;
  const out = [];
  for (const note of list.slice(0, POLICY_TEXT_LIMITS.maxNotes)) {
    const clean = sanitizeText(note, POLICY_TEXT_LIMITS.note);
    if (!clean) continue;
    out.push(clean);
  }
  return out;
}

function normalizeWeights(weights, allowedKeys, fallbackWeights = {}) {
  const out = {};
  const source = weights && typeof weights === "object" ? weights : {};
  for (const key of allowedKeys) {
    const raw = Object.prototype.hasOwnProperty.call(source, key) ? source[key] : fallbackWeights[key];
    if (raw === undefined) continue;
    out[key] = clamp(Number(raw) || 0, 0, 3);
  }
  return out;
}

function normalizePolicyNarrative(policy, fallbackPolicy = null) {
  const focus = sanitizeText(policy?.focus, POLICY_TEXT_LIMITS.focus)
    || sanitizeText(fallbackPolicy?.focus, POLICY_TEXT_LIMITS.focus);
  const summary = sanitizeText(policy?.summary, POLICY_TEXT_LIMITS.summary)
    || sanitizeText(fallbackPolicy?.summary, POLICY_TEXT_LIMITS.summary);
  return {
    focus,
    summary,
    steeringNotes: sanitizeNotes(policy?.steeringNotes, fallbackPolicy?.steeringNotes ?? []),
  };
}

function normalizeGroupPolicy(policy) {
  const groupId = canonicalizeAiGroupId(policy?.groupId);
  const contract = getGroupPolicyContract(groupId);
  if (!contract) return null;

  const fallbackPolicy = DEFAULT_GROUP_POLICIES[groupId] ?? null;
  return {
    groupId,
    intentWeights: normalizeWeights(
      policy?.intentWeights ?? {},
      listAllowedPolicyIntents(groupId),
      fallbackPolicy?.intentWeights ?? {},
    ),
    riskTolerance: clamp(Number(policy?.riskTolerance) || fallbackPolicy?.riskTolerance || 0.5, 0, 1),
    targetPriorities: normalizeWeights(
      policy?.targetPriorities ?? {},
      listAllowedTargetPriorities(groupId),
      fallbackPolicy?.targetPriorities ?? {},
    ),
    ttlSec: clamp(Number(policy?.ttlSec) || fallbackPolicy?.ttlSec || 24, 8, AI_CONFIG.maxPolicyTtlSec),
    ...normalizePolicyNarrative(policy, fallbackPolicy),
  };
}

export function guardEnvironmentDirective(directive) {
  const fallbackFocus = (() => {
    if (directive?.weather === WEATHER.RAIN) return "contested logistics lane";
    if (directive?.weather === WEATHER.STORM) return "storm front pressure";
    if (directive?.weather === WEATHER.DROUGHT) return "farm stress belt";
    if (directive?.weather === WEATHER.WINTER) return "winter route drag";
    return "stable frontier";
  })();
  const normalized = {
    weather: directive.weather,
    durationSec: clamp(Number(directive.durationSec) || 18, 8, AI_CONFIG.maxDirectiveDurationSec),
    factionTension: clamp(Number(directive.factionTension) || 0.5, 0, 1),
    eventSpawns: [],
    focus: sanitizeText(directive?.focus, POLICY_TEXT_LIMITS.focus) || fallbackFocus,
    summary: sanitizeText(directive?.summary, POLICY_TEXT_LIMITS.summary),
    steeringNotes: sanitizeNotes(directive?.steeringNotes),
  };

  if (!Object.values(WEATHER).includes(normalized.weather)) {
    normalized.weather = WEATHER.CLEAR;
  }

  if (Array.isArray(directive.eventSpawns)) {
    for (const spawn of directive.eventSpawns.slice(0, 3)) {
      normalized.eventSpawns.push({
        type: spawn.type,
        intensity: clamp(Number(spawn.intensity) || 1, 0.4, BALANCE.maxEventIntensity),
        durationSec: clamp(Number(spawn.durationSec) || 14, 6, 60),
      });
    }
  }

  if (!normalized.summary) {
    normalized.summary = `Maintain ${normalized.focus} for ${normalized.durationSec.toFixed(0)}s without obscuring the map's main pressure.`;
  }
  if (normalized.steeringNotes.length === 0) {
    normalized.steeringNotes = [
      normalized.weather === WEATHER.RAIN || normalized.weather === WEATHER.STORM
        ? "Keep route pressure spatial and readable."
        : "Prefer scenario-linked pressure over generic noise.",
    ];
  }

  return normalized;
}

export function guardGroupPolicies(payload) {
  const normalizedPolicies = [];
  const seenGroups = new Set();
  for (const candidate of payload.policies ?? []) {
    const policy = normalizeGroupPolicy(candidate);
    if (!policy) continue;
    if (seenGroups.has(policy.groupId)) continue;
    seenGroups.add(policy.groupId);
    normalizedPolicies.push(policy);
  }

  const validGroups = new Set(
    normalizedPolicies
      .map((policy) => String(policy.groupId ?? "").trim())
      .filter(Boolean)
      .filter((groupId) => groupId !== LEGACY_GROUP_IDS.VISITORS),
  );

  const stateTargets = [];
  const seenTargets = new Set();
  for (const target of payload.stateTargets ?? []) {
    if (!target || typeof target !== "object") continue;
    const groupId = canonicalizeAiGroupId(target.groupId);
    if (!groupId || !validGroups.has(groupId)) continue;

    const allowedStates = listGroupStates(groupId);
    if (allowedStates.length === 0) continue;
    const targetState = String(target.targetState ?? "").trim();
    if (!allowedStates.includes(targetState)) continue;

    const dedupeKey = `${groupId}:${targetState}`;
    if (seenTargets.has(dedupeKey)) continue;
    seenTargets.add(dedupeKey);

    stateTargets.push({
      groupId,
      targetState,
      priority: clamp(Number(target.priority) || 0.5, 0, 1),
      ttlSec: clamp(Number(target.ttlSec) || 12, 4, AI_CONFIG.maxPolicyTtlSec),
      reason: sanitizeText(target.reason, 160),
    });
  }

  return {
    policies: normalizedPolicies,
    stateTargets,
  };
}
