import { getLongRunAiTuning } from "../../../config/longRunProfile.js";
import { applyEnvironmentDirective } from "./EnvironmentDirectiveApplier.js";
import { buildWorldSummary } from "../memory/WorldSummary.js";
import { markAiDecisionRequest, recordAiDecisionResult } from "../../../app/aiRuntimeStats.js";
import { BALANCE } from "../../../config/balance.js";
import { VISITOR_KIND } from "../../../config/constants.js";
import { createVisitor } from "../../../entities/EntityFactory.js";
import { isPassable, tileToWorld } from "../../../world/grid/Grid.js";
import { pushWarning } from "../../../app/warnings.js";

// v0.8.2 Round-6 Wave-1 01b-playability (Step 10) — pick a passable tile on
// (or near) the map edge so a "Raiders sighted near <gate>" toast has a
// matching visual: the saboteur enters from a border. Falls back to any
// passable tile if no edge tile is reachable. Pure helper for testability.
function pickEdgeSpawn(grid, random) {
  const W = Number(grid?.width ?? 0);
  const H = Number(grid?.height ?? 0);
  if (W <= 0 || H <= 0) return null;
  // Bias toward N/S edges (matches the toast copy "north" / "south gate").
  const sideRoll = random();
  const onSouth = sideRoll < 0.5;
  const baseRow = onSouth ? H - 1 : 0;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const ix = Math.floor(random() * W);
    const iz = baseRow;
    if (isPassable(grid, ix, iz)) return { ix, iz, side: onSouth ? "south" : "north" };
  }
  // Fallback: scan the full edge row.
  for (let ix = 0; ix < W; ix += 1) {
    if (isPassable(grid, ix, baseRow)) return { ix, iz: baseRow, side: onSouth ? "south" : "north" };
  }
  return null;
}

export class EnvironmentDirectorSystem {
  constructor() {
    this.name = "EnvironmentDirectorSystem";
    this.pendingPromise = null;
    this.pendingResult = null;
    // v0.8.2 Round-6 Wave-1 01b-playability (Step 10) — last sim-second the
    // threat-gated raid micro-pulse fired. Persisted on the system instance
    // (not state) so snapshot reload restarts the cooldown — harmless: at
    // worst the player gets one extra raid pulse after a manual reload.
    this.lastEnvironmentRaidSec = -Infinity;
  }

  // v0.8.2 Round-6 Wave-1 01b-playability (Step 10) — threat-gated saboteur
  // micro-raid pulse. Independent of the LLM directive flow above — fires when
  // the colony has been "in red" (threat ≥ 60/100) for > raidEnvironmentCooldownSec
  // since the last pulse, AND the run has not exceeded BALANCE.raidDeathBudget.
  // Spawns 1-2 SABOTEUR visitors on a north/south border tile and pushes a
  // "Raiders sighted near <side> gate." toast via pushWarning(level=info).
  // Determinism: uses `services.rng` only when present (production); skips
  // gracefully in unit-test contexts where rng is not wired.
  #maybeSpawnThreatGatedRaid(state, services) {
    if (!state || !services) return;
    const rng = services.rng;
    if (typeof rng?.next !== "function") return;
    const grid = state.grid;
    if (!grid) return;
    const threat = Number(state.gameplay?.threat ?? 0);
    const threatThreshold = Number(BALANCE.raidEnvironmentThreatThreshold ?? 60);
    if (threat < threatThreshold) return;
    const now = Number(state.metrics?.timeSec ?? 0);
    const cooldown = Number(BALANCE.raidEnvironmentCooldownSec ?? 90);
    if (now - this.lastEnvironmentRaidSec < cooldown) return;
    const deathsTotal = Number(state.metrics?.deathsTotal ?? 0);
    const budget = Number(BALANCE.raidDeathBudget ?? 18);
    if (deathsTotal >= budget) return;
    // Lock cadence first — if any spawn step short-circuits we still pay
    // the full cooldown so the toast never spams.
    this.lastEnvironmentRaidSec = now;
    const spawn = pickEdgeSpawn(grid, () => rng.next());
    if (!spawn) return;
    const count = rng.next() < 0.5 ? 1 : 2;
    if (!Array.isArray(state.agents)) state.agents = [];
    for (let i = 0; i < count; i += 1) {
      // Slight x-jitter so multiple saboteurs don't stack on one tile.
      const ix = Math.max(0, Math.min(grid.width - 1, spawn.ix + (i === 0 ? 0 : (rng.next() < 0.5 ? -1 : 1))));
      const wp = tileToWorld(ix, spawn.iz, grid);
      const sab = createVisitor(wp.x, wp.z, VISITOR_KIND.SABOTEUR, () => rng.next());
      state.agents.push(sab);
    }
    pushWarning(
      state,
      `Raiders sighted near ${spawn.side} gate.`,
      "info",
      "raid-environment",
    );
  }

  update(_dt, state, services) {
    // Step 10 hook fires every tick; internal cooldown + threat gates keep
    // the actual spawn rare. Runs BEFORE the LLM directive bookkeeping so
    // the saboteurs are observable in the same tick they spawn.
    this.#maybeSpawnThreatGatedRaid(state, services);

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
      recordAiDecisionResult(state, "environment", this.pendingResult, now);

      const debugExchange = this.pendingResult.debug ?? {};
      const environmentExchange = {
        category: "environment-director",
        label: "Environment Director",
        simSec: now,
        source: usedFallback ? "fallback" : "llm",
        fallback: usedFallback,
        model: this.pendingResult.model ?? state.ai.lastEnvironmentModel ?? "",
        latencyMs: this.pendingResult.latencyMs ?? null,
        endpoint: debugExchange.endpoint ?? "/api/ai/environment",
        requestedAtIso: debugExchange.requestedAtIso ?? "",
        requestSummary: debugExchange.requestSummary ?? null,
        promptSystem: debugExchange.promptSystem ?? "",
        promptUser: debugExchange.promptUser ?? "",
        requestPayload: debugExchange.requestPayload ?? null,
        rawModelContent: debugExchange.rawModelContent ?? "",
        parsedBeforeValidation: debugExchange.parsedBeforeValidation ?? null,
        guardedOutput: debugExchange.guardedOutput ?? this.pendingResult.data ?? null,
        decisionResult: this.pendingResult.data ?? null,
        error: this.pendingResult.error ?? debugExchange.error ?? "",
      };
      state.ai.lastEnvironmentExchange = environmentExchange;
      state.ai.environmentExchanges ??= [];
      state.ai.environmentExchanges.unshift(environmentExchange);
      state.ai.environmentExchanges = state.ai.environmentExchanges.slice(0, 8);
      state.ai.llmCallLog ??= [];
      state.ai.llmCallLog.unshift(environmentExchange);
      state.ai.llmCallLog = state.ai.llmCallLog.slice(0, 24);

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

    const tuning = getLongRunAiTuning(state);
    if (state.metrics.timeSec - state.ai.lastEnvironmentDecisionSec < tuning.environmentDecisionIntervalSec) {
      return;
    }

    state.ai.lastEnvironmentDecisionSec = state.metrics.timeSec;
    markAiDecisionRequest(state, "environment", state.metrics.timeSec);
    const summary = buildWorldSummary(state);
    if (services.memoryStore) {
      const memCtx = services.memoryStore.formatForPrompt(
        "weather event threat prosperity",
        state.metrics.timeSec,
      );
      if (memCtx) summary._memoryContext = memCtx;
    }
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
        const fallbackRaw = services.fallbackEnvironment(summary);
        this.pendingResult = {
          fallback: true,
          data: fallbackRaw,
          latencyMs: 0,
          error: String(err?.message ?? err),
          model: services.llmClient.lastModel ?? "fallback",
          debug: {
            requestedAtIso: new Date().toISOString(),
            endpoint: "/api/ai/environment",
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
