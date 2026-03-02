import {
  MAP_TEMPLATES,
  TERRAIN_WALL_MODES,
  TERRAIN_OCEAN_SIDES,
  getTerrainTuningDefaults,
  sanitizeTerrainTuning,
} from "../../world/grid/Grid.js";
import { getDoctrinePresets } from "../../simulation/meta/ProgressionSystem.js";

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

    this.#ensurePopulationTargets();
    this.#ensureTerrainTuning();

    this.#setupToolButtons();
    this.#setupManagementControls();
    this.#setupModeControls();
    this.#restoreCompactPreference();

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
  }

  #restoreCompactPreference() {
    const savedCompact = localStorage.getItem("utopiaCompactMode") === "1";
    if (savedCompact) {
      this.uiRoot?.classList.add("compact");
      if (this.compactToggle) this.compactToggle.checked = true;
    }
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
