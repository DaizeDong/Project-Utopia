
import { MAP_TEMPLATES } from "../../world/grid/Grid.js";

function formatOverlayMeta(state) {
  const scenario = state?.gameplay?.scenario ?? {};
  const family = String(scenario.family ?? "").replaceAll("_", " ");
  if (!scenario.title && !family) return "Quick Start Guide";
  if (!family) return scenario.title;
  return `${scenario.title} · ${family}`;
}

// v0.8.0 Phase 4 — Survival Mode. The outcome meta now surfaces survival time
// and the running score rather than objective progress (which has been retired
// along with the "win" outcome).
function formatSurvivalTime(totalSec) {
  const clamped = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatOutcomeMeta(state) {
  const scenarioTitle = state?.gameplay?.scenario?.title ?? "Scenario";
  const survived = formatSurvivalTime(state?.metrics?.timeSec ?? 0);
  const score = Math.floor(Number(state?.metrics?.survivalScore ?? 0));
  return `${scenarioTitle} · Survived: ${survived} · Score: ${score}`;
}

export class GameStateOverlay {
  // v0.8.2 Round-0 01a-onboarding — private fields for end-panel read gate.
  // Declared here (rather than inside #lastPhase lazy assignment) so class
  // instantiation does not throw on property access in Node strict mode.
  #lastPhase = null;

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

    // v0.8.2 Round-0 01a-onboarding — end-panel read gate.
    //
    // Reviewer 01-onboarding reported "game ended and I clicked New Map
    // before seeing the stats". The stats block exists (see render() /
    // this.endStats) but players click through instantly. To give every
    // player a chance to read the run summary we briefly disable the
    // end-panel buttons when the end phase first appears; the timer
    // restarts any time the phase re-enters `end`.
    this.endGateDisabledUntilMs = 0;
    this.endGateReadMs = 2500;
    this.restartBtn = restartBtn;
    this.resetBtn = resetBtn;
    this.#refreshEndGateButtons();

    startBtn?.addEventListener("click", () => {
      const templateId = this.mapTemplateSelect?.value;
      if (templateId && this.state?.controls) {
        this.state.controls.mapTemplateId = templateId;
      }
      this.handlers.onStart?.();
    });
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
    restartBtn?.addEventListener("click", () => {
      if (this.#isEndGateActive()) return;
      this.handlers.onRestart?.();
    });
    resetBtn?.addEventListener("click", () => {
      if (this.#isEndGateActive()) return;
      this.handlers.onReset?.();
    });
  }

  #now() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  #isEndGateActive() {
    return this.#now() < (this.endGateDisabledUntilMs || 0);
  }

  #refreshEndGateButtons() {
    const gated = this.#isEndGateActive();
    const ttl = Math.max(0, Math.ceil(((this.endGateDisabledUntilMs || 0) - this.#now()) / 1000));
    const suffix = gated && ttl > 0 ? ` (${ttl})` : "";
    if (this.restartBtn) {
      this.restartBtn.disabled = gated;
      this.restartBtn.textContent = gated ? `Try Again${suffix}` : "Try Again";
    }
    if (this.resetBtn) {
      this.resetBtn.disabled = gated;
      this.resetBtn.textContent = gated ? `New Map${suffix}` : "New Map";
    }
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
    // v0.8.2 Round-0 01a-onboarding — when we first enter the end phase
    // start the read-gate timer; the next few ticks (~2.5s) disable the
    // restart/new-map buttons so players actually see the stats. Also
    // refresh the button labels every tick so the countdown visibly
    // decrements.
    if (isEnd && this.#lastPhase !== "end") {
      this.endGateDisabledUntilMs = this.#now() + this.endGateReadMs;
    }
    this.#lastPhase = phase;
    if (isEnd) this.#refreshEndGateButtons();
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
      // v0.8.0 Phase 4 — Survival Mode. The 3-objective card deck has been
      // replaced by a single survival status card. Objectives are still
      // rendered if anything upstream populates them (nothing does today),
      // preserving the legacy codepath while phase 7 finalises HUD polish.
      const objectives = this.state.gameplay?.objectives ?? [];
      if (objectives.length > 0) {
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
      } else {
        const survived = formatSurvivalTime(this.state.metrics?.timeSec ?? 0);
        const score = Math.floor(Number(this.state.metrics?.survivalScore ?? 0));
        this.objectiveCards.innerHTML = `<div class="overlay-obj-card current">
      <div class="overlay-obj-num">∞</div>
      <div class="overlay-obj-text">Survive as long as you can</div>
      <div class="overlay-obj-pct">${survived} · ${score} pts</div>
    </div>`;
      }
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
      // v0.8.2 Round-0 01a-onboarding — seed is a developer identifier.
      // Only show it when body.dev-mode is asserted (01c gate). Casual /
      // first-time players see just the template + dimensions so the menu
      // panel no longer leads with "SEED 1337".
      const isDevMode = typeof document !== "undefined"
        && document.body?.classList?.contains("dev-mode");
      if (seed && isDevMode) {
        this.menuMeta.textContent = `${base} · ${w}×${h} · seed ${seed}`;
      } else {
        this.menuMeta.textContent = `${base} · ${w}×${h} tiles`;
      }
    }


    if (isEnd) {
      // v0.8.0 Phase 4 — Survival Mode only produces "loss" (or "none" before
      // evaluation). The legacy "win" branch has been removed.
      if (this.endTitle) {
        this.endTitle.textContent = "Colony Lost";
        this.endTitle.style.background = "linear-gradient(135deg, #922b21, #e74c3c)";
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
        // v0.8.0 Phase 4 — DevIndex badge line. Agent 4.A's survival-score row
        // (if added separately) should sit adjacent to this one without
        // clobbering it; both live in the endStats multi-line block.
        const devIndex = Number(this.state.gameplay?.devIndex ?? 0);
        const devIndexSmoothed = Number(this.state.gameplay?.devIndexSmoothed ?? 0);
        const survivalScore = Number(this.state.metrics?.survivalScore ?? 0);
        const survivalLine = Number.isFinite(survivalScore) && survivalScore !== 0
          ? `Survival Score: ${survivalScore.toFixed(0)}`
          : null;
        const lines = [
          `Time Survived: ${min}:${sec.toString().padStart(2, "0")}`,
          `Workers: ${workers}  |  Total Entities: ${total}`,
          `Prosperity: ${Number(this.state.gameplay?.prosperity ?? 0).toFixed(0)}  |  Threat: ${Number(this.state.gameplay?.threat ?? 0).toFixed(0)}`,
          `DevIndex: ${devIndex.toFixed(0)}/100  (smoothed ${devIndexSmoothed.toFixed(0)})`,
          `Deaths: ${deaths}`,
        ];
        if (survivalLine) lines.splice(3, 0, survivalLine);
        this.endStats.textContent = lines.join("\n");
      }
    }
  }
}
