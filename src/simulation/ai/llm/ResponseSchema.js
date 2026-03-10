import { EVENT_TYPE, WEATHER } from "../../../config/constants.js";
import {
  POLICY_TEXT_LIMITS,
  canonicalizeAiGroupId,
  getGroupPolicyContract,
} from "../../../config/aiConfig.js";

const WEATHER_SET = new Set(Object.values(WEATHER));
const EVENT_SET = new Set(Object.values(EVENT_TYPE));

function isNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateWeights(value, label) {
  if (!isRecord(value)) return `${label} invalid`;
  for (const [key, weight] of Object.entries(value)) {
    if (typeof key !== "string" || key.trim().length === 0) return `${label} key invalid`;
    if (!isNumber(weight)) return `${label} weight invalid`;
  }
  return "";
}

function validateOptionalText(value, label, limit) {
  if (value === undefined) return "";
  if (typeof value !== "string") return `${label} invalid`;
  if (value.length > limit * 4) return `${label} too long`;
  return "";
}

function validateOptionalNotes(value, label = "steeringNotes") {
  if (value === undefined) return "";
  if (!Array.isArray(value)) return `${label} invalid`;
  if (value.length > POLICY_TEXT_LIMITS.maxNotes * 2) return `${label} too long`;
  for (const note of value) {
    if (typeof note !== "string") return `${label} item invalid`;
    if (note.length > POLICY_TEXT_LIMITS.note * 3) return `${label} item too long`;
  }
  return "";
}

export function validateEnvironmentDirective(input) {
  if (!input || typeof input !== "object") return { ok: false, error: "directive not object" };
  if (!WEATHER_SET.has(input.weather)) return { ok: false, error: "invalid weather" };
  if (!isNumber(input.durationSec)) return { ok: false, error: "durationSec invalid" };
  if (!isNumber(input.factionTension)) return { ok: false, error: "factionTension invalid" };
  if (!Array.isArray(input.eventSpawns)) return { ok: false, error: "eventSpawns invalid" };

  for (const spawn of input.eventSpawns) {
    if (!spawn || typeof spawn !== "object") return { ok: false, error: "event spawn invalid" };
    if (!EVENT_SET.has(spawn.type)) return { ok: false, error: "event type invalid" };
    if (!isNumber(spawn.intensity)) return { ok: false, error: "event intensity invalid" };
    if (!isNumber(spawn.durationSec)) return { ok: false, error: "event duration invalid" };
  }

  const summaryError = validateOptionalText(input.summary, "summary", POLICY_TEXT_LIMITS.summary);
  if (summaryError) return { ok: false, error: summaryError };
  const focusError = validateOptionalText(input.focus, "focus", POLICY_TEXT_LIMITS.focus);
  if (focusError) return { ok: false, error: focusError };
  const notesError = validateOptionalNotes(input.steeringNotes);
  if (notesError) return { ok: false, error: notesError };

  return { ok: true, value: input };
}

export function validateGroupPolicy(input) {
  if (!input || typeof input !== "object") return { ok: false, error: "policy payload invalid" };
  if (!Array.isArray(input.policies)) return { ok: false, error: "policies missing" };

  for (const policy of input.policies) {
    if (!policy || typeof policy !== "object") return { ok: false, error: "policy item invalid" };
    if (typeof policy.groupId !== "string" || policy.groupId.length === 0) {
      return { ok: false, error: "groupId invalid" };
    }
    if (!getGroupPolicyContract(canonicalizeAiGroupId(policy.groupId))) {
      return { ok: false, error: "groupId unsupported" };
    }

    const weightsError = validateWeights(policy.intentWeights, "intentWeights");
    if (weightsError) return { ok: false, error: weightsError };

    if (!isNumber(policy.riskTolerance)) return { ok: false, error: "riskTolerance invalid" };

    const targetsError = validateWeights(policy.targetPriorities, "targetPriorities");
    if (targetsError) return { ok: false, error: targetsError };

    if (!isNumber(policy.ttlSec)) return { ok: false, error: "ttlSec invalid" };

    const summaryError = validateOptionalText(policy.summary, "summary", POLICY_TEXT_LIMITS.summary);
    if (summaryError) return { ok: false, error: summaryError };
    const focusError = validateOptionalText(policy.focus, "focus", POLICY_TEXT_LIMITS.focus);
    if (focusError) return { ok: false, error: focusError };
    const notesError = validateOptionalNotes(policy.steeringNotes);
    if (notesError) return { ok: false, error: notesError };
  }

  if (input.stateTargets !== undefined) {
    if (!Array.isArray(input.stateTargets)) return { ok: false, error: "stateTargets invalid" };
    for (const target of input.stateTargets) {
      if (!target || typeof target !== "object") return { ok: false, error: "stateTarget item invalid" };
      if (typeof target.groupId !== "string" || target.groupId.length === 0) {
        return { ok: false, error: "stateTarget groupId invalid" };
      }
      if (!getGroupPolicyContract(canonicalizeAiGroupId(target.groupId))) {
        return { ok: false, error: "stateTarget groupId unsupported" };
      }
      if (typeof target.targetState !== "string" || target.targetState.length === 0) {
        return { ok: false, error: "stateTarget targetState invalid" };
      }
      if (!isNumber(target.priority)) return { ok: false, error: "stateTarget priority invalid" };
      if (!isNumber(target.ttlSec)) return { ok: false, error: "stateTarget ttlSec invalid" };
      if (target.reason !== undefined && typeof target.reason !== "string") {
        return { ok: false, error: "stateTarget reason invalid" };
      }
    }
  }

  return { ok: true, value: input };
}
