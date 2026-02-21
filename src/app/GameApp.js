import "./types.js";
import { createInitialGameState } from "../entities/EntityFactory.js";
import { SceneRenderer } from "../render/SceneRenderer.js";
import { BuildToolbar } from "../ui/tools/BuildToolbar.js";
import { HUDController } from "../ui/hud/HUDController.js";
import { InspectorPanel } from "../ui/panels/InspectorPanel.js";
import { EventPanel } from "../ui/panels/EventPanel.js";
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
  }

  render(dt) {
    this.hud.render();
    this.inspector.render();
    this.eventPanel.render();
    this.toolbar.sync();
    this.renderer.render(dt);
  }

  start() {
    this.loop.start();
  }
}
