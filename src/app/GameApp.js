import "./types.js";
import { createInitialGameState } from "../entities/EntityFactory.js";
import { SceneRenderer } from "../render/SceneRenderer.js";
import { BuildToolbar } from "../ui/tools/BuildToolbar.js";
import { HUDController } from "../ui/hud/HUDController.js";
import { InspectorPanel } from "../ui/panels/InspectorPanel.js";
import { EventPanel } from "../ui/panels/EventPanel.js";
import { PerformancePanel } from "../ui/panels/PerformancePanel.js";
import { BuildSystem } from "../simulation/construction/BuildSystem.js";
import { SimulationClock } from "./SimulationClock.js";
import { RoleAssignmentSystem } from "../simulation/population/RoleAssignmentSystem.js";
import { EnvironmentDirectorSystem } from "../simulation/ai/director/EnvironmentDirectorSystem.js";
import { WeatherSystem } from "../world/weather/WeatherSystem.js";
import { WorldEventSystem } from "../world/events/WorldEventSystem.js";
import { NPCBrainSystem } from "../simulation/ai/brains/NPCBrainSystem.js";
import { WorkerAISystem } from "../simulation/npc/WorkerAISystem.js";
import { VisitorAISystem } from "../simulation/npc/VisitorAISystem.js";
import { AnimalAISystem } from "../simulation/npc/AnimalAISystem.js";
import { BoidsSystem } from "../simulation/movement/BoidsSystem.js";
import { ResourceSystem } from "../simulation/economy/ResourceSystem.js";
import { createServices } from "./createServices.js";
import { GameLoop } from "./GameLoop.js";
import { createWorker } from "../entities/EntityFactory.js";
import { randomPassableTile, tileToWorld } from "../world/grid/Grid.js";

export class GameApp {
  constructor(canvas) {
    this.state = createInitialGameState();
    this.services = createServices();

    this.buildSystem = new BuildSystem();
    this.renderer = new SceneRenderer(canvas, this.state, this.buildSystem, (id) => {
      this.state.controls.selectedEntityId = id;
    });

    this.toolbar = new BuildToolbar(this.state);
    this.hud = new HUDController(this.state);
    this.inspector = new InspectorPanel(this.state);
    this.eventPanel = new EventPanel(this.state);
    this.performancePanel = new PerformancePanel(this.state, {
      onSetExtraWorkers: (count) => this.setExtraWorkers(count),
      onRunBenchmark: () => this.startBenchmark(),
      onCancelBenchmark: () => this.cancelBenchmark(),
      onDownloadBenchmark: () => this.downloadBenchmarkCsv(),
    });

    this.benchmark = {
      running: false,
      schedule: [0, 100, 200, 300, 400, 500],
      stageIndex: 0,
      stageElapsedSec: 0,
      stageDurationSec: 4,
      sampleStartSec: 1.2,
      sampleCount: 0,
      sumFps: 0,
      sumFrameMs: 0,
      results: [],
      csv: "",
    };

    this.systems = [
      new SimulationClock(),
      new RoleAssignmentSystem(),
      new EnvironmentDirectorSystem(),
      new WeatherSystem(),
      new WorldEventSystem(),
      new NPCBrainSystem(),
      new WorkerAISystem(),
      new VisitorAISystem(),
      new AnimalAISystem(),
      new BoidsSystem(),
      new ResourceSystem(),
    ];

    this.loop = new GameLoop((dt) => this.update(dt), (dt) => this.render(dt));
  }

  update(dt) {
    const frameStart = performance.now();

    for (const system of this.systems) {
      try {
        system.update(dt, this.state, this.services);
      } catch (err) {
        const msg = `${system.name} failed: ${String(err?.message ?? err)}`;
        this.state.ai.lastError = msg;
        this.state.metrics.warnings.push(msg);
      }
    }

    this.state.metrics.frameMs = performance.now() - frameStart;
    const instantFps = 1 / Math.max(0.0001, dt);
    this.state.metrics.averageFps = this.state.metrics.averageFps * 0.95 + instantFps * 0.05;
    this.updateBenchmark(dt);
  }

  render(dt) {
    this.hud.render();
    this.inspector.render();
    this.eventPanel.render();
    this.performancePanel.render();
    this.toolbar.sync();
    this.renderer.render(dt);
  }

  setExtraWorkers(extraCount) {
    const safeCount = Math.max(0, Math.min(500, extraCount | 0));
    const baseWorkers = this.state.agents.filter((a) => a.type === "WORKER" && !a.isStressWorker);
    const stressWorkers = this.state.agents.filter((a) => a.type === "WORKER" && a.isStressWorker);
    const nonWorkers = this.state.agents.filter((a) => a.type !== "WORKER");

    if (stressWorkers.length < safeCount) {
      const addCount = safeCount - stressWorkers.length;
      for (let i = 0; i < addCount; i += 1) {
        const tile = randomPassableTile(this.state.grid);
        const p = tileToWorld(tile.ix, tile.iz, this.state.grid);
        const worker = createWorker(p.x, p.z);
        worker.isStressWorker = true;
        stressWorkers.push(worker);
      }
    } else if (stressWorkers.length > safeCount) {
      stressWorkers.length = safeCount;
    }

    this.state.agents = [...baseWorkers, ...stressWorkers, ...nonWorkers];
    this.state.controls.stressExtraWorkers = safeCount;
  }

  startBenchmark() {
    if (this.benchmark.running) return;
    this.benchmark.running = true;
    this.benchmark.stageIndex = 0;
    this.benchmark.stageElapsedSec = 0;
    this.benchmark.sampleCount = 0;
    this.benchmark.sumFps = 0;
    this.benchmark.sumFrameMs = 0;
    this.benchmark.results = [];
    this.benchmark.csv = "";
    this.state.metrics.benchmarkCsvReady = false;
    this.setExtraWorkers(this.benchmark.schedule[0]);
    this.state.metrics.benchmarkStatus = `running load=${this.benchmark.schedule[0]}`;
  }

  cancelBenchmark() {
    this.benchmark.running = false;
    this.state.metrics.benchmarkCsvReady = false;
    this.benchmark.csv = "";
    this.state.metrics.benchmarkStatus = "cancelled";
  }

  updateBenchmark(dt) {
    if (!this.benchmark.running) return;

    this.benchmark.stageElapsedSec += dt;
    const load = this.benchmark.schedule[this.benchmark.stageIndex];
    if (this.benchmark.stageElapsedSec >= this.benchmark.sampleStartSec) {
      this.benchmark.sampleCount += 1;
      this.benchmark.sumFps += this.state.metrics.averageFps;
      this.benchmark.sumFrameMs += this.state.metrics.frameMs;
    }

    if (this.benchmark.stageElapsedSec < this.benchmark.stageDurationSec) {
      const remain = Math.max(0, this.benchmark.stageDurationSec - this.benchmark.stageElapsedSec);
      this.state.metrics.benchmarkStatus = `running load=${load} t=${remain.toFixed(1)}s`;
      return;
    }

    const avgFps = this.benchmark.sampleCount > 0 ? this.benchmark.sumFps / this.benchmark.sampleCount : this.state.metrics.averageFps;
    const avgFrameMs = this.benchmark.sampleCount > 0 ? this.benchmark.sumFrameMs / this.benchmark.sampleCount : this.state.metrics.frameMs;
    this.benchmark.results.push({
      load,
      workers: this.state.agents.filter((a) => a.type === "WORKER").length,
      totalEntities: this.state.agents.length + this.state.animals.length,
      avgFps,
      avgFrameMs,
    });

    this.benchmark.stageIndex += 1;
    this.benchmark.stageElapsedSec = 0;
    this.benchmark.sampleCount = 0;
    this.benchmark.sumFps = 0;
    this.benchmark.sumFrameMs = 0;

    if (this.benchmark.stageIndex >= this.benchmark.schedule.length) {
      this.benchmark.running = false;
      this.benchmark.csv = this.buildBenchmarkCsv();
      this.state.metrics.benchmarkCsvReady = true;
      this.state.metrics.benchmarkStatus = "done (csv ready)";
      return;
    }

    const nextLoad = this.benchmark.schedule[this.benchmark.stageIndex];
    this.setExtraWorkers(nextLoad);
  }

  buildBenchmarkCsv() {
    const header = "load,workers,total_entities,avg_fps,avg_frame_ms";
    const rows = this.benchmark.results.map((r) => {
      return [
        r.load,
        r.workers,
        r.totalEntities,
        r.avgFps.toFixed(2),
        r.avgFrameMs.toFixed(3),
      ].join(",");
    });
    return `${header}\n${rows.join("\n")}\n`;
  }

  downloadBenchmarkCsv() {
    if (!this.benchmark.csv) return;
    const blob = new Blob([this.benchmark.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `utopia-benchmark-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  start() {
    this.loop.start();
  }
}
