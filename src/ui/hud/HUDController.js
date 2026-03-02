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

    this.foodVal.textContent = Math.floor(state.resources.food);
    this.woodVal.textContent = Math.floor(state.resources.wood);

    this.foodBar.style.width = `${Math.min(100, (state.resources.food / 180) * 100)}%`;
    this.woodBar.style.width = `${Math.min(100, (state.resources.wood / 180) * 100)}%`;

    const workers = state.agents.filter((a) => a.type === "WORKER");
    const visitors = state.agents.filter((a) => a.type === "VISITOR");
    const herbivores = state.animals.filter((a) => a.kind === "HERBIVORE");
    const predators = state.animals.filter((a) => a.kind === "PREDATOR");

    const farmers = workers.filter((w) => w.role === "FARM").length;
    const loggers = workers.filter((w) => w.role === "WOOD").length;

    this.workersVal.textContent = String(workers.length);
    this.visitorsVal.textContent = String(visitors.length);
    this.herbivoresVal.textContent = String(herbivores.length);
    this.predatorsVal.textContent = String(predators.length);
    this.farmersVal.textContent = String(farmers);
    this.loggersVal.textContent = String(loggers);

    this.weatherVal.textContent = `${state.weather.current} (${Math.max(0, state.weather.timeLeftSec).toFixed(0)}s)`;
    if (this.mapVal) {
      this.mapVal.textContent = `${state.world.mapTemplateName} (seed ${state.world.mapSeed})`;
    }
    if (this.doctrineVal) this.doctrineVal.textContent = state.gameplay.doctrine;
    if (this.prosperityVal) this.prosperityVal.textContent = state.gameplay.prosperity.toFixed(1);
    if (this.threatVal) this.threatVal.textContent = state.gameplay.threat.toFixed(1);
    if (this.objectiveVal) {
      const currentObjective = state.gameplay.objectives[state.gameplay.objectiveIndex];
      this.objectiveVal.textContent = currentObjective
        ? `${currentObjective.title} (${currentObjective.progress.toFixed(0)}%)`
        : "All objectives completed";
    }
    this.aiModeVal.textContent = `${state.ai.enabled ? "on" : "off"} / ${state.ai.mode}`;
    const fmtSec = (sec) => (sec >= 0 ? `${sec.toFixed(1)}s` : "-");
    if (this.aiEnvVal) {
      this.aiEnvVal.textContent = `${state.ai.lastEnvironmentSource} @ ${fmtSec(state.ai.lastEnvironmentResultSec)} (llm ${state.ai.environmentLlmCount}/${state.ai.environmentDecisionCount})`;
    }
    if (this.aiPolicyVal) {
      this.aiPolicyVal.textContent = `${state.ai.lastPolicySource} @ ${fmtSec(state.ai.lastPolicyResultSec)} (llm ${state.ai.policyLlmCount}/${state.ai.policyDecisionCount})`;
    }
    if (this.aiDecisionVal) {
      this.aiDecisionVal.textContent = `env req ${fmtSec(state.ai.lastEnvironmentDecisionSec)} / policy req ${fmtSec(state.ai.lastPolicyDecisionSec)}`;
    }
    this.eventVal.textContent = state.events.active.length > 0
      ? state.events.active.map((e) => `${e.type}:${e.status}`).join(", ")
      : "none";
    this.timeVal.textContent = `${state.metrics.timeSec.toFixed(1)}s`;
    if (this.toolVal) this.toolVal.textContent = state.controls.tool;
    if (this.simVal) {
      const mode = state.controls.isPaused ? "paused" : "running";
      this.simVal.textContent = `${mode} | steps=${state.metrics.simStepsThisFrame}`;
    }
    if (this.actionVal) this.actionVal.textContent = state.controls.actionMessage || "Ready";
    if (this.visualModeVal) {
      const icons = state.controls.showTileIcons ? "icons:on" : "icons:off";
      const sprites = state.controls.showUnitSprites ? "sprites:on" : "sprites:off";
      this.visualModeVal.textContent = `${state.controls.visualPreset} | ${icons} | ${sprites}`;
    }
    const totalAgents = state.agents.length + state.animals.length;
    if (this.fpsVal) this.fpsVal.textContent = state.metrics.averageFps.toFixed(1);
    if (this.frameVal) this.frameVal.textContent = `${state.metrics.frameMs.toFixed(2)} ms`;
    if (this.agentVal) this.agentVal.textContent = String(totalAgents);

    if (state.ai.lastEnvironmentError || state.ai.lastPolicyError) {
      const envErr = state.ai.lastEnvironmentError ? `env=${state.ai.lastEnvironmentError}` : "";
      const policyErr = state.ai.lastPolicyError ? `policy=${state.ai.lastPolicyError}` : "";
      const errorText = [envErr, policyErr].filter(Boolean).join(" | ");
      this.warningVal.textContent = `AI: ${errorText}`;
    } else if (state.metrics.warnings.length > 0) {
      this.warningVal.textContent = state.metrics.warnings[state.metrics.warnings.length - 1];
    } else {
      this.warningVal.textContent = "none";
    }
  }
}
