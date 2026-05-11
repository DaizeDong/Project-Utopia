// AgentAdapter — minimal 4-channel adapter interface for the academic benchmark.
//
// Plumbing seam between the simulation's per-channel decision sites
// (StrategicDirector / EnvironmentDirectorSystem / NPCBrainSystem /
// AgentDirectorSystem) and any agent framework (OpenAI-compatible proxy,
// vLLM, llama.cpp, a fixed deterministic policy, etc).
//
// Concrete implementations live alongside this file:
//   - LLMClient.js           — existing OpenAI-compatible proxy adapter
//   - HTTPAgentClient.js     — pull/push agent over /api/agent/* (S5 wave-2)
//   - FallbackAdapter.js     — wraps PromptBuilder.buildXxxFallback (S5 wave-2)
//
// Channels are stable strings; matches the prompt files in
// src/data/prompts/ exactly. Adding a 5th channel requires updating
// (1) this constant, (2) the corresponding system that fires it,
// (3) the schema in ResponseSchema.js, (4) the bench manifest writer.

/** @typedef {"environment-director" | "npc-policy" | "strategic-plan" | "colony-agent"} Channel */

export const CHANNELS = Object.freeze([
  "environment-director",
  "npc-policy",
  "strategic-plan",
  "colony-agent",
]);

/**
 * @typedef {object} DecisionRequest
 * @property {Channel} channel
 * @property {object}  payload   — PromptPayload envelope
 * @property {string}  schemaVersion
 * @property {object}  budget    — { maxTokens, timeoutMs }
 */

/**
 * @typedef {object} DecisionResponse
 * @property {object} data        — directive matching ResponseSchema for this channel
 * @property {boolean} fallback
 * @property {object} usage       — { promptTokens, completionTokens, cachedTokens? }
 * @property {number} latencyMs
 * @property {string} model
 * @property {string} error
 * @property {object} debug
 */

/**
 * Base AgentAdapter contract.
 *
 * Concrete adapter must implement `request(channel, payload, options)`.
 * The `options` argument carries `{ timeoutMs, signal, schemaVersion }`.
 *
 * Implementations MUST:
 *  - Return a `DecisionResponse` shaped object even on failure
 *    (set `fallback=true`, populate `error`).
 *  - Tolerate `schemaVersion` mismatch by returning a fallback rather
 *    than throwing — the caller writes a warning and uses the deterministic
 *    fallback policy.
 *  - Never mutate `payload`.
 */
export class AgentAdapter {
  /**
   * @param {Channel} channel
   * @param {object} _payload
   * @param {object} [_options]
   * @returns {Promise<DecisionResponse>}
   */
  // eslint-disable-next-line no-unused-vars
  async request(channel, _payload, _options) {
    throw new Error(
      `AgentAdapter.request not implemented for channel=${channel}; ` +
      `subclass must override (see LLMClient.js / HTTPAgentClient.js).`
    );
  }
}

/** Empty adapter — returns fallback for every request. Useful as a default in tests. */
export class NoopAgentAdapter extends AgentAdapter {
  async request(channel, payload) {
    return {
      data: null,
      fallback: true,
      usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
      latencyMs: 0,
      model: "noop",
      error: "",
      debug: { channel, payloadEcho: payload },
    };
  }
}

export const SCHEMA_VERSION = "1.0";
