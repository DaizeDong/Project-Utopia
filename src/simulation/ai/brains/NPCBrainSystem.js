import { BALANCE } from "../../../config/balance.js";
import { buildPolicySummary } from "../memory/WorldSummary.js";

export class NPCBrainSystem {
  constructor() {
    this.name = "NPCBrainSystem";
    this.pendingPromise = null;
    this.pendingResult = null;
  }

  update(_dt, state, services) {
    if (this.pendingResult) {
      const now = state.metrics.timeSec;
      for (const policy of this.pendingResult.data.policies) {
        state.ai.groupPolicies.set(policy.groupId, {
          expiresAtSec: now + policy.ttlSec,
          data: policy,
        });
      }
      state.ai.mode = this.pendingResult.fallback ? "fallback" : "llm";
      if (this.pendingResult.error) state.ai.lastError = this.pendingResult.error;
      this.pendingResult = null;
    }

    const now = state.metrics.timeSec;
    for (const [groupId, p] of [...state.ai.groupPolicies.entries()]) {
      if (p.expiresAtSec <= now) {
        state.ai.groupPolicies.delete(groupId);
      }
    }

    for (const e of [...state.agents, ...state.animals]) {
      e.policy = state.ai.groupPolicies.get(e.groupId)?.data ?? null;
    }

    if (this.pendingPromise) return;

    if (state.metrics.timeSec - state.ai.lastPolicyDecisionSec < BALANCE.policyDecisionIntervalSec) {
      return;
    }

    state.ai.lastPolicyDecisionSec = state.metrics.timeSec;
    const summary = buildPolicySummary(state);
    this.pendingPromise = services.llmClient
      .requestPolicies(summary, state.ai.enabled)
      .then((result) => {
        this.pendingResult = result;
      })
      .catch((err) => {
        this.pendingResult = {
          fallback: true,
          data: services.fallbackPolicies(summary),
          error: String(err?.message ?? err),
        };
      })
      .finally(() => {
        this.pendingPromise = null;
      });
  }
}
