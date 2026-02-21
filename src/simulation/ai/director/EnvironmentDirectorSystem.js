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
      applyEnvironmentDirective(state, this.pendingResult.data);
      state.ai.mode = this.pendingResult.fallback ? "fallback" : "llm";
      state.ai.lastError = this.pendingResult.error ?? "";
      this.pendingResult = null;
    }

    if (this.pendingPromise) return;

    if (state.metrics.timeSec - state.ai.lastEnvironmentDecisionSec < BALANCE.environmentDecisionIntervalSec) {
      return;
    }

    state.ai.lastEnvironmentDecisionSec = state.metrics.timeSec;
    const summary = buildWorldSummary(state);
    this.pendingPromise = services.llmClient
      .requestEnvironment(summary, state.ai.enabled)
      .then((result) => {
        this.pendingResult = result;
      })
      .catch((err) => {
        this.pendingResult = {
          fallback: true,
          data: services.fallbackEnvironment(summary),
          error: String(err?.message ?? err),
        };
      })
      .finally(() => {
        this.pendingPromise = null;
      });
  }
}
