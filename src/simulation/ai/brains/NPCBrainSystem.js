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
      const usedFallback = Boolean(this.pendingResult.fallback);
      state.ai.mode = usedFallback ? "fallback" : "llm";
      state.ai.lastPolicySource = usedFallback ? "fallback" : "llm";
      state.ai.lastPolicyResultSec = now;
      state.ai.policyDecisionCount += 1;
      if (!usedFallback) state.ai.policyLlmCount += 1;
      state.ai.lastPolicyError = this.pendingResult.error ?? "";
      state.ai.lastError = state.ai.lastEnvironmentError || state.ai.lastPolicyError || "";
      if (state.debug?.aiTrace) {
        const groups = this.pendingResult.data.policies.map((p) => p.groupId).join(", ");
        state.debug.aiTrace.unshift({
          sec: now,
          source: usedFallback ? "fallback" : "llm",
          channel: "policy",
          weather: state.weather.current,
          events: groups || "none",
          error: this.pendingResult.error ?? "",
        });
        state.debug.aiTrace = state.debug.aiTrace.slice(0, 36);
      }
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
    if (state.debug?.aiTrace) {
      state.debug.aiTrace.unshift({
        sec: state.metrics.timeSec,
        source: state.ai.enabled ? "llm" : "fallback",
        channel: "policy-request",
        weather: summary.world.weather.current,
        events: Object.keys(summary.groups).join(", "),
        error: "",
      });
      state.debug.aiTrace = state.debug.aiTrace.slice(0, 36);
    }
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
