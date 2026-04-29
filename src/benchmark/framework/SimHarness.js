import { createInitialGameState } from "../../entities/EntityFactory.js";
import { createServices } from "../../app/createServices.js";
import { SimulationClock } from "../../app/SimulationClock.js";
import { ProgressionSystem } from "../../simulation/meta/ProgressionSystem.js";
import { RoleAssignmentSystem } from "../../simulation/population/RoleAssignmentSystem.js";
import { MemoryStore } from "../../simulation/ai/memory/MemoryStore.js";
import { MemoryObserver } from "../../simulation/ai/memory/MemoryObserver.js";
import { StrategicDirector } from "../../simulation/ai/strategic/StrategicDirector.js";
import { EnvironmentDirectorSystem } from "../../simulation/ai/director/EnvironmentDirectorSystem.js";
import { WeatherSystem } from "../../world/weather/WeatherSystem.js";
import { WorldEventSystem } from "../../world/events/WorldEventSystem.js";
import { NPCBrainSystem } from "../../simulation/ai/brains/NPCBrainSystem.js";
import { WorkerAISystem } from "../../simulation/npc/WorkerAISystem.js";
import { VisitorAISystem } from "../../simulation/npc/VisitorAISystem.js";
import { AnimalAISystem } from "../../simulation/npc/AnimalAISystem.js";
import { MortalitySystem } from "../../simulation/lifecycle/MortalitySystem.js";
import { WildlifePopulationSystem } from "../../simulation/ecology/WildlifePopulationSystem.js";
import { BoidsSystem } from "../../simulation/movement/BoidsSystem.js";
import { ResourceSystem } from "../../simulation/economy/ResourceSystem.js";
import { ProcessingSystem } from "../../simulation/economy/ProcessingSystem.js";
import { PopulationGrowthSystem } from "../../simulation/population/PopulationGrowthSystem.js";
import { TileStateSystem } from "../../simulation/economy/TileStateSystem.js";
import { ColonyDirectorSystem } from "../../simulation/meta/ColonyDirectorSystem.js";
import { ConstructionSystem } from "../../simulation/construction/ConstructionSystem.js";
import { WarehouseQueueSystem } from "../../simulation/economy/WarehouseQueueSystem.js";
import { evaluateRunOutcomeState } from "../../app/runOutcome.js";
import { applyPreset } from "../BenchmarkPresets.js";

export const DT_SEC = 1 / 30;

/**
 * Build systems in the same order as GameApp.createSystems() (line 373-412).
 * This matches the real game's update order exactly.
 *
 * v0.8.12 F1 — added WarehouseQueueSystem (v0.8.6) before WorkerAISystem and
 * ConstructionSystem (v0.8.4) after WorkerAISystem. Pre-fix: harness silently
 * omitted both, so any benchmark involving construction never completed
 * blueprints (workers applied labour past workTotalSec indefinitely) and
 * warehouse intake queues did not advance.
 */
function buildDefaultSystems(memoryStore) {
  return [
    new SimulationClock(),
    new ProgressionSystem(),
    new RoleAssignmentSystem(),
    new PopulationGrowthSystem(),
    new StrategicDirector(memoryStore),
    new EnvironmentDirectorSystem(),
    new WeatherSystem(),
    new WorldEventSystem(),
    new TileStateSystem(),
    new NPCBrainSystem(),
    new WarehouseQueueSystem(),
    new WorkerAISystem(),
    new ConstructionSystem(),
    new VisitorAISystem(),
    new AnimalAISystem(),
    new MortalitySystem(),
    new WildlifePopulationSystem(),
    new BoidsSystem(),
    new ResourceSystem(),
    new ProcessingSystem(),
    new ColonyDirectorSystem(),
  ];
}

export class SimHarness {
  /**
   * @param {object} opts
   * @param {string} opts.templateId
   * @param {number} opts.seed
   * @param {boolean} [opts.aiEnabled=false]
   * @param {object} [opts.preset]
   * @param {string} [opts.runtimeProfile="long_run"]
   * @param {Function} [opts.buildSystemsOverride]
   */
  constructor(opts) {
    const {
      templateId,
      seed,
      aiEnabled = false,
      preset,
      runtimeProfile = "long_run",
      buildSystemsOverride,
    } = opts;

    this.state = createInitialGameState({ templateId, seed });
    this.state.session.phase = "active";
    this.state.controls.isPaused = false;
    this.state.controls.timeScale = 1;
    this.state.ai.enabled = Boolean(aiEnabled);
    this.state.ai.coverageTarget = "fallback";
    this.state.ai.runtimeProfile = runtimeProfile;

    this.memoryStore = new MemoryStore();
    this.memoryObserver = new MemoryObserver(this.memoryStore);

    this.services = createServices(seed, {
      offlineAiFallback: !aiEnabled,
      deterministic: true,
    });

    // applyPreset after services exist so preset position jitter can draw
    // from the seeded RNG (determinism — otherwise Math.random pollutes the
    // initial state). Presets do not read sim systems, so the ordering swap
    // is safe.
    if (preset) applyPreset(this.state, preset, this.services);

    this.systems = buildSystemsOverride
      ? buildSystemsOverride(this.memoryStore)
      : buildDefaultSystems(this.memoryStore);

    this.refreshPopulationStats();
    this._initialWorkers = this.aliveWorkers.length;
  }

  refreshPopulationStats() {
    const workers = this.aliveWorkers;
    this.state.metrics.populationStats = {
      workers: workers.length,
      totalEntities: this.state.agents.length + (this.state.animals?.length ?? 0),
    };
    this.state.metrics.deathsTotal = this.state.metrics.deathsTotal ?? 0;
  }

  get aliveWorkers() {
    return this.state.agents.filter(
      (a) => a.type === "WORKER" && a.alive !== false,
    );
  }

  get initialWorkers() {
    return this._initialWorkers;
  }

  async tick() {
    for (const system of this.systems) {
      system.update(DT_SEC, this.state, this.services);
    }
    this.refreshPopulationStats();
    this.memoryObserver.observe(this.state);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  async advanceTo(targetSec) {
    const totalTicks = Math.max(1, Math.round(targetSec / DT_SEC));
    for (let t = 0; t < totalTicks; t++) {
      await this.tick();
      const outcome =
        this.state.session.phase === "active"
          ? evaluateRunOutcomeState(this.state)
          : null;
      if (outcome) {
        this.state.session.phase = "end";
        this.state.session.outcome = outcome.outcome;
        this.state.session.reason = outcome.reason;
        break;
      }
    }
  }

  async advanceTicks(count, onTick) {
    for (let t = 0; t < count; t++) {
      await this.tick();
      if (onTick) onTick(this.state, t);
      if (this.state.session.phase === "end") break;
    }
  }

  snapshot() {
    const s = this.state;
    return {
      timeSec: Number(s.metrics.timeSec ?? 0),
      food: s.resources.food,
      wood: s.resources.wood,
      stone: s.resources.stone ?? 0,
      herbs: s.resources.herbs ?? 0,
      workers: this.aliveWorkers.length,
      prosperity: s.gameplay.prosperity ?? 0,
      threat: s.gameplay.threat ?? 0,
      buildings: { ...s.buildings },
    };
  }
}

export function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
