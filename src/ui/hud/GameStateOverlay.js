
import { MAP_TEMPLATES, describeMapTemplate } from "../../world/grid/Grid.js";
import { getScenarioVoiceForTemplate } from "../../world/scenarios/ScenarioFactory.js";

function formatOverlayMeta(state) {
  const templateId = String(state?.controls?.mapTemplateId ?? state?.world?.mapTemplateId ?? "").trim();
  const template = describeMapTemplate(templateId);
  const voice = getScenarioVoiceForTemplate(templateId);
  const templateName = String(template?.name ?? state?.world?.mapTemplateName ?? "").trim();
  const width = Number(state?.controls?.mapWidth ?? state?.grid?.width ?? 0);
  const height = Number(state?.controls?.mapHeight ?? state?.grid?.height ?? 0);
  const parts = [];

  if (templateName) parts.push(templateName);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    parts.push(`${Math.floor(width)}x${Math.floor(height)} tiles`);
  }
  const voiceTitle = String(voice?.title ?? "").trim();
  if (voiceTitle && voiceTitle !== templateName) {
    parts.push(voiceTitle);
  }
  const area = Math.floor(width) * Math.floor(height);
  if (Number.isFinite(area) && area > 0) {
    if (area >= 110 * 84) {
      parts.push("larger map, longer haul lines");
    } else if (area <= 80 * 60) {
      parts.push("compact map, faster pressure");
    } else {
      parts.push("balanced map, steady opening");
    }
  }

  const isDevMode = typeof document !== "undefined"
    && document.body?.classList?.contains("dev-mode");
  const seed = state?.world?.mapSeed;
  if (seed !== "" && seed !== null && seed !== undefined && isDevMode) {
    parts.push(`seed ${seed}`);
  }

  return parts.length > 0 ? parts.join(" \u00b7 ") : "Quick Start Guide";
}

function formatTemplateLead(templateId) {
  const template = describeMapTemplate(templateId);
  const voice = getScenarioVoiceForTemplate(templateId);
  return String(voice?.summary ?? template?.description ?? "Build and manage a colony.").trim();
}

function formatTemplatePressure(templateId) {
  const voice = getScenarioVoiceForTemplate(templateId);
  return `First pressure: ${String(voice?.openingPressure ?? voice?.hintInitial ?? "Open with a plan and keep the first route alive.").trim()}`;
}

function formatTemplatePriority(templateId) {
  const voice = getScenarioVoiceForTemplate(templateId);
  return `First build: ${String(voice?.hintInitial ?? "Open with the first build that keeps food and wood moving.").trim()}`;
}

function formatHeatLensUseCase(templateId) {
  const template = describeMapTemplate(templateId);
  const tagLine = Array.isArray(template?.tags) && template.tags.length > 0
    ? template.tags.slice(0, 3).join(" / ")
    : "routes / warehouses / processors";
  return `Heat Lens: red means surplus is trapped and blue means the first bottleneck is starving input (${tagLine}).`;
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
    this.menuBriefing = document.getElementById("overlayMenuBriefing");
    this.menuPressure = document.getElementById("overlayMenuPressure");
    this.menuPriority = document.getElementById("overlayMenuPriority");
    this.menuLens = document.getElementById("overlayMenuLens");
    this.menuSizeHint = document.getElementById("overlayMenuSizeHint");
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
        `<option value="${t.id}" title="${t.description}">${t.name}</option>`
      ).join("");
    }

    this.#syncMenuInputsFromState();
    this.#renderMenuCopy();

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
      this.#syncMenuSelectionFromInputs();
      this.handlers.onStart?.();
    });
    resetFromMenuBtn?.addEventListener("click", () => {
      if (resetFromMenuBtn) {
        resetFromMenuBtn.textContent = "Generating...";
        resetFromMenuBtn.disabled = true;
      }
      const { width, height, templateId } = this.#syncMenuSelectionFromInputs();
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

    const updateMenuPreview = () => {
      this.#syncMenuSelectionFromInputs();
      this.#renderMenuCopy();
    };
    this.mapTemplateSelect?.addEventListener("change", updateMenuPreview);
    this.mapWidthInput?.addEventListener("input", updateMenuPreview);
    this.mapWidthInput?.addEventListener("change", updateMenuPreview);
    this.mapHeightInput?.addEventListener("input", updateMenuPreview);
    this.mapHeightInput?.addEventListener("change", updateMenuPreview);
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
    const fallback = Number(this.state?.controls?.mapWidth ?? this.state?.grid?.width ?? 0);
    const val = Number(this.mapWidthInput?.value ?? fallback);
    return Number.isFinite(val) && val >= 24 ? Math.floor(val) : null;
  }

  #readMapHeight() {
    const fallback = Number(this.state?.controls?.mapHeight ?? this.state?.grid?.height ?? 0);
    const val = Number(this.mapHeightInput?.value ?? fallback);
    return Number.isFinite(val) && val >= 24 ? Math.floor(val) : null;
  }

  #syncMenuInputsFromState() {
    if (!this.state?.controls) return;
    const templateId = String(this.state.controls.mapTemplateId ?? this.state.world?.mapTemplateId ?? MAP_TEMPLATES[0].id);
    const width = Number(this.state.controls.mapWidth ?? this.state.grid?.width ?? 96);
    const height = Number(this.state.controls.mapHeight ?? this.state.grid?.height ?? 72);

    this.state.controls.mapTemplateId = templateId;
    this.state.controls.mapWidth = Number.isFinite(width) && width >= 24 ? Math.floor(width) : 96;
    this.state.controls.mapHeight = Number.isFinite(height) && height >= 24 ? Math.floor(height) : 72;

    if (this.mapTemplateSelect) this.mapTemplateSelect.value = templateId;
    if (this.mapWidthInput) this.mapWidthInput.value = String(this.state.controls.mapWidth);
    if (this.mapHeightInput) this.mapHeightInput.value = String(this.state.controls.mapHeight);
  }

  #syncMenuSelectionFromInputs() {
    if (!this.state?.controls) {
      return { templateId: undefined, width: null, height: null };
    }
    const templateId = this.mapTemplateSelect?.value || this.state.controls.mapTemplateId || this.state.world?.mapTemplateId || MAP_TEMPLATES[0].id;
    const width = this.#readMapWidth() ?? Number(this.state.controls.mapWidth ?? this.state.grid?.width ?? 96);
    const height = this.#readMapHeight() ?? Number(this.state.controls.mapHeight ?? this.state.grid?.height ?? 72);

    this.state.controls.mapTemplateId = templateId;
    this.state.controls.mapWidth = width;
    this.state.controls.mapHeight = height;

    if (this.mapTemplateSelect) this.mapTemplateSelect.value = templateId;
    if (this.mapWidthInput) this.mapWidthInput.value = String(width);
    if (this.mapHeightInput) this.mapHeightInput.value = String(height);

    return { templateId, width, height };
  }

  #renderMenuCopy() {
    if (!this.menuTitle && !this.menuLead && !this.menuMeta && !this.menuPressure && !this.menuPriority && !this.menuLens && !this.menuSizeHint) {
      return;
    }
    const templateId = String(this.state?.controls?.mapTemplateId ?? this.state?.world?.mapTemplateId ?? MAP_TEMPLATES[0].id);
    const width = Number(this.state?.controls?.mapWidth ?? this.state?.grid?.width ?? 0);
    const height = Number(this.state?.controls?.mapHeight ?? this.state?.grid?.height ?? 0);
    const metaState = {
      ...this.state,
      controls: {
        ...(this.state?.controls ?? {}),
        mapTemplateId: templateId,
        mapWidth: width,
        mapHeight: height,
      },
    };

    if (this.menuTitle) {
      this.menuTitle.textContent = "Project Utopia";
    }
    if (this.menuLead) {
      this.menuLead.textContent = formatTemplateLead(templateId);
    }
    if (this.menuMeta) {
      this.menuMeta.textContent = formatOverlayMeta(metaState);
    }
    if (this.menuPressure) {
      this.menuPressure.textContent = formatTemplatePressure(templateId);
    }
    if (this.menuPriority) {
      this.menuPriority.textContent = formatTemplatePriority(templateId);
    }
    if (this.menuLens) {
      this.menuLens.textContent = formatHeatLensUseCase(templateId);
    }
    if (this.menuSizeHint) {
      const area = Math.floor(width) * Math.floor(height);
      let sizeLine = "Map size: steady opening pace.";
      if (Number.isFinite(area) && area > 0) {
        if (area >= 110 * 84) {
          sizeLine = "Map size: larger maps buy space but stretch the first haul line.";
        } else if (area <= 80 * 60) {
          sizeLine = "Map size: compact maps close pressure faster and demand early routing.";
        } else {
          sizeLine = "Map size: balanced maps keep the opening pace steady.";
        }
      }
      this.menuSizeHint.textContent = sizeLine;
    }
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
    if (isMenu) {
      this.#syncMenuInputsFromState();
      this.#renderMenuCopy();
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
