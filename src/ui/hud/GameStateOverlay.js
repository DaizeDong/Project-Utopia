import { SHORTCUT_HINT } from "../../app/shortcutResolver.js";

function formatObjectives(gameplay = {}) {
  const objectives = gameplay.objectives ?? [];
  const objectiveIndex = gameplay.objectiveIndex ?? 0;
  if (!Array.isArray(objectives) || objectives.length === 0) return `No objectives\n\nControls\n${SHORTCUT_HINT}`;
  const objectiveLines = objectives
    .map((objective, idx) => {
      const state = objective.completed ? "done" : idx === objectiveIndex ? "active" : "pending";
      const progress = Number(objective.progress ?? 0).toFixed(0);
      return `${state.toUpperCase()} - ${objective.title} (${progress}%)`;
    })
    .join("\n");
  const hint = gameplay.objectiveHint ? `\n\nHint\n${gameplay.objectiveHint}` : "";
  return `${objectiveLines}${hint}\n\nControls\n${SHORTCUT_HINT}`;
}

export class GameStateOverlay {
  constructor(state, handlers = {}) {
    this.state = state;
    this.handlers = handlers;

    this.root = document.getElementById("gameStateOverlay");
    this.menuPanel = document.getElementById("overlayMenuPanel");
    this.endPanel = document.getElementById("overlayEndPanel");
    this.menuSummary = document.getElementById("overlayMenuSummary");
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
    if (this.menuPanel) this.menuPanel.hidden = !isMenu;
    if (this.endPanel) this.endPanel.hidden = !isEnd;

    if (this.menuSummary) {
      this.menuSummary.textContent = formatObjectives(this.state.gameplay ?? {});
    }

    if (isEnd) {
      const outcome = session?.outcome ?? "loss";
      if (this.endTitle) {
        this.endTitle.textContent = outcome === "win" ? "Victory" : "Defeat";
      }
      if (this.endReason) {
        this.endReason.textContent = session?.reason ?? "";
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
