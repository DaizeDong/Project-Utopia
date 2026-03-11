import {
  DEFAULT_GROUP_POLICIES,
  GROUP_IDS,
  canonicalizeAiGroupId,
  listAllowedPolicyIntents,
  listAllowedTargetPriorities,
  normalizeAiToken,
} from "../../../config/aiConfig.js";
import { getLongRunAiTuning } from "../../../config/longRunProfile.js";
import { pushWarning } from "../../../app/warnings.js";
import { buildPolicySummary } from "../memory/WorldSummary.js";
import { listGroupStates } from "../../npc/state/StateGraph.js";
import { buildFeasibilityContext, isStateFeasible } from "../../npc/state/StateFeasibility.js";
import { markAiDecisionRequest, recordAiDecisionResult } from "../../../app/aiRuntimeStats.js";

const REQUIRED_POLICY_GROUPS = Object.freeze([
  GROUP_IDS.WORKERS,
  GROUP_IDS.TRADERS,
  GROUP_IDS.SABOTEURS,
  GROUP_IDS.HERBIVORES,
  GROUP_IDS.PREDATORS,
]);

const POLICY_INTENT_TO_STATE = Object.freeze({
  [GROUP_IDS.WORKERS]: Object.freeze({
    eat: "seek_food",
    deliver: "deliver",
    farm: "seek_task",
    wood: "seek_task",
    wander: "wander",
  }),
  [GROUP_IDS.TRADERS]: Object.freeze({
    trade: "seek_trade",
    eat: "seek_food",
    wander: "wander",
  }),
  [GROUP_IDS.SABOTEURS]: Object.freeze({
    sabotage: "sabotage",
    scout: "scout",
    evade: "evade",
    eat: "seek_food",
    wander: "wander",
  }),
  [GROUP_IDS.HERBIVORES]: Object.freeze({
    flee: "flee",
    graze: "graze",
    migrate: "regroup",
    wander: "wander",
  }),
  [GROUP_IDS.PREDATORS]: Object.freeze({
    hunt: "hunt",
    stalk: "stalk",
    feed: "feed",
    rest: "rest",
    wander: "roam",
  }),
});

function canonicalStateForGroup(groupId, rawState) {
  const token = normalizeAiToken(rawState);
  if (!token) return "";
  const allowed = listGroupStates(groupId);
  if (allowed.includes(token)) return token;
  const byToken = new Map(allowed.map((state) => [normalizeAiToken(state), state]));
  return byToken.get(token) ?? "";
}

function sanitizePolicyWeights(source, allowedKeys, fallbackWeights = {}) {
  const out = {};
  for (const key of allowedKeys) {
    const raw = Object.prototype.hasOwnProperty.call(source ?? {}, key) ? source[key] : fallbackWeights[key];
    if (raw === undefined) continue;
    out[key] = Math.max(0, Math.min(3, Number(raw) || 0));
  }
  return out;
}

function sanitizePolicyForRuntime(policy, groupId, state) {
  const fallback = DEFAULT_GROUP_POLICIES[groupId] ?? {};
  const tuning = getLongRunAiTuning(state);
  return {
    ...fallback,
    ...policy,
    groupId,
    intentWeights: sanitizePolicyWeights(policy?.intentWeights ?? {}, listAllowedPolicyIntents(groupId), fallback.intentWeights ?? {}),
    targetPriorities: sanitizePolicyWeights(policy?.targetPriorities ?? {}, listAllowedTargetPriorities(groupId), fallback.targetPriorities ?? {}),
    riskTolerance: Math.max(0, Math.min(1, Number(policy?.riskTolerance) || Number(fallback.riskTolerance) || 0.5)),
    ttlSec: Math.max(8, Math.min(90, Number(policy?.ttlSec) || Number(fallback.ttlSec) || Number(tuning.policyTtlDefaultSec) || 24)),
    focus: String(policy?.focus ?? fallback.focus ?? "").slice(0, 72),
    summary: String(policy?.summary ?? fallback.summary ?? "").slice(0, 140),
    steeringNotes: Array.isArray(policy?.steeringNotes)
      ? policy.steeringNotes.map((note) => String(note ?? "").slice(0, 120)).filter(Boolean).slice(0, 4)
      : Array.isArray(fallback.steeringNotes)
        ? [...fallback.steeringNotes]
        : [],
  };
}

function sanitizeStateTargetForRuntime(groupId, targetState) {
  if (groupId === GROUP_IDS.WORKERS) {
    if (targetState === "harvest") return "seek_task";
    if (targetState === "eat" || targetState === "seek_food" || targetState === "idle") return "seek_task";
  }
  if (groupId === GROUP_IDS.TRADERS) {
    if (targetState === "trade" || targetState === "eat" || targetState === "seek_food" || targetState === "idle") {
      return "seek_trade";
    }
  }
  return targetState;
}

function deriveStateTargetFromPolicy(policy, state) {
  const groupId = canonicalizeAiGroupId(policy?.groupId);
  const intentMap = POLICY_INTENT_TO_STATE[groupId];
  if (!intentMap) return null;
  const tuning = getLongRunAiTuning(state);

  const intents = Object.entries(policy?.intentWeights ?? {})
    .map(([intent, value]) => ({ intent: normalizeAiToken(intent), value: Number(value) || 0 }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  if (intents.length === 0) return null;
  const top = intents[0];
  const second = intents[1]?.value ?? 0;
  const targetState = intentMap[top.intent];
  if (!targetState) return null;
  if (!listGroupStates(groupId).includes(targetState)) return null;

  const dominance = Math.max(0, top.value - second);
  const priority = Math.max(0.35, Math.min(0.82, 0.45 + dominance * 0.2));
  const ttlSec = Math.max(6, Math.min(36, Math.round((Number(policy?.ttlSec) || Number(tuning.policyTtlDefaultSec) || 18) * 0.7)));

  return {
    groupId,
    targetState,
    priority,
    ttlSec,
    reason: `policy-intent:${top.intent}`,
  };
}

function mergeStateTargetsWithPolicyFallback(policies, stateTargets, state) {
  const merged = [...stateTargets];
  const existingGroups = new Set(merged.map((target) => target.groupId));
  for (const policy of policies) {
    const groupId = canonicalizeAiGroupId(policy?.groupId);
    if (!groupId || existingGroups.has(groupId)) continue;
    const derived = deriveStateTargetFromPolicy(policy, state);
    if (!derived) continue;
    merged.push(derived);
    existingGroups.add(groupId);
  }
  return merged;
}

function clonePolicy(policy) {
  return JSON.parse(JSON.stringify(policy));
}

function splitLegacyVisitorsPolicy(policy) {
  const groupId = canonicalizeAiGroupId(policy?.groupId);
  if (groupId !== "visitors") return [policy];
  return [
    clonePolicy({ ...policy, groupId: GROUP_IDS.TRADERS, splitFrom: "visitors" }),
    clonePolicy({ ...policy, groupId: GROUP_IDS.SABOTEURS, splitFrom: "visitors" }),
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
      const groupId = canonicalizeAiGroupId(policy.groupId);
      if (!groupId) continue;
      if (!REQUIRED_POLICY_GROUPS.includes(groupId)) continue;
      policyByGroup.set(groupId, sanitizePolicyForRuntime(policy, groupId, state));
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

function normalizeStateTargetsForRuntime(stateTargets = [], state) {
  const sanitized = [];
  const seen = new Set();

  for (const candidate of stateTargets) {
    if (!candidate || typeof candidate !== "object") continue;
    const groupId = canonicalizeAiGroupId(candidate.groupId);
    const targetState = sanitizeStateTargetForRuntime(
      groupId,
      canonicalStateForGroup(groupId, candidate.targetState),
    );
    if (!groupId || !targetState) continue;
    if (!REQUIRED_POLICY_GROUPS.includes(groupId)) continue;

    const key = `${groupId}:${targetState}`;
    if (seen.has(key)) continue;
    seen.add(key);

    sanitized.push({
      groupId,
      targetState,
      priority: Math.max(0, Math.min(1, Number(candidate.priority) || 0.5)),
      ttlSec: Math.max(4, Math.min(60, Number(candidate.ttlSec) || 14)),
      reason: String(candidate.reason ?? "").slice(0, 160),
    });
  }

  if ((stateTargets?.length ?? 0) > 0 && sanitized.length === 0) {
    pushWarning(state, "Policy stateTargets were rejected by runtime validation.", "warn", "NPCBrainSystem");
  }

  return sanitized;
}

function entitiesByGroup(state, groupId) {
  const list = [];
  for (const entity of state.agents ?? []) {
    if (entity?.alive === false) continue;
    if (String(entity.groupId ?? "") === groupId) list.push(entity);
  }
  for (const entity of state.animals ?? []) {
    if (entity?.alive === false) continue;
    if (String(entity.groupId ?? "") === groupId) list.push(entity);
  }
  return list;
}

function isTargetFeasibleForGroup(state, target) {
  const members = entitiesByGroup(state, target.groupId);
  if (members.length === 0) return true;
  const ctx = {
    predators: state.animals?.filter?.((animal) => animal.groupId === GROUP_IDS.PREDATORS && animal.alive !== false) ?? [],
    herbivores: state.animals?.filter?.((animal) => animal.groupId === GROUP_IDS.HERBIVORES && animal.alive !== false) ?? [],
  };
  for (const entity of members) {
    const feasibilityContext = buildFeasibilityContext(entity, target.groupId, state, ctx);
    const feasible = isStateFeasible(entity, target.groupId, target.targetState, state, {
      ...ctx,
      feasibilityContext,
    });
    if (feasible.ok) return true;
  }
  return false;
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
      const llmStateTargets = normalizeStateTargetsForRuntime(this.pendingResult.data?.stateTargets ?? [], state);
      const stateTargets = mergeStateTargetsWithPolicyFallback(policies, llmStateTargets, state)
        .filter((target) => {
          const feasible = isTargetFeasibleForGroup(state, target);
          if (!feasible) {
            pushWarning(
              state,
              `Dropped infeasible state target ${target.groupId}:${target.targetState}.`,
              "warn",
              "NPCBrainSystem",
            );
          }
          return feasible;
        });
      for (const policy of policies) {
        state.ai.groupPolicies.set(policy.groupId, {
          expiresAtSec: now + policy.ttlSec,
          data: policy,
        });
      }
      state.ai.groupStateTargets ??= new Map();
      for (const target of stateTargets) {
        state.ai.groupStateTargets.set(target.groupId, {
          targetState: target.targetState,
          expiresAtSec: now + target.ttlSec,
          priority: target.priority,
          source: this.pendingResult.fallback ? "fallback" : "llm",
          reason: target.reason || `policy:${target.targetState}`,
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
      state.ai.lastStateTargetBatch = [...stateTargets];
      state.ai.lastPolicyModel = this.pendingResult.model ?? state.ai.lastPolicyModel ?? "";
      state.ai.lastError = state.ai.lastEnvironmentError || state.ai.lastPolicyError || "";
      state.metrics.aiLatencyMs = Number(this.pendingResult.latencyMs ?? state.metrics.aiLatencyMs ?? 0);
      state.metrics.proxyHealth = services.llmClient.lastStatus ?? state.metrics.proxyHealth;
      recordAiDecisionResult(state, "policy", this.pendingResult, now);

      const debugExchange = this.pendingResult.debug ?? {};
      const baseExchange = {
        simSec: now,
        source: usedFallback ? "fallback" : "llm",
        fallback: usedFallback,
        model: this.pendingResult.model ?? state.ai.lastPolicyModel ?? "",
        endpoint: debugExchange.endpoint ?? "/api/ai/policy",
        requestedAtIso: debugExchange.requestedAtIso ?? "",
        requestSummary: debugExchange.requestSummary ?? null,
        promptSystem: debugExchange.promptSystem ?? "",
        promptUser: debugExchange.promptUser ?? "",
        requestPayload: debugExchange.requestPayload ?? null,
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
        const targets = stateTargets.map((target) => `${target.groupId}:${target.targetState}`).join(" ");
        state.debug.aiTrace.unshift({
          sec: now,
          source: usedFallback ? "fallback" : "llm",
          channel: "policy",
          fallback: usedFallback,
          model: this.pendingResult.model ?? services.llmClient.lastModel ?? "",
          weather: state.weather.current,
          events: `${groups || "none"} ${targets ? `targets=${targets}` : ""}`.trim(),
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
    if (state.ai.groupStateTargets instanceof Map) {
      for (const [groupId, target] of [...state.ai.groupStateTargets.entries()]) {
        if (Number(target?.expiresAtSec ?? 0) <= now) {
          state.ai.groupStateTargets.delete(groupId);
        }
      }
    }

    for (const e of [...state.agents, ...state.animals]) {
      e.policy = state.ai.groupPolicies.get(e.groupId)?.data ?? null;
      const groupTarget = state.ai.groupStateTargets?.get?.(e.groupId) ?? null;
      let targetForEntity = groupTarget;
      if (groupTarget) {
        const context = {
          predators: state.animals?.filter?.((animal) => animal.groupId === GROUP_IDS.PREDATORS && animal.alive !== false) ?? [],
          herbivores: state.animals?.filter?.((animal) => animal.groupId === GROUP_IDS.HERBIVORES && animal.alive !== false) ?? [],
        };
        const feasibilityContext = buildFeasibilityContext(e, String(e.groupId ?? ""), state, context);
        const feasible = isStateFeasible(e, String(e.groupId ?? ""), groupTarget.targetState, state, {
          ...context,
          feasibilityContext,
        });
        if (!feasible.ok) {
          targetForEntity = null;
        }
      }
      e.blackboard ??= {};
      e.blackboard.aiTargetState = targetForEntity ? targetForEntity.targetState : null;
      e.blackboard.aiTargetMeta = targetForEntity
        ? {
            expiresAtSec: targetForEntity.expiresAtSec,
            priority: targetForEntity.priority,
            source: targetForEntity.source,
            reason: targetForEntity.reason,
          }
        : null;
    }

    if (this.pendingPromise) return;

    const tuning = getLongRunAiTuning(state);
    if (state.metrics.timeSec - state.ai.lastPolicyDecisionSec < tuning.policyDecisionIntervalSec) {
      return;
    }

    state.ai.lastPolicyDecisionSec = state.metrics.timeSec;
    markAiDecisionRequest(state, "policy", state.metrics.timeSec);
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
        const fallbackRaw = services.fallbackPolicies(summary);
        this.pendingResult = {
          fallback: true,
          data: fallbackRaw,
          latencyMs: 0,
          error: String(err?.message ?? err),
          model: services.llmClient.lastModel ?? "fallback",
          debug: {
            requestedAtIso: new Date().toISOString(),
            endpoint: "/api/ai/policy",
            requestSummary: summary,
            rawModelContent: JSON.stringify(fallbackRaw, null, 2),
            parsedBeforeValidation: fallbackRaw,
            guardedOutput: fallbackRaw,
            error: String(err?.message ?? err),
          },
        };
      })
      .finally(() => {
        this.pendingPromise = null;
      });
  }
}
