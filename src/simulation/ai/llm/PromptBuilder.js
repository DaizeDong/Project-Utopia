import { EVENT_TYPE, WEATHER } from "../../../config/constants.js";
import { DEFAULT_GROUP_POLICIES } from "../../../config/aiConfig.js";

export function buildEnvironmentFallback(summary) {
  const lowFood = summary.resources.food < 18;
  const congestionHigh = summary.traffic.congestion > 0.58;

  if (lowFood) {
    return {
      weather: WEATHER.CLEAR,
      durationSec: 18,
      factionTension: 0.45,
      eventSpawns: [{ type: EVENT_TYPE.TRADE_CARAVAN, intensity: 1.2, durationSec: 16 }],
    };
  }

  if (congestionHigh) {
    return {
      weather: WEATHER.RAIN,
      durationSec: 14,
      factionTension: 0.6,
      eventSpawns: [{ type: EVENT_TYPE.ANIMAL_MIGRATION, intensity: 1.0, durationSec: 15 }],
    };
  }

  return {
    weather: Math.random() > 0.8 ? WEATHER.STORM : WEATHER.CLEAR,
    durationSec: 16,
    factionTension: 0.55,
    eventSpawns: [{ type: EVENT_TYPE.BANDIT_RAID, intensity: 0.8, durationSec: 12 }],
  };
}

export function buildPolicyFallback(_summary) {
  return {
    policies: Object.values(DEFAULT_GROUP_POLICIES),
  };
}
