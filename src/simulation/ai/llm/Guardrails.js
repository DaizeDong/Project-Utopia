import { AI_CONFIG } from "../../../config/aiConfig.js";
import { BALANCE } from "../../../config/balance.js";
import { WEATHER } from "../../../config/constants.js";

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
  return {
    policies: (payload.policies ?? []).map((policy) => ({
      groupId: policy.groupId,
      intentWeights: normalizeWeights(policy.intentWeights ?? {}),
      riskTolerance: clamp(Number(policy.riskTolerance) || 0.5, 0, 1),
      targetPriorities: normalizeWeights(policy.targetPriorities ?? {}),
      ttlSec: clamp(Number(policy.ttlSec) || 24, 8, AI_CONFIG.maxPolicyTtlSec),
    })),
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
