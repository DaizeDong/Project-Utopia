import { getAiInsight, getCausalDigest } from "../interpretation/WorldExplain.js";

const DEV_DOCK_PANELS_STORAGE_KEY = "utopiaDevDockPanels:v1";
const DEV_DOCK_DEFAULT_OPEN = Object.freeze(["global", "ai-trace"]);

export class DeveloperPanel {
  constructor(state) {
    this.state = state;
    this.globalVal = document.getElementById("devGlobalVal");
    this.algoVal = document.getElementById("devAlgoVal");
    this.aiTraceVal = document.getElementById("devAiTraceVal");
    this.systemVal = document.getElementById("devSystemVal");
    this.eventVal = document.getElementById("devEventTraceVal");
    this.logicVal = document.getElementById("devLogicVal");

    this.dockCards = Array.from(
      document.querySelectorAll("details.dock-card[data-dock-key]")
    );
    this.dockCollapseAllBtn = document.getElementById("dockCollapseAllBtn");
    this.dockExpandAllBtn = document.getElementById("dockExpandAllBtn");
    this.dockResetLayoutBtn = document.getElementById("dockResetLayoutBtn");
    this.lastPanelText = new Map();
    this.interactionUntilByPanelKey = new Map();

    this.#setupDockLayoutControls();
    this.#setupPanelInteractionGuards();
    this.#restoreDockPanelState();
  }

  #nowMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  #bumpPanelInteraction(panelKey, ms = 850) {
    if (!panelKey) return;
    const until = this.#nowMs() + ms;
    const prev = Number(this.interactionUntilByPanelKey.get(panelKey) ?? 0);
    this.interactionUntilByPanelKey.set(panelKey, Math.max(prev, until));
  }

  #isPanelInteracting(panelKey) {
    return this.#nowMs() < Number(this.interactionUntilByPanelKey.get(panelKey) ?? 0);
  }

  #setPanelText(node, panelKey, text) {
    if (!node || !panelKey) return;
    const prevText = this.lastPanelText.get(panelKey);
    if (prevText === text) return;
    if (this.#isPanelInteracting(panelKey)) return;

    const prevTop = Number(node.scrollTop ?? 0);
    node.textContent = text;
    this.lastPanelText.set(panelKey, text);
    const maxTop = Math.max(0, Number(node.scrollHeight ?? 0) - Number(node.clientHeight ?? 0));
    node.scrollTop = Math.max(0, Math.min(prevTop, maxTop));
  }

  #setupPanelInteractionGuards() {
    const panelEntries = [
      ["global", this.globalVal],
      ["algo", this.algoVal],
      ["ai-trace", this.aiTraceVal],
      ["logic", this.logicVal],
      ["timings", this.systemVal],
      ["events", this.eventVal],
    ];
    for (const [panelKey, node] of panelEntries) {
      if (!node) continue;
      node.addEventListener(
        "pointerdown",
        () => this.#bumpPanelInteraction(panelKey, 1300),
        true,
      );
      node.addEventListener(
        "wheel",
        () => this.#bumpPanelInteraction(panelKey, 1000),
        { passive: true, capture: true },
      );
      node.addEventListener(
        "scroll",
        () => this.#bumpPanelInteraction(panelKey, 900),
        { passive: true, capture: true },
      );
    }
  }

  #setupDockLayoutControls() {
    this.dockCards.forEach((card) => {
      card.addEventListener("toggle", () => this.#persistDockPanelState());
    });

    this.dockCollapseAllBtn?.addEventListener("click", () => {
      this.#setAllDockPanels(false);
    });

    this.dockExpandAllBtn?.addEventListener("click", () => {
      this.#setAllDockPanels(true);
    });

    this.dockResetLayoutBtn?.addEventListener("click", () => {
      this.#applyDefaultDockLayout();
      this.#persistDockPanelState();
    });
  }

  #setAllDockPanels(open) {
    this.dockCards.forEach((card) => {
      card.open = Boolean(open);
    });
    this.#persistDockPanelState();
  }

  #applyDefaultDockLayout() {
    this.dockCards.forEach((card) => {
      const key = card.dataset.dockKey ?? "";
      card.open = DEV_DOCK_DEFAULT_OPEN.includes(key);
    });
  }

  #restoreDockPanelState() {
    if (this.dockCards.length === 0) return;
    const raw = localStorage.getItem(DEV_DOCK_PANELS_STORAGE_KEY);
    if (!raw) {
      this.#applyDefaultDockLayout();
      this.#persistDockPanelState();
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      this.dockCards.forEach((card) => {
        const key = card.dataset.dockKey ?? "";
        const value = parsed?.[key];
        if (typeof value === "boolean") {
          card.open = value;
        } else {
          card.open = DEV_DOCK_DEFAULT_OPEN.includes(key);
        }
      });
    } catch {
      this.#applyDefaultDockLayout();
      this.#persistDockPanelState();
    }
  }

  #persistDockPanelState() {
    if (this.dockCards.length === 0) return;
    const saved = {};
    for (const card of this.dockCards) {
      const key = card.dataset.dockKey ?? "";
      if (!key) continue;
      saved[key] = Boolean(card.open);
    }
    localStorage.setItem(DEV_DOCK_PANELS_STORAGE_KEY, JSON.stringify(saved));
  }

  #fmtNum(value, digits = 2) {
    if (!Number.isFinite(value)) return "-";
    return Number(value).toFixed(digits);
  }

  #renderGlobal() {
    if (!this.globalVal) return;
    const state = this.state;
    const popStats = state.metrics.populationStats ?? null;
    const workers = popStats?.workers ?? state.agents.filter((a) => a.type === "WORKER").length;
    const visitors = popStats?.visitors ?? state.agents.filter((a) => a.type === "VISITOR").length;
    const traders = state.agents.filter((a) => a.groupId === "traders").length;
    const saboteurs = state.agents.filter((a) => a.groupId === "saboteurs").length;
    const herbivores = popStats?.herbivores ?? state.animals.filter((a) => a.kind === "HERBIVORE").length;
    const predators = popStats?.predators ?? state.animals.filter((a) => a.kind === "PREDATOR").length;
    const objective = state.gameplay.objectives[state.gameplay.objectiveIndex] ?? null;
    const selectedTile = state.controls.selectedTile;
    const gridStats = state.debug.gridStats ?? {};
    const renderMode = state.debug.renderMode ?? "detailed";
    const renderEntities = state.debug.renderEntityCount ?? 0;
    const renderPixelRatio = state.debug.renderPixelRatio ?? "-";
    const visualPack = state.debug.visualAssetPack ?? "unknown";
    const tileLoaded = state.debug.tileTexturesLoaded ? "yes" : "no";
    const iconLoaded = state.debug.iconAtlasLoaded ? "yes" : "no";
    const unitLoaded = state.debug.unitSpriteLoaded ? "yes" : "no";
    const terrainTuning = state.controls.terrainTuning ?? {};
    const popBreakdown = state.controls.populationBreakdown ?? {
      baseWorkers: 0,
      stressWorkers: 0,
      totalWorkers: 0,
      totalEntities: workers + visitors + herbivores + predators,
    };
    const rngSnapshot = state.debug?.rng ?? null;
    const deathsTotal = Number(state.metrics.deathsTotal ?? 0);
    const deathsByReason = state.metrics.deathsByReason ?? {};
    const recovery = state.gameplay.recovery ?? null;
    const ecology = state.metrics.ecology ?? null;

    const lines = [
      `Map: ${state.world.mapTemplateName} (${state.world.mapTemplateId})`,
      `Seed: ${state.world.mapSeed} | Grid v${state.grid.version} | ${state.grid.width}x${state.grid.height}`,
      `Terrain: passable=${this.#fmtNum((gridStats.passableRatio ?? 0) * 100, 1)}% road=${gridStats.roads ?? 0} water=${gridStats.water ?? 0} walls=${gridStats.walls ?? 0} emptyBase=${gridStats.emptyBaseTiles ?? 0}`,
      `Tuning: water=${this.#fmtNum(terrainTuning.waterLevel, 2)} riverCount=${terrainTuning.riverCount ?? "-"} riverWidth=${this.#fmtNum(terrainTuning.riverWidth, 1)} riverAmp=${this.#fmtNum(terrainTuning.riverAmp, 2)} mountain=${this.#fmtNum(terrainTuning.mountainStrength, 2)} island=${this.#fmtNum(terrainTuning.islandBias, 2)} ocean=${this.#fmtNum(terrainTuning.oceanBias, 2)} road=${this.#fmtNum((terrainTuning.roadDensity ?? 0) * 100, 0)}% settle=${this.#fmtNum((terrainTuning.settlementDensity ?? 0) * 100, 0)}%`,
      `Sim: t=${this.#fmtNum(state.metrics.timeSec, 1)}s tick=${state.metrics.tick} dt=${this.#fmtNum(state.metrics.simDt, 3)} steps=${state.metrics.simStepsThisFrame}`,
      `Render: fps=${this.#fmtNum(state.metrics.averageFps, 1)} frame=${this.#fmtNum(state.metrics.frameMs, 2)}ms simCost=${this.#fmtNum(state.metrics.simCostMs, 2)}ms`,
      `Render Mode: ${renderMode} (entities=${renderEntities}, switch@${state.debug.renderModelDisableThreshold ?? "-"}, pixelRatio=${renderPixelRatio})`,
      `Visual: preset=${state.controls.visualPreset} pack=${visualPack} tileTextures=${tileLoaded} icons=${iconLoaded} unitSprites=${unitLoaded}`,
      `Resources: food=${Math.floor(state.resources.food)} wood=${Math.floor(state.resources.wood)} | buildings W/H/F/L=${state.buildings.walls}/${state.buildings.warehouses}/${state.buildings.farms}/${state.buildings.lumbers}`,
      `Population: workers=${workers} visitors=${visitors} (traders=${traders}, saboteurs=${saboteurs}) herbivores=${herbivores} predators=${predators}`,
      `Population Breakdown: baseW=${popBreakdown.baseWorkers} stressW=${popBreakdown.stressWorkers} totalW=${popBreakdown.totalWorkers} totalEntities=${popBreakdown.totalEntities}`,
      `Deaths: total=${deathsTotal} starvation=${Number(deathsByReason.starvation ?? 0)} predation=${Number(deathsByReason.predation ?? 0)} event=${Number(deathsByReason.event ?? 0)}`,
      ecology ? ecology.summary : "Ecology: unavailable",
      `Gameplay: doctrine=${state.gameplay.doctrine} prosperity=${this.#fmtNum(state.gameplay.prosperity, 1)} threat=${this.#fmtNum(state.gameplay.threat, 1)}`,
      recovery
        ? `Progression: mastery=${this.#fmtNum(state.gameplay.doctrineMastery ?? 1, 2)} recovery=${Number(recovery.charges ?? 0)} active=${this.#fmtNum(recovery.activeBoostSec ?? 0, 1)}s risk=${this.#fmtNum(recovery.collapseRisk ?? 0, 1)}% reason=${recovery.lastReason || "-"}` 
        : "Progression: recovery unavailable",
      objective
        ? `Objective: ${objective.title} (${this.#fmtNum(objective.progress, 1)}%)`
        : "Objective: all completed",
      selectedTile
        ? `Selected Tile: (${selectedTile.ix}, ${selectedTile.iz}) type=${selectedTile.typeName}`
        : "Selected Tile: none",
      `Selected Entity: ${state.controls.selectedEntityId ?? "none"}`,
      `AI: enabled=${state.ai.enabled} mode=${state.ai.mode} env(${state.ai.environmentLlmCount}/${state.ai.environmentDecisionCount}) policy(${state.ai.policyLlmCount}/${state.ai.policyDecisionCount}) latency=${this.#fmtNum(state.metrics.aiLatencyMs, 1)}ms proxy=${state.metrics.proxyHealth ?? "unknown"} hasKey=${Boolean(state.metrics.proxyHasApiKey)} model=${state.metrics.proxyModel || "-"}`,
      rngSnapshot ? `RNG: seed=${rngSnapshot.initialSeed} state=${rngSnapshot.state} calls=${rngSnapshot.calls}` : "RNG: unavailable",
    ];

    this.#setPanelText(this.globalVal, "global", lines.join("\n"));
  }

  #renderAlgorithms() {
    if (!this.algoVal) return;
    const astar = this.state.debug.astar ?? {};
    const boids = this.state.debug.boids ?? {};
    const traffic = this.state.metrics?.traffic ?? this.state.debug?.traffic ?? {};
    const req = Number(astar.requests ?? 0);
    const success = Number(astar.success ?? 0);
    const fail = Number(astar.fail ?? 0);
    const successRate = req > 0 ? (success / req) * 100 : 0;
    const hotspotRows = Array.isArray(traffic.hotspotTiles)
      ? traffic.hotspotTiles.slice(0, 3).map((entry) => `(${entry.ix},${entry.iz}) load=${this.#fmtNum(entry.load, 1)} x${this.#fmtNum(entry.penalty, 2)}`)
      : [];

    const lines = [
      "A*",
      `requests=${req} success=${success} fail=${fail} successRate=${this.#fmtNum(successRate, 1)}%`,
      `cache hits=${astar.cacheHits ?? 0} misses=${astar.cacheMisses ?? 0}`,
      `last duration=${this.#fmtNum(astar.lastDurationMs, 3)}ms avg duration=${this.#fmtNum(astar.avgDurationMs, 3)}ms`,
      `last path len=${this.#fmtNum(astar.lastPathLength, 1)} avg path len=${this.#fmtNum(astar.avgPathLength, 1)}`,
      `traffic version=${astar.trafficVersion ?? 0} hotspots=${astar.lastTrafficHotspots ?? 0} peakLoad=${this.#fmtNum(astar.lastTrafficPeakLoad, 1)}`,
      astar.lastFrom && astar.lastTo
        ? `last query: (${astar.lastFrom.ix},${astar.lastFrom.iz}) -> (${astar.lastTo.ix},${astar.lastTo.iz})`
        : "last query: none",
      "",
      "Boids",
      `entities=${boids.entities ?? 0} avgNeighbors=${this.#fmtNum(boids.avgNeighbors, 2)}`,
      `avgSpeed=${this.#fmtNum(boids.avgSpeed, 3)} maxSpeed=${this.#fmtNum(boids.maxSpeed, 3)} update=${this.#fmtNum(boids.updateIntervalSec, 3)}s`,
      "",
      "Traffic",
      `version=${traffic.version ?? 0} activeLanes=${traffic.activeLaneCount ?? 0} hotspots=${traffic.hotspotCount ?? 0}`,
      `avgLoad=${this.#fmtNum(traffic.avgLoad, 2)} peakLoad=${this.#fmtNum(traffic.peakLoad, 2)} peakPenalty=x${this.#fmtNum(traffic.peakPenalty ?? 1, 2)}`,
      hotspotRows.length > 0 ? `top hotspots: ${hotspotRows.join(" | ")}` : "top hotspots: none",
    ];

    this.#setPanelText(this.algoVal, "algo", lines.join("\n"));
  }

  #renderAiTrace() {
    if (!this.aiTraceVal) return;
    const trace = this.state.debug.aiTrace ?? [];
    const digest = getCausalDigest(this.state);
    const aiInsight = getAiInsight(this.state);
    if (trace.length === 0) {
      this.#setPanelText(this.aiTraceVal, "ai-trace", [
        "Narrative:",
        `${digest.headline} | ${digest.action}`,
        aiInsight.summary,
        "",
        "No AI traces yet.",
      ].join("\n"));
      return;
    }

    const headerLines = [
      "Narrative:",
      `${digest.headline} | ${digest.action}`,
      aiInsight.summary,
      `Warning focus: ${digest.warning}`,
      "",
      "Trace:",
    ];
    const lines = trace.slice(0, 16).map((entry) => {
      const sec = this.#fmtNum(entry.sec, 1);
      const fallback = entry.fallback !== undefined
        ? Boolean(entry.fallback)
        : entry.source === "fallback";
      const model = String(entry.model ?? this.state.metrics.proxyModel ?? "-").trim() || "-";
      const err = entry.error ? ` err=${String(entry.error).slice(0, 110)}` : "";
      return `[${sec}s] ${entry.channel} ${entry.source} fallback=${fallback} model=${model} weather=${entry.weather} detail=${entry.events}${err}`;
    });

    this.#setPanelText(this.aiTraceVal, "ai-trace", [...headerLines, ...lines].join("\n"));
  }

  #renderSystemTimings() {
    if (!this.systemVal) return;
    const timings = this.state.debug.systemTimingsMs ?? {};
    const entries = Object.entries(timings)
      .sort((a, b) => (b[1]?.avg ?? 0) - (a[1]?.avg ?? 0));

    if (entries.length === 0) {
      this.#setPanelText(this.systemVal, "timings", "No system timings collected yet.");
      return;
    }

    const lines = ["name | last(ms) | avg(ms) | peak(ms)"];
    for (const [name, stat] of entries.slice(0, 16)) {
      lines.push(
        `${name.padEnd(22)} ${this.#fmtNum(stat.last, 3).padStart(8)} ${this.#fmtNum(stat.avg, 3).padStart(8)} ${this.#fmtNum(stat.peak, 3).padStart(8)}`,
      );
    }
    this.#setPanelText(this.systemVal, "timings", lines.join("\n"));
  }

  #renderEventLog() {
    if (!this.eventVal) return;
    const objectiveLog = this.state.gameplay.objectiveLog ?? [];
    const eventTrace = this.state.debug.eventTrace ?? [];
    const warnings = this.state.metrics.warnings ?? [];
    const presetComparison = this.state.debug.presetComparison ?? [];
    const lines = [];

    if (objectiveLog.length > 0) {
      lines.push("Objective Log:");
      lines.push(...objectiveLog.slice(0, 8));
      lines.push("");
    }

    const events = this.state.events.active ?? [];
    if (events.length > 0) {
      lines.push("Active Events:");
      for (const event of events.slice(0, 8)) {
        const remain = Math.max(0, event.durationSec - event.elapsedSec);
        lines.push(
          `- ${event.type}/${event.status} intensity=${this.#fmtNum(event.intensity, 2)} p=${this.#fmtNum(event.payload?.pressure, 2)} severity=${event.payload?.severity ?? "-"} target=${event.payload?.targetLabel ?? "-"} contested=${Number(event.payload?.contestedTiles ?? 0)} remain=${this.#fmtNum(remain, 1)}s`,
        );
      }
      lines.push("");
    }

    if (eventTrace.length > 0) {
      lines.push("Event Trace:");
      lines.push(...eventTrace.slice(0, 8));
      lines.push("");
    }

    if (warnings.length > 0) {
      lines.push("Warnings:");
      lines.push(...warnings.slice(-6));
    }

    if (presetComparison.length > 0) {
      lines.push("");
      lines.push("Preset Comparison:");
      for (const row of presetComparison.slice(0, 8)) {
        lines.push(`- ${row.templateId}: road=${row.roadPct}% water=${row.waterPct}% passable=${row.passablePct}% validation=${row.validation}`);
      }
    }

    this.#setPanelText(
      this.eventVal,
      "events",
      lines.length > 0 ? lines.join("\n") : "No event/diagnostic logs yet.",
    );
  }

  #renderLogicConsistency() {
    if (!this.logicVal) return;
    const logic = this.state.debug.logic ?? {};
    const idleByGroup = logic.idleWithoutReasonSecByGroup ?? this.state.metrics.idleWithoutReasonSec ?? {};
    const pathByEntity = logic.pathRecalcByEntity ?? {};
    const topPathHotspots = Object.entries(pathByEntity)
      .sort((a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0))
      .slice(0, 5);
    const reachabilityDeaths = this.state.metrics.deathByReasonAndReachability ?? logic.deathByReasonAndReachability ?? {};

    const activeStateTargets = [];
    if (this.state.ai.groupStateTargets instanceof Map) {
      for (const [groupId, target] of this.state.ai.groupStateTargets.entries()) {
        const ttl = Math.max(0, Number(target.expiresAtSec ?? 0) - Number(this.state.metrics.timeSec ?? 0));
        activeStateTargets.push(`${groupId}->${target.targetState} p=${this.#fmtNum(target.priority, 2)} ttl=${this.#fmtNum(ttl, 1)}s src=${target.source ?? "-"}`);
      }
    }

    const lines = [
      `Invalid transitions: ${Number(this.state.metrics.invalidTransitionCount ?? 0)}`,
      `Goal flips (rapid): ${Number(this.state.metrics.goalFlipCount ?? 0)}`,
      `Avg goal flips/entity: ${this.#fmtNum(this.state.metrics.avgGoalFlipPerEntity, 3)}`,
      `Path recalc/entity/min: ${this.#fmtNum(this.state.metrics.pathRecalcPerEntityPerMin, 3)}`,
      `Total path recalcs: ${Number(logic.totalPathRecalcs ?? 0)}`,
      `Deliver without carry: ${Number(this.state.metrics.deliverWithoutCarryCount ?? 0)}`,
      `Feasibility rejects: ${Object.keys(this.state.metrics.feasibilityRejectCountByGroup ?? {}).length > 0 ? JSON.stringify(this.state.metrics.feasibilityRejectCountByGroup) : "{}"}`,
      `Starvation risk entities: ${Number(this.state.metrics.starvationRiskCount ?? 0)}`,
      `Idle without reason (sec): ${Object.keys(idleByGroup).length > 0 ? JSON.stringify(idleByGroup) : "{}"}`,
      `Death reason+reachability: ${Object.keys(reachabilityDeaths).length > 0 ? JSON.stringify(reachabilityDeaths) : "{}"}`,
      `Active AI state targets: ${activeStateTargets.length > 0 ? activeStateTargets.join(" | ") : "none"}`,
      `Last AI target batch: ${Array.isArray(this.state.ai.lastStateTargetBatch) && this.state.ai.lastStateTargetBatch.length > 0 ? this.state.ai.lastStateTargetBatch.map((t) => `${t.groupId}:${t.targetState}`).join(", ") : "none"}`,
      topPathHotspots.length > 0
        ? `Path hotspot entities: ${topPathHotspots.map(([id, n]) => `${id}=${n}`).join(" | ")}`
        : "Path hotspot entities: none",
    ];

    this.#setPanelText(this.logicVal, "logic", lines.join("\n"));
  }

  render() {
    this.#renderGlobal();
    this.#renderAlgorithms();
    this.#renderAiTrace();
    this.#renderLogicConsistency();
    this.#renderSystemTimings();
    this.#renderEventLog();
  }
}
