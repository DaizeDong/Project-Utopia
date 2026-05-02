// src/simulation/ai/colony/BuildProposer.js
//
// v0.10.1 R5 wave-1 (C1-build-proposer refactor):
// Public interface for "build need proposers" — small, named, pure-synchronous
// units that read game state and return zero or more BuildNeed records.
//
// Background — debt-col-3 ("regressed"): the function
// `assessColonyNeeds` in `src/simulation/meta/ColonyDirectorSystem.js`
// has accreted four priority-95+ "safety net" if-blocks (zero-farm,
// zero-lumber, zero-quarry, emergency-shortage). Each round of
// playtest tuning appends another sibling block; the file grew
// 1205 → 1222 LOC in R4 alone. This file establishes a tiny seam so:
//
//   * each future safety-net is +1 proposer file (~30 LOC) instead of
//     +1 sibling if-block welded into the orchestrator,
//   * LLM/fallback/test code can register or mock proposers without
//     monkey-patching the whole module,
//   * wave-2 (deferred) will port the recovery / bootstrap / logistics /
//     processing branches plus `proposeBridges` / `proposeScoutRoad` /
//     AgentDirSystem.survivalPreempt into the same layer, collapsing
//     them into a single sortable list.
//
// Wave-1 ports ONLY the four priority-95+ safety-net blocks; downstream
// branches in `assessColonyNeeds` are unchanged. Proposer registration
// order matches the original push order so behaviour is byte-identical:
//
//     zeroFarm  →  zeroLumber  →  zeroQuarry  →  emergencyShortage
//
// system_order_safe: TRUE — `assessColonyNeeds` is a pure synchronous
// function called from `ColonyDirectorSystem.update`; no SYSTEM_ORDER
// entry is added/removed/reordered. No new system, no service rewire.

import { ZeroFarmProposer } from "./proposers/ZeroFarmProposer.js";
import { ZeroLumberProposer } from "./proposers/ZeroLumberProposer.js";
import { ZeroQuarryProposer } from "./proposers/ZeroQuarryProposer.js";
import { EmergencyShortageProposer } from "./proposers/EmergencyShortageProposer.js";

/**
 * @typedef {object} BuildNeed
 * @property {string} type    — building/tile type id (e.g. "farm", "lumber",
 *                              "warehouse", "quarry"). Must match the
 *                              identifiers consumed by the downstream
 *                              `placeBuild` / `BuildSystem` pipeline.
 * @property {number} priority — sort key; higher fires first. Safety nets
 *                              sit at 95+; emergency at 100; recovery
 *                              98/96/92; bootstrap 82/80/78; logistics
 *                              70/68/66; etc.
 * @property {string} reason  — human-readable explanation; surfaced in
 *                              `state.controls.actionMessage` and used
 *                              for postmortem trace logs.
 */

/**
 * @typedef {object} BuildProposerCtx
 * @property {number} workers       — count of alive WORKER agents.
 * @property {number} food          — `state.resources.food`.
 * @property {number} wood          — `state.resources.wood`.
 * @property {object} buildings     — result of `rebuildBuildingStats`.
 * @property {object} resources     — `state.resources` (full object; allows
 *                                    proposers to read stone, herbs, etc.
 *                                    without an additional ctx field).
 * @property {number} timeSec       — `state.metrics.timeSec`.
 */

/**
 * @typedef {object} BuildProposer
 * @property {string} name                                              — diagnostic id (snake/camel both ok).
 * @property {(state: object, ctx: BuildProposerCtx) => BuildNeed[]} evaluate — read-only; must return [] when not firing.
 */

/**
 * Walk a list of proposers and concatenate their outputs IN REGISTRATION
 * ORDER. Order matters: the original `assessColonyNeeds` safety-net block
 * pushed in a fixed sequence (zero-farm → zero-lumber → zero-quarry →
 * emergency-shortage) and downstream sort is `priority` DESC + stable —
 * preserving the push order is what keeps the wave-1 refactor
 * behaviour-identical (locked by `test/build-proposer-orchestration.test.js`).
 *
 * Proposers MUST be pure / read-only with respect to `state`. A proposer
 * that mutates state breaks the wave-2 guarantee that proposers can be
 * reordered or run in parallel for diagnostic purposes.
 *
 * @param {BuildProposer[]} proposers — registered proposers in order.
 * @param {object} state              — game state.
 * @param {BuildProposerCtx} ctx      — pre-computed shared context.
 * @returns {BuildNeed[]}             — flat concat of every proposer's output.
 */
export function runProposers(proposers, state, ctx) {
  if (!Array.isArray(proposers) || proposers.length === 0) return [];
  const out = [];
  for (const proposer of proposers) {
    if (!proposer || typeof proposer.evaluate !== "function") continue;
    const result = proposer.evaluate(state, ctx);
    if (!result) continue;
    if (Array.isArray(result)) {
      for (const need of result) {
        if (need) out.push(need);
      }
    }
  }
  return out;
}

/**
 * Default registration order for wave-1. Mirrors the original push order
 * inside `assessColonyNeeds` (lines 101-161 of ColonyDirectorSystem.js as
 * of parent-commit `d08a60f`):
 *
 *   1. zero-farm @99       (lines 101-111)
 *   2. zero-lumber @95     (lines 113-128)
 *   3. zero-quarry @95     (lines 130-147)
 *   4. emergency-shortage  (lines 149-161 — 4 sub-rules: warehouse@100
 *                            food-bottleneck, farm@100 food-shortage,
 *                            warehouse@100 food-logistics, lumber@95
 *                            wood-shortage)
 */
export const DEFAULT_BUILD_PROPOSERS = Object.freeze([
  ZeroFarmProposer,
  ZeroLumberProposer,
  ZeroQuarryProposer,
  EmergencyShortageProposer,
]);

// Re-export the individual proposers for callers that want to register a
// custom subset (e.g. test fixtures or LLM strategies).
export {
  ZeroFarmProposer,
  ZeroLumberProposer,
  ZeroQuarryProposer,
  EmergencyShortageProposer,
};
