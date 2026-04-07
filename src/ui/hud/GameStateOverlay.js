import { SHORTCUT_HINT } from "../../app/shortcutResolver.js";

function formatObjectives(state) {
  const gameplay = state?.gameplay ?? {};
  const scenario = gameplay.scenario ?? {};
  const objectives = gameplay.objectives ?? [];
  const objectiveIndex = gameplay.objectiveIndex ?? 0;
  if (!Array.isArray(objectives) || objectives.length === 0) return `No objectives\n\nControls\n${SHORTCUT_HINT}`;
  const objectiveLines = objectives
    .map((objective, idx) => {
      const label = objective.completed ? "DONE" : idx === objectiveIndex ? "CURRENT" : "NEXT";
      const progress = Number(objective.progress ?? 0).toFixed(0);
      return `${label} - ${objective.title} (${progress}%)`;
    })
    .join("\n");
  const sections = [
    scenario.title ? `Map: ${scenario.title}` : null,
    `Objectives\n${objectiveLines}`,
    gameplay.objectiveHint ? `Tip: ${gameplay.objectiveHint}` : null,
    `Controls\n${SHORTCUT_HINT}`,
  ].filter(Boolean);
  return sections.join("\n\n");
}

function formatOverlayMeta(state) {
  const scenario = state?.gameplay?.scenario ?? {};
  const family = String(scenario.family ?? "").replaceAll("_", " ");
  if (!scenario.title && !family) return "Quick Start Guide";
  if (!family) return scenario.title;
  return `${scenario.title} · ${family}`;
}

function formatOutcomeMeta(state) {
  const scenarioTitle = state?.gameplay?.scenario?.title ?? "Scenario";
  const totalObjectives = Number(state?.gameplay?.objectives?.length ?? 0);
  const completedObjectives = (state?.gameplay?.objectives ?? []).filter((objective) => objective.completed).length;
  return `${scenarioTitle} · objectives ${completedObjectives}/${totalObjectives}`;
}

export class GameStateOverlay {
  constructor(state, handlers = {}) {
    this.state = state;
    this.handlers = handlers;

    this.root = document.getElementById("gameStateOverlay");
    this.menuPanel = document.getElementById("overlayMenuPanel");
    this.endPanel = document.getElementById("overlayEndPanel");
    this.menuTitle = document.getElementById("overlayMenuTitle");
    this.menuLead = document.getElementById("overlayMenuLead");
    this.menuMeta = document.getElementById("overlayMenuMeta");
    this.menuSummary = document.getElementById("overlayMenuSummary");
    this.endMeta = document.getElementById("overlayEndMeta");
    this.endTitle = document.getElementById("overlayEndTitle");
    this.endReason = document.getElementById("overlayEndReason");
    this.endStats = document.getElementById("overlayEndStats");

    const startBtn = document.getElementById("overlayStartBtn");
    const resetFromMenuBtn = document.getElementById("overlayResetFromMenuBtn");
    const restartBtn = document.getElementById("overlayRestartBtn");
    const resetBtn = document.getElementById("overlayResetBtn");

    startBtn?.addEventListener("click", () => this.handlers.onStart?.());
    resetFromMenuBtn?.addEventListener("click", () => this.handlers.onReset?.());
    restartBtn?.addEventListener("click", () => this.handlers.onRestart?.());
    resetBtn?.addEventListener("click", () => this.handlers.onReset?.());
  }

  render(session) {
    if (!this.root) return;
    const phase = session?.phase ?? "menu";
    const isMenu = phase === "menu";
    const isEnd = phase === "end";
    const isInteractive = isMenu || isEnd;
    this.root.hidden = !isInteractive;
    this.root.setAttribute("data-phase", phase);
    this.root.setAttribute("aria-hidden", isInteractive ? "false" : "true");
    this.root.style.display = isInteractive ? "flex" : "none";
    this.root.style.pointerEvents = isInteractive ? "auto" : "none";
    const statusBar = document.getElementById("statusBar");
    if (statusBar) statusBar.style.display = isInteractive ? "none" : "flex";
    if (this.menuPanel) this.menuPanel.hidden = !isMenu;
    if (this.endPanel) this.endPanel.hidden = !isEnd;

    if (this.menuSummary) {
      this.menuSummary.textContent = formatObjectives(this.state);
    }
    if (this.menuTitle) {
      this.menuTitle.textContent = "Project Utopia Beta";
    }
    if (this.menuLead) {
      this.menuLead.textContent = this.state.gameplay?.scenario?.summary
        ?? "Build and manage a colony. Place farms for food, lumber mills for wood, warehouses for storage, and roads to connect them.";
    }
    if (this.menuMeta) {
      this.menuMeta.textContent = formatOverlayMeta(this.state);
    }

    if (isEnd) {
      const outcome = session?.outcome ?? "loss";
      if (this.endTitle) {
        this.endTitle.textContent = outcome === "win" ? "Victory" : "Defeat";
      }
      if (this.endReason) {
        this.endReason.textContent = session?.reason ?? "";
      }
      if (this.endMeta) {
        this.endMeta.textContent = formatOutcomeMeta(this.state);
      }
      if (this.endStats) {
        const workers = Number(this.state.metrics.populationStats?.workers ?? 0);
        const total = Number(this.state.metrics.populationStats?.totalEntities ?? (this.state.agents.length + this.state.animals.length));
        const deaths = Number(this.state.metrics.deathsTotal ?? 0);
        const timeSec = Number(this.state.metrics.timeSec ?? 0).toFixed(1);
        this.endStats.textContent = [
          `Sim Time: ${timeSec}s`,
          `Workers: ${workers}`,
          `Total Entities: ${total}`,
          `Prosperity: ${Number(this.state.gameplay?.prosperity ?? 0).toFixed(1)}`,
          `Threat: ${Number(this.state.gameplay?.threat ?? 0).toFixed(1)}`,
          `Deaths: ${deaths}`,
        ].join("\n");
      }
    }
  }
}
