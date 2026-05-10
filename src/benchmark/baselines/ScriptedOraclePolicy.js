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
