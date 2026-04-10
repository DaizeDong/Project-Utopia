
import { MAP_TEMPLATES } from "../../world/grid/Grid.js";

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
    this.objectiveCards = document.getElementById("overlayObjectiveCards");
    this.endMeta = document.getElementById("overlayEndMeta");
    this.endTitle = document.getElementById("overlayEndTitle");
    this.endReason = document.getElementById("overlayEndReason");
    this.endStats = document.getElementById("overlayEndStats");
    this.mapWidthInput = document.getElementById("overlayMapWidth");
    this.mapHeightInput = document.getElementById("overlayMapHeight");
    this.mapTemplateSelect = document.getElementById("overlayMapTemplate");

    // Populate map template dropdown
    if (this.mapTemplateSelect) {
      this.mapTemplateSelect.innerHTML = MAP_TEMPLATES.map((t) =>
        `<option value="${t.id}">${t.name}</option>`
      ).join("");
      this.mapTemplateSelect.value = state.world?.mapTemplateId ?? MAP_TEMPLATES[0].id;
    }

    const startBtn = document.getElementById("overlayStartBtn");
    const resetFromMenuBtn = document.getElementById("overlayResetFromMenuBtn");
    const restartBtn = document.getElementById("overlayRestartBtn");
    const resetBtn = document.getElementById("overlayResetBtn");

    startBtn?.addEventListener("click", () => this.handlers.onStart?.());
    resetFromMenuBtn?.addEventListener("click", () => {
      if (resetFromMenuBtn) {
        resetFromMenuBtn.textContent = "Generating...";
        resetFromMenuBtn.disabled = true;
      }
      const width = this.#readMapWidth();
      const height = this.#readMapHeight();
      const templateId = this.mapTemplateSelect?.value || undefined;
      this.handlers.onReset?.({ width, height, templateId });
      if (resetFromMenuBtn) {
        setTimeout(() => {
          resetFromMenuBtn.textContent = "New Map";
          resetFromMenuBtn.disabled = false;
        }, 300);
      }
    });
    restartBtn?.addEventListener("click", () => this.handlers.onRestart?.());
    resetBtn?.addEventListener("click", () => this.handlers.onReset?.());
  }

  #readMapWidth() {
    const val = Number(this.mapWidthInput?.value);
    return Number.isFinite(val) && val >= 24 ? val : null;
  }

  #readMapHeight() {
    const val = Number(this.mapHeightInput?.value);
    return Number.isFinite(val) && val >= 24 ? val : null;
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
    // Overlay background is pointer-events:none; only .overlay-panel blocks clicks.
    // This lets users pan/zoom the map behind the overlay during menu phase.
    const statusBar = document.getElementById("statusBar");
    if (statusBar) statusBar.style.display = isInteractive ? "none" : "flex";
    const speedControls = document.getElementById("speedControls");
    if (speedControls) speedControls.style.display = isInteractive ? "none" : "flex";
    const uiLayer = document.getElementById("ui");
    if (uiLayer) uiLayer.style.display = isInteractive ? "none" : "";
    const entityFocus = document.getElementById("entityFocusOverlay");
    if (entityFocus) entityFocus.style.display = isInteractive ? "none" : "";
    const devDock = document.getElementById("devDock");
    if (devDock) devDock.style.display = isInteractive ? "none" : "";
    if (this.menuPanel) this.menuPanel.hidden = !isMenu;
    if (this.endPanel) this.endPanel.hidden = !isEnd;

    if (this.objectiveCards) {
      const objectives = this.state.gameplay?.objectives ?? [];
      const objectiveIndex = this.state.gameplay?.objectiveIndex ?? 0;
      this.objectiveCards.innerHTML = objectives.map((obj, idx) => {
        const isCurrent = idx === objectiveIndex && !obj.completed;
        const label = obj.completed ? "✓" : String(idx + 1);
        const pct = Number(obj.progress ?? 0).toFixed(0);
        return `<div class="overlay-obj-card${isCurrent ? " current" : ""}">
      <div class="overlay-obj-num">${label}</div>
      <div class="overlay-obj-text">${obj.title}</div>
      <div class="overlay-obj-pct">${pct}%</div>
    </div>`;
      }).join("");
    }
    if (this.menuTitle) {
      this.menuTitle.textContent = "Project Utopia";
    }
    if (this.menuLead) {
      this.menuLead.textContent = this.state.gameplay?.scenario?.summary
        ?? "Build and manage a colony. Place farms for food, lumber mills for wood, warehouses for storage, and roads to connect them.";
    }
    if (this.menuMeta) {
      const seed = this.state.world?.mapSeed ?? "";
      const w = this.state.grid?.width ?? 96;
      const h = this.state.grid?.height ?? 72;
      const base = formatOverlayMeta(this.state);
      this.menuMeta.textContent = seed ? `${base} · ${w}×${h} · seed ${seed}` : base;
    }


    if (isEnd) {
      const outcome = session?.outcome ?? "loss";
      if (this.endTitle) {
        this.endTitle.textContent = outcome === "win" ? "Victory!" : "Colony Lost";
        this.endTitle.style.background = outcome === "win"
          ? "linear-gradient(135deg, #1b7a3d, #27ae60)"
          : "linear-gradient(135deg, #922b21, #e74c3c)";
        this.endTitle.style.webkitBackgroundClip = "text";
        this.endTitle.style.webkitTextFillColor = "transparent";
        this.endTitle.style.backgroundClip = "text";
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
        const totalSec = Math.floor(Number(this.state.metrics.timeSec ?? 0));
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        this.endStats.textContent = [
          `Time Survived: ${min}:${sec.toString().padStart(2, "0")}`,
          `Workers: ${workers}  |  Total Entities: ${total}`,
          `Prosperity: ${Number(this.state.gameplay?.prosperity ?? 0).toFixed(0)}  |  Threat: ${Number(this.state.gameplay?.threat ?? 0).toFixed(0)}`,
          `Deaths: ${deaths}`,
        ].join("\n");
      }
    }
  }
}
