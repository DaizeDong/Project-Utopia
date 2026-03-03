import { BALANCE } from "../../../config/balance.js";
import { applyEnvironmentDirective } from "./EnvironmentDirectiveApplier.js";
import { buildWorldSummary } from "../memory/WorldSummary.js";

export class EnvironmentDirectorSystem {
  constructor() {
    this.name = "EnvironmentDirectorSystem";
    this.pendingPromise = null;
    this.pendingResult = null;
  }

  update(_dt, state, services) {
    if (this.pendingResult) {
      const now = state.metrics.timeSec;
      applyEnvironmentDirective(state, this.pendingResult.data);
      const usedFallback = Boolean(this.pendingResult.fallback);
      state.ai.mode = usedFallback ? "fallback" : "llm";
      state.ai.lastEnvironmentSource = usedFallback ? "fallback" : "llm";
      state.ai.lastEnvironmentResultSec = now;
      state.ai.environmentDecisionCount += 1;
      if (!usedFallback) state.ai.environmentLlmCount += 1;
      state.ai.lastEnvironmentError = this.pendingResult.error ?? "";
      state.ai.lastEnvironmentDirective = this.pendingResult.data ?? null;
      state.ai.lastEnvironmentModel = this.pendingResult.model ?? state.ai.lastEnvironmentModel ?? "";
      state.ai.lastError = state.ai.lastEnvironmentError || state.ai.lastPolicyError || "";
      state.metrics.aiLatencyMs = Number(this.pendingResult.latencyMs ?? state.metrics.aiLatencyMs ?? 0);
      state.metrics.proxyHealth = services.llmClient.lastStatus ?? state.metrics.proxyHealth;

      const debugExchange = this.pendingResult.debug ?? {};
      const environmentExchange = {
        simSec: now,
        source: usedFallback ? "fallback" : "llm",
        fallback: usedFallback,
        model: this.pendingResult.model ?? state.ai.lastEnvironmentModel ?? "",
        endpoint: debugExchange.endpoint ?? "/api/ai/environment",
        requestedAtIso: debugExchange.requestedAtIso ?? "",
        requestSummary: debugExchange.requestSummary ?? null,
        rawModelContent: debugExchange.rawModelContent ?? "",
        parsedBeforeValidation: debugExchange.parsedBeforeValidation ?? null,
        guardedOutput: debugExchange.guardedOutput ?? this.pendingResult.data ?? null,
        error: this.pendingResult.error ?? debugExchange.error ?? "",
      };
      state.ai.lastEnvironmentExchange = environmentExchange;
      state.ai.environmentExchanges ??= [];
      state.ai.environmentExchanges.unshift(environmentExchange);
      state.ai.environmentExchanges = state.ai.environmentExchanges.slice(0, 8);

      if (state.debug?.aiTrace) {
        state.debug.aiTrace.unshift({
          sec: now,
          source: usedFallback ? "fallback" : "llm",
          channel: "environment",
          fallback: usedFallback,
          model: this.pendingResult.model ?? services.llmClient.lastModel ?? "",
          weather: this.pendingResult.data?.weather ?? "unknown",
          events: (this.pendingResult.data?.eventSpawns ?? []).map((e) => `${e.type}:${e.intensity}`).join(", ") || "none",
          error: this.pendingResult.error ?? "",
        });
        state.debug.aiTrace = state.debug.aiTrace.slice(0, 36);
      }
      this.pendingResult = null;
    }

    if (this.pendingPromise) return;

    if (state.metrics.timeSec - state.ai.lastEnvironmentDecisionSec < BALANCE.environmentDecisionIntervalSec) {
      return;
    }

    state.ai.lastEnvironmentDecisionSec = state.metrics.timeSec;
    const summary = buildWorldSummary(state);
    if (state.debug?.aiTrace) {
      state.debug.aiTrace.unshift({
        sec: state.metrics.timeSec,
        source: state.ai.enabled ? "llm" : "fallback",
        channel: "environment-request",
        fallback: !state.ai.enabled,
        model: state.metrics.proxyModel ?? services.llmClient.lastModel ?? "",
        weather: summary.weather.current,
        events: summary.events.map((e) => e.type).join(", ") || "none",
        error: "",
      });
      state.debug.aiTrace = state.debug.aiTrace.slice(0, 36);
    }
    this.pendingPromise = services.llmClient
      .requestEnvironment(summary, state.ai.enabled)
      .then((result) => {
        this.pendingResult = result;
      })
      .catch((err) => {
        this.pendingResult = {
          fallback: true,
          data: services.fallbackEnvironment(summary),
          latencyMs: 0,
          error: String(err?.message ?? err),
          model: services.llmClient.lastModel ?? "fallback",
          debug: {
            requestedAtIso: new Date().toISOString(),
            endpoint: "/api/ai/environment",
            requestSummary: summary,
            rawModelContent: "",
            parsedBeforeValidation: null,
            guardedOutput: services.fallbackEnvironment(summary),
            error: String(err?.message ?? err),
          },
        };
      })
      .finally(() => {
        this.pendingPromise = null;
      });
  }
}
