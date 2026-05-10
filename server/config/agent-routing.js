// agent-routing.js — declarative cross-vendor routing table for E3
// (cross-vendor / multi-LLM matrix). Each "cell" is a labelled assignment
// from each of the 4 channels (`environment-director` / `npc-policy` /
// `strategic-plan` / `colony-agent`) to a backend config.
//
// Cell labels used by the academic benchmark:
//   FB                     — all 4 channels = deterministic NoopAdapter
//                            (rule-based fallback baseline; no LLM calls)
//   WW                     — all 4 channels = a single open-weights model
//                            (Hermes-3-7b style); weak/weak both directions
//   SS                     — all 4 channels = a single strong frontier
//                            model (Claude Sonnet 4.6); strong/strong
//   SW                     — environment-director = strong; the other three
//                            channels = weak. Used to attribute capability
//                            wins to the *director* channel.
//   WS                     — npc-policy = strong; other three = weak. Used
//                            to attribute capability wins to the *policy*
//                            (per-NPC behavior) channel.
//   XV-OPUS-SONNET         — homogeneous strong, but split across two
//                            Anthropic snapshots (Opus + Sonnet) to test
//                            within-vendor heterogeneity.
//   XV-DIVERSE-LIGHT       — 4 different *light* models from 4 different
//                            vendors (Claude / OpenAI / Hermes / Llama).
//   XV-DIVERSE-STRONG      — 4 different *strong* models from 4 different
//                            vendors (Claude / OpenAI / Hermes / Llama).
//   XV-OPENWEIGHT-ONLY     — 4 different open-weights families (Hermes /
//                            Llama / Qwen / Mistral) — vendor-independence.
//
// Each backend config is a `{ baseUrl, model, kind? }` plain object. The
// concrete adapter is materialised by `instantiateAdapterForBackend()` —
// `kind: "fallback"` returns a NoopAgentAdapter (no LLM), anything else
// returns an LLMClient pointed at `baseUrl`. Real production routing will
// extend this with vendor-specific adapters as wave-3 lands.

import { LLMClient } from "../../src/simulation/ai/llm/LLMClient.js";
import { CHANNELS, NoopAgentAdapter } from "../../src/simulation/ai/llm/AgentAdapter.js";

// Snapshot-pinned model strings. Change requires a benchmark cell-id bump.
export const MODEL = Object.freeze({
  CLAUDE_SONNET: "claude-sonnet-4-6",
  CLAUDE_OPUS:   "claude-opus-4-7",
  GPT5_MINI:     "gpt-5-mini",
  GPT5_FULL:     "gpt-5",
  HERMES_7B:     "hermes-3-7b",
  HERMES_70B:    "hermes-3-70b",
  LLAMA_8B:      "llama-3.1-8b-instruct",
  LLAMA_70B:     "llama-3.1-70b-instruct",
  QWEN_72B:      "qwen-2.5-72b-instruct",
  MISTRAL_LARGE: "mistral-large-2",
  FALLBACK:      "fallback",
});

const CLAUDE_BASE_URL  = process.env.CLAUDE_BASE_URL  ?? "https://api.anthropic.com/v1";
const OPENAI_BASE_URL  = process.env.OPENAI_BASE_URL  ?? "https://api.openai.com/v1";
const HERMES_BASE_URL  = process.env.HERMES_BASE_URL  ?? "http://localhost:8001/v1";
const LLAMA_BASE_URL   = process.env.LLAMA_BASE_URL   ?? "http://localhost:8002/v1";
const QWEN_BASE_URL    = process.env.QWEN_BASE_URL    ?? "http://localhost:8003/v1";
const MISTRAL_BASE_URL = process.env.MISTRAL_BASE_URL ?? "http://localhost:8004/v1";
const FALLBACK_URL     = "fallback://noop";

const cellAllSame = (baseUrl, model) => Object.fromEntries(
  CHANNELS.map((c) => [c, { baseUrl, model }]),
);

/**
 * Cell label → channel → backend config.
 * Frozen so callers cannot accidentally mutate the routing table.
 */
export const DEFAULT_AGENT_ROUTING = Object.freeze({
  // Deterministic baseline — no LLM at all.
  FB: cellAllSame(FALLBACK_URL, MODEL.FALLBACK),

  // Homogeneous open-weights / strong.
  WW: cellAllSame(HERMES_BASE_URL, MODEL.HERMES_7B),
  SS: cellAllSame(CLAUDE_BASE_URL, MODEL.CLAUDE_SONNET),

  // Asymmetric — director vs policy capability gradient.
  SW: {
    "environment-director": { baseUrl: CLAUDE_BASE_URL, model: MODEL.CLAUDE_SONNET },
    "npc-policy":            { baseUrl: HERMES_BASE_URL, model: MODEL.HERMES_7B },
    "strategic-plan":        { baseUrl: HERMES_BASE_URL, model: MODEL.HERMES_7B },
    "colony-agent":          { baseUrl: HERMES_BASE_URL, model: MODEL.HERMES_7B },
  },
  WS: {
    "environment-director": { baseUrl: HERMES_BASE_URL, model: MODEL.HERMES_7B },
    "npc-policy":            { baseUrl: CLAUDE_BASE_URL, model: MODEL.CLAUDE_SONNET },
    "strategic-plan":        { baseUrl: HERMES_BASE_URL, model: MODEL.HERMES_7B },
    "colony-agent":          { baseUrl: HERMES_BASE_URL, model: MODEL.HERMES_7B },
  },

  // Within-vendor heterogeneity (Anthropic only, mixed Opus+Sonnet).
  "XV-OPUS-SONNET": {
    "environment-director": { baseUrl: CLAUDE_BASE_URL, model: MODEL.CLAUDE_OPUS },
    "npc-policy":            { baseUrl: CLAUDE_BASE_URL, model: MODEL.CLAUDE_SONNET },
    "strategic-plan":        { baseUrl: CLAUDE_BASE_URL, model: MODEL.CLAUDE_OPUS },
    "colony-agent":          { baseUrl: CLAUDE_BASE_URL, model: MODEL.CLAUDE_SONNET },
  },

  // Cross-vendor diversity — light / strong / open-weights tiers.
  "XV-DIVERSE-LIGHT": {
    "environment-director": { baseUrl: CLAUDE_BASE_URL, model: MODEL.CLAUDE_SONNET },
    "npc-policy":            { baseUrl: OPENAI_BASE_URL, model: MODEL.GPT5_MINI },
    "strategic-plan":        { baseUrl: HERMES_BASE_URL, model: MODEL.HERMES_7B },
    "colony-agent":          { baseUrl: LLAMA_BASE_URL,  model: MODEL.LLAMA_8B },
  },
  "XV-DIVERSE-STRONG": {
    "environment-director": { baseUrl: CLAUDE_BASE_URL, model: MODEL.CLAUDE_OPUS },
    "npc-policy":            { baseUrl: OPENAI_BASE_URL, model: MODEL.GPT5_FULL },
    "strategic-plan":        { baseUrl: HERMES_BASE_URL, model: MODEL.HERMES_70B },
    "colony-agent":          { baseUrl: LLAMA_BASE_URL,  model: MODEL.LLAMA_70B },
  },
  "XV-OPENWEIGHT-ONLY": {
    "environment-director": { baseUrl: HERMES_BASE_URL,  model: MODEL.HERMES_70B },
    "npc-policy":            { baseUrl: LLAMA_BASE_URL,   model: MODEL.LLAMA_70B },
    "strategic-plan":        { baseUrl: QWEN_BASE_URL,    model: MODEL.QWEN_72B },
    "colony-agent":          { baseUrl: MISTRAL_BASE_URL, model: MODEL.MISTRAL_LARGE },
  },
});

/**
 * Resolve a cell label into a `Map<channel, backendConfig>`. Throws if the
 * cell is unknown so the caller can decide whether to register a Noop
 * registry or fail-fast.
 */
export function buildBackendsForCell(cellId) {
  const cell = DEFAULT_AGENT_ROUTING[cellId];
  if (!cell) {
    throw new Error(`unknown cell label: ${cellId} (known: ${Object.keys(DEFAULT_AGENT_ROUTING).join(", ")})`);
  }
  const out = new Map();
  for (const channel of CHANNELS) {
    const cfg = cell[channel];
    if (!cfg) {
      throw new Error(`cell ${cellId} missing backend for channel ${channel}`);
    }
    out.set(channel, { ...cfg });
  }
  return out;
}

/**
 * Materialise a backend config into a concrete AgentAdapter.
 *
 *   { kind: "fallback" } or { baseUrl: "fallback://*" } → NoopAgentAdapter
 *   anything else                                       → LLMClient
 *
 * LLMClient is the OpenAI-compatible adapter; for non-OpenAI vendors the
 * caller is expected to point `baseUrl` at a vendor-shimming proxy (this
 * is exactly the pattern `server/ai-proxy.js` enables for Anthropic via
 * OPENAI_BASE_URL pointing at Anthropic's compat endpoint).
 */
export function instantiateAdapterForBackend(backendCfg) {
  if (!backendCfg || typeof backendCfg !== "object") {
    return new NoopAgentAdapter();
  }
  const kind = String(backendCfg.kind ?? "").toLowerCase();
  const baseUrl = String(backendCfg.baseUrl ?? "");
  const model = String(backendCfg.model ?? "");
  if (kind === "fallback" || baseUrl.startsWith("fallback://") || model === MODEL.FALLBACK) {
    return new NoopAgentAdapter();
  }
  return new LLMClient({ baseUrl, model });
}

/**
 * Listing helper for tests / introspection.
 */
export function listCellLabels() {
  return Object.freeze(Object.keys(DEFAULT_AGENT_ROUTING).slice());
}
