export class SimulationClock {
  constructor() {
    this.name = "SimulationClock";
  }

  update(dt, state) {
    state.metrics.timeSec += dt;
    state.metrics.tick += 1;
    state.metrics.frameCount += 1;
  }
}
