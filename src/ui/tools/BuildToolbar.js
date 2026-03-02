import {
  MAP_TEMPLATES,
  TERRAIN_WALL_MODES,
  TERRAIN_OCEAN_SIDES,
  getTerrainTuningDefaults,
  sanitizeTerrainTuning,
} from "../../world/grid/Grid.js";
import { getDoctrinePresets } from "../../simulation/meta/ProgressionSystem.js";

const SIDEBAR_PANELS_STORAGE_KEY = "utopiaSidebarPanels:v1";
const CORE_PANEL_KEYS = Object.freeze(["build", "management", "stress"]);

export class BuildToolbar {
  constructor(state, handlers = {}) {
    this.state = state;
    this.handlers = handlers;

    this.toolButtons = Array.from(document.querySelectorAll("button[data-tool]"));
    this.farmRatio = document.getElementById("farmRatio");
    this.farmRatioLabel = document.getElementById("farmRatioLabel");
    this.aiToggle = document.getElementById("aiToggle");
    this.compactToggle = document.getElementById("compactToggle");
    this.uiRoot = document.getElementById("ui");
    this.wrapRoot = document.getElementById("wrap");
    this.toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
    this.toggleDockBtn = document.getElementById("toggleDockBtn");
    this.sidebarCollapseAllBtn = document.getElementById("sidebarCollapseAllBtn");
    this.sidebarExpandCoreBtn = document.getElementById("sidebarExpandCoreBtn");
    this.sidebarExpandAllBtn = document.getElementById("sidebarExpandAllBtn");
    this.panelCards = Array.from(this.uiRoot?.querySelectorAll("details.card[data-panel-key]") ?? []);
    this.mapTemplateSelect = document.getElementById("mapTemplateSelect");
    this.mapSeedInput = document.getElementById("mapSeedInput");
    this.regenerateMapBtn = document.getElementById("regenerateMapBtn");
    this.doctrineSelect = document.getElementById("doctrineSelect");
    this.workerTargetInput = document.getElementById("workerTargetInput");
    this.workerTargetLabel = document.getElementById("workerTargetLabel");
    this.visitorTargetInput = document.getElementById("visitorTargetInput");
    this.visitorTargetLabel = document.getElementById("visitorTargetLabel");
    this.herbivoreTargetInput = document.getElementById("herbivoreTargetInput");
    this.herbivoreTargetLabel = document.getElementById("herbivoreTargetLabel");
    this.predatorTargetInput = document.getElementById("predatorTargetInput");
    this.predatorTargetLabel = document.getElementById("predatorTargetLabel");
    this.applyPopulationBtn = document.getElementById("applyPopulationBtn");
    this.populationBreakdownVal = document.getElementById("populationBreakdownVal");
    this.undoBuildBtn = document.getElementById("undoBuildBtn");
    this.redoBuildBtn = document.getElementById("redoBuildBtn");
    this.saveSlotInput = document.getElementById("saveSlotInput");
    this.saveSnapshotBtn = document.getElementById("saveSnapshotBtn");
    this.loadSnapshotBtn = document.getElementById("loadSnapshotBtn");
    this.comparePresetsBtn = document.getElementById("comparePresetsBtn");
    this.exportReplayBtn = document.getElementById("exportReplayBtn");
    this.terrainWaterLevel = document.getElementById("terrainWaterLevel");
    this.terrainWaterLevelLabel = document.getElementById("terrainWaterLevelLabel");
    this.terrainRiverCount = document.getElementById("terrainRiverCount");
    this.terrainRiverCountLabel = document.getElementById("terrainRiverCountLabel");
    this.terrainRiverWidth = document.getElementById("terrainRiverWidth");
    this.terrainRiverWidthLabel = document.getElementById("terrainRiverWidthLabel");
    this.terrainRiverAmp = document.getElementById("terrainRiverAmp");
    this.terrainRiverAmpLabel = document.getElementById("terrainRiverAmpLabel");
    this.terrainMountainStrength = document.getElementById("terrainMountainStrength");
    this.terrainMountainStrengthLabel = document.getElementById("terrainMountainStrengthLabel");
    this.terrainIslandBias = document.getElementById("terrainIslandBias");
    this.terrainIslandBiasLabel = document.getElementById("terrainIslandBiasLabel");
    this.terrainOceanBias = document.getElementById("terrainOceanBias");
    this.terrainOceanBiasLabel = document.getElementById("terrainOceanBiasLabel");
    this.terrainRoadDensity = document.getElementById("terrainRoadDensity");
    this.terrainRoadDensityLabel = document.getElementById("terrainRoadDensityLabel");
    this.terrainSettlementDensity = document.getElementById("terrainSettlementDensity");
    this.terrainSettlementDensityLabel = document.getElementById("terrainSettlementDensityLabel");
    this.terrainWallModeSelect = document.getElementById("terrainWallModeSelect");
    this.terrainOceanSideSelect = document.getElementById("terrainOceanSideSelect");
    this.resetTerrainTuningBtn = document.getElementById("resetTerrainTuningBtn");
    this.showTileIconsToggle = document.getElementById("showTileIconsToggle");
    this.showUnitSpritesToggle = document.getElementById("showUnitSpritesToggle");
    this.fixedStepHz = document.getElementById("fixedStepHz");
    this.fixedStepHzLabel = document.getElementById("fixedStepHzLabel");
    this.cameraMinZoom = document.getElementById("cameraMinZoom");
    this.cameraMinZoomLabel = document.getElementById("cameraMinZoomLabel");
    this.cameraMaxZoom = document.getElementById("cameraMaxZoom");
    this.cameraMaxZoomLabel = document.getElementById("cameraMaxZoomLabel");
    this.renderDetailThreshold = document.getElementById("renderDetailThreshold");
    this.renderDetailThresholdLabel = document.getElementById("renderDetailThresholdLabel");

    this.#ensurePopulationTargets();
    this.#ensureTerrainTuning();
    this.#ensureAuxControls();

    this.#setupToolButtons();
    this.#setupManagementControls();
    this.#setupModeControls();
    this.#setupSidebarPanelControls();
    this.#restoreCompactPreference();
    this.#restoreLayoutPreference();
    this.#restoreSidebarPanelState();

    this.sync();
  }

  #setupToolButtons() {
    this.toolButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tool = btn.dataset.tool;
        if (!tool) return;
        this.state.controls.tool = tool;
        this.state.controls.actionMessage = `Selected tool: ${tool}`;
        this.state.controls.actionKind = "info";
        this.sync();
      });
    });
  }

  #setupManagementControls() {
    this.#populateMapTemplates();
    this.#populateDoctrines();
    this.#populateTerrainModeOptions();
    this.#setupPopulationControls();
    this.#setupTerrainTuningControls();
    this.#setupAdvancedControls();

    this.farmRatio?.addEventListener("input", () => {
      const pct = Number(this.farmRatio.value);
      this.state.controls.farmRatio = Math.max(0, Math.min(1, pct / 100));
      this.sync();
    });

    this.mapTemplateSelect?.addEventListener("change", () => {
      const templateId = this.mapTemplateSelect.value;
      this.state.controls.mapTemplateId = templateId;
      this.state.controls.terrainTuning = getTerrainTuningDefaults(templateId);
      this.state.controls.actionMessage = `Template selected: ${templateId}`;
      this.state.controls.actionKind = "info";
      this.sync();
    });

    this.mapSeedInput?.addEventListener("change", () => {
      const raw = this.mapSeedInput.value.trim();
      const asNumber = Number(raw);
      this.state.controls.mapSeed = Number.isFinite(asNumber) ? asNumber : raw || 1337;
      this.state.controls.actionMessage = `Map seed set to ${this.state.controls.mapSeed}`;
      this.state.controls.actionKind = "info";
      this.sync();
    });

    this.regenerateMapBtn?.addEventListener("click", () => {
      this.handlers.onRegenerateMap?.({
        templateId: this.state.controls.mapTemplateId,
        seed: this.state.controls.mapSeed,
        terrainTuning: sanitizeTerrainTuning(this.state.controls.terrainTuning, this.state.controls.mapTemplateId),
      });
    });

    this.doctrineSelect?.addEventListener("change", () => {
      const doctrine = this.doctrineSelect.value;
      this.state.controls.doctrine = doctrine;
      this.handlers.onDoctrineChange?.(doctrine);
      this.sync();
    });
  }

  #setupPopulationControls() {
    const bindInput = (input, key, min, max) => {
      input?.addEventListener("input", () => {
        const raw = Number(input.value);
        const value = Math.max(min, Math.min(max, Number.isFinite(raw) ? raw : min));
        this.state.controls.populationTargets[key] = value;
        this.sync();
      });
    };

    bindInput(this.workerTargetInput, "workers", 0, 500);
    bindInput(this.visitorTargetInput, "visitors", 0, 300);
    bindInput(this.herbivoreTargetInput, "herbivores", 0, 400);
    bindInput(this.predatorTargetInput, "predators", 0, 200);

    this.applyPopulationBtn?.addEventListener("click", () => {
      const targets = { ...this.state.controls.populationTargets };
      this.handlers.onApplyPopulationTargets?.(targets);
    });

    this.undoBuildBtn?.addEventListener("click", () => {
      this.handlers.onUndo?.();
      this.sync();
    });

    this.redoBuildBtn?.addEventListener("click", () => {
      this.handlers.onRedo?.();
      this.sync();
    });

    this.saveSlotInput?.addEventListener("change", () => {
      this.state.controls.saveSlotId = this.saveSlotInput.value.trim() || "default";
      this.sync();
    });

    this.saveSnapshotBtn?.addEventListener("click", () => {
      const slotId = this.state.controls.saveSlotId ?? this.saveSlotInput?.value ?? "default";
      this.handlers.onSaveSnapshot?.(slotId);
    });

    this.loadSnapshotBtn?.addEventListener("click", () => {
      const slotId = this.state.controls.saveSlotId ?? this.saveSlotInput?.value ?? "default";
      this.handlers.onLoadSnapshot?.(slotId);
    });

    this.comparePresetsBtn?.addEventListener("click", () => {
      this.handlers.onComparePresets?.();
    });

    this.exportReplayBtn?.addEventListener("click", () => {
      this.handlers.onExportReplay?.();
    });
  }

  #setupTerrainTuningControls() {
    const tuning = () => this.state.controls.terrainTuning;
    const bindFloatRange = (el, key, min, max, scale = 1) => {
      el?.addEventListener("input", () => {
        const raw = Number(el.value);
        const value = Math.max(min, Math.min(max, Number.isFinite(raw) ? raw / scale : min));
        tuning()[key] = value;
        this.sync();
      });
    };
    const bindIntRange = (el, key, min, max) => {
      el?.addEventListener("input", () => {
        const raw = Number(el.value);
        const value = Math.max(min, Math.min(max, Number.isFinite(raw) ? Math.round(raw) : min));
        tuning()[key] = value;
        this.sync();
      });
    };

    bindFloatRange(this.terrainWaterLevel, "waterLevel", 0.02, 0.58, 100);
    bindIntRange(this.terrainRiverCount, "riverCount", 0, 4);
    bindFloatRange(this.terrainRiverWidth, "riverWidth", 0.8, 6.5, 10);
    bindFloatRange(this.terrainRiverAmp, "riverAmp", 0, 0.45, 100);
    bindFloatRange(this.terrainMountainStrength, "mountainStrength", 0, 0.85, 100);
    bindFloatRange(this.terrainIslandBias, "islandBias", 0, 0.85, 100);
    bindFloatRange(this.terrainOceanBias, "oceanBias", 0, 0.85, 100);
    bindFloatRange(this.terrainRoadDensity, "roadDensity", 0, 1, 100);
    bindFloatRange(this.terrainSettlementDensity, "settlementDensity", 0, 1, 100);

    this.terrainWallModeSelect?.addEventListener("change", () => {
      tuning().wallMode = this.terrainWallModeSelect.value;
      this.sync();
    });

    this.terrainOceanSideSelect?.addEventListener("change", () => {
      tuning().oceanSide = this.terrainOceanSideSelect.value;
      this.sync();
    });

    this.resetTerrainTuningBtn?.addEventListener("click", () => {
      this.state.controls.terrainTuning = getTerrainTuningDefaults(this.state.controls.mapTemplateId);
      this.state.controls.actionMessage = "Terrain tuning reset to preset defaults.";
      this.state.controls.actionKind = "info";
      this.sync();
    });
  }

  #setupAdvancedControls() {
    this.showTileIconsToggle?.addEventListener("change", () => {
      const enabled = Boolean(this.showTileIconsToggle.checked);
      this.handlers.onSetTileIconsVisible?.(enabled);
      this.sync();
    });

    this.showUnitSpritesToggle?.addEventListener("change", () => {
      const enabled = Boolean(this.showUnitSpritesToggle.checked);
      this.handlers.onSetUnitSpritesVisible?.(enabled);
      this.sync();
    });

    this.fixedStepHz?.addEventListener("input", () => {
      const hz = Math.max(5, Math.min(120, Number(this.fixedStepHz.value) || 30));
      this.handlers.onSetFixedStepHz?.(hz);
      this.sync();
    });

    const syncZoom = () => {
      const minZoom = (Number(this.cameraMinZoom?.value) || 55) / 100;
      const maxZoom = (Number(this.cameraMaxZoom?.value) || 320) / 100;
      this.handlers.onSetCameraZoomRange?.(minZoom, maxZoom);
      this.sync();
    };

    this.cameraMinZoom?.addEventListener("input", syncZoom);
    this.cameraMaxZoom?.addEventListener("input", syncZoom);

    this.renderDetailThreshold?.addEventListener("input", () => {
      const value = Math.max(80, Math.min(2000, Math.round(Number(this.renderDetailThreshold.value) || 260)));
      this.handlers.onSetRenderDetailThreshold?.(value);
      this.sync();
    });
  }

  #setupSidebarPanelControls() {
    this.panelCards.forEach((panel) => {
      panel.addEventListener("toggle", () => {
        this.#persistSidebarPanelState();
      });
    });

    this.sidebarCollapseAllBtn?.addEventListener("click", () => {
      this.panelCards.forEach((panel) => {
        panel.open = false;
      });
      this.#persistSidebarPanelState();
    });

    this.sidebarExpandCoreBtn?.addEventListener("click", () => {
      this.panelCards.forEach((panel) => {
        const key = panel.dataset.panelKey ?? "";
        panel.open = CORE_PANEL_KEYS.includes(key);
      });
      this.#persistSidebarPanelState();
    });

    this.sidebarExpandAllBtn?.addEventListener("click", () => {
      this.panelCards.forEach((panel) => {
        panel.open = true;
      });
      this.#persistSidebarPanelState();
    });
  }

  #setupModeControls() {
    this.aiToggle?.addEventListener("change", () => {
      this.state.ai.enabled = Boolean(this.aiToggle.checked);
      if (!this.state.ai.enabled) {
        this.state.ai.mode = "fallback";
        this.state.controls.actionMessage = "AI disabled. Using fallback.";
      } else {
        this.state.controls.actionMessage = "AI enabled. Waiting for next decision cycle.";
      }
      this.state.controls.actionKind = "info";
    });

    this.compactToggle?.addEventListener("change", () => {
      const compact = Boolean(this.compactToggle.checked);
      this.uiRoot?.classList.toggle("compact", compact);
      localStorage.setItem("utopiaCompactMode", compact ? "1" : "0");
    });

    this.toggleSidebarBtn?.addEventListener("click", () => {
      const next = !this.wrapRoot?.classList.contains("sidebar-collapsed");
      this.#setSidebarCollapsed(next);
      this.sync();
    });

    this.toggleDockBtn?.addEventListener("click", () => {
      const next = !this.wrapRoot?.classList.contains("dock-collapsed");
      this.#setDockCollapsed(next);
      this.sync();
    });
  }

  #restoreCompactPreference() {
    const savedCompact = localStorage.getItem("utopiaCompactMode") === "1";
    if (savedCompact) {
      this.uiRoot?.classList.add("compact");
      if (this.compactToggle) this.compactToggle.checked = true;
    }
  }

  #restoreLayoutPreference() {
    const sidebarCollapsed = localStorage.getItem("utopiaSidebarCollapsed") === "1";
    const dockCollapsed = localStorage.getItem("utopiaDockCollapsed") === "1";
    this.#setSidebarCollapsed(sidebarCollapsed);
    this.#setDockCollapsed(dockCollapsed);
  }

  #restoreSidebarPanelState() {
    if (!this.panelCards.length) return;
    const raw = localStorage.getItem(SIDEBAR_PANELS_STORAGE_KEY);
    if (!raw) {
      this.panelCards.forEach((panel) => {
        const key = panel.dataset.panelKey ?? "";
        panel.open = CORE_PANEL_KEYS.includes(key);
      });
      this.#persistSidebarPanelState();
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      this.panelCards.forEach((panel) => {
        const key = panel.dataset.panelKey ?? "";
        const value = parsed?.[key];
        if (typeof value === "boolean") {
          panel.open = value;
          return;
        }
        panel.open = CORE_PANEL_KEYS.includes(key);
      });
    } catch {
      this.panelCards.forEach((panel) => {
        const key = panel.dataset.panelKey ?? "";
        panel.open = CORE_PANEL_KEYS.includes(key);
      });
      this.#persistSidebarPanelState();
    }
  }

  #persistSidebarPanelState() {
    if (!this.panelCards.length) return;
    const state = {};
    for (const panel of this.panelCards) {
      const key = panel.dataset.panelKey ?? "";
      if (!key) continue;
      state[key] = Boolean(panel.open);
    }
    localStorage.setItem(SIDEBAR_PANELS_STORAGE_KEY, JSON.stringify(state));
  }

  #setSidebarCollapsed(collapsed) {
    this.wrapRoot?.classList.toggle("sidebar-collapsed", Boolean(collapsed));
    localStorage.setItem("utopiaSidebarCollapsed", collapsed ? "1" : "0");
  }

  #setDockCollapsed(collapsed) {
    this.wrapRoot?.classList.toggle("dock-collapsed", Boolean(collapsed));
    localStorage.setItem("utopiaDockCollapsed", collapsed ? "1" : "0");
  }

  #ensurePopulationTargets() {
    const controls = this.state.controls;
    if (controls.populationTargets) return;
    controls.populationTargets = {
      workers: this.state.agents.filter((a) => a.type === "WORKER").length,
      visitors: this.state.agents.filter((a) => a.type === "VISITOR").length,
      herbivores: this.state.animals.filter((a) => a.kind === "HERBIVORE").length,
      predators: this.state.animals.filter((a) => a.kind === "PREDATOR").length,
    };
  }

  #ensureTerrainTuning() {
    const controls = this.state.controls;
    if (controls.terrainTuning) return;
    controls.terrainTuning = getTerrainTuningDefaults(
      controls.mapTemplateId ?? this.state.world.mapTemplateId,
    );
  }

  #ensureAuxControls() {
    const controls = this.state.controls;
    if (typeof controls.saveSlotId !== "string") controls.saveSlotId = "default";
    if (!Number.isFinite(controls.cameraMinZoom)) controls.cameraMinZoom = 0.55;
    if (!Number.isFinite(controls.cameraMaxZoom)) controls.cameraMaxZoom = 3.2;
    if (!Number.isFinite(controls.renderModelDisableThreshold)) controls.renderModelDisableThreshold = 260;
    if (!controls.benchmarkConfig || typeof controls.benchmarkConfig !== "object") {
      controls.benchmarkConfig = {
        schedule: [0, 100, 200, 300, 400, 500],
        stageDurationSec: 4,
        sampleStartSec: 1.2,
      };
    }
    if (!controls.populationBreakdown) {
      const baseWorkers = this.state.agents.filter((a) => a.type === "WORKER" && !a.isStressWorker).length;
      const stressWorkers = this.state.agents.filter((a) => a.type === "WORKER" && a.isStressWorker).length;
      controls.populationBreakdown = {
        baseWorkers,
        stressWorkers,
        totalWorkers: baseWorkers + stressWorkers,
        totalEntities: this.state.agents.length + this.state.animals.length,
      };
    }
    controls.canUndo = Boolean(controls.undoStack?.length);
    controls.canRedo = Boolean(controls.redoStack?.length);
  }

  #populateMapTemplates() {
    if (!this.mapTemplateSelect) return;
    if (this.mapTemplateSelect.options.length > 0) return;

    for (const tpl of MAP_TEMPLATES) {
      const option = document.createElement("option");
      option.value = tpl.id;
      option.textContent = `${tpl.name} - ${tpl.tags.join(",")}`;
      this.mapTemplateSelect.appendChild(option);
    }
  }

  #populateDoctrines() {
    if (!this.doctrineSelect) return;
    if (this.doctrineSelect.options.length > 0) return;

    for (const doctrine of getDoctrinePresets()) {
      const option = document.createElement("option");
      option.value = doctrine.id;
      option.textContent = doctrine.name;
      this.doctrineSelect.appendChild(option);
    }
  }

  #populateTerrainModeOptions() {
    if (this.terrainWallModeSelect && this.terrainWallModeSelect.options.length === 0) {
      for (const mode of TERRAIN_WALL_MODES) {
        const option = document.createElement("option");
        option.value = mode;
        option.textContent = mode;
        this.terrainWallModeSelect.appendChild(option);
      }
    }

    if (this.terrainOceanSideSelect && this.terrainOceanSideSelect.options.length === 0) {
      for (const side of TERRAIN_OCEAN_SIDES) {
        const option = document.createElement("option");
        option.value = side;
        option.textContent = side;
        this.terrainOceanSideSelect.appendChild(option);
      }
    }
  }

  sync() {
    this.toolButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === this.state.controls.tool);
    });

    if (this.farmRatio && this.farmRatioLabel) {
      const pct = Math.round(this.state.controls.farmRatio * 100);
      this.farmRatio.value = String(pct);
      this.farmRatioLabel.textContent = `${pct}%`;
    }

    if (this.aiToggle) {
      this.aiToggle.checked = this.state.ai.enabled;
    }

    if (this.compactToggle && this.uiRoot) {
      this.compactToggle.checked = this.uiRoot.classList.contains("compact");
    }

    if (this.showTileIconsToggle) {
      this.showTileIconsToggle.checked = Boolean(this.state.controls.showTileIcons);
    }

    if (this.showUnitSpritesToggle) {
      this.showUnitSpritesToggle.checked = Boolean(this.state.controls.showUnitSprites);
    }

    if (this.fixedStepHz && this.fixedStepHzLabel) {
      const hz = Math.max(5, Math.min(120, 1 / Math.max(1 / 120, this.state.controls.fixedStepSec || 1 / 30)));
      this.fixedStepHz.value = String(Math.round(hz));
      this.fixedStepHzLabel.textContent = `${hz.toFixed(1)} Hz`;
    }

    if (this.cameraMinZoom && this.cameraMinZoomLabel) {
      const minZoom = Math.max(0.3, Math.min(5, Number(this.state.controls.cameraMinZoom) || 0.55));
      this.cameraMinZoom.value = String(Math.round(minZoom * 100));
      this.cameraMinZoomLabel.textContent = minZoom.toFixed(2);
    }

    if (this.cameraMaxZoom && this.cameraMaxZoomLabel) {
      const maxZoom = Math.max(0.4, Math.min(6, Number(this.state.controls.cameraMaxZoom) || 3.2));
      this.cameraMaxZoom.value = String(Math.round(maxZoom * 100));
      this.cameraMaxZoomLabel.textContent = maxZoom.toFixed(2);
    }

    if (this.renderDetailThreshold && this.renderDetailThresholdLabel) {
      const threshold = Math.max(80, Math.min(2000, Math.round(Number(this.state.controls.renderModelDisableThreshold) || 260)));
      this.renderDetailThreshold.value = String(threshold);
      this.renderDetailThresholdLabel.textContent = String(threshold);
    }

    if (this.toggleSidebarBtn && this.wrapRoot) {
      const collapsed = this.wrapRoot.classList.contains("sidebar-collapsed");
      this.toggleSidebarBtn.textContent = collapsed ? "Show Sidebar" : "Hide Sidebar";
    }

    if (this.toggleDockBtn && this.wrapRoot) {
      const collapsed = this.wrapRoot.classList.contains("dock-collapsed");
      this.toggleDockBtn.textContent = collapsed ? "Show Dev Dock" : "Hide Dev Dock";
    }

    if (this.mapTemplateSelect) {
      this.mapTemplateSelect.value = this.state.controls.mapTemplateId ?? this.state.world.mapTemplateId;
    }

    if (this.mapSeedInput) {
      this.mapSeedInput.value = String(this.state.controls.mapSeed ?? this.state.world.mapSeed ?? 1337);
    }

    if (this.doctrineSelect) {
      this.doctrineSelect.value = this.state.controls.doctrine ?? this.state.gameplay.doctrine;
    }

    const targets = this.state.controls.populationTargets;
    if (targets) {
      if (this.workerTargetInput) this.workerTargetInput.value = String(Math.max(0, Math.min(500, targets.workers | 0)));
      if (this.workerTargetLabel) this.workerTargetLabel.textContent = String(Math.max(0, Math.min(500, targets.workers | 0)));

      if (this.visitorTargetInput) this.visitorTargetInput.value = String(Math.max(0, Math.min(300, targets.visitors | 0)));
      if (this.visitorTargetLabel) this.visitorTargetLabel.textContent = String(Math.max(0, Math.min(300, targets.visitors | 0)));

      if (this.herbivoreTargetInput) this.herbivoreTargetInput.value = String(Math.max(0, Math.min(400, targets.herbivores | 0)));
      if (this.herbivoreTargetLabel) this.herbivoreTargetLabel.textContent = String(Math.max(0, Math.min(400, targets.herbivores | 0)));

      if (this.predatorTargetInput) this.predatorTargetInput.value = String(Math.max(0, Math.min(200, targets.predators | 0)));
      if (this.predatorTargetLabel) this.predatorTargetLabel.textContent = String(Math.max(0, Math.min(200, targets.predators | 0)));
    }

    if (this.saveSlotInput) {
      this.saveSlotInput.value = this.state.controls.saveSlotId ?? "default";
    }
    if (this.undoBuildBtn) this.undoBuildBtn.disabled = !this.state.controls.canUndo;
    if (this.redoBuildBtn) this.redoBuildBtn.disabled = !this.state.controls.canRedo;

    if (this.populationBreakdownVal) {
      const breakdown = this.state.controls.populationBreakdown ?? {
        baseWorkers: 0,
        stressWorkers: 0,
        totalWorkers: 0,
        totalEntities: this.state.agents.length + this.state.animals.length,
      };
      this.populationBreakdownVal.textContent = `Base W:${breakdown.baseWorkers} | Stress W:${breakdown.stressWorkers} | Total W:${breakdown.totalWorkers} | Entities:${breakdown.totalEntities}`;
    }

    const tuned = sanitizeTerrainTuning(
      this.state.controls.terrainTuning ?? getTerrainTuningDefaults(this.state.controls.mapTemplateId),
      this.state.controls.mapTemplateId,
    );
    this.state.controls.terrainTuning = tuned;

    if (this.terrainWaterLevel) this.terrainWaterLevel.value = String(Math.round(tuned.waterLevel * 100));
    if (this.terrainWaterLevelLabel) this.terrainWaterLevelLabel.textContent = tuned.waterLevel.toFixed(2);
    if (this.terrainRiverCount) this.terrainRiverCount.value = String(tuned.riverCount);
    if (this.terrainRiverCountLabel) this.terrainRiverCountLabel.textContent = String(tuned.riverCount);
    if (this.terrainRiverWidth) this.terrainRiverWidth.value = String(Math.round(tuned.riverWidth * 10));
    if (this.terrainRiverWidthLabel) this.terrainRiverWidthLabel.textContent = tuned.riverWidth.toFixed(1);
    if (this.terrainRiverAmp) this.terrainRiverAmp.value = String(Math.round(tuned.riverAmp * 100));
    if (this.terrainRiverAmpLabel) this.terrainRiverAmpLabel.textContent = tuned.riverAmp.toFixed(2);
    if (this.terrainMountainStrength) this.terrainMountainStrength.value = String(Math.round(tuned.mountainStrength * 100));
    if (this.terrainMountainStrengthLabel) this.terrainMountainStrengthLabel.textContent = tuned.mountainStrength.toFixed(2);
    if (this.terrainIslandBias) this.terrainIslandBias.value = String(Math.round(tuned.islandBias * 100));
    if (this.terrainIslandBiasLabel) this.terrainIslandBiasLabel.textContent = tuned.islandBias.toFixed(2);
    if (this.terrainOceanBias) this.terrainOceanBias.value = String(Math.round(tuned.oceanBias * 100));
    if (this.terrainOceanBiasLabel) this.terrainOceanBiasLabel.textContent = tuned.oceanBias.toFixed(2);
    if (this.terrainRoadDensity) this.terrainRoadDensity.value = String(Math.round(tuned.roadDensity * 100));
    if (this.terrainRoadDensityLabel) this.terrainRoadDensityLabel.textContent = `${Math.round(tuned.roadDensity * 100)}%`;
    if (this.terrainSettlementDensity) this.terrainSettlementDensity.value = String(Math.round(tuned.settlementDensity * 100));
    if (this.terrainSettlementDensityLabel) this.terrainSettlementDensityLabel.textContent = `${Math.round(tuned.settlementDensity * 100)}%`;
    if (this.terrainWallModeSelect) this.terrainWallModeSelect.value = tuned.wallMode;
    if (this.terrainOceanSideSelect) this.terrainOceanSideSelect.value = tuned.oceanSide;
  }
}
