import { BALANCE } from "../../../config/balance.js";
import { DEFAULT_GROUP_POLICIES, GROUP_IDS } from "../../../config/aiConfig.js";
import { pushWarning } from "../../../app/warnings.js";
import { buildPolicySummary } from "../memory/WorldSummary.js";

const REQUIRED_POLICY_GROUPS = Object.freeze([
  GROUP_IDS.WORKERS,
  GROUP_IDS.TRADERS,
  GROUP_IDS.SABOTEURS,
  GROUP_IDS.HERBIVORES,
  GROUP_IDS.PREDATORS,
]);

function clonePolicy(policy) {
  return JSON.parse(JSON.stringify(policy));
}

function splitLegacyVisitorsPolicy(policy) {
  const groupId = String(policy?.groupId ?? "").trim();
  if (groupId !== "visitors") return [policy];
  return [
    clonePolicy({ ...policy, groupId: GROUP_IDS.TRADERS }),
    clonePolicy({ ...policy, groupId: GROUP_IDS.SABOTEURS }),
  ];
}

function normalizePoliciesForRuntime(policies = [], state) {
  const policyByGroup = new Map();
  let migratedLegacyVisitors = false;

  for (const candidate of policies) {
    if (!candidate || typeof candidate !== "object") continue;
    const expanded = splitLegacyVisitorsPolicy(candidate);
    if (expanded.length > 1) migratedLegacyVisitors = true;
    for (const policy of expanded) {
      const groupId = String(policy.groupId ?? "").trim();
      if (!groupId) continue;
      policyByGroup.set(groupId, policy);
    }
  }

  if (migratedLegacyVisitors) {
    pushWarning(state, "Policy group 'visitors' migrated to traders+saboteurs for compatibility.", "warn", "NPCBrainSystem");
  }

  for (const groupId of REQUIRED_POLICY_GROUPS) {
    if (policyByGroup.has(groupId)) continue;
    policyByGroup.set(groupId, clonePolicy(DEFAULT_GROUP_POLICIES[groupId]));
    pushWarning(state, `Missing policy '${groupId}', fallback policy injected.`, "warn", "NPCBrainSystem");
  }

  return REQUIRED_POLICY_GROUPS.map((groupId) => policyByGroup.get(groupId));
}

export class NPCBrainSystem {
  constructor() {
    this.name = "NPCBrainSystem";
    this.pendingPromise = null;
    this.pendingResult = null;
  }

  update(_dt, state, services) {
    if (this.pendingResult) {
      const now = state.metrics.timeSec;
      const policies = normalizePoliciesForRuntime(this.pendingResult.data?.policies ?? [], state);
      for (const policy of policies) {
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
      state.ai.lastPolicyBatch = [...policies];
      state.ai.lastPolicyModel = this.pendingResult.model ?? state.ai.lastPolicyModel ?? "";
      state.ai.lastError = state.ai.lastEnvironmentError || state.ai.lastPolicyError || "";
      state.metrics.aiLatencyMs = Number(this.pendingResult.latencyMs ?? state.metrics.aiLatencyMs ?? 0);
      state.metrics.proxyHealth = services.llmClient.lastStatus ?? state.metrics.proxyHealth;

      const debugExchange = this.pendingResult.debug ?? {};
      const baseExchange = {
        simSec: now,
        source: usedFallback ? "fallback" : "llm",
        fallback: usedFallback,
        model: this.pendingResult.model ?? state.ai.lastPolicyModel ?? "",
        endpoint: debugExchange.endpoint ?? "/api/ai/policy",
        requestedAtIso: debugExchange.requestedAtIso ?? "",
        requestSummary: debugExchange.requestSummary ?? null,
        rawModelContent: debugExchange.rawModelContent ?? "",
        parsedBeforeValidation: debugExchange.parsedBeforeValidation ?? null,
        guardedOutput: debugExchange.guardedOutput ?? this.pendingResult.data ?? null,
        error: this.pendingResult.error ?? debugExchange.error ?? "",
      };
      state.ai.lastPolicyExchange = baseExchange;
      state.ai.policyExchanges ??= [];
      state.ai.policyExchanges.unshift(baseExchange);
      state.ai.policyExchanges = state.ai.policyExchanges.slice(0, 8);
      state.ai.lastPolicyExchangeByGroup ??= {};
      for (const policy of policies) {
        state.ai.lastPolicyExchangeByGroup[policy.groupId] = {
          ...baseExchange,
          groupId: policy.groupId,
        };
      }

      if (state.debug?.aiTrace) {
        const groups = policies.map((p) => p.groupId).join(", ");
        state.debug.aiTrace.unshift({
          sec: now,
          source: usedFallback ? "fallback" : "llm",
          channel: "policy",
          fallback: usedFallback,
          model: this.pendingResult.model ?? services.llmClient.lastModel ?? "",
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
        fallback: !state.ai.enabled,
        model: state.metrics.proxyModel ?? services.llmClient.lastModel ?? "",
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
          latencyMs: 0,
          error: String(err?.message ?? err),
          model: services.llmClient.lastModel ?? "fallback",
          debug: {
            requestedAtIso: new Date().toISOString(),
            endpoint: "/api/ai/policy",
            requestSummary: summary,
            rawModelContent: "",
            parsedBeforeValidation: null,
            guardedOutput: services.fallbackPolicies(summary),
            error: String(err?.message ?? err),
          },
        };
      })
      .finally(() => {
        this.pendingPromise = null;
      });
  }
}
