// ScriptedOraclePolicy — hand-tuned per-scenario "ceiling" baseline (W1 P0-6).
//
// Implements the AgentAdapter interface so it can drop into any harness
// where a real LLM adapter would normally sit. Each scenario gets a
// directive bank covering the four canonical channels:
//   - environment-director
//   - npc-policy
//   - strategic-plan
//   - colony-agent
//
// All directives are constructed to schema-validate and pass Guardrails.
// The point is to give relative-scoring callers a stable upper-bound
// reference: an LLM agent's score is normalized as
//   relative = (agent − fallback) / (oracle − fallback)
// so an oracle that survives Guardrails clamping is a non-negotiable
// component of the evaluation.

import {
  AgentAdapter,
  CHANNELS,
  SCHEMA_VERSION,
} from "../../simulation/ai/llm/AgentAdapter.js";
import { WEATHER, EVENT_TYPE } from "../../config/constants.js";
import { GROUP_IDS } from "../../config/aiConfig.js";
import {
  guardEnvironmentDirective,
  guardGroupPolicies,
} from "../../simulation/ai/llm/Guardrails.js";

/**
 * Per-scenario directive blueprints. Each scenario maps to the 4-channel
 * directive shape. Directives here are AUTHORED to satisfy:
 *   - ResponseSchema.validate{Environment,GroupPolicy} for the LLM-facing channels
 *   - Guardrails.guard{EnvironmentDirective,GroupPolicies} clamp ranges
 *   - Strategic / colony-agent shape matches the in-game consumers
 *
 * Adding a scenario: copy `temperate_plains` and tune the four channels.
 */
const SCENARIO_BLUEPRINTS = {
  temperate_plains: {
    "environment-director": () => ({
      weather: WEATHER.CLEAR,
      durationSec: 60,
      factionTension: 0.2,
      eventSpawns: [],
      focus: "stable harvest belt",
      summary: "Maintain calm weather while the colony scales food and storage.",
      steeringNotes: [
        "No raid pressure during the food bootstrap.",
        "Prefer scenario-linked pressure over generic noise.",
      ],
    }),
    "npc-policy": () => ({
      policies: [
        {
          groupId: GROUP_IDS.WORKERS,
          intentWeights: {
            farm: 2.5,
            wood: 1.6,
            deliver: 2.0,
            eat: 1.4,
            wander: 0.2,
            quarry: 0.6,
            gather_herbs: 0.6,
            cook: 1.2,
            smith: 0.4,
            heal: 0.6,
          },
          riskTolerance: 0.4,
          targetPriorities: {
            warehouse: 1.7,
            farm: 1.4,
            lumber: 1.0,
            road: 1.05,
            depot: 1.3,
            frontier: 0.7,
            safety: 1.2,
            quarry: 0.7,
            herb_garden: 0.7,
            kitchen: 1.1,
            smithy: 0.5,
            clinic: 0.7,
            bridge: 0.6,
          },
          ttlSec: 60,
          focus: "food-first depot throughput",
          summary: "Keep workers fed and harvest cargo flowing into warehouses before any cosmetic chores.",
          steeringNotes: [
            "Protect food chain over wood expansion.",
            "Avoid worker idle by routing to nearest unfilled depot.",
          ],
        },
      ],
      stateTargets: [],
    }),
    "strategic-plan": () => ({
      directive: {
        focus: "secure food supply, build 3 warehouses by day 5",
        horizonSec: 180,
        priorityChain: ["food", "storage", "lumber", "stone"],
      },
      summary: "Bootstrap the food economy first; do not overbuild military before warehouses exist.",
      steeringNotes: [
        "Secure food before any defensive build.",
        "Three warehouses minimum before military investment.",
      ],
    }),
    "colony-agent": () => ({
      buildPlan: [
        { type: "farm", priority: 3 },
        { type: "lumber", priority: 2 },
        { type: "warehouse", priority: 3 },
        { type: "kitchen", priority: 1 },
      ],
      summary: "Order: farm → lumber → warehouse → kitchen; defer combat infra until food buffer exists.",
      steeringNotes: [
        "Scale farms first, then storage, then processing.",
      ],
    }),
  },

  fortified_basin: {
    "environment-director": () => ({
      weather: WEATHER.CLEAR,
      durationSec: 45,
      factionTension: 0.6,
      eventSpawns: [
        { type: EVENT_TYPE.BANDIT_RAID, intensity: 0.8, durationSec: 20 },
      ],
      focus: "chokepoint pressure ramp",
      summary: "Telegraph a raid window so guards can fortify before contact.",
      steeringNotes: [
        "Pressure should be readable to defenders on the central chokepoint.",
        "Avoid scattering wildlife pressure during raid windows.",
      ],
    }),
    "npc-policy": () => ({
      policies: [
        {
          groupId: GROUP_IDS.WORKERS,
          intentWeights: {
            farm: 1.4,
            wood: 1.4,
            deliver: 1.6,
            eat: 1.2,
            wander: 0.2,
            quarry: 1.5,
            gather_herbs: 0.8,
            cook: 0.8,
            smith: 1.6,
            heal: 1.0,
          },
          riskTolerance: 0.3,
          targetPriorities: {
            warehouse: 1.5,
            farm: 0.9,
            lumber: 1.0,
            road: 1.0,
            depot: 1.2,
            frontier: 0.8,
            safety: 1.5,
            quarry: 1.4,
            herb_garden: 0.7,
            kitchen: 0.9,
            smithy: 1.4,
            clinic: 1.0,
            bridge: 0.6,
          },
          ttlSec: 60,
          focus: "fortify chokepoint",
          summary: "Push stone and tools into the chokepoint while keeping food intake steady.",
          steeringNotes: [
            "Maintain four guards minimum on the central chokepoint.",
            "Prioritize defensive infra over expansion during raid windows.",
          ],
        },
        {
          groupId: GROUP_IDS.SABOTEURS,
          intentWeights: { sabotage: 1.5, scout: 1.0, evade: 1.0, wander: 0.2 },
          riskTolerance: 0.7,
          targetPriorities: {
            warehouse: 1.3,
            farm: 1.0,
            lumber: 0.9,
            road: 0.8,
            frontier: 1.2,
            choke: 1.2,
            exit: 0.7,
          },
          ttlSec: 45,
          focus: "frontier disruption",
          summary: "Exploit raid window cover to hit warehouses; retreat through frontier.",
          steeringNotes: ["Soft targets only; avoid wall pushes."],
        },
      ],
      stateTargets: [],
    }),
    "strategic-plan": () => ({
      directive: {
        focus: "fortify chokepoint at center, maintain 4 guards minimum",
        horizonSec: 180,
        priorityChain: ["wall", "gate", "smithy", "clinic"],
      },
      summary: "Defense first; expansion second. Hold the center until raid pressure breaks.",
      steeringNotes: [
        "Wall and gate before any new farm.",
        "Keep clinic adjacent to barracks for fast triage.",
      ],
    }),
    "colony-agent": () => ({
      buildPlan: [
        { type: "wall", priority: 3 },
        { type: "gate", priority: 3 },
        { type: "smithy", priority: 2 },
        { type: "clinic", priority: 2 },
      ],
      summary: "Order: wall → gate → smithy → clinic; defer expansion until defended.",
      steeringNotes: [
        "Lock the chokepoint before scaling farms.",
      ],
    }),
  },

  rugged_highlands: {
    "environment-director": () => ({
      weather: WEATHER.CLEAR,
      durationSec: 60,
      factionTension: 0.3,
      eventSpawns: [
        { type: EVENT_TYPE.ANIMAL_MIGRATION, intensity: 0.6, durationSec: 18 },
      ],
      focus: "stone-rich highland exploitation",
      summary: "Clear skies favor mining throughput; occasional rockfall pressure on highland routes.",
      steeringNotes: [
        "Prefer scenario-linked pressure over generic noise.",
        "Telegraph rockfall along highland paths, not over depots.",
      ],
    }),
    "npc-policy": () => ({
      policies: [
        {
          groupId: GROUP_IDS.WORKERS,
          intentWeights: {
            farm: 1.4,
            wood: 1.5,
            deliver: 2.0,
            eat: 1.4,
            wander: 0.2,
            quarry: 2.5,
            gather_herbs: 0.6,
            cook: 1.0,
            smith: 1.4,
            heal: 0.8,
          },
          riskTolerance: 0.3,
          targetPriorities: {
            warehouse: 1.6,
            farm: 1.0,
            lumber: 1.2,
            road: 1.1,
            depot: 1.3,
            frontier: 0.8,
            safety: 1.3,
            quarry: 1.7,
            herb_garden: 0.6,
            kitchen: 1.0,
            smithy: 1.3,
            clinic: 0.9,
            bridge: 0.7,
          },
          ttlSec: 60,
          focus: "stone-rich highland exploitation",
          summary: "Concentrate workers on quarry throughput while keeping food intake steady against rockfall risk.",
          steeringNotes: [
            "Push stone into smithy and warehouse before any cosmetic chores.",
            "Reinforce against rockfall before expanding farms.",
          ],
        },
      ],
      stateTargets: [],
    }),
    "strategic-plan": () => ({
      directive: {
        focus: "stone-rich highland exploitation, reinforce against rockfall",
        horizonSec: 180,
        priorityChain: ["stone", "wood", "food", "tools"],
      },
      summary: "Lean into stone advantage; reinforce highland routes before food shortages compound.",
      steeringNotes: [
        "Quarry first, then storage, then food.",
        "Smithy unlocks tool throughput before scaling further.",
      ],
    }),
    "colony-agent": () => ({
      buildPlan: [
        { type: "quarry", priority: 3 },
        { type: "lumber", priority: 2 },
        { type: "warehouse", priority: 3 },
        { type: "smithy", priority: 2 },
      ],
      summary: "Order: quarry → lumber → warehouse → smithy; food belt scales after stone tools land.",
      steeringNotes: [
        "Lean into stone advantage; defer farms until tools exist.",
      ],
    }),
  },

  archipelago_isles: {
    "environment-director": () => ({
      weather: WEATHER.CLEAR,
      durationSec: 50,
      factionTension: 0.4,
      eventSpawns: [
        { type: EVENT_TYPE.WILDFIRE, intensity: 0.5, durationSec: 14 },
      ],
      focus: "bridge network across isles",
      summary: "Calm windows between storms; pressure rises on isolated isles cut off from the central hub.",
      steeringNotes: [
        "Pressure should be readable on cut-off isles, not generic noise.",
        "Avoid scattering wildlife pressure across distant water tiles.",
      ],
    }),
    "npc-policy": () => ({
      policies: [
        {
          groupId: GROUP_IDS.WORKERS,
          intentWeights: {
            farm: 1.3,
            wood: 2.0,
            deliver: 2.0,
            eat: 1.3,
            wander: 1.0,
            quarry: 1.2,
            gather_herbs: 0.8,
            cook: 1.0,
            smith: 0.8,
            heal: 0.7,
          },
          riskTolerance: 0.5,
          targetPriorities: {
            warehouse: 1.6,
            farm: 1.0,
            lumber: 1.4,
            road: 1.2,
            depot: 1.3,
            frontier: 1.1,
            safety: 1.1,
            quarry: 0.9,
            herb_garden: 0.7,
            kitchen: 1.0,
            smithy: 0.7,
            clinic: 0.7,
            bridge: 1.7,
          },
          ttlSec: 60,
          focus: "bridge network across isles",
          summary: "Push wood and bridges to connect isles before food belts stall on isolated tiles.",
          steeringNotes: [
            "Bridge frontier isles before scaling farms there.",
            "Keep central hub depot saturated to stage cargo.",
          ],
        },
      ],
      stateTargets: [],
    }),
    "strategic-plan": () => ({
      directive: {
        focus: "establish bridge network across isles, secure central hub",
        horizonSec: 180,
        priorityChain: ["wood", "bridge", "storage", "food"],
      },
      summary: "Connect isles first; the central hub feeds and stores until bridges relieve isolation.",
      steeringNotes: [
        "Wood and bridges before any frontier farm.",
        "Hub warehouse must stay above 50 percent to stage cargo.",
      ],
    }),
    "colony-agent": () => ({
      buildPlan: [
        { type: "bridge", priority: 3 },
        { type: "warehouse", priority: 3 },
        { type: "kitchen", priority: 2 },
        { type: "lumber", priority: 2 },
      ],
      summary: "Order: bridge → warehouse → kitchen → lumber; food network depends on connection first.",
      steeringNotes: [
        "Bridge before farm; isolated farms starve carriers.",
      ],
    }),
  },

  coastal_ocean: {
    "environment-director": () => ({
      weather: WEATHER.CLEAR,
      durationSec: 55,
      factionTension: 0.2,
      eventSpawns: [],
      focus: "coastal supply line",
      summary: "Calm coastline favors farm expansion inland while the supply line holds along the shore.",
      steeringNotes: [
        "Prefer scenario-linked pressure over generic noise.",
        "Keep weather pressure off the inland farm belt.",
      ],
    }),
    "npc-policy": () => ({
      policies: [
        {
          groupId: GROUP_IDS.WORKERS,
          intentWeights: {
            farm: 2.0,
            wood: 1.6,
            deliver: 2.0,
            eat: 1.4,
            wander: 0.3,
            quarry: 0.8,
            gather_herbs: 0.7,
            cook: 1.2,
            smith: 0.6,
            heal: 0.7,
          },
          riskTolerance: 0.4,
          targetPriorities: {
            warehouse: 1.6,
            farm: 1.5,
            lumber: 1.1,
            road: 1.1,
            depot: 1.3,
            frontier: 0.9,
            safety: 1.2,
            quarry: 0.8,
            herb_garden: 0.7,
            kitchen: 1.1,
            smithy: 0.6,
            clinic: 0.8,
            bridge: 0.9,
          },
          ttlSec: 60,
          focus: "coastal supply line",
          summary: "Anchor farms inland and keep the coastal depot chain above the cargo waterline.",
          steeringNotes: [
            "Protect the coastal supply line over inland expansion.",
            "Avoid worker idle by routing to nearest unfilled depot.",
          ],
        },
      ],
      stateTargets: [],
    }),
    "strategic-plan": () => ({
      directive: {
        focus: "secure coastal supply line, expand inland farms",
        horizonSec: 180,
        priorityChain: ["food", "storage", "wood", "tools"],
      },
      summary: "Secure the coastal lane first; once warehouses are saturated, push farms inland.",
      steeringNotes: [
        "Coast before frontier; do not abandon supply for expansion.",
        "Keep one warehouse adjacent to the coast for cargo staging.",
      ],
    }),
    "colony-agent": () => ({
      buildPlan: [
        { type: "farm", priority: 3 },
        { type: "lumber", priority: 2 },
        { type: "warehouse", priority: 3 },
        { type: "kitchen", priority: 2 },
      ],
      summary: "Order: farm → lumber → warehouse → kitchen; coastal storage before any combat infra.",
      steeringNotes: [
        "Anchor farms inland; depot adjacent to coast.",
      ],
    }),
  },

  fertile_riverlands: {
    "environment-director": () => ({
      weather: WEATHER.CLEAR,
      durationSec: 90,
      factionTension: 0.15,
      eventSpawns: [],
      focus: "fertile river plain harvest",
      summary: "Long calm window favors farm scale-up across the fertile river plain.",
      steeringNotes: [
        "No raid pressure during the food bootstrap.",
        "Prefer scenario-linked pressure over generic noise.",
      ],
    }),
    "npc-policy": () => ({
      policies: [
        {
          groupId: GROUP_IDS.WORKERS,
          intentWeights: {
            farm: 3.0,
            wood: 2.0,
            deliver: 2.2,
            eat: 1.4,
            wander: 0.2,
            quarry: 0.8,
            gather_herbs: 0.7,
            cook: 1.4,
            smith: 0.6,
            heal: 0.6,
          },
          riskTolerance: 0.5,
          targetPriorities: {
            warehouse: 1.7,
            farm: 1.6,
            lumber: 1.2,
            road: 1.1,
            depot: 1.3,
            frontier: 0.8,
            safety: 1.0,
            quarry: 0.7,
            herb_garden: 0.7,
            kitchen: 1.2,
            smithy: 0.6,
            clinic: 0.7,
            bridge: 0.8,
          },
          ttlSec: 60,
          focus: "fertile river plain harvest",
          summary: "Run farms at maximum cadence; warehouses absorb harvest before kitchens scale meals.",
          steeringNotes: [
            "Farms first, then storage, then processing.",
            "Avoid worker idle by routing to nearest unfilled depot.",
          ],
        },
      ],
      stateTargets: [],
    }),
    "strategic-plan": () => ({
      directive: {
        focus: "exploit fertile river plains, scale food production",
        horizonSec: 180,
        priorityChain: ["food", "storage", "wood", "tools"],
      },
      summary: "River plains let farms outscale storage; build warehouses ahead of the harvest cliff.",
      steeringNotes: [
        "Stay ahead of the harvest cliff with warehouse builds.",
        "Smithy only after kitchen meal throughput stabilizes.",
      ],
    }),
    "colony-agent": () => ({
      buildPlan: [
        { type: "farm", priority: 3 },
        { type: "farm", priority: 3 },
        { type: "warehouse", priority: 3 },
        { type: "kitchen", priority: 2 },
        { type: "smithy", priority: 1 },
      ],
      summary: "Order: farm → farm → warehouse → kitchen → smithy; double farms before any combat infra.",
      steeringNotes: [
        "Double farms before any combat infra.",
      ],
    }),
  },
};

const SUPPORTED_SCENARIOS = Object.freeze(Object.keys(SCENARIO_BLUEPRINTS));

function isSupported(scenarioId) {
  return Object.prototype.hasOwnProperty.call(SCENARIO_BLUEPRINTS, scenarioId);
}

export class ScriptedOraclePolicy extends AgentAdapter {
  /**
   * @param {string} scenarioId
   * @param {object} [opts]
   */
  constructor(scenarioId, opts = {}) {
    super();
    this.scenarioId = String(scenarioId ?? "");
    this.opts = opts ?? {};
    this.fallbackScenarioId = "temperate_plains";

    if (!isSupported(this.scenarioId)) {
      // Soft-degrade rather than throw — callers may run a scenario we
      // haven't authored yet. Emit a single console warning so the test
      // surface stays clean.
      if (!ScriptedOraclePolicy._warned) {
        ScriptedOraclePolicy._warned = new Set();
      }
      if (!ScriptedOraclePolicy._warned.has(this.scenarioId)) {
        ScriptedOraclePolicy._warned.add(this.scenarioId);
        // eslint-disable-next-line no-console
        console.warn(
          `[ScriptedOraclePolicy] no blueprint for scenario "${this.scenarioId}" — falling back to ${this.fallbackScenarioId}`
        );
      }
    }
  }

  /**
   * @param {string} channel
   * @param {object} payload
   * @param {object} [_options]
   */
  async request(channel, payload, _options = {}) {
    const startMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!CHANNELS.includes(channel)) {
      return this._buildErrorResponse(channel, payload, `unsupported channel: ${channel}`, startMs);
    }
    const scenarioKey = isSupported(this.scenarioId) ? this.scenarioId : this.fallbackScenarioId;
    const blueprint = SCENARIO_BLUEPRINTS[scenarioKey];
    const builder = blueprint?.[channel];
    if (typeof builder !== "function") {
      return this._buildErrorResponse(channel, payload, `no blueprint for channel: ${channel}`, startMs);
    }

    let data;
    try {
      data = builder(payload, this.opts);
    } catch (err) {
      return this._buildErrorResponse(channel, payload, String(err?.message ?? err), startMs);
    }

    // Reviewer Round-1 O-1 P1 fix — pre-clamp through Guardrails so the
    // returned data is already idempotent. Downstream guard passes will be
    // no-ops, eliminating sandwich-normalization drift across replays.
    try {
      if (channel === "environment-director") {
        data = guardEnvironmentDirective(data);
      } else if (channel === "npc-policy") {
        data = guardGroupPolicies(data);
      }
      // strategic-plan + colony-agent are free-form and have no guard.
    } catch (err) {
      return this._buildErrorResponse(channel, payload, `guardrail: ${err?.message ?? err}`, startMs);
    }

    const latencyMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startMs;
    return {
      data,
      fallback: false,
      usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
      latencyMs: Math.max(0, latencyMs),
      model: `scripted-oracle:${scenarioKey}`,
      error: "",
      debug: {
        channel,
        scenario: scenarioKey,
        schemaVersion: SCHEMA_VERSION,
      },
    };
  }

  _buildErrorResponse(channel, payload, error, startMs) {
    const latencyMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startMs;
    return {
      data: null,
      fallback: true,
      usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
      latencyMs: Math.max(0, latencyMs),
      model: "scripted-oracle:error",
      error,
      debug: { channel, scenario: this.scenarioId, payloadEcho: payload },
    };
  }

  static get supportedScenarios() {
    return SUPPORTED_SCENARIOS;
  }
}

/**
 * Convenience factory.
 *
 * @param {string} scenarioId
 * @returns {ScriptedOraclePolicy}
 */
export function buildOraclePolicy(scenarioId) {
  return new ScriptedOraclePolicy(scenarioId);
}
