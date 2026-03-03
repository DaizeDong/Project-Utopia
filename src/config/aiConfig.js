export const AI_CONFIG = Object.freeze({
  environmentEndpoint: "/api/ai/environment",
  policyEndpoint: "/api/ai/policy",
  requestTimeoutMs: 7000,
  maxDirectiveDurationSec: 120,
  maxPolicyTtlSec: 60,
  minDecisionIntervalSec: 8,
  enableByDefault: false,
  retryAfterFailureSec: 8,
});

export const GROUP_IDS = Object.freeze({
  WORKERS: "workers",
  TRADERS: "traders",
  SABOTEURS: "saboteurs",
  HERBIVORES: "herbivores",
  PREDATORS: "predators",
});

export const DEFAULT_GROUP_POLICIES = Object.freeze({
  [GROUP_IDS.WORKERS]: {
    groupId: GROUP_IDS.WORKERS,
    intentWeights: { farm: 1.0, wood: 1.0, deliver: 1.2, eat: 1.4, wander: 0.2 },
    riskTolerance: 0.35,
    targetPriorities: { warehouse: 1.5, farm: 1.0, lumber: 1.0, safety: 1.2 },
    ttlSec: 24,
  },
  [GROUP_IDS.TRADERS]: {
    groupId: GROUP_IDS.TRADERS,
    intentWeights: { trade: 1.6, eat: 0.8, wander: 0.35 },
    riskTolerance: 0.42,
    targetPriorities: { warehouse: 1.7, road: 1.2, safety: 1.1, farm: 0.7 },
    ttlSec: 24,
  },
  [GROUP_IDS.SABOTEURS]: {
    groupId: GROUP_IDS.SABOTEURS,
    intentWeights: { sabotage: 1.5, scout: 1.0, evade: 0.9, wander: 0.2 },
    riskTolerance: 0.74,
    targetPriorities: { warehouse: 1.4, farm: 1.2, lumber: 1.1, exit: 0.8 },
    ttlSec: 24,
  },
  [GROUP_IDS.HERBIVORES]: {
    groupId: GROUP_IDS.HERBIVORES,
    intentWeights: { graze: 1.0, migrate: 0.8, flee: 1.3 },
    riskTolerance: 0.25,
    targetPriorities: { grass: 1.3, road: 0.7, safety: 1.2 },
    ttlSec: 24,
  },
  [GROUP_IDS.PREDATORS]: {
    groupId: GROUP_IDS.PREDATORS,
    intentWeights: { hunt: 1.0, stalk: 0.9, wander: 0.6 },
    riskTolerance: 0.8,
    targetPriorities: { herbivore: 1.4, isolation: 1.0, safety: 0.5 },
    ttlSec: 24,
  },
});
