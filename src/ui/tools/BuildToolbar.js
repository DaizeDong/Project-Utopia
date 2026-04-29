import {
  MAP_TEMPLATES,
  TERRAIN_WALL_MODES,
  TERRAIN_OCEAN_SIDES,
  getTerrainTuningDefaults,
  sanitizeTerrainTuning,
} from "../../world/grid/Grid.js";
import { getDoctrinePresets } from "../../simulation/meta/ProgressionSystem.js";
import { getBuildToolPanelState } from "../../simulation/construction/BuildAdvisor.js";
import { explainTerm } from "../hud/glossary.js";
import { getResourceChainStall } from "../../simulation/ai/colony/ColonyPerceiver.js";
import { DEFAULT_DISPLAY_SETTINGS, sanitizeDisplaySettings } from "../../app/controlSanitizers.js";
import { BALANCE } from "../../config/balance.js";

// v0.8.2 Round-5 Wave-2 (02b-casual Step 4): when a build preview reports
// "insufficientResource", pick the first limiting raw resource that still
// has a production-chain bottleneck and return the chain's nextAction so
// the build-preview tooltip can say "need wood — no lumber mill yet;
// build lumber (5w)" instead of a bare "Insufficient resources."
function getBuildDeficitHint(state, preview) {
  if (!preview || preview.reason !== "insufficientResource") return null;
  const deficits = preview.deficits ?? preview.shortfalls ?? preview.missing ?? null;
  const stall = getResourceChainStall(state) ?? {};
  const orderedKeys = deficits && typeof deficits === "object"
    ? Object.keys(deficits).filter((k) => Number(deficits[k]) > 0)
    : ["wood", "stone", "herbs", "food"];
  for (const key of orderedKeys) {
    const info = stall[key];
    if (info && info.bottleneck) {
      return info.nextAction
        ? `${key} stalled: ${info.bottleneck} — ${info.nextAction}`
        : `${key} stalled: ${info.bottleneck}`;
    }
  }
  return null;
}

const SIDEBAR_PANELS_STORAGE_KEY = "utopiaSidebarPanels:v2";
const CORE_PANEL_KEYS = Object.freeze([
  "build",
  "costs",
  "resources",
  "population",
  "display",
  "management",
  "world",
  "ai-automation",
  "ai-timeline",
  "ai-insights",
  "ai-exchange",
]);
const POPULATION_TARGET_LIMITS = Object.freeze({
  workers: { min: 0, max: 500 },
  traders: { min: 0, max: 300 },
  saboteurs: { min: 0, max: 300 },
  herbivores: { min: 0, max: 400 },
  predators: { min: 0, max: 200 },
});
const DISPLAY_PRESETS = Object.freeze({
  performance: Object.freeze({
    resolutionScale: 0.65,
    renderMode: "2d",
    antialias: "off",
    shadowQuality: "off",
    textureQuality: "low",
    powerPreference: "high-performance",
    effectsEnabled: false,
    weatherParticles: false,
    fogEnabled: false,
    heatLabels: false,
    entityAnimations: false,
  }),
  balanced: Object.freeze({
    resolutionScale: 1,
    renderMode: "auto",
    antialias: "auto",
    shadowQuality: "auto",
    textureQuality: "high",
    powerPreference: "high-performance",
    effectsEnabled: true,
    weatherParticles: true,
    fogEnabled: true,
    heatLabels: true,
    entityAnimations: true,
  }),
  quality: Object.freeze({
    resolutionScale: 1.2,
    renderMode: "auto",
    antialias: "on",
    shadowQuality: "medium",
    textureQuality: "high",
    powerPreference: "high-performance",
    effectsEnabled: true,
    weatherParticles: true,
    fogEnabled: true,
    heatLabels: true,
    entityAnimations: true,
  }),
  ultra: Object.freeze({
    resolutionScale: 1.5,
    renderMode: "3d",
    antialias: "on",
    shadowQuality: "high",
    textureQuality: "ultra",
    powerPreference: "high-performance",
    effectsEnabled: true,
    weatherParticles: true,
    fogEnabled: true,
    heatLabels: true,
    entityAnimations: true,
  }),
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

    // Add the neutral tool before collecting data-tool buttons so it joins
    // the existing click handlers and active-state sync.
    this.#injectSelectToolButton();
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
    this.displayPresetSelect = document.getElementById("displayPresetSelect");
    this.displayResolutionScale = document.getElementById("displayResolutionScale");
    this.displayResolutionScaleLabel = document.getElementById("displayResolutionScaleLabel");
    this.displayUiScale = document.getElementById("displayUiScale");
    this.displayUiScaleLabel = document.getElementById("displayUiScaleLabel");
    this.displayRenderModeSelect = document.getElementById("displayRenderModeSelect");
    this.displayShadowQualitySelect = document.getElementById("displayShadowQualitySelect");
    this.displayAntialiasSelect = document.getElementById("displayAntialiasSelect");
    this.displayTextureQualitySelect = document.getElementById("displayTextureQualitySelect");
    this.displayPowerPreferenceSelect = document.getElementById("displayPowerPreferenceSelect");
    this.displayEffectsToggle = document.getElementById("displayEffectsToggle");
    this.displayWeatherParticlesToggle = document.getElementById("displayWeatherParticlesToggle");
    this.displayFogToggle = document.getElementById("displayFogToggle");
    this.displayHeatLabelsToggle = document.getElementById("displayHeatLabelsToggle");
    this.displayEntityAnimationsToggle = document.getElementById("displayEntityAnimationsToggle");
    this.displayTileIconsToggle = document.getElementById("displayTileIconsToggle");
    this.displayUnitSpritesToggle = document.getElementById("displayUnitSpritesToggle");
    this.displayRuntimeSummary = document.getElementById("displayRuntimeSummary");
    this.resetDisplaySettingsBtn = document.getElementById("resetDisplaySettingsBtn");
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
    // v0.8.8 A1 (F6) — Recruit DOM is now baked into index.html
    // (#recruitControlsWrap with #recruitOneBtn / #autoRecruitToggle /
    // #recruitStatusVal at line ~2710). Both #ensureRecruitControls (state
    // backfill) and #injectRecruitControls (dynamic DOM) were removed —
    // EntityFactory.js seeds recruit fields on state.controls and the
    // static DOM is always present. Only #setupRecruitControls remains
    // to wire handlers to the existing nodes.
    this.#setupRecruitControls();

    this.#setupToolButtons();
    this.#setupManagementControls();
    this.#setupModeControls();
    this.#setupSidebarPanelControls();
    this.#restoreCompactPreference();
    this.#restoreLayoutPreference();
    this.#restoreSidebarPanelState();

    this.sync();
  }

  /**
   * v0.8.4 Phase 11 (Agent D) — wire the recruit DOM nodes to state. The
   * +1 button enqueues (clamped to BALANCE.recruitMaxQueueSize and gated on
   * food >= recruitFoodCost). The auto toggle binds to autoRecruit. The
   * worker target slider, if present, updates recruitTarget so the existing
   * UI tile keeps doing useful work post-rename.
   *
   * v0.8.8 A1 (F6) — Static DOM is now in index.html (#recruitControlsWrap
   * with #recruitOneBtn / #autoRecruitToggle / #recruitStatusVal). The
   * dynamic-injection helpers (#injectRecruitControls, #ensureRecruitControls)
   * were removed; this method now resolves the static nodes and also
   * defensively backfills state.controls fields for legacy snapshots.
   */
  #setupRecruitControls() {
    if (typeof document === "undefined") return;
    // Defensive backfill for legacy snapshots without recruit fields.
    // EntityFactory.js seeds these on fresh state, but pre-v0.8.4 saves
    // may load without them.
    if (this.state) {
      this.state.controls ??= {};
      const cc = this.state.controls;
      if (!Number.isFinite(cc.recruitTarget)) cc.recruitTarget = 16;
      if (!Number.isFinite(cc.recruitQueue)) cc.recruitQueue = 0;
      if (!Number.isFinite(cc.recruitCooldownSec)) cc.recruitCooldownSec = 0;
      if (typeof cc.autoRecruit !== "boolean") cc.autoRecruit = true;
    }
    const c = this.state?.controls ?? null;
    if (!c) return;

    // Resolve static DOM nodes (index.html ~line 2710).
    this.recruitOneBtn = document.getElementById("recruitOneBtn");
    this.autoRecruitToggle = document.getElementById("autoRecruitToggle");
    this.recruitStatusVal = document.getElementById("recruitStatusVal");

    if (this.recruitOneBtn) {
      this.recruitOneBtn.addEventListener("click", () => {
        const food = Number(this.state.resources?.food ?? 0);
        const cost = Number(BALANCE.recruitFoodCost ?? 25);
        const maxQueue = Number(BALANCE.recruitMaxQueueSize ?? 12);
        if (food < cost) {
          c.actionMessage = "Not enough food to recruit.";
          c.actionKind = "warn";
          this.sync();
          return;
        }
        if ((c.recruitQueue ?? 0) >= maxQueue) {
          c.actionMessage = "Recruit queue is full.";
          c.actionKind = "warn";
          this.sync();
          return;
        }
        c.recruitQueue = Math.min(maxQueue, Number(c.recruitQueue ?? 0) + 1);
        c.actionMessage = `Recruit queued (${c.recruitQueue}).`;
        c.actionKind = "info";
        this.sync();
      });
    }

    if (this.autoRecruitToggle) {
      this.autoRecruitToggle.addEventListener("change", () => {
        c.autoRecruit = Boolean(this.autoRecruitToggle.checked);
        this.sync();
      });
    }

    // Worker target slider doubles as the recruit target. Existing
    // populationTargets binding in #setupPopulationControls already handles
    // the slider; we mirror its value into recruitTarget on input.
    if (this.workerTargetInput) {
      this.workerTargetInput.addEventListener("input", () => {
        const v = Math.max(0, Number(this.workerTargetInput.value) | 0);
        c.recruitTarget = v;
      });
    }
  }

  #setupToolButtons() {
    this.toolButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tool = btn.dataset.tool;
        if (!tool) return;
        this.state.controls.tool = tool;
        if (tool === "select") {
          this.state.controls.buildPreview = null;
          this.state.controls.actionMessage = "Select tool - click a worker or tile without building.";
        } else if (tool === "erase") {
          // v0.8.4 (Agent B) — destructive action gets a distinct, explicit
          // status message instead of "Selected tool: erase". The construction
          // overlay flow (Agent A) means demolishing now takes time, so the
          // message also nudges players that workers will travel to the site.
          this.state.controls.actionMessage = "Demolish tool — click a built tile or RUINS. Workers will dismantle over time. Costs 1 wood to commission.";
        } else {
          this.state.controls.actionMessage = `Selected tool: ${tool}`;
        }
        this.state.controls.actionKind = "info";
        this.sync();
        // v0.8.7 T3-3 (QA2-F3): clear any in-flight toasts before the tool
        // changes so a "Need 5 wood" toast left over from BUILD doesn't
        // float over the next tool's UI. Fire a separate event so GameApp
        // can forward to SceneRenderer.clearToasts() without BuildToolbar
        // needing a renderer reference.
        if (typeof document !== "undefined") {
          document.dispatchEvent(new CustomEvent("utopia:clearToasts", { detail: { reason: "toolChange" }, bubbles: false }));
        }
        // Notify GameApp so it can apply the context-aware terrain overlay.
        if (typeof document !== "undefined") {
          document.dispatchEvent(new CustomEvent("utopia:toolChange", { detail: { tool }, bubbles: false }));
        }
      });
    });
  }

  #injectSelectToolButton() {
    if (typeof document === "undefined") return;
    if (document.querySelector('button[data-tool="select"]')) return;

    // Look for any existing data-tool button so we can target its parent
    // (the tool-grid container). Falls back to null on headless DOM.
    const anchor = document.querySelector("button[data-tool]");
    const grid = anchor?.parentElement;
    if (!grid) return;

    const selectBtn = document.createElement("button");
    selectBtn.setAttribute("data-tool", "select");
    // v0.8.7.1 U3 — advertise hotkey 0 in the tooltip + data-hotkey
    // attribute so the help modal / future shortcut surfaces can read it.
    selectBtn.setAttribute("data-hotkey", "0");
    selectBtn.setAttribute(
      "title",
      "Select / Inspect (0 or Esc) - neutral mode, click a worker or tile without building",
    );
    selectBtn.textContent = "Select";
    grid.insertBefore(selectBtn, anchor);

    // v0.8.2 Round-5 Wave-2 (01a-onboarding Step 2): removed the
    // road → select silent rebind. Since default tool is now "select"
    // (EntityFactory.js), the rebind was dead code that also confused
    // player expectations (pressing `1` would fight the rebind).
  }

  #setupManagementControls() {
    this.#populateMapTemplates();
    this.#populateDoctrines();
    this.#populateTerrainModeOptions();
    this.#setupPopulationControls();
    this.#setupRoleQuotaControls();
    this.#setupTerrainTuningControls();
    this.#setupDisplayControls();
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
        // v0.8.2 Round-5 Wave-1 (02a Step 9): 99 = "unlimited" sentinel,
        // aligned with EntityFactory.createInitialGameState. Pop-scaled
        // formula in RoleAssignmentSystem dominates; player sliders still
        // clamp the cap back into 1-5 when they want to compress.
        this.state.controls.roleQuotas = { cook: 99, smith: 99, herbalist: 99, haul: 99, stone: 99, herbs: 99 };
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

  #displaySettings() {
    const { settings } = sanitizeDisplaySettings(this.state.controls.display, DEFAULT_DISPLAY_SETTINGS);
    this.state.controls.display = settings;
    return settings;
  }

  #applyDisplaySettings(patch, options = {}) {
    const current = this.#displaySettings();
    const next = {
      ...current,
      ...patch,
    };
    if (options.markCustom !== false && patch.preset === undefined) {
      next.preset = "custom";
    }
    const { settings } = sanitizeDisplaySettings(next, DEFAULT_DISPLAY_SETTINGS);
    this.handlers.onSetDisplaySettings?.(settings);
    if (!this.handlers.onSetDisplaySettings) {
      this.state.controls.display = settings;
    }
    this.sync();
  }

  #setupDisplayControls() {
    this.displayPresetSelect?.addEventListener("change", () => {
      const preset = this.displayPresetSelect.value;
      if (preset === "custom") {
        this.#applyDisplaySettings({ preset: "custom" }, { markCustom: false });
        return;
      }
      const presetSettings = DISPLAY_PRESETS[preset] ?? DISPLAY_PRESETS.balanced;
      this.#applyDisplaySettings({ ...presetSettings, preset }, { markCustom: false });
    });

    this.displayResolutionScale?.addEventListener("input", () => {
      const value = Math.max(50, Math.min(175, Number(this.displayResolutionScale.value) || 100)) / 100;
      this.#applyDisplaySettings({ resolutionScale: value });
    });

    this.displayUiScale?.addEventListener("input", () => {
      const value = Math.max(80, Math.min(140, Number(this.displayUiScale.value) || 100)) / 100;
      this.#applyDisplaySettings({ uiScale: value });
    });

    this.displayRenderModeSelect?.addEventListener("change", () => {
      this.#applyDisplaySettings({ renderMode: this.displayRenderModeSelect.value });
    });
    this.displayShadowQualitySelect?.addEventListener("change", () => {
      this.#applyDisplaySettings({ shadowQuality: this.displayShadowQualitySelect.value });
    });
    this.displayAntialiasSelect?.addEventListener("change", () => {
      this.#applyDisplaySettings({ antialias: this.displayAntialiasSelect.value });
    });
    this.displayTextureQualitySelect?.addEventListener("change", () => {
      this.#applyDisplaySettings({ textureQuality: this.displayTextureQualitySelect.value });
    });
    this.displayPowerPreferenceSelect?.addEventListener("change", () => {
      this.#applyDisplaySettings({ powerPreference: this.displayPowerPreferenceSelect.value });
    });

    this.displayEffectsToggle?.addEventListener("change", () => {
      this.#applyDisplaySettings({ effectsEnabled: Boolean(this.displayEffectsToggle.checked) });
    });
    this.displayWeatherParticlesToggle?.addEventListener("change", () => {
      this.#applyDisplaySettings({ weatherParticles: Boolean(this.displayWeatherParticlesToggle.checked) });
    });
    this.displayFogToggle?.addEventListener("change", () => {
      this.#applyDisplaySettings({ fogEnabled: Boolean(this.displayFogToggle.checked) });
    });
    this.displayHeatLabelsToggle?.addEventListener("change", () => {
      this.#applyDisplaySettings({ heatLabels: Boolean(this.displayHeatLabelsToggle.checked) });
    });
    this.displayEntityAnimationsToggle?.addEventListener("change", () => {
      this.#applyDisplaySettings({ entityAnimations: Boolean(this.displayEntityAnimationsToggle.checked) });
    });
    this.displayTileIconsToggle?.addEventListener("change", () => {
      this.handlers.onSetTileIconsVisible?.(Boolean(this.displayTileIconsToggle.checked));
      this.sync();
    });
    this.displayUnitSpritesToggle?.addEventListener("change", () => {
      this.handlers.onSetUnitSpritesVisible?.(Boolean(this.displayUnitSpritesToggle.checked));
      this.sync();
    });

    this.resetDisplaySettingsBtn?.addEventListener("click", () => {
      this.handlers.onSetTileIconsVisible?.(true);
      this.handlers.onSetUnitSpritesVisible?.(true);
      this.#applyDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS }, { markCustom: false });
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
        // Reset decision timers so the LLM is called immediately on the next
        // simulation tick rather than waiting for the full interval to elapse.
        this.state.ai.lastEnvironmentDecisionSec = -9999;
        this.state.ai.lastPolicyDecisionSec = -9999;
        this.state.ai.forceStrategicDecision = true;
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
      // v0.8.8 A5 (F14) — Single source of truth is `utopiaSidebarOpen` and
      // the `sidebar-open` class on wrapRoot, both managed by inline JS in
      // index.html (~line 3140). BuildToolbar no longer toggles
      // `sidebar-collapsed`; we just flip the open state via storage so the
      // index.html restore handler picks it up on next load.
      const isOpen = Boolean(this.wrapRoot?.classList.contains("sidebar-open"));
      const next = !isOpen;
      this.wrapRoot?.classList.toggle("sidebar-open", next);
      try { localStorage.setItem("utopiaSidebarOpen", next ? "1" : "0"); } catch {}
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
    // v0.8.8 A5 (F14) — sidebar state lives at `utopiaSidebarOpen` and is
    // restored by inline JS in index.html (~line 3178). We no longer apply
    // `sidebar-collapsed` from BuildToolbar; the legacy
    // `utopiaSidebarCollapsed` key is ignored to avoid the dual-source
    // conflict that caused stale visibility on reload.
    const storedDock = localStorage.getItem("utopiaDockCollapsed");
    const dockCollapsed = storedDock === null ? true : storedDock === "1";
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

  // v0.8.8 A5 (F14) — #setSidebarCollapsed removed; sidebar state is now
  // owned exclusively by inline JS in index.html (utopiaSidebarOpen +
  // sidebar-open class).

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
    controls.display = sanitizeDisplaySettings(controls.display, DEFAULT_DISPLAY_SETTINGS).settings;
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
      // v0.8.2 Round-6 Wave-1 01b-playability (Step 6) — Population panel /
      // target-sync now counts the FULL `agent.type === "WORKER"` set
      // (base + stress) rather than just `!isStressWorker`. This aligns
      // with HUDController.js (lines 734-744 / 1153) which has always shown
      // the full count via `state.metrics.populationStats.workers`. Pre-fix
      // the top-bar said `Workers 13` while this Population panel said
      // `Workers 0` because the worker pool was entirely stress-rolled.
      // The base/stress split is preserved for the developer-only
      // Population Breakdown line in `populationBreakdownVal` (see :1004).
      if (agent.type === "WORKER") workers += 1;
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

  // v0.8.4 (Agent B) — Demolish-tool hover preview helper. Reads the
  // construction overlay (if any) on the hovered tile and returns a
  // { text, kind, tooltip } object describing what clicking would do.
  // Robust to missing overlay system (Agent A may not have merged yet); when
  // tileState lookup throws or returns nothing, we fall back to the legacy
  // build-preview verb.
  #readConstructionOverlay(ix, iz) {
    try {
      const grid = this.state?.grid;
      if (!grid || !Number.isFinite(ix) || !Number.isFinite(iz)) return null;
      const width = Number(grid.width ?? 0);
      const idx = ix + iz * width;
      const tileState = grid.tileState;
      const entry = (tileState && typeof tileState.get === "function") ? tileState.get(idx) : null;
      const overlay = entry?.construction ?? null;
      if (overlay && overlay.kind === "build") {
        const refund = overlay.cost ?? {};
        const refundParts = this.#formatRefundParts(refund);
        const refundText = refundParts ? ` (refund ${refundParts})` : "";
        return {
          text: `Cancel construction${refundText}`,
          kind: "warn",
          tooltip: "Right-click cancels the blueprint and refunds the commission cost.",
        };
      }
      if (overlay && overlay.kind === "demolish") {
        const totalSec = Number(overlay.workTotalSec ?? 0);
        const appliedSec = Number(overlay.workAppliedSec ?? 0);
        const pct = totalSec > 0
          ? Math.max(0, Math.min(100, Math.round((appliedSec / totalSec) * 100)))
          : 0;
        return {
          text: `Demolish in progress (${pct}% complete)`,
          kind: "warn",
          tooltip: "Workers are dismantling this tile. Click to leave them to it.",
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  #formatRefundParts(refund) {
    if (!refund || typeof refund !== "object") return "";
    const parts = [];
    const wood = Number(refund.wood ?? 0);
    const stone = Number(refund.stone ?? 0);
    const food = Number(refund.food ?? 0);
    const herbs = Number(refund.herbs ?? 0);
    if (wood > 0) parts.push(`${wood} wood`);
    if (stone > 0) parts.push(`${stone} stone`);
    if (food > 0) parts.push(`${food} food`);
    if (herbs > 0) parts.push(`${herbs} herbs`);
    return parts.join(" / ");
  }

  sync() {
    // v0.8.2 Round-5 Wave-2 (01a-onboarding Step 2): ensure the active-class
    // contract holds even for unknown tools by falling back to the Select
    // button when the current tool doesn't match any known button. Prevents
    // "no button looks active" states after future tool additions.
    const currentTool = this.state.controls.tool;
    const knownTools = new Set();
    this.toolButtons.forEach((btn) => {
      if (btn.dataset.tool) knownTools.add(btn.dataset.tool);
    });
    const effectiveTool = knownTools.has(currentTool) ? currentTool : "select";
    this.toolButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === effectiveTool);
    });

    // Update canvas cursor: default arrow in select mode, crosshair for build tools.
    if (typeof document !== "undefined") {
      document.body.style.cursor = effectiveTool === "select" ? "default" : "crosshair";
    }

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

    // v0.8.2 Round-1 01a-onboarding — attach glossary tooltips to role-quota
    // labels exactly once per BuildToolbar instance. The parent div already
    // carries a terse engine-oriented title (e.g. "Max workers assigned to
    // cooking meals"); we append the player-facing glossary copy so new
    // players see a full explanation on hover. One-shot via
    // `_glossaryApplied` to avoid repeated DOM writes every sync().
    if (!this._glossaryApplied) {
      const glossPairs = [
        [this.roleQuotaCookLabel, "cook"],
        [this.roleQuotaSmithLabel, "smith"],
        [this.roleQuotaHerbalistLabel, "herbalist"],
        [this.roleQuotaHaulLabel, "haul"],
      ];
      for (const [node, key] of glossPairs) {
        if (!node || typeof node.setAttribute !== "function") continue;
        const gloss = explainTerm(key);
        if (!gloss) continue;
        const existing = typeof node.getAttribute === "function"
          ? (node.getAttribute("title") ?? "")
          : "";
        if (existing.includes(gloss)) continue;
        const composite = existing ? `${existing} | ${gloss}` : gloss;
        node.setAttribute("title", composite);
      }
      this._glossaryApplied = true;
    }

    if (this.aiToggle) {
      this.aiToggle.checked = this.state.ai.enabled;
    }

    if (this.compactToggle && this.uiRoot) {
      this.compactToggle.checked = this.uiRoot.classList.contains("compact");
    }

    // v0.8.4 Phase 11 (Agent D) — recruit panel sync. Status line shows
    // queue + cooldown + food/cost; +1 button disables when queue is full
    // or food < cost; checkbox mirrors state.controls.autoRecruit.
    const c = this.state?.controls ?? null;
    if (c) {
      const food = Number(this.state.resources?.food ?? 0);
      const cost = Number(BALANCE.recruitFoodCost ?? 25);
      const maxQueue = Number(BALANCE.recruitMaxQueueSize ?? 12);
      const queue = Math.max(0, Number(c.recruitQueue ?? 0) | 0);
      const cooldown = Math.max(0, Number(c.recruitCooldownSec ?? 0));
      if (this.recruitStatusVal) {
        // v0.8.8 A2 (F7) — color cues:
        //  - Food segment red when food < cost (recruit blocked)
        //  - Queue segment amber when queue >= maxQueue (recruit blocked)
        const queueColor = queue >= maxQueue ? "#fbbf24" : "";
        const foodColor = food < cost ? "#f87171" : "";
        const queueSeg = queueColor
          ? `<span style="color: ${queueColor}">Queue: ${queue}</span>`
          : `Queue: ${queue}`;
        const foodSeg = foodColor
          ? `<span style="color: ${foodColor}">Food: ${Math.floor(food)}/${cost}</span>`
          : `Food: ${Math.floor(food)}/${cost}`;
        this.recruitStatusVal.innerHTML =
          `${queueSeg} · Cooldown: ${cooldown.toFixed(0)}s · ${foodSeg}`;
      }
      if (this.recruitOneBtn) {
        this.recruitOneBtn.disabled = (queue >= maxQueue) || (food < cost);
      }
      if (this.autoRecruitToggle) {
        this.autoRecruitToggle.checked = c.autoRecruit !== false;
      }
    }

    const display = this.#displaySettings();
    if (this.displayPresetSelect) this.#setFieldValueIfIdle(this.displayPresetSelect, display.preset);
    if (this.displayResolutionScale && this.displayResolutionScaleLabel) {
      const pct = Math.round(display.resolutionScale * 100);
      this.#setFieldValueIfIdle(this.displayResolutionScale, pct);
      this.displayResolutionScaleLabel.textContent = `${pct}%`;
    }
    if (this.displayUiScale && this.displayUiScaleLabel) {
      const pct = Math.round(display.uiScale * 100);
      this.#setFieldValueIfIdle(this.displayUiScale, pct);
      this.displayUiScaleLabel.textContent = `${pct}%`;
    }
    if (this.displayRenderModeSelect) this.#setFieldValueIfIdle(this.displayRenderModeSelect, display.renderMode);
    if (this.displayShadowQualitySelect) this.#setFieldValueIfIdle(this.displayShadowQualitySelect, display.shadowQuality);
    if (this.displayAntialiasSelect) this.#setFieldValueIfIdle(this.displayAntialiasSelect, display.antialias);
    if (this.displayTextureQualitySelect) this.#setFieldValueIfIdle(this.displayTextureQualitySelect, display.textureQuality);
    if (this.displayPowerPreferenceSelect) this.#setFieldValueIfIdle(this.displayPowerPreferenceSelect, display.powerPreference);
    if (this.displayEffectsToggle) this.displayEffectsToggle.checked = Boolean(display.effectsEnabled);
    if (this.displayWeatherParticlesToggle) this.displayWeatherParticlesToggle.checked = Boolean(display.weatherParticles);
    if (this.displayFogToggle) this.displayFogToggle.checked = Boolean(display.fogEnabled);
    if (this.displayHeatLabelsToggle) this.displayHeatLabelsToggle.checked = Boolean(display.heatLabels);
    if (this.displayEntityAnimationsToggle) this.displayEntityAnimationsToggle.checked = Boolean(display.entityAnimations);
    if (this.displayTileIconsToggle) this.displayTileIconsToggle.checked = Boolean(this.state.controls.showTileIcons);
    if (this.displayUnitSpritesToggle) this.displayUnitSpritesToggle.checked = Boolean(this.state.controls.showUnitSprites);
    if (this.displayRuntimeSummary) {
      const pixelRatio = Number(this.state.debug?.renderPixelRatio ?? 0);
      const entityMode = this.state.debug?.renderMode ?? "pending";
      const canvas = typeof document !== "undefined" ? document.getElementById("c") : null;
      const sizeText = canvas?.width && canvas?.height ? `${canvas.width}x${canvas.height}` : "canvas pending";
      const aaText = this.state.debug?.rendererAntialias ? "AA on" : "AA off/auto";
      const shadows = this.state.debug?.shadowQuality ?? display.shadowQuality;
      this.displayRuntimeSummary.textContent =
        `${sizeText} | ${pixelRatio > 0 ? `${pixelRatio.toFixed(2)}x` : "auto DPR"} | ${entityMode} | shadows:${shadows} | ${aaText}`;
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
      // v0.8.8 A5 (F14) — read sidebar state from `sidebar-open` class
      // (single source of truth) instead of legacy `sidebar-collapsed`.
      const open = this.wrapRoot.classList.contains("sidebar-open");
      this.toggleSidebarBtn.textContent = open ? "✕ Close" : "☰ Menu";
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
      if (this.workerTargetLabel) {
        // v0.8.7 T3-2 (QA2-F2): surface the effective infra cap on the
        // worker-target label so players see why the slider can't go past
        // a certain number. PopulationGrowthSystem already publishes
        // `state.metrics.populationInfraCap` every tick (computed as
        // min of warehouseCap, foodCap, restCap). Show "<target> / <max>
        // (infra cap N)" when the cap is below the slider max so the
        // limiting factor is obvious; otherwise just show the target.
        const infraCap = Number(this.state.metrics?.populationInfraCap ?? Infinity);
        const sliderMax = Number(this.workerTargetInput?.max ?? 200);
        if (Number.isFinite(infraCap) && infraCap >= 0 && infraCap < sliderMax) {
          this.workerTargetLabel.textContent = `${workers} / ${sliderMax} (infra cap ${infraCap})`;
        } else {
          this.workerTargetLabel.textContent = String(workers);
        }
      }

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
      // v0.8.4 (Agent B) — when the active tool is "erase" (Demolish) and the
      // hovered tile carries a construction overlay, enrich the preview text
      // with the demolish-specific verb ("Cancel construction" vs "Demolish")
      // and the salvage / refund hint. The legacy preview already reports
      // built-tile salvage in summary; we augment with overlay state.
      const preview = this.state.controls?.buildPreview;
      const isErase = (this.state.controls?.tool === "erase");
      const overlayHint = (isErase && preview && Number.isFinite(preview.ix) && Number.isFinite(preview.iz))
        ? this.#readConstructionOverlay(preview.ix, preview.iz)
        : null;
      const isBlocker = preview && preview.ok === false && preview.reasonText;
      if (isBlocker) {
        // v0.8.7.1 U2 — surface the resource-chain deficit hint INLINE in
        // the preview text (not just data-tooltip) so casual players see it
        // without hovering. Tooltip continues to expose the long form.
        let inlineText = preview.reasonText;
        let tooltip = preview.reasonText;
        if (preview.reason === "insufficientResource") {
          try {
            const stall = getBuildDeficitHint(this.state, preview);
            if (stall) {
              inlineText = `${preview.reasonText} — ${stall}`;
              tooltip = `${tooltip} — ${stall}`;
            }
          } catch {
            // Never let hint augmentation break the blocker line.
          }
        }
        this.buildPreviewVal.textContent = `\u2717 ${inlineText}`;
        this.buildPreviewVal.setAttribute("data-kind", "error");
        this.buildPreviewVal.setAttribute("data-tooltip", tooltip);
      } else if (preview && preview.ok === true && Array.isArray(preview.warnings) && preview.warnings.length > 0) {
        this.buildPreviewVal.textContent = `\u26A0 ${preview.warnings[0]} | ${buildPanel.previewSummary}`;
        this.buildPreviewVal.setAttribute("data-kind", "warn");
        this.buildPreviewVal.setAttribute("data-tooltip", preview.warnings[0]);
      } else if (overlayHint) {
        // v0.8.4 (Agent B) \u2014 demolish hover surface for blueprints + active
        // demolish overlays. The legacy build-preview path handles
        // built/RUINS hover via summarizeBuildPreview; we only fire on
        // blueprint or in-progress demolish overlays.
        this.buildPreviewVal.textContent = overlayHint.text;
        this.buildPreviewVal.setAttribute("data-kind", overlayHint.kind);
        this.buildPreviewVal.setAttribute("data-tooltip", overlayHint.tooltip);
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

    this.#refreshToolTier(this.state);
  }

  #refreshToolTier(state) {
    if (typeof document === "undefined") return;
    const unlock = state?.services?.balance?.casualUx?.toolTierUnlockBuildings ?? {};
    const unlockT = state?.services?.balance?.casualUx?.toolTierUnlockTimeSec ?? {};
    const ts = Number(state?.metrics?.timeSec ?? 0);
    const bld = state?.buildings ?? {};
    const meetsBuildings = (req) => Object.entries(req ?? {}).every(([k, v]) => Number(bld[k] ?? 0) >= Number(v));
    const tiers = ["primary"];
    if (ts >= Number(unlockT.secondary ?? 180) || meetsBuildings(unlock.secondary)) tiers.push("secondary");
    if (ts >= Number(unlockT.advanced ?? 360) || meetsBuildings(unlock.advanced)) tiers.push("advanced");
    document.body.dataset.toolTierUnlocked = tiers.join(" ");
  }
}
