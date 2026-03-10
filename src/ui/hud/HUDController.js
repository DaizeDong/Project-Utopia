import { getAiInsight, getCausalDigest, getEventInsight, getFrontierStatus, getLogisticsInsight, getTrafficInsight, getWeatherInsight } from "../interpretation/WorldExplain.js";

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
    this.foodBar = document.getElementById("foodBar");
    this.woodBar = document.getElementById("woodBar");

    this.workersVal = document.getElementById("workersVal");
    this.visitorsVal = document.getElementById("visitorsVal");
    this.herbivoresVal = document.getElementById("herbivoresVal");
    this.predatorsVal = document.getElementById("predatorsVal");
    this.farmersVal = document.getElementById("farmersVal");
    this.loggersVal = document.getElementById("loggersVal");

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

    this.foodBar.style.width = `${Math.min(100, (state.resources.food / 180) * 100)}%`;
    this.woodBar.style.width = `${Math.min(100, (state.resources.wood / 180) * 100)}%`;

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

    this.weatherVal.textContent = weather.summary;
    if (this.mapVal) {
      this.mapVal.textContent = `${state.world.mapTemplateName} (seed ${state.world.mapSeed})`;
    }
    if (this.doctrineVal) this.doctrineVal.textContent = state.gameplay.doctrine;
    if (this.prosperityVal) this.prosperityVal.textContent = state.gameplay.prosperity.toFixed(1);
    if (this.threatVal) this.threatVal.textContent = state.gameplay.threat.toFixed(1);
    if (this.objectiveVal) {
      const currentObjective = state.gameplay.objectives[state.gameplay.objectiveIndex];
      this.objectiveVal.textContent = currentObjective
        ? `${currentObjective.title} (${currentObjective.progress.toFixed(0)}%) | ${digest.headline}`
        : "All objectives completed";
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
      this.deathVal.textContent = `${deathsTotal} (starve ${starvation} / pred ${predation})`;
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
  }
}
