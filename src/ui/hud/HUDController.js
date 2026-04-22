import { getAiInsight, getCausalDigest, getEventInsight, getFrontierStatus, getLogisticsInsight, getScenarioProgressCompact, getSurvivalScoreBreakdown, getTrafficInsight, getWeatherInsight } from "../interpretation/WorldExplain.js";
import { computeStorytellerStripText } from "./storytellerStrip.js";

function shouldSuppressUserWarning(warningEvent, warningText = "") {
  const source = String(warningEvent?.source ?? "").toLowerCase();
  const text = String(warningEvent?.message ?? warningText ?? "").toLowerCase();
  if (source === "npcbrainsystem" && text.includes("dropped infeasible state target")) return true;
  if (text.includes("dropped infeasible state target")) return true;
  return false;
}

export class HUDController {
  constructor(state) {
    this.state = state;
    this.foodVal = document.getElementById("foodVal");
    this.woodVal = document.getElementById("woodVal");
    this.stoneVal = document.getElementById("stoneVal");
    this.herbsVal = document.getElementById("herbsVal");
    this.mealsVal = document.getElementById("mealsVal");
    this.toolsVal = document.getElementById("toolsVal");
    this.medicineVal = document.getElementById("medicineVal");
    this.foodBar = document.getElementById("foodBar");
    this.woodBar = document.getElementById("woodBar");
    this.stoneBar = document.getElementById("stoneBar");
    this.herbsBar = document.getElementById("herbsBar");
    this.mealsBar = document.getElementById("mealsBar");
    this.toolsBar = document.getElementById("toolsBar");
    this.medicineBar = document.getElementById("medicineBar");

    this.workersVal = document.getElementById("workersVal");
    this.visitorsVal = document.getElementById("visitorsVal");
    this.herbivoresVal = document.getElementById("herbivoresVal");
    this.predatorsVal = document.getElementById("predatorsVal");
    this.farmersVal = document.getElementById("farmersVal");
    this.loggersVal = document.getElementById("loggersVal");
    this.stonersVal = document.getElementById("stonersVal");
    this.herbistsVal = document.getElementById("herbistsVal");
    this.cooksVal = document.getElementById("cooksVal");
    this.smithsVal = document.getElementById("smithsVal");
    this.herbalistsVal = document.getElementById("herbalistsVal");
    this.haulersVal = document.getElementById("haulersVal");

    this.weatherVal = document.getElementById("weatherVal");
    this.mapVal = document.getElementById("mapVal");
    this.doctrineVal = document.getElementById("doctrineVal");
    this.prosperityVal = document.getElementById("prosperityVal");
    this.threatVal = document.getElementById("threatVal");
    this.objectiveVal = document.getElementById("objectiveVal");
    this.aiModeVal = document.getElementById("aiModeVal");
    this.aiEnvVal = document.getElementById("aiEnvVal");
    this.aiPolicyVal = document.getElementById("aiPolicyVal");
    this.aiDecisionVal = document.getElementById("aiDecisionVal");
    // v0.8.2 Round-0 01e-innovation (Step 4) — Storyteller strip DOM ref.
    // Populated every render() via renderStorytellerStrip; hidden element
    // is fine, HUDController simply no-ops when the node is missing.
    this.storytellerStrip = document.getElementById("storytellerStrip");
    // v0.8.2 Round-0 01e-innovation (Step 5) — Death obituary flash. When a
    // new worker dies, replace the aggregate "N (starve X / pred Y)" line
    // with a personalised micro-obituary for OBITUARY_FLASH_MS ms before
    // falling back. `_lastDeathsSeen` is used to detect new deaths relative
    // to the previous render; _obituaryUntilMs is the wall-clock deadline
    // after which the HUD reverts to the aggregate count.
    this._lastDeathsSeen = 0;
    this._obituaryText = "";
    this._obituaryUntilMs = 0;
    this.deathVal = document.getElementById("deathVal");
    this.eventVal = document.getElementById("eventVal");
    this.timeVal = document.getElementById("timeVal");
    this.warningVal = document.getElementById("warningVal");
    this.actionVal = document.getElementById("actionVal");
    this.toolVal = document.getElementById("toolVal");
    this.simVal = document.getElementById("simVal");
    this.fpsVal = document.getElementById("fpsVal");
    this.frameVal = document.getElementById("frameVal");
    this.agentVal = document.getElementById("agentVal");
    this.visualModeVal = document.getElementById("visualModeVal");

    this.statusFood = document.getElementById("statusFood");
    this.statusWood = document.getElementById("statusWood");
    this.statusStone = document.getElementById("statusStone");
    this.statusHerbs = document.getElementById("statusHerbs");
    this.statusWorkers = document.getElementById("statusWorkers");
    this.statusMeals = document.getElementById("statusMeals");
    this.statusTools = document.getElementById("statusTools");
    this.statusMedicine = document.getElementById("statusMedicine");
    this.statusProsperity = document.getElementById("statusProsperity");
    this.statusThreat = document.getElementById("statusThreat");
    this.statusStoneBar = document.getElementById("statusStoneBar");
    this.statusHerbsBar = document.getElementById("statusHerbsBar");
    this.statusObjective = document.getElementById("statusObjective");
    // v0.8.2 Round-0 02e-indie-critic — scenario headline slot. Surfaces the
    // procedurally generated scenario title/summary as a persistent line in
    // the HUD status bar (previously only visible on the pre-game menu).
    this.statusScenarioHeadline = document.getElementById("statusScenarioHeadline");
    this._lastScenarioHeadlineText = null;
    // v0.8.2 Round-0 02c-speedrunner — scoreboard ribbon DOM refs. Sits
    // alongside #statusScenarioHeadline (02e) and #statusObjective (existing).
    // #statusScenario shows the compact scenario-progress ribbon; #statusScoreBreak
    // carries the per-rule score rules (survival/birth/death) in both the
    // visible span and the `title` tooltip so hover still works on narrow
    // viewports where the text is hidden by CSS.
    this.statusScenario = document.getElementById("statusScenario");
    this.statusScoreBreak = document.getElementById("statusScoreBreak");
    this.statusAction = document.getElementById("statusAction");
    this.statusFoodBar = document.getElementById("statusFoodBar");
    this.statusWoodBar = document.getElementById("statusWoodBar");
    this.statusProsperityBar = document.getElementById("statusProsperityBar");
    this.statusThreatBar = document.getElementById("statusThreatBar");
    this.hudFood = document.getElementById("hudFood");
    this.hudWood = document.getElementById("hudWood");
    this.hudWorkers = document.getElementById("hudWorkers");

    this.speedPauseBtn = document.getElementById("speedPauseBtn");
    this.speedPlayBtn = document.getElementById("speedPlayBtn");
    this.speedFastBtn = document.getElementById("speedFastBtn");
    this.gameTimer = document.getElementById("gameTimer");

    // v0.8.2 Round-0 01d — Resource rate badges. Snapshot every RATE_WINDOW_SEC
    // sim-seconds and compute (delta / window) * 60 → per-minute rate. Kept at 3s
    // to avoid jittery signs on stable supply. /min unit is chosen because
    // production/consumption events on the colony-chain are O(1 per few sec).
    this.foodRateVal = document.getElementById("foodRateVal");
    this.woodRateVal = document.getElementById("woodRateVal");
    this.stoneRateVal = document.getElementById("stoneRateVal");
    this.herbsRateVal = document.getElementById("herbsRateVal");
    this.mealsRateVal = document.getElementById("mealsRateVal");
    this.toolsRateVal = document.getElementById("toolsRateVal");
    this.medicineRateVal = document.getElementById("medicineRateVal");
    this._lastResourceSnapshot = null;
    this._lastSnapshotSimSec = 0;
    this._lastComputedRates = null; // cached between windows so UI shows continuous values

    // v0.8.2 Round-0 01b — track last shown action message so we only re-fire
    // the flash-action pulse when the text actually changes (not every render).
    this.lastActionMessage = "";

    this.setupSpeedControls();
  }

  setupSpeedControls() {
    this.speedPauseBtn?.addEventListener("click", () => {
      this.state.controls.isPaused = !this.state.controls.isPaused;
    });
    this.speedPlayBtn?.addEventListener("click", () => {
      this.state.controls.isPaused = false;
      this.state.controls.timeScale = 1.0;
    });
    this.speedFastBtn?.addEventListener("click", () => {
      this.state.controls.isPaused = false;
      // v0.8.2 Round-0 02c-speedrunner — FF target 2.0 → 4.0 (x4). Coordinated
      // with simStepper's clamp widening from 3 → 4 so the button actually
      // reaches the requested rate. Ceiling held at 4 per orchestrator
      // arbitration (Phase 10 determinism: accumulatorSec 0.5s + capSteps still
      // protect against spiral-of-death).
      this.state.controls.timeScale = 4.0;
    });
  }

  render() {
    const { state } = this;
    const frontier = getFrontierStatus(state);
    const weather = getWeatherInsight(state);
    const logistics = getLogisticsInsight(state);
    const traffic = getTrafficInsight(state);
    const aiInsight = getAiInsight(state);
    const digest = getCausalDigest(state);
    const latestWarningEvent = Array.isArray(state.metrics.warningLog) && state.metrics.warningLog.length > 0
      ? state.metrics.warningLog[state.metrics.warningLog.length - 1]
      : null;
    const latestWarningText = latestWarningEvent?.message
      ?? (state.metrics.warnings.length > 0 ? state.metrics.warnings[state.metrics.warnings.length - 1] : "");

    this.foodVal.textContent = Math.floor(state.resources.food);
    this.woodVal.textContent = Math.floor(state.resources.wood);
    if (this.stoneVal) this.stoneVal.textContent = Math.floor(state.resources.stone);
    if (this.herbsVal) this.herbsVal.textContent = Math.floor(state.resources.herbs);
    if (this.mealsVal) this.mealsVal.textContent = Math.floor(state.resources.meals);
    if (this.toolsVal) this.toolsVal.textContent = Math.floor(state.resources.tools);
    if (this.medicineVal) this.medicineVal.textContent = Math.floor(state.resources.medicine);

    // --- v0.8.2 Round-0 01d: Resource rate badges (/min) ---
    const RATE_WINDOW_SEC = 3;
    const simSec = Number(state.metrics?.timeSec ?? 0);
    const snap = {
      food: Number(state.resources.food ?? 0),
      wood: Number(state.resources.wood ?? 0),
      stone: Number(state.resources.stone ?? 0),
      herbs: Number(state.resources.herbs ?? 0),
      meals: Number(state.resources.meals ?? 0),
      tools: Number(state.resources.tools ?? 0),
      medicine: Number(state.resources.medicine ?? 0),
      t: simSec,
    };
    if (this._lastResourceSnapshot == null) {
      this._lastResourceSnapshot = snap;
      this._lastSnapshotSimSec = simSec;
    } else if (simSec - this._lastSnapshotSimSec >= RATE_WINDOW_SEC) {
      const prev = this._lastResourceSnapshot;
      const dt = Math.max(0.0001, simSec - prev.t);
      this._lastComputedRates = {
        food: ((snap.food - prev.food) / dt) * 60,
        wood: ((snap.wood - prev.wood) / dt) * 60,
        stone: ((snap.stone - prev.stone) / dt) * 60,
        herbs: ((snap.herbs - prev.herbs) / dt) * 60,
        meals: ((snap.meals - prev.meals) / dt) * 60,
        tools: ((snap.tools - prev.tools) / dt) * 60,
        medicine: ((snap.medicine - prev.medicine) / dt) * 60,
      };
      this._lastResourceSnapshot = snap;
      this._lastSnapshotSimSec = simSec;
    }
    const formatRate = (rate) => {
      if (rate == null || !Number.isFinite(rate)) return "—";
      if (Math.abs(rate) < 0.05) return "= 0.0/min";
      return rate >= 0
        ? `▲ +${rate.toFixed(1)}/min`
        : `▼ ${rate.toFixed(1)}/min`;
    };
    const rates = this._lastComputedRates;
    if (this.foodRateVal) this.foodRateVal.textContent = formatRate(rates?.food);
    if (this.woodRateVal) this.woodRateVal.textContent = formatRate(rates?.wood);
    if (this.stoneRateVal) this.stoneRateVal.textContent = formatRate(rates?.stone);
    if (this.herbsRateVal) this.herbsRateVal.textContent = formatRate(rates?.herbs);
    if (this.mealsRateVal) this.mealsRateVal.textContent = formatRate(rates?.meals);
    if (this.toolsRateVal) this.toolsRateVal.textContent = formatRate(rates?.tools);
    if (this.medicineRateVal) this.medicineRateVal.textContent = formatRate(rates?.medicine);

    this.foodBar.style.width = `${Math.min(100, (state.resources.food / 180) * 100)}%`;
    this.woodBar.style.width = `${Math.min(100, (state.resources.wood / 180) * 100)}%`;
    if (this.stoneBar) this.stoneBar.style.width = `${Math.min(100, (state.resources.stone / 80) * 100)}%`;
    if (this.herbsBar) this.herbsBar.style.width = `${Math.min(100, (state.resources.herbs / 50) * 100)}%`;
    if (this.mealsBar) this.mealsBar.style.width = `${Math.min(100, (state.resources.meals / 50) * 100)}%`;
    if (this.toolsBar) this.toolsBar.style.width = `${Math.min(100, (state.resources.tools / 10) * 100)}%`;
    if (this.medicineBar) this.medicineBar.style.width = `${Math.min(100, (state.resources.medicine / 30) * 100)}%`;

    const stats = state.metrics.populationStats ?? {
      workers: state.agents.filter((a) => a.type === "WORKER").length,
      visitors: state.agents.filter((a) => a.type === "VISITOR").length,
      herbivores: state.animals.filter((a) => a.kind === "HERBIVORE").length,
      predators: state.animals.filter((a) => a.kind === "PREDATOR").length,
      farmers: state.agents.filter((a) => a.type === "WORKER" && a.role === "FARM").length,
      loggers: state.agents.filter((a) => a.type === "WORKER" && a.role === "WOOD").length,
      totalEntities: state.agents.length + state.animals.length,
    };

    this.workersVal.textContent = String(stats.workers);
    this.visitorsVal.textContent = String(stats.visitors);
    this.herbivoresVal.textContent = String(stats.herbivores);
    this.predatorsVal.textContent = String(stats.predators);
    this.farmersVal.textContent = String(stats.farmers);
    this.loggersVal.textContent = String(stats.loggers);
    if (this.stonersVal) this.stonersVal.textContent = String(stats.stoneMiners ?? 0);
    if (this.herbistsVal) this.herbistsVal.textContent = String(stats.herbGatherers ?? 0);
    if (this.cooksVal) this.cooksVal.textContent = String(stats.cooks ?? 0);
    if (this.smithsVal) this.smithsVal.textContent = String(stats.smiths ?? 0);
    if (this.herbalistsVal) this.herbalistsVal.textContent = String(stats.herbalists ?? 0);
    if (this.haulersVal) this.haulersVal.textContent = String(stats.haulers ?? 0);

    this.weatherVal.textContent = weather.summary;
    if (this.mapVal) {
      this.mapVal.textContent = `${state.world.mapTemplateName} (seed ${state.world.mapSeed})`;
    }
    if (this.doctrineVal) this.doctrineVal.textContent = state.gameplay.doctrine;
    if (this.prosperityVal) this.prosperityVal.textContent = state.gameplay.prosperity.toFixed(1);
    if (this.threatVal) this.threatVal.textContent = state.gameplay.threat.toFixed(1);
    if (this.objectiveVal) {
      // v0.8.0 Phase 4 — Survival Mode: display the running survival score and
      // elapsed time instead of objective progress. Keep the legacy headline
      // digest as secondary context. objectives[] is always empty in survival
      // mode (the scenario objective pipeline was retired), so we unconditionally
      // render the survival status line here.
      // v0.8.2 Round-0 01b (P1): when the run is not active (menu / end overlay
      // is up), the simulation is paused, so we must also FREEZE the rendered
      // timer/score. Otherwise the HUD creates a "game is running behind the
      // menu" visual illusion (reviewer feedback 02, P1 root cause).
      const totalSec = Math.max(0, Math.floor(Number(state.metrics?.timeSec ?? 0)));
      const inActive = state.session?.phase === "active" && totalSec > 0;
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const formatted = inActive
        ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : "--:--:--";
      const score = inActive ? Math.floor(Number(state.metrics?.survivalScore ?? 0)) : "\u2014";
      this.objectiveVal.textContent = `Survived ${formatted} · Score ${score} | ${digest.headline}`;
    }
    const proxyModel = state.metrics.proxyModel || "-";
    this.aiModeVal.textContent = `${state.ai.enabled ? "on" : "off"} / ${state.ai.mode} (${state.metrics.proxyHealth ?? "unknown"}, ${proxyModel})`;
    const fmtSec = (sec) => (sec >= 0 ? `${sec.toFixed(1)}s` : "-");
    if (this.aiEnvVal) {
      this.aiEnvVal.textContent = `${state.ai.lastEnvironmentSource} @ ${fmtSec(state.ai.lastEnvironmentResultSec)} | ${aiInsight.environmentFocus}`;
    }
    if (this.aiPolicyVal) {
      this.aiPolicyVal.textContent = `${state.ai.lastPolicySource} @ ${fmtSec(state.ai.lastPolicyResultSec)} | workers=${digest.workerFocus}`;
    }
    if (this.aiDecisionVal) {
      this.aiDecisionVal.textContent = aiInsight.summary;
    }
    if (this.deathVal) {
      const deathsTotal = Number(state.metrics.deathsTotal ?? 0);
      const starvation = Number(state.metrics.deathsByReason?.starvation ?? 0);
      const predation = Number(state.metrics.deathsByReason?.predation ?? 0);
      const aggregate = `${deathsTotal} (starve ${starvation} / pred ${predation})`;

      // v0.8.2 Round-0 01e-innovation (Step 5) — personalised obituary flash.
      // When deathsTotal advances between renders, search `state.agents` for
      // the most recently-died worker (highest `deathSec`) and build a short
      // narrative using their displayName + backstory + deathReason. Show it
      // for OBITUARY_FLASH_MS milliseconds, then revert to the aggregate.
      const OBITUARY_FLASH_MS = 8000;
      const now = (typeof performance !== "undefined" && typeof performance.now === "function")
        ? performance.now()
        : Date.now();
      if (deathsTotal > this._lastDeathsSeen) {
        const candidates = Array.isArray(state.agents) ? state.agents : [];
        let latestDead = null;
        let latestDeathSec = -Infinity;
        for (const agent of candidates) {
          if (!agent || agent.alive) continue;
          const sec = Number(agent.deathSec ?? -1);
          if (sec > latestDeathSec) {
            latestDeathSec = sec;
            latestDead = agent;
          }
        }
        if (latestDead) {
          const name = String(latestDead.displayName ?? latestDead.id ?? "Unknown");
          const backstory = String(latestDead.backstory ?? "").trim();
          const reason = String(latestDead.deathReason ?? "unknown cause").trim() || "unknown cause";
          const tx = Math.floor(Number(latestDead.x ?? 0));
          const tz = Math.floor(Number(latestDead.z ?? 0));
          const bio = backstory ? ` (${backstory})` : "";
          this._obituaryText = `${name}${bio} died of ${reason} at (${tx},${tz})`;
          this._obituaryUntilMs = now + OBITUARY_FLASH_MS;
        }
        this._lastDeathsSeen = deathsTotal;
      }
      if (this._obituaryText && now < this._obituaryUntilMs) {
        this.deathVal.textContent = this._obituaryText;
        this.deathVal.setAttribute?.("title", `${this._obituaryText} · total ${aggregate}`);
      } else {
        this.deathVal.textContent = aggregate;
        this.deathVal.setAttribute?.("title", "Deaths by cause (starvation / predation)");
        this._obituaryText = "";
      }
    }

    // v0.8.2 Round-0 01e-innovation (Step 4) — Storyteller strip render.
    // Keeps the computation side-effect-free (computeStorytellerStripText)
    // and just writes the result into the DOM ref captured in the
    // constructor. The text communicates fallback-as-feature rather than
    // going silent when no LLM is connected.
    if (this.storytellerStrip) {
      const text = computeStorytellerStripText(state);
      if (this.storytellerStrip.textContent !== text) {
        this.storytellerStrip.textContent = text;
        this.storytellerStrip.setAttribute?.("title", text);
      }
    }
    this.eventVal.textContent = getEventInsight(state);
    this.timeVal.textContent = `${state.metrics.timeSec.toFixed(1)}s`;
    if (this.toolVal) this.toolVal.textContent = state.controls.tool;
    if (this.simVal) {
      const phase = state.session?.phase ?? "menu";
      const mode = phase !== "active" ? "locked" : state.controls.isPaused ? "paused" : "running";
      this.simVal.textContent = `phase=${phase} | ${mode} | steps=${state.metrics.simStepsThisFrame}`;
    }
    if (this.actionVal) {
      const actionKind = state.controls.actionMessage ? (state.controls.actionKind ?? "info") : digest.severity;
      this.actionVal.textContent = state.controls.actionMessage || digest.action || state.gameplay.objectiveHint || frontier.summary;
      this.actionVal.setAttribute("data-kind", actionKind);
    }
    if (this.visualModeVal) {
      const icons = state.controls.showTileIcons ? "icons:on" : "icons:off";
      const sprites = state.controls.showUnitSprites ? "sprites:on" : "sprites:off";
      this.visualModeVal.textContent = `${state.controls.visualPreset} | ${icons} | ${sprites}`;
    }
    const totalAgents = stats.totalEntities;
    if (this.fpsVal) this.fpsVal.textContent = state.metrics.averageFps.toFixed(1);
    if (this.frameVal) this.frameVal.textContent = `${state.metrics.frameMs.toFixed(2)} ms`;
    if (this.agentVal) this.agentVal.textContent = String(totalAgents);

    if (this.statusFood) this.statusFood.textContent = Math.floor(state.resources.food);
    if (this.statusWood) this.statusWood.textContent = Math.floor(state.resources.wood);
    if (this.statusStone) this.statusStone.textContent = Math.floor(state.resources.stone);
    if (this.statusHerbs) this.statusHerbs.textContent = Math.floor(state.resources.herbs);
    if (this.statusWorkers) this.statusWorkers.textContent = state.metrics?.populationStats?.workers ?? 0;
    if (this.statusMeals) this.statusMeals.textContent = Math.floor(state.resources.meals);
    if (this.statusTools) this.statusTools.textContent = Math.floor(state.resources.tools);
    if (this.statusMedicine) this.statusMedicine.textContent = Math.floor(state.resources.medicine);
    if (this.statusProsperity) this.statusProsperity.textContent = (state.gameplay?.prosperity ?? 0).toFixed(0);
    if (this.statusThreat) this.statusThreat.textContent = (state.gameplay?.threat ?? 0).toFixed(0);

    const foodPct = Math.min(100, (state.resources.food / 120) * 100);
    const woodPct = Math.min(100, (state.resources.wood / 120) * 100);
    const stonePct = Math.min(100, (state.resources.stone / 80) * 100);
    const herbsPct = Math.min(100, (state.resources.herbs / 50) * 100);
    const prosperityPct = Math.min(100, state.gameplay?.prosperity ?? 0);
    const threatPct = Math.min(100, state.gameplay?.threat ?? 0);

    if (this.statusFoodBar) this.statusFoodBar.style.width = `${foodPct}%`;
    if (this.statusWoodBar) this.statusWoodBar.style.width = `${woodPct}%`;
    if (this.statusStoneBar) this.statusStoneBar.style.width = `${stonePct}%`;
    if (this.statusHerbsBar) this.statusHerbsBar.style.width = `${herbsPct}%`;
    if (this.statusProsperityBar) this.statusProsperityBar.style.width = `${prosperityPct}%`;
    if (this.statusThreatBar) this.statusThreatBar.style.width = `${threatPct}%`;

    if (this.hudFood) this.hudFood.setAttribute("data-urgency", state.resources.food < 20 ? "low" : "");
    if (this.hudWood) this.hudWood.setAttribute("data-urgency", state.resources.wood < 15 ? "low" : "");
    if (this.hudWorkers) this.hudWorkers.setAttribute("data-urgency", (state.metrics?.populationStats?.workers ?? 0) <= 3 ? "low" : "");

    if (this.statusObjective) {
      // v0.8.0 Phase 4 — Survival Mode badge. Shows
      // "Survived HH:MM:SS  Score N · Dev D/100" once DevIndex is live.
      // v0.8.2 Round-0 01b (P1): freeze the visible ticker when the session is
      // not active so the menu/end overlays don't create the illusion that the
      // simulation is still running behind them.
      const totalSec = Math.max(0, Math.floor(Number(state.metrics?.timeSec ?? 0)));
      const inActive = state.session?.phase === "active" && totalSec > 0;
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const ss = String(s).padStart(2, "0");
      const timeText = inActive ? `${hh}:${mm}:${ss}` : "--:--:--";
      const score = inActive ? Math.floor(Number(state.metrics?.survivalScore ?? 0)) : "\u2014";
      const devTicks = Number(state.gameplay?.devIndexTicksComputed ?? 0);
      const devScore = Math.round(Number(state.gameplay?.devIndexSmoothed ?? 0));
      const devSuffix = inActive && devTicks > 0 ? `  ·  Dev ${devScore}/100` : "";
      this.statusObjective.textContent = `Survived ${timeText}  Score ${score}${devSuffix}`;
      // v0.8.2 Round-0 02c-speedrunner (Step 6) — DevIndex 6-dim attribution as
      // hover tooltip on #statusObjective. Speedrunner feedback: "Dev only went
      // down when I built things" — exposing which dim dragged the composite
      // gives the player a faster causal loop than the Debug panel. Prefixed
      // with "Dev breakdown:" so we don't overwrite the pre-existing semantic
      // title ("Survival time and running score…").
      const dims = state.gameplay?.devIndexDims ?? {};
      const dimEntries = Object.entries(dims)
        .filter(([, v]) => Number.isFinite(Number(v)))
        .map(([k, v]) => `${k} ${Math.round(Number(v))}`);
      const devTooltip = dimEntries.length > 0
        ? `Dev breakdown: ${dimEntries.join(" · ")}`
        : "Survival time and running score (Phase 4 endless mode)";
      this.statusObjective.setAttribute?.("title", devTooltip);
    }
    // v0.8.2 Round-0 02c-speedrunner (Step 5) — Compact scenario-progress
    // ribbon. Surfaces the `scenario.targets` counts (routes/depots/wh/farms/
    // lumbers/walls) that were previously only visible in the Debug panel so
    // the HUD shows the causal chain between "what the scenario wants" and
    // "what Score rewards". Survival-mode returns "endless · no active
    // objectives"; see WorldExplain.getScenarioProgressCompact.
    if (this.statusScenario) {
      this.statusScenario.textContent = getScenarioProgressCompact(state);
    }
    // v0.8.2 Round-0 02c-speedrunner (Step 5b) — Per-rule score breakdown.
    // Renders BALANCE.survivalScorePerSecond/perBirth/perDeath alongside
    // running subtotals from metrics.timeSec/birthsTotal/deathsTotal so the
    // player can map HUD actions → score deltas without opening Debug.
    if (this.statusScoreBreak) {
      const br = getSurvivalScoreBreakdown(state);
      const rules = `+${br.perSec}/s · +${br.perBirth}/birth · -${br.perDeath}/death`;
      const subtotals = `lived ${br.subtotalSec} · births ${br.subtotalBirths} · deaths -${br.subtotalDeaths}`;
      const text = `${rules} (${subtotals})`;
      this.statusScoreBreak.textContent = text;
      this.statusScoreBreak.setAttribute?.("title", text);
    }
    // v0.8.2 Round-0 02e-indie-critic — render scenario headline in statusBar.
    // Pulls `scenario.title` + `scenario.summary` (same copy reviewer praised
    // on the pre-game menu) and mirrors it into #statusScenarioHeadline. We
    // only touch the DOM when the text changes to avoid layout thrash, and
    // hide the node outright when there is no active scenario (Quick Start).
    if (this.statusScenarioHeadline) {
      const scenario = state?.gameplay?.scenario ?? {};
      const title = String(scenario.title ?? "").trim();
      const summary = String(scenario.summary ?? "").trim();
      let headline;
      if (title && summary) headline = `${title} — ${summary}`;
      else if (title) headline = title;
      else headline = "";
      if (headline !== this._lastScenarioHeadlineText) {
        if (headline) {
          this.statusScenarioHeadline.textContent = headline;
          this.statusScenarioHeadline.setAttribute("title", headline);
          this.statusScenarioHeadline.hidden = false;
        } else {
          this.statusScenarioHeadline.textContent = "";
          this.statusScenarioHeadline.setAttribute("title", "Current scenario briefing");
          this.statusScenarioHeadline.hidden = true;
        }
        this._lastScenarioHeadlineText = headline;
      }
    }
    if (this.statusAction) {
      if (state.controls.actionMessage) {
        this.statusAction.textContent = state.controls.actionMessage;
        // v0.8.2 Round-0 01d — mirror textContent into the native `title`
        // attribute so the browser tooltip shows the full message even when
        // ellipsis truncates the visible text (40-char cap at max-width 420px).
        this.statusAction.setAttribute("title", state.controls.actionMessage);
        this.statusAction.style.opacity = "1";
        this.statusAction.style.background = state.controls.actionKind === "error" ? "rgba(244,67,54,0.3)" : "rgba(76,175,80,0.3)";
        this.statusAction.style.color = state.controls.actionKind === "error" ? "#ff8a80" : "#a5d6a7";
        // v0.8.2 Round-0 01b — pulse the status-bar action chip whenever the
        // message text changes, so eye-gazes anchored on the canvas still
        // register the feedback channel. Only triggered on value transitions
        // (not every render); compact-mode CSS neutralises the scale pulse.
        if (this.lastActionMessage !== state.controls.actionMessage) {
          try {
            // Classic "retrigger animation" trick: remove, force reflow, re-add.
            this.statusAction.classList?.remove("flash-action");
            // Reading offsetWidth forces a reflow so the keyframe restarts.
            void this.statusAction.offsetWidth;
            this.statusAction.classList?.add("flash-action");
          } catch (_err) {
            // Headless test nodes may not implement classList; ignore.
          }
          this.lastActionMessage = state.controls.actionMessage;
        }
      } else {
        this.statusAction.setAttribute("title", "");
        this.statusAction.style.opacity = "0";
        this.lastActionMessage = "";
      }
    }

    if (state.ai.lastEnvironmentError || state.ai.lastPolicyError) {
      const envErr = state.ai.lastEnvironmentError ? `env=${state.ai.lastEnvironmentError}` : "";
      const policyErr = state.ai.lastPolicyError ? `policy=${state.ai.lastPolicyError}` : "";
      const errorText = [envErr, policyErr].filter(Boolean).join(" | ");
      this.warningVal.textContent = `AI: ${errorText}`;
      this.warningVal.setAttribute("data-kind", "error");
    } else if (state.metrics.proxyHealth === "down") {
      this.warningVal.textContent = "AI proxy is unreachable; running fallback.";
      this.warningVal.setAttribute("data-kind", "error");
    } else if (latestWarningEvent?.level === "error" && latestWarningText) {
      this.warningVal.textContent = latestWarningText;
      this.warningVal.setAttribute("data-kind", "error");
    } else if (traffic.hasHotspots) {
      this.warningVal.textContent = digest.warning || traffic.summary;
      this.warningVal.setAttribute("data-kind", digest.severity === "error" ? "error" : "info");
    } else if (latestWarningText && !shouldSuppressUserWarning(latestWarningEvent, latestWarningText)) {
      this.warningVal.textContent = latestWarningText;
      this.warningVal.setAttribute("data-kind", "info");
    } else {
      this.warningVal.textContent = digest.warning || logistics || frontier.summary;
      this.warningVal.setAttribute("data-kind", digest.severity === "error" ? "error" : "info");
    }

    if (this.gameTimer) {
      const totalSec = Math.floor(state.metrics.timeSec ?? 0);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      this.gameTimer.textContent = `${min}:${sec.toString().padStart(2, "0")}`;
    }
    const paused = state.controls.isPaused;
    const fast = (state.controls.timeScale ?? 1) > 1.2;
    this.speedPauseBtn?.classList.toggle("active", paused);
    this.speedPlayBtn?.classList.toggle("active", !paused && !fast);
    this.speedFastBtn?.classList.toggle("active", fast && !paused);
  }
}
