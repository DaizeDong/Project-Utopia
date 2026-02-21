import { EVENT_TYPE, WEATHER } from "../../../config/constants.js";

const WEATHER_SET = new Set(Object.values(WEATHER));
const EVENT_SET = new Set(Object.values(EVENT_TYPE));

function isNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
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

    if (!policy.intentWeights || typeof policy.intentWeights !== "object") {
      return { ok: false, error: "intentWeights invalid" };
    }

    if (!isNumber(policy.riskTolerance)) return { ok: false, error: "riskTolerance invalid" };
    if (!policy.targetPriorities || typeof policy.targetPriorities !== "object") {
      return { ok: false, error: "targetPriorities invalid" };
    }

    if (!isNumber(policy.ttlSec)) return { ok: false, error: "ttlSec invalid" };
  }

  return { ok: true, value: input };
}
