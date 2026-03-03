import { AI_CONFIG } from "../../../config/aiConfig.js";
import { BALANCE } from "../../../config/balance.js";
import { WEATHER } from "../../../config/constants.js";
import { listGroupStates } from "../../npc/state/StateGraph.js";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function guardEnvironmentDirective(directive) {
  const normalized = {
    weather: directive.weather,
    durationSec: clamp(Number(directive.durationSec) || 18, 8, AI_CONFIG.maxDirectiveDurationSec),
    factionTension: clamp(Number(directive.factionTension) || 0.5, 0, 1),
    eventSpawns: [],
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

  return normalized;
}

export function guardGroupPolicies(payload) {
  const policies = (payload.policies ?? []).map((policy) => ({
    groupId: policy.groupId,
    intentWeights: normalizeWeights(policy.intentWeights ?? {}),
    riskTolerance: clamp(Number(policy.riskTolerance) || 0.5, 0, 1),
    targetPriorities: normalizeWeights(policy.targetPriorities ?? {}),
    ttlSec: clamp(Number(policy.ttlSec) || 24, 8, AI_CONFIG.maxPolicyTtlSec),
  }));

  const validGroups = new Set(
    policies
      .map((policy) => String(policy.groupId ?? "").trim())
      .filter(Boolean),
  );

  const stateTargets = [];
  const seen = new Set();
  for (const target of payload.stateTargets ?? []) {
    if (!target || typeof target !== "object") continue;
    const groupId = String(target.groupId ?? "").trim();
    if (!groupId || !validGroups.has(groupId)) continue;

    const allowedStates = listGroupStates(groupId);
    if (allowedStates.length === 0) continue;
    const targetState = String(target.targetState ?? "").trim();
    if (!allowedStates.includes(targetState)) continue;

    const dedupeKey = `${groupId}:${targetState}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    stateTargets.push({
      groupId,
      targetState,
      priority: clamp(Number(target.priority) || 0.5, 0, 1),
      ttlSec: clamp(Number(target.ttlSec) || 12, 4, AI_CONFIG.maxPolicyTtlSec),
      reason: String(target.reason ?? "").slice(0, 160),
    });
  }

  return {
    policies,
    stateTargets,
  };
}

function normalizeWeights(weights) {
  const out = {};
  for (const [k, v] of Object.entries(weights)) {
    const n = clamp(Number(v) || 0, 0, 3);
    out[k] = n;
  }
  return out;
}
