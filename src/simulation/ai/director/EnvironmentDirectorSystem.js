import { getLongRunAiTuning } from "../../../config/longRunProfile.js";
import { applyEnvironmentDirective } from "./EnvironmentDirectiveApplier.js";
import { buildWorldSummary } from "../memory/WorldSummary.js";
import { markAiDecisionRequest, recordAiDecisionResult } from "../../../app/aiRuntimeStats.js";
import { BALANCE } from "../../../config/balance.js";
import { VISITOR_KIND } from "../../../config/constants.js";
import { createVisitor } from "../../../entities/EntityFactory.js";
import { isPassable, tileToWorld } from "../../../world/grid/Grid.js";
import { pushWarning } from "../../../app/warnings.js";
import {
  buildEnvironmentMenu,
  validateEnvironmentPick,
} from "./EnvironmentAnalytics.js";

// v0.8.2 LLM-tune (env-director): perception block injected onto the
// world summary BEFORE it ships to LLMClient.requestEnvironment. The
// proxy serializes the entire summary into the LLM user-message JSON,
// so adding well-named fields here surfaces fragility, raid posture,
// and trend signals to the model without touching PromptPayload or
// LLMClient. Exposed (named export) for unit tests.
//
// Thesis (why this should beat the rule-based fallback):
// 1. Contextual trade-off — fallback only checks food<18 OR collapseRisk>=65.
//    Real fragility starts much earlier: food<100 with fewer than 3 farms,
//    or shrinking food trajectory. We surface a graded "fragilityLevel"
//    so the LLM can hold pressure back BEFORE the cliff.
// 2. Threat posture — fallback ignores active raid events when picking
//    weather. We compute `raidPosture` from active events + threat.
// 3. Long-horizon hint — fallback rolls per-tick decisions; LLM gets a
//    suggested progression hint (calm now / pressure later) so it can
//    sequence weather instead of bouncing between extremes.
export function buildEnvironmentPerception(summary) {
  const world = summary?.world ?? summary ?? {};
  const food = Number(world.resources?.food ?? 0);
  const wood = Number(world.resources?.wood ?? 0);
  const meals = Number(world.resources?.meals ?? 0);
  const farms = Number(world.buildings?.farms ?? 0);
  const warehouses = Number(world.buildings?.warehouses ?? 0);
  const workers = Number(world.population?.workers ?? 0);
  const collapseRisk = Number(world.gameplay?.recovery?.collapseRisk ?? 0);
  const threat = Number(world.gameplay?.threat ?? 0);
  const prosperity = Number(world.gameplay?.prosperity ?? 50);
  const events = Array.isArray(world.events) ? world.events : [];
  const activeRaids = events.filter(
    (e) => e?.type === "banditRaid" || e?.type === "raid",
  ).length;
  const activeWildfire = events.some((e) => e?.type === "wildfire");
  const activeDisease = events.some((e) => e?.type === "diseaseOutbreak");
  const predators = Number(world.population?.predators ?? 0);

  // Fragility tiers — graded so the LLM can pick proportional weather.
  // CRITICAL  → must be calm + send relief
  // FRAGILE   → calm, no extra pressure
  // WATCHFUL  → mild pressure ok, avoid storm/drought
  // STABLE    → normal challenge cadence
  // THRIVING  → pressure events welcome
  let fragilityLevel = "stable";
  let fragilityReason = "";
  const reasons = [];
  if (food < 25 || collapseRisk >= 65 || meals + food < 15) {
    fragilityLevel = "critical";
    if (food < 25) reasons.push(`food=${food.toFixed(0)}<25`);
    if (collapseRisk >= 65) reasons.push(`collapseRisk=${collapseRisk.toFixed(0)}`);
  } else if (food < 100 && farms < 3) {
    fragilityLevel = "fragile";
    reasons.push(`food=${food.toFixed(0)}<100 with farms=${farms}<3`);
  } else if (prosperity < 50 || threat > 60 || activeRaids > 0) {
    fragilityLevel = "fragile";
    if (prosperity < 50) reasons.push(`prosperity=${prosperity.toFixed(0)}<50`);
    if (threat > 60) reasons.push(`threat=${threat.toFixed(0)}>60`);
    if (activeRaids > 0) reasons.push(`activeRaids=${activeRaids}`);
  } else if (food < 150 || prosperity < 60 || threat > 45 || predators >= 3) {
    fragilityLevel = "watchful";
    if (food < 150) reasons.push(`food=${food.toFixed(0)}<150`);
    if (predators >= 3) reasons.push(`predators=${predators}`);
  } else if (prosperity >= 70 && threat <= 25 && food >= 200) {
    fragilityLevel = "thriving";
  }
  fragilityReason = reasons.join(", ");

  // Raid posture — composite of active raid events + saboteurs +
  // elevated threat. Surfaced separately so weather can avoid stacking
  // pressure on top of an active threat (no insult-to-injury).
  let raidPosture = "calm";
  if (activeRaids >= 1 || threat >= 70) raidPosture = "active";
  else if (threat >= 50 || predators >= 3) raidPosture = "elevated";

  // Long-horizon hint — encourage chained progression (clear → rain
  // later when stable; rain → clear when fragile). Fallback never
  // sequences across calls because each call is independent.
  let progressionHint = "stable cadence";
  if (fragilityLevel === "critical") progressionHint = "recovery now; consider re-evaluating in 30s";
  else if (fragilityLevel === "fragile") progressionHint = "calm now; light pressure only after food rebuilds";
  else if (fragilityLevel === "thriving") progressionHint = "ok to chain rain → storm if no raids";

  // Recommended weather window — narrows the LLM's choice when the
  // stakes are high. Empty = any weather is acceptable. The LLM is
  // ALLOWED to override; this is steering, not gating.
  let recommendedWeather = [];
  if (fragilityLevel === "critical" || fragilityLevel === "fragile" || raidPosture === "active") {
    recommendedWeather = ["clear"];
  } else if (fragilityLevel === "watchful") {
    recommendedWeather = ["clear", "rain"];
  }

  // Iteration 2: positive-list framing for events. Models follow
  // "use only X" much more reliably than "must not use Y". When the
  // colony is fragile or under raid pressure, allow ONLY tradeCaravan
  // (relief), nothing else. The string list also makes the rule easy
  // to verify in tests.
  let allowedEventsThisCall;
  let bannedEventsThisCall;
  if (fragilityLevel === "critical") {
    allowedEventsThisCall = ["tradeCaravan"];
    bannedEventsThisCall = ["banditRaid", "wildfire", "diseaseOutbreak", "moraleBreak", "animalMigration"];
  } else if (fragilityLevel === "fragile" || raidPosture === "active") {
    allowedEventsThisCall = ["tradeCaravan"];
    bannedEventsThisCall = ["banditRaid", "wildfire", "diseaseOutbreak", "moraleBreak"];
  } else if (fragilityLevel === "watchful") {
    allowedEventsThisCall = ["tradeCaravan", "animalMigration"];
    bannedEventsThisCall = ["banditRaid", "wildfire", "diseaseOutbreak"];
  } else if (fragilityLevel === "thriving") {
    allowedEventsThisCall = ["tradeCaravan", "animalMigration", "banditRaid", "moraleBreak"];
    bannedEventsThisCall = [];
  } else {
    allowedEventsThisCall = ["tradeCaravan", "animalMigration"];
    bannedEventsThisCall = ["wildfire", "diseaseOutbreak"];
  }

  // Tighten intensity ceiling for fragile/active runs.
  const maxEventIntensity = (fragilityLevel === "critical" || fragilityLevel === "fragile" || raidPosture === "active")
    ? 0.6
    : (fragilityLevel === "watchful" ? 1.0 : 1.5);

  return {
    fragilityLevel,
    fragilityReason,
    fragilitySignals: {
      food,
      foodFloor25: food < 25,
      foodFloor100: food < 100,
      foodFloor150: food < 150,
      farms,
      farmsBelow3: farms < 3,
      warehouses,
      workers,
      meals,
      wood,
      collapseRisk,
      prosperity,
      threat,
      predators,
      activeRaids,
      activeWildfire,
      activeDisease,
    },
    raidPosture,
    progressionHint,
    recommendedWeather,
    allowedEventsThisCall,
    bannedEventsThisCall,
    maxEventIntensity,
    // Hard guidance the LLM MUST treat as a soft rule. Phrased as
    // direct imperatives because the model treats them as system-prompt-
    // adjacent rules when they show up alongside `hardRules` in the JSON
    // payload. Iteration 2 reframes negative rules as positive
    // "ONLY use X" because LLMs follow allowlists more reliably.
    fragilityRules: [
      `Use ONLY events from allowedEventsThisCall (${allowedEventsThisCall.join(", ") || "none"}). DO NOT spawn any event whose type appears in bannedEventsThisCall.`,
      `Cap eventSpawns[].intensity at ${maxEventIntensity.toFixed(2)} for this call.`,
      `Pick weather from recommendedWeather (${recommendedWeather.length > 0 ? recommendedWeather.join(", ") : "any"}).`,
      "If raidPosture is 'active' or fragilityLevel is 'critical', prefer eventSpawns=[] (empty) — let the colony breathe.",
      "Sequence across calls: prefer chaining clear → rain → storm rather than oscillating; reuse the prior weather when fragility is unchanged.",
    ],
  };
}

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
    // Round 2: holds the pre-rated weather/event menu we injected into the
    // outgoing prompt, so the post-validation step can verify the LLM's
    // pick was on-menu when the result returns.
    this.pendingMenu = null;
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
      // Round 2: post-validate the LLM's pick against the candidate menu we
      // pre-computed when the request was issued. We DO NOT post-validate
      // fallback directives — the rule-based fallback is already
      // deterministic and fragility-aware.
      const usedFallback = Boolean(this.pendingResult.fallback);
      const menu = this.pendingMenu;
      let candidateUseRate = 1;
      let postValidationReasons = [];
      if (!usedFallback && menu && this.pendingResult.data) {
        const check = validateEnvironmentPick(
          this.pendingResult.data,
          menu.weatherCandidates,
          menu.eventCandidates,
          menu.posture,
          menu.recommendedDurationSec ?? null,
          menu.recommendedReliefSpawn ?? null,
        );
        candidateUseRate = check.candidateUseRate;
        postValidationReasons = check.reasons;
        // Replace the directive with the sanitized one. If the LLM picked
        // off-menu, we silently rewrite to top-1; the reason is logged on
        // the exchange so it surfaces in the AI panel.
        this.pendingResult.data = check.fixed;
      }
      applyEnvironmentDirective(state, this.pendingResult.data);
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
        // Round 2: pre-rated menu + post-validation telemetry.
        candidateUseRate,
        postValidationReasons,
        storytellerPosture: menu?.posture?.posture ?? null,
        threatWindow: menu?.threatWindow ?? null,
        topWeather: menu?.weatherCandidates?.[0]?.weather ?? null,
        topWeatherScore: menu?.weatherCandidates?.[0]?.score ?? null,
      };
      state.ai.lastEnvironmentExchange = environmentExchange;
      // Round 2: rolling avg of candidateUseRate across LLM-only calls. The
      // bench reads this to confirm ≥ 0.85 on 3/3 scenarios.
      if (!usedFallback) {
        const prev = Number(state.ai.environmentCandidateUseRateAvg ?? 0);
        const n = Number(state.ai.environmentLlmCount ?? 1);
        state.ai.environmentCandidateUseRateAvg = Number(
          (prev + (candidateUseRate - prev) / Math.max(1, n)).toFixed(4),
        );
      }
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
      this.pendingMenu = null;
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
    // v0.8.2 LLM-tune (env-director): inject the fragility perception
    // block onto the summary. The proxy serializes the entire summary
    // into the LLM user-message JSON, so the model sees fragilityLevel,
    // fragilityRules, raidPosture, recommendedWeather, etc. The
    // fallback path (services.fallbackEnvironment / buildEnvironmentFallback)
    // reads ONLY food / collapseRisk / prosperity / threat — these
    // perception fields are no-ops for it, so the rule-based path is
    // unchanged. Tested in test/llm-environment-tune.test.js.
    summary._fragilityPerception = buildEnvironmentPerception(summary);
    // Round 2: pre-rate every legal weather/event option, classify storyteller
    // posture, and embed the markdown menu directly in the summary so it
    // appears in the LLM prompt JSON. Stash the raw menu on the system
    // instance so we can post-validate the LLM's pick when it returns.
    const environmentMenu = buildEnvironmentMenu(summary, summary._fragilityPerception);
    summary._environmentMenu = {
      menuMarkdown: environmentMenu.menuMarkdown,
      posture: environmentMenu.posture,
      threatWindow: environmentMenu.threatWindow,
      weatherCandidates: environmentMenu.weatherCandidates,
      eventCandidates: environmentMenu.eventCandidates,
      recommendedDurationSec: environmentMenu.recommendedDurationSec,
      recommendedReliefSpawn: environmentMenu.recommendedReliefSpawn,
    };
    this.pendingMenu = environmentMenu;
    const wantsLlm = state.ai.enabled && state.ai.coverageTarget !== "fallback";
    if (state.debug?.aiTrace) {
      state.debug.aiTrace.unshift({
        sec: state.metrics.timeSec,
        source: wantsLlm ? "llm" : "fallback",
        channel: "environment-request",
        fallback: !wantsLlm,
        model: state.metrics.proxyModel ?? services.llmClient.lastModel ?? "",
        weather: summary.weather.current,
        events: summary.events.map((e) => e.type).join(", ") || "none",
        error: "",
      });
      state.debug.aiTrace = state.debug.aiTrace.slice(0, 36);
    }
    this.pendingPromise = services.llmClient
      .requestEnvironment(summary, wantsLlm)
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
