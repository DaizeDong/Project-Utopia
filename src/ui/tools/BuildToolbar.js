import {
  MAP_TEMPLATES,
  TERRAIN_WALL_MODES,
  TERRAIN_OCEAN_SIDES,
  getTerrainTuningDefaults,
  sanitizeTerrainTuning,
} from "../../world/grid/Grid.js";
import { getDoctrinePresets } from "../../simulation/meta/ProgressionSystem.js";
import { getBuildToolPanelState } from "../../simulation/construction/BuildAdvisor.js";

const SIDEBAR_PANELS_STORAGE_KEY = "utopiaSidebarPanels:v2";
const CORE_PANEL_KEYS = Object.freeze(["build", "costs", "resources", "population", "management", "world"]);
const POPULATION_TARGET_LIMITS = Object.freeze({
  workers: { min: 0, max: 500 },
  traders: { min: 0, max: 300 },
  saboteurs: { min: 0, max: 300 },
  herbivores: { min: 0, max: 400 },
  predators: { min: 0, max: 200 },
});

function clampPopulationTarget(key, rawValue, fallback = 0) {
  const limits = POPULATION_TARGET_LIMITS[key];
  if (!limits) return 0;
  const parsed = Number(rawValue);
  const safe = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  return Math.max(limits.min, Math.min(limits.max, safe));
}

export class BuildToolbar {
  constructor(state, handlers = {}) {
    this.state = state;
    this.handlers = handlers;

    this.toolButtons = Array.from(document.querySelectorAll("button[data-tool]"));
    this.farmRatio = document.getElementById("farmRatio");
    this.farmRatioLabel = document.getElementById("farmRatioLabel");
    // v0.8.2 Round-1 02a-rimworld-veteran — Role Quota sliders (6 specialist
    // slots). DOM lives in index.html after #farmRatio.
    this.roleQuotaCook = document.getElementById("roleQuotaCook");
    this.roleQuotaCookLabel = document.getElementById("roleQuotaCookLabel");
    this.roleQuotaSmith = document.getElementById("roleQuotaSmith");
    this.roleQuotaSmithLabel = document.getElementById("roleQuotaSmithLabel");
    this.roleQuotaHerbalist = document.getElementById("roleQuotaHerbalist");
    this.roleQuotaHerbalistLabel = document.getElementById("roleQuotaHerbalistLabel");
    this.roleQuotaHaul = document.getElementById("roleQuotaHaul");
    this.roleQuotaHaulLabel = document.getElementById("roleQuotaHaulLabel");
    this.roleQuotaStone = document.getElementById("roleQuotaStone");
    this.roleQuotaStoneLabel = document.getElementById("roleQuotaStoneLabel");
    this.roleQuotaHerbs = document.getElementById("roleQuotaHerbs");
    this.roleQuotaHerbsLabel = document.getElementById("roleQuotaHerbsLabel");
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
    this.workerTargetNumber = document.getElementById("workerTargetNumber");
    this.workerTargetLabel = document.getElementById("workerTargetLabel");
    this.traderTargetInput = document.getElementById("traderTargetInput");
    this.traderTargetNumber = document.getElementById("traderTargetNumber");
    this.traderTargetLabel = document.getElementById("traderTargetLabel");
    this.saboteurTargetInput = document.getElementById("saboteurTargetInput");
    this.saboteurTargetNumber = document.getElementById("saboteurTargetNumber");
    this.saboteurTargetLabel = document.getElementById("saboteurTargetLabel");
    this.visitorTargetLabel = document.getElementById("visitorTargetLabel");
    this.herbivoreTargetInput = document.getElementById("herbivoreTargetInput");
    this.herbivoreTargetNumber = document.getElementById("herbivoreTargetNumber");
    this.herbivoreTargetLabel = document.getElementById("herbivoreTargetLabel");
    this.predatorTargetInput = document.getElementById("predatorTargetInput");
    this.predatorTargetNumber = document.getElementById("predatorTargetNumber");
    this.predatorTargetLabel = document.getElementById("predatorTargetLabel");
    this.populationAdjustButtons = Array.from(document.querySelectorAll("button[data-pop-adjust]"));
    this.syncPopulationTargetsBtn = document.getElementById("syncPopulationTargetsBtn");
    this.applyPopulationBtn = document.getElementById("applyPopulationBtn");
    this.populationBreakdownVal = document.getElementById("populationBreakdownVal");
    this.undoBuildBtn = document.getElementById("undoBuildBtn");
    this.redoBuildBtn = document.getElementById("redoBuildBtn");
    this.saveSlotInput = document.getElementById("saveSlotInput");
    this.saveSnapshotBtn = document.getElementById("saveSnapshotBtn");
    this.loadSnapshotBtn = document.getElementById("loadSnapshotBtn");
    this.comparePresetsBtn = document.getElementById("comparePresetsBtn");
    this.exportReplayBtn = document.getElementById("exportReplayBtn");
    this.buildToolLabelVal = document.getElementById("buildToolLabelVal");
    this.buildToolSummaryVal = document.getElementById("buildToolSummaryVal");
    this.buildToolCostVal = document.getElementById("buildToolCostVal");
    this.buildToolRulesVal = document.getElementById("buildToolRulesVal");
    this.buildPreviewVal = document.getElementById("buildPreviewVal");
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
    this.#setupRoleQuotaControls();
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
    const bindInput = (input, key) => {
      input?.addEventListener("input", () => {
        this.#setPopulationTarget(key, input.value);
      });
      input?.addEventListener("change", () => {
        this.#setPopulationTarget(key, input.value);
      });
    };

    bindInput(this.workerTargetInput, "workers");
    bindInput(this.workerTargetNumber, "workers");
    bindInput(this.traderTargetInput, "traders");
    bindInput(this.traderTargetNumber, "traders");
    bindInput(this.saboteurTargetInput, "saboteurs");
    bindInput(this.saboteurTargetNumber, "saboteurs");
    bindInput(this.herbivoreTargetInput, "herbivores");
    bindInput(this.herbivoreTargetNumber, "herbivores");
    bindInput(this.predatorTargetInput, "predators");
    bindInput(this.predatorTargetNumber, "predators");

    this.populationAdjustButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const raw = btn.dataset.popAdjust ?? "";
        const [key, deltaRaw] = raw.split(":");
        const delta = Number(deltaRaw);
        if (!key || !Number.isFinite(delta)) return;
        const current = this.state.controls.populationTargets?.[key] ?? 0;
        this.#setPopulationTarget(key, current + delta);
      });
    });

    this.syncPopulationTargetsBtn?.addEventListener("click", () => {
      this.#syncPopulationTargetsFromWorld();
      const t = this.state.controls.populationTargets;
      this.state.controls.actionMessage =
        `Population targets synced: W${t.workers} T${t.traders} S${t.saboteurs} H${t.herbivores} P${t.predators}.`;
      this.state.controls.actionKind = "info";
      this.sync();
    });

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

  // v0.8.2 Round-1 02a-rimworld-veteran — Role Quota sliders surface the
  // 6 specialist slot knobs (cook/smith/herbalist/haul/stone/herbs) that
  // previously were hardcoded to 1 in RoleAssignmentSystem. Gating rules
  // (required building exists, n>=10 for HAUL) stay on the sim side; the
  // sliders only set the max cap, so accidental over-allocation still
  // yields specialistBudget-bounded behaviour.
  #setupRoleQuotaControls() {
    const ensureQuotas = () => {
      if (!this.state.controls.roleQuotas) {
        this.state.controls.roleQuotas = { cook: 1, smith: 1, herbalist: 1, haul: 1, stone: 1, herbs: 1 };
      }
      return this.state.controls.roleQuotas;
    };
    const bind = (el, key) => {
      el?.addEventListener("input", () => {
        const raw = Number(el.value);
        const v = Math.max(0, Math.min(8, Number.isFinite(raw) ? Math.round(raw) : 0));
        const quotas = ensureQuotas();
        quotas[key] = v;
        this.sync();
      });
    };
    bind(this.roleQuotaCook, "cook");
    bind(this.roleQuotaSmith, "smith");
    bind(this.roleQuotaHerbalist, "herbalist");
    bind(this.roleQuotaHaul, "haul");
    bind(this.roleQuotaStone, "stone");
    bind(this.roleQuotaHerbs, "herbs");
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
    const storedDock = localStorage.getItem("utopiaDockCollapsed");
    const dockCollapsed = storedDock === null ? true : storedDock === "1";
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
    if (!controls.populationTargets) {
      this.#syncPopulationTargetsFromWorld();
      return;
    }

    const existing = controls.populationTargets;
    const visitorFallback = Number.isFinite(Number(existing.visitors)) ? Number(existing.visitors) : null;
    let traders = Number(existing.traders);
    let saboteurs = Number(existing.saboteurs);

    if (!Number.isFinite(traders) && !Number.isFinite(saboteurs) && Number.isFinite(visitorFallback)) {
      traders = Math.round(visitorFallback * 0.2);
      saboteurs = Math.max(0, visitorFallback - traders);
    }

    if (!Number.isFinite(traders)) {
      traders = this.state.agents.filter((a) => a.type === "VISITOR" && (a.kind === "TRADER" || a.groupId === "traders")).length;
    }
    if (!Number.isFinite(saboteurs)) {
      saboteurs = this.state.agents.filter((a) => a.type === "VISITOR" && !(a.kind === "TRADER" || a.groupId === "traders")).length;
    }

    controls.populationTargets = {
      workers: clampPopulationTarget("workers", existing.workers, 0),
      traders: clampPopulationTarget("traders", traders, 0),
      saboteurs: clampPopulationTarget("saboteurs", saboteurs, 0),
      herbivores: clampPopulationTarget("herbivores", existing.herbivores, 0),
      predators: clampPopulationTarget("predators", existing.predators, 0),
      visitors: clampPopulationTarget("traders", traders, 0) + clampPopulationTarget("saboteurs", saboteurs, 0),
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

  #isElementFocused(el) {
    return Boolean(el && typeof document !== "undefined" && document.activeElement === el);
  }

  #setFieldValueIfIdle(el, value) {
    if (!el || this.#isElementFocused(el)) return;
    const next = String(value ?? "");
    if (el.value !== next) {
      el.value = next;
    }
  }

  #setPopulationTarget(key, value) {
    if (!POPULATION_TARGET_LIMITS[key]) return;
    const current = this.state.controls.populationTargets?.[key] ?? 0;
    const nextValue = clampPopulationTarget(key, value, current);
    this.state.controls.populationTargets[key] = nextValue;
    this.state.controls.populationTargets.visitors =
      (this.state.controls.populationTargets.traders | 0)
      + (this.state.controls.populationTargets.saboteurs | 0);
    this.sync();
  }

  #syncPopulationTargetsFromWorld() {
    let workers = 0;
    let traders = 0;
    let saboteurs = 0;
    let herbivores = 0;
    let predators = 0;

    for (const agent of this.state.agents) {
      if (agent.type === "WORKER" && !agent.isStressWorker) workers += 1;
      if (agent.type === "VISITOR") {
        if (agent.kind === "TRADER" || agent.groupId === "traders") traders += 1;
        else saboteurs += 1;
      }
    }
    for (const animal of this.state.animals) {
      if (animal.kind === "HERBIVORE") herbivores += 1;
      if (animal.kind === "PREDATOR") predators += 1;
    }

    this.state.controls.populationTargets = {
      workers: clampPopulationTarget("workers", workers),
      traders: clampPopulationTarget("traders", traders),
      saboteurs: clampPopulationTarget("saboteurs", saboteurs),
      herbivores: clampPopulationTarget("herbivores", herbivores),
      predators: clampPopulationTarget("predators", predators),
      visitors: clampPopulationTarget("traders", traders) + clampPopulationTarget("saboteurs", saboteurs),
    };
  }

  sync() {
    this.toolButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === this.state.controls.tool);
    });

    if (this.farmRatio && this.farmRatioLabel) {
      const pct = Math.round(this.state.controls.farmRatio * 100);
      this.#setFieldValueIfIdle(this.farmRatio, pct);
      this.farmRatioLabel.textContent = `${pct}%`;
    }

    // v0.8.2 Round-1 02a-rimworld-veteran — reflect state.controls.roleQuotas
    // back into the 6 sliders + number labels. Mirrors the farmRatio pattern.
    const quotas = this.state.controls?.roleQuotas;
    if (quotas) {
      const clampQuota = (v) => Math.max(0, Math.min(8, Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0));
      const syncQuota = (input, label, key) => {
        const value = clampQuota(quotas[key]);
        if (input) this.#setFieldValueIfIdle(input, value);
        if (label) label.textContent = String(value);
      };
      syncQuota(this.roleQuotaCook, this.roleQuotaCookLabel, "cook");
      syncQuota(this.roleQuotaSmith, this.roleQuotaSmithLabel, "smith");
      syncQuota(this.roleQuotaHerbalist, this.roleQuotaHerbalistLabel, "herbalist");
      syncQuota(this.roleQuotaHaul, this.roleQuotaHaulLabel, "haul");
      syncQuota(this.roleQuotaStone, this.roleQuotaStoneLabel, "stone");
      syncQuota(this.roleQuotaHerbs, this.roleQuotaHerbsLabel, "herbs");
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
      this.#setFieldValueIfIdle(this.fixedStepHz, Math.round(hz));
      this.fixedStepHzLabel.textContent = `${hz.toFixed(1)} Hz`;
    }

    if (this.cameraMinZoom && this.cameraMinZoomLabel) {
      const minZoom = Math.max(0.3, Math.min(5, Number(this.state.controls.cameraMinZoom) || 0.55));
      this.#setFieldValueIfIdle(this.cameraMinZoom, Math.round(minZoom * 100));
      this.cameraMinZoomLabel.textContent = minZoom.toFixed(2);
    }

    if (this.cameraMaxZoom && this.cameraMaxZoomLabel) {
      const maxZoom = Math.max(0.4, Math.min(6, Number(this.state.controls.cameraMaxZoom) || 3.2));
      this.#setFieldValueIfIdle(this.cameraMaxZoom, Math.round(maxZoom * 100));
      this.cameraMaxZoomLabel.textContent = maxZoom.toFixed(2);
    }

    if (this.renderDetailThreshold && this.renderDetailThresholdLabel) {
      const threshold = Math.max(80, Math.min(2000, Math.round(Number(this.state.controls.renderModelDisableThreshold) || 260)));
      this.#setFieldValueIfIdle(this.renderDetailThreshold, threshold);
      this.renderDetailThresholdLabel.textContent = String(threshold);
    }

    if (this.toggleSidebarBtn && this.wrapRoot) {
      const collapsed = this.wrapRoot.classList.contains("sidebar-collapsed");
      this.toggleSidebarBtn.textContent = collapsed ? "☰ Menu" : "✕ Close";
    }

    if (this.toggleDockBtn && this.wrapRoot) {
      const collapsed = this.wrapRoot.classList.contains("dock-collapsed");
      this.toggleDockBtn.textContent = collapsed ? "Debug" : "Hide Debug";
    }

    if (this.mapTemplateSelect) {
      this.#setFieldValueIfIdle(this.mapTemplateSelect, this.state.controls.mapTemplateId ?? this.state.world.mapTemplateId);
    }

    if (this.mapSeedInput) {
      this.#setFieldValueIfIdle(this.mapSeedInput, this.state.controls.mapSeed ?? this.state.world.mapSeed ?? 1337);
    }

    if (this.doctrineSelect) {
      this.#setFieldValueIfIdle(this.doctrineSelect, this.state.controls.doctrine ?? this.state.gameplay.doctrine);
    }

    const targets = this.state.controls.populationTargets;
    if (targets) {
      const workers = clampPopulationTarget("workers", targets.workers, 0);
      const traders = clampPopulationTarget("traders", targets.traders, 0);
      const saboteurs = clampPopulationTarget("saboteurs", targets.saboteurs, 0);
      const herbivores = clampPopulationTarget("herbivores", targets.herbivores, 0);
      const predators = clampPopulationTarget("predators", targets.predators, 0);
      const visitors = traders + saboteurs;
      targets.visitors = visitors;

      if (this.workerTargetInput) this.#setFieldValueIfIdle(this.workerTargetInput, workers);
      if (this.workerTargetNumber) this.#setFieldValueIfIdle(this.workerTargetNumber, workers);
      if (this.workerTargetLabel) this.workerTargetLabel.textContent = String(workers);

      if (this.traderTargetInput) this.#setFieldValueIfIdle(this.traderTargetInput, traders);
      if (this.traderTargetNumber) this.#setFieldValueIfIdle(this.traderTargetNumber, traders);
      if (this.traderTargetLabel) this.traderTargetLabel.textContent = String(traders);

      if (this.saboteurTargetInput) this.#setFieldValueIfIdle(this.saboteurTargetInput, saboteurs);
      if (this.saboteurTargetNumber) this.#setFieldValueIfIdle(this.saboteurTargetNumber, saboteurs);
      if (this.saboteurTargetLabel) this.saboteurTargetLabel.textContent = String(saboteurs);

      if (this.herbivoreTargetInput) this.#setFieldValueIfIdle(this.herbivoreTargetInput, herbivores);
      if (this.herbivoreTargetNumber) this.#setFieldValueIfIdle(this.herbivoreTargetNumber, herbivores);
      if (this.herbivoreTargetLabel) this.herbivoreTargetLabel.textContent = String(herbivores);

      if (this.predatorTargetInput) this.#setFieldValueIfIdle(this.predatorTargetInput, predators);
      if (this.predatorTargetNumber) this.#setFieldValueIfIdle(this.predatorTargetNumber, predators);
      if (this.predatorTargetLabel) this.predatorTargetLabel.textContent = String(predators);

      if (this.visitorTargetLabel) {
        this.visitorTargetLabel.textContent = `Visitors Total: ${visitors} (Traders ${traders} / Saboteurs ${saboteurs})`;
      }
    }

    if (this.saveSlotInput) {
      this.#setFieldValueIfIdle(this.saveSlotInput, this.state.controls.saveSlotId ?? "default");
    }
    if (this.undoBuildBtn) this.undoBuildBtn.disabled = !this.state.controls.canUndo;
    if (this.redoBuildBtn) this.redoBuildBtn.disabled = !this.state.controls.canRedo;

    const buildPanel = getBuildToolPanelState(this.state);
    // v0.8.2 Round0 02b-casual — swap compact cost ("5w") for expanded
    // cost ("5 wood") when the casual UI profile is active. Reviewer
    // player-02-casual reported reading "5w" as "5 food" multiple times.
    const profile = this.state.controls?.uiProfile ?? "casual";
    const costLabelDisplay = profile === "casual"
      ? (buildPanel.costLabelExpanded ?? buildPanel.costLabel)
      : buildPanel.costLabel;
    if (this.buildToolLabelVal) this.buildToolLabelVal.textContent = buildPanel.label;
    if (this.buildToolSummaryVal) this.buildToolSummaryVal.textContent = buildPanel.summary;
    if (this.buildToolCostVal) this.buildToolCostVal.textContent = `Cost: ${costLabelDisplay}`;
    if (this.buildToolRulesVal) this.buildToolRulesVal.textContent = `Rules: ${buildPanel.rules}`;
    if (this.buildPreviewVal) {
      // v0.8.2 Round-0 01b — tint the hover-preview row when the current tool
      // cannot be placed on the hovered tile, and prepend a ✗ glyph so players
      // notice the blocker BEFORE clicking (P0 fix: "silent failure" root cause).
      const preview = this.state.controls?.buildPreview;
      const isBlocker = preview && preview.ok === false && preview.reasonText;
      if (isBlocker) {
        this.buildPreviewVal.textContent = `\u2717 ${preview.reasonText}`;
        this.buildPreviewVal.setAttribute("data-kind", "error");
        // Bonus: expose the reason via data-tooltip for any downstream reader
        // (reviewer 01a / 02b / 02e may hook into this). First introduction.
        this.buildPreviewVal.setAttribute("data-tooltip", preview.reasonText);
      } else if (preview && preview.ok === true && Array.isArray(preview.warnings) && preview.warnings.length > 0) {
        this.buildPreviewVal.textContent = `\u26A0 ${preview.warnings[0]} | ${buildPanel.previewSummary}`;
        this.buildPreviewVal.setAttribute("data-kind", "warn");
        this.buildPreviewVal.setAttribute("data-tooltip", preview.warnings[0]);
      } else {
        this.buildPreviewVal.textContent = buildPanel.previewSummary;
        this.buildPreviewVal.setAttribute("data-kind", "");
        this.buildPreviewVal.setAttribute("data-tooltip", "");
      }
      // v0.8.2 Round0 02b-casual — bold the validity row in casual profile.
      // CSS selector body.casual-mode #buildPreviewVal[data-ui-casual-accent].
      if (profile === "casual") {
        this.buildPreviewVal.setAttribute("data-ui-casual-accent", "1");
      } else {
        this.buildPreviewVal.removeAttribute("data-ui-casual-accent");
      }
    }

    if (this.populationBreakdownVal) {
      const breakdown = this.state.controls.populationBreakdown ?? {
        baseWorkers: 0,
        stressWorkers: 0,
        totalWorkers: 0,
        totalEntities: this.state.agents.length + this.state.animals.length,
      };
      // v0.8.2 Round-0 02e-indie-critic — voice polish: strip dev-variable names
      // ("Base W / Stress W / Total W / Entities:") from the player-facing label.
      // Bullets (·) and an "N entities" suffix read as colony narration instead
      // of engineer telemetry, addressing the indie-critic voice-leak feedback.
      this.populationBreakdownVal.textContent = `Base ${breakdown.baseWorkers} \u00b7 Stress ${breakdown.stressWorkers} \u00b7 Total ${breakdown.totalWorkers} \u00b7 ${breakdown.totalEntities} entities`;
    }

    const tuned = sanitizeTerrainTuning(
      this.state.controls.terrainTuning ?? getTerrainTuningDefaults(this.state.controls.mapTemplateId),
      this.state.controls.mapTemplateId,
    );
    this.state.controls.terrainTuning = tuned;

    if (this.terrainWaterLevel) this.#setFieldValueIfIdle(this.terrainWaterLevel, Math.round(tuned.waterLevel * 100));
    if (this.terrainWaterLevelLabel) this.terrainWaterLevelLabel.textContent = tuned.waterLevel.toFixed(2);
    if (this.terrainRiverCount) this.#setFieldValueIfIdle(this.terrainRiverCount, tuned.riverCount);
    if (this.terrainRiverCountLabel) this.terrainRiverCountLabel.textContent = String(tuned.riverCount);
    if (this.terrainRiverWidth) this.#setFieldValueIfIdle(this.terrainRiverWidth, Math.round(tuned.riverWidth * 10));
    if (this.terrainRiverWidthLabel) this.terrainRiverWidthLabel.textContent = tuned.riverWidth.toFixed(1);
    if (this.terrainRiverAmp) this.#setFieldValueIfIdle(this.terrainRiverAmp, Math.round(tuned.riverAmp * 100));
    if (this.terrainRiverAmpLabel) this.terrainRiverAmpLabel.textContent = tuned.riverAmp.toFixed(2);
    if (this.terrainMountainStrength) this.#setFieldValueIfIdle(this.terrainMountainStrength, Math.round(tuned.mountainStrength * 100));
    if (this.terrainMountainStrengthLabel) this.terrainMountainStrengthLabel.textContent = tuned.mountainStrength.toFixed(2);
    if (this.terrainIslandBias) this.#setFieldValueIfIdle(this.terrainIslandBias, Math.round(tuned.islandBias * 100));
    if (this.terrainIslandBiasLabel) this.terrainIslandBiasLabel.textContent = tuned.islandBias.toFixed(2);
    if (this.terrainOceanBias) this.#setFieldValueIfIdle(this.terrainOceanBias, Math.round(tuned.oceanBias * 100));
    if (this.terrainOceanBiasLabel) this.terrainOceanBiasLabel.textContent = tuned.oceanBias.toFixed(2);
    if (this.terrainRoadDensity) this.#setFieldValueIfIdle(this.terrainRoadDensity, Math.round(tuned.roadDensity * 100));
    if (this.terrainRoadDensityLabel) this.terrainRoadDensityLabel.textContent = `${Math.round(tuned.roadDensity * 100)}%`;
    if (this.terrainSettlementDensity) this.#setFieldValueIfIdle(this.terrainSettlementDensity, Math.round(tuned.settlementDensity * 100));
    if (this.terrainSettlementDensityLabel) this.terrainSettlementDensityLabel.textContent = `${Math.round(tuned.settlementDensity * 100)}%`;
    if (this.terrainWallModeSelect) this.#setFieldValueIfIdle(this.terrainWallModeSelect, tuned.wallMode);
    if (this.terrainOceanSideSelect) this.#setFieldValueIfIdle(this.terrainOceanSideSelect, tuned.oceanSide);
  }
}
