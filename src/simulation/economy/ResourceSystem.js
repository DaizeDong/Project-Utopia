import { rebuildBuildingStats } from "../../world/grid/Grid.js";

export class ResourceSystem {
  constructor() {
    this.name = "ResourceSystem";
    this.lastGridVersion = -1;
  }

  update(_dt, state) {
    state.resources.food = Number.isFinite(state.resources.food) ? Math.max(0, state.resources.food) : 0;
    state.resources.wood = Number.isFinite(state.resources.wood) ? Math.max(0, state.resources.wood) : 0;

    if (this.lastGridVersion !== state.grid.version) {
      state.buildings = rebuildBuildingStats(state.grid);
      this.lastGridVersion = state.grid.version;
    }

    if (!Number.isFinite(state.resources.food) || !Number.isFinite(state.resources.wood)) {
      state.metrics.warnings.push("Resource value became invalid and was reset");
      state.resources.food = Math.max(0, state.resources.food || 0);
      state.resources.wood = Math.max(0, state.resources.wood || 0);
    }

    if (state.metrics.warnings.length > 20) {
      state.metrics.warnings = state.metrics.warnings.slice(-20);
    }
  }
}
