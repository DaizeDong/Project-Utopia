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
    this.aiModeVal = document.getElementById("aiModeVal");
    this.eventVal = document.getElementById("eventVal");
    this.timeVal = document.getElementById("timeVal");
    this.warningVal = document.getElementById("warningVal");
    this.fpsVal = document.getElementById("fpsVal");
    this.frameVal = document.getElementById("frameVal");
    this.agentVal = document.getElementById("agentVal");
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
    this.aiModeVal.textContent = `${state.ai.enabled ? "on" : "off"} / ${state.ai.mode}`;
    this.eventVal.textContent = state.events.active.length > 0
      ? state.events.active.map((e) => `${e.type}:${e.status}`).join(", ")
      : "none";
    this.timeVal.textContent = `${state.metrics.timeSec.toFixed(1)}s`;
    const totalAgents = state.agents.length + state.animals.length;
    if (this.fpsVal) this.fpsVal.textContent = state.metrics.averageFps.toFixed(1);
    if (this.frameVal) this.frameVal.textContent = `${state.metrics.frameMs.toFixed(2)} ms`;
    if (this.agentVal) this.agentVal.textContent = String(totalAgents);

    if (state.ai.lastError) {
      this.warningVal.textContent = `AI: ${state.ai.lastError}`;
    } else if (state.metrics.warnings.length > 0) {
      this.warningVal.textContent = state.metrics.warnings[state.metrics.warnings.length - 1];
    } else {
      this.warningVal.textContent = "none";
    }
  }
}
