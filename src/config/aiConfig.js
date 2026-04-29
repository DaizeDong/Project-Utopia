export const AI_CONFIG = Object.freeze({
  environmentEndpoint: "/api/ai/environment",
  policyEndpoint: "/api/ai/policy",
  planEndpoint: "/api/ai/plan",
  // v0.8.5 Tier 3: 120000 → 30000. 30s LLM timeout — 120s ties up the
  // request slot way past any reasonable "do useful work" window. Cost
  // protection: a 120s timeout pays full token cost for a stalled model.
  requestTimeoutMs: 30000,
  maxDirectiveDurationSec: 180,
  maxPolicyTtlSec: 120,
  minDecisionIntervalSec: 8,
  enableByDefault: false,
  retryAfterFailureSec: 8,
  // v0.8.5 Tier 3: basic cost guardrail — cap LLM calls per hour at 240
  // (~4/min) so a runaway loop or flapping director can't burn budget.
  maxLLMCallsPerHour: 240,
});

export const GROUP_IDS = Object.freeze({
  WORKERS: "workers",
  TRADERS: "traders",
  SABOTEURS: "saboteurs",
  HERBIVORES: "herbivores",
  PREDATORS: "predators",
});

export const LEGACY_GROUP_IDS = Object.freeze({
  VISITORS: "visitors",
});

export const POLICY_TEXT_LIMITS = Object.freeze({
  summary: 140,
  focus: 72,
  note: 120,
  maxNotes: 4,
});

export function normalizeAiToken(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function canonicalizeAiGroupId(raw) {
  const token = normalizeAiToken(raw);
  if (!token) return "";
  if (token === "workers" || token === "worker" || token === "labor" || token === "labour") return GROUP_IDS.WORKERS;
  if (token === "traders" || token === "trader" || token === "merchant" || token === "merchants") return GROUP_IDS.TRADERS;
  if (token === "saboteurs" || token === "saboteur" || token === "raider" || token === "raiders") return GROUP_IDS.SABOTEURS;
  if (token === "herbivores" || token === "herbivore" || token === "prey") return GROUP_IDS.HERBIVORES;
  if (token === "predators" || token === "predator" || token === "hunter" || token === "hunters") return GROUP_IDS.PREDATORS;
  if (token === "visitors" || token === "visitor") return LEGACY_GROUP_IDS.VISITORS;
  return token;
}

export const GROUP_POLICY_CONTRACTS = Object.freeze({
  [GROUP_IDS.WORKERS]: Object.freeze({
    allowedIntents: Object.freeze(["farm", "wood", "deliver", "eat", "wander", "quarry", "gather_herbs", "cook", "smith", "heal"]),
    allowedTargets: Object.freeze(["warehouse", "farm", "lumber", "road", "depot", "frontier", "safety", "quarry", "herb_garden", "kitchen", "smithy", "clinic", "bridge"]),
    focusHint: "keep depots connected, push delivery before cargo stalls, and protect hunger-safe throughput",
  }),
  [GROUP_IDS.TRADERS]: Object.freeze({
    allowedIntents: Object.freeze(["trade", "eat", "wander"]),
    allowedTargets: Object.freeze(["warehouse", "road", "depot", "frontier", "safety", "farm"]),
    focusHint: "favor defended depots and road-supported trade lanes while avoiding exposed corridors",
  }),
  [GROUP_IDS.SABOTEURS]: Object.freeze({
    allowedIntents: Object.freeze(["sabotage", "scout", "evade", "wander", "eat"]),
    allowedTargets: Object.freeze(["warehouse", "farm", "lumber", "road", "frontier", "choke", "exit"]),
    focusHint: "pressure weak frontier corridors, exposed depots, and lightly defended chokepoints",
  }),
  [GROUP_IDS.HERBIVORES]: Object.freeze({
    allowedIntents: Object.freeze(["graze", "migrate", "flee"]),
    allowedTargets: Object.freeze(["grass", "farm", "wildlife", "road", "safety"]),
    focusHint: "graze around habitat anchors, pressure farms only when hunger justifies it, and preserve escape routes",
  }),
  [GROUP_IDS.PREDATORS]: Object.freeze({
    allowedIntents: Object.freeze(["hunt", "stalk", "wander", "feed", "rest"]),
    allowedTargets: Object.freeze(["herbivore", "isolation", "wildlife", "farm", "safety"]),
    focusHint: "hunt isolated prey, patrol frontier habitats, and only drift toward farms when prey pressure accumulates there",
  }),
  [LEGACY_GROUP_IDS.VISITORS]: Object.freeze({
    allowedIntents: Object.freeze(["trade", "eat", "wander", "sabotage", "scout", "evade"]),
    allowedTargets: Object.freeze(["warehouse", "road", "depot", "frontier", "safety", "farm", "lumber", "choke", "exit"]),
    focusHint: "legacy compatibility group that will be split into traders and saboteurs at runtime",
  }),
});

export function getGroupPolicyContract(groupId) {
  return GROUP_POLICY_CONTRACTS[canonicalizeAiGroupId(groupId)] ?? null;
}

export function listAllowedPolicyIntents(groupId) {
  return [...(getGroupPolicyContract(groupId)?.allowedIntents ?? [])];
}

export function listAllowedTargetPriorities(groupId) {
  return [...(getGroupPolicyContract(groupId)?.allowedTargets ?? [])];
}

export const STRATEGY_CONFIG = {
  heartbeatSec: 90,
  cooldownSec: 15,
  maxObservations: 50,
  maxReflections: 20,
};

export const DEFAULT_GROUP_POLICIES = Object.freeze({
  [GROUP_IDS.WORKERS]: {
    groupId: GROUP_IDS.WORKERS,
    intentWeights: { farm: 1.0, wood: 1.0, deliver: 1.2, eat: 1.4, wander: 0.2, quarry: 0.8, gather_herbs: 0.8, cook: 0.8, smith: 0.8, heal: 0.8 },
    riskTolerance: 0.35,
    targetPriorities: { warehouse: 1.5, farm: 1.0, lumber: 1.0, road: 1.05, depot: 1.2, frontier: 0.9, safety: 1.2, quarry: 0.9, herb_garden: 0.9, kitchen: 0.9, smithy: 0.9, clinic: 0.9, bridge: 0.7 },
    ttlSec: 24,
    focus: "depot throughput",
    summary: "Keep workers fed, reconnect routes, and unload cargo before harvest loops stall.",
    steeringNotes: ["Protect delivery chains before raw output.", "Avoid steering workers into hunger or cargo deadlocks."],
  },
  [GROUP_IDS.TRADERS]: {
    groupId: GROUP_IDS.TRADERS,
    intentWeights: { trade: 1.6, eat: 0.8, wander: 0.35 },
    riskTolerance: 0.42,
    targetPriorities: { warehouse: 1.7, road: 1.25, depot: 1.35, frontier: 0.95, safety: 1.1, farm: 0.7 },
    ttlSec: 24,
    focus: "defended depots",
    summary: "Route traders through defended warehouses and reliable roads instead of idling on exposed lanes.",
    steeringNotes: ["Trade should concentrate where route support and defenses are both present."],
  },
  [GROUP_IDS.SABOTEURS]: {
    groupId: GROUP_IDS.SABOTEURS,
    intentWeights: { sabotage: 1.5, scout: 1.0, evade: 0.9, wander: 0.2 },
    riskTolerance: 0.74,
    targetPriorities: { warehouse: 1.4, farm: 1.2, lumber: 1.1, road: 0.95, frontier: 1.15, choke: 1.05, exit: 0.8 },
    ttlSec: 24,
    focus: "frontier disruption",
    summary: "Hit lightly defended depots, fragile corridors, and productive tiles that keep the frontier supplied.",
    steeringNotes: ["Prefer soft targets over protected walls.", "Exit value should rise after a successful strike."],
  },
  [GROUP_IDS.HERBIVORES]: {
    groupId: GROUP_IDS.HERBIVORES,
    intentWeights: { graze: 1.0, migrate: 0.8, flee: 1.3 },
    riskTolerance: 0.25,
    targetPriorities: { grass: 1.3, farm: 0.95, wildlife: 1.15, road: 0.7, safety: 1.2 },
    ttlSec: 24,
    focus: "habitat grazing",
    summary: "Keep herds near habitat anchors, spill onto farms when pressure builds, and preserve escape options.",
    steeringNotes: ["Farm pressure should be visible but not constant.", "Predator pressure must still dominate flee decisions."],
  },
  [GROUP_IDS.PREDATORS]: {
    groupId: GROUP_IDS.PREDATORS,
    intentWeights: { hunt: 1.0, stalk: 0.9, wander: 0.6 },
    riskTolerance: 0.8,
    targetPriorities: { herbivore: 1.4, isolation: 1.0, wildlife: 0.95, farm: 0.8, safety: 0.5 },
    ttlSec: 24,
    focus: "isolated prey",
    summary: "Favor isolated prey and frontier hotspots before drifting toward safer or less consequential patrol paths.",
    steeringNotes: ["Use farm hotspots as a secondary lure, not a replacement for live prey."],
  },
});
