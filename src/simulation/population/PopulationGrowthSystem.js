import { TILE } from "../../config/constants.js";
import { createWorker } from "../../entities/EntityFactory.js";
import { listTilesByType, tileToWorld } from "../../world/grid/Grid.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";

const CHECK_INTERVAL_SEC = 12;
const FOOD_COST_PER_COLONIST = 8;
const MIN_FOOD_FOR_GROWTH = 25;

export class PopulationGrowthSystem {
  constructor() {
    this.name = "PopulationGrowthSystem";
    this._timer = CHECK_INTERVAL_SEC * 0.5; // first check after half interval
  }

  update(dt, state) {
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = CHECK_INTERVAL_SEC;

    const workers = state.agents.filter(a => a.type === "WORKER" && a.alive !== false);
    const warehouses = listTilesByType(state.grid, [TILE.WAREHOUSE]);
    if (warehouses.length === 0) return;

    // Dynamic population cap based on infrastructure
    const farms = state.buildings?.farms ?? 0;
    const cap = Math.min(24, 8 + warehouses.length * 2 + Math.floor(farms * 0.5));
    if (workers.length >= cap) return;

    // Need sufficient food
    if ((state.resources?.food ?? 0) < MIN_FOOD_FOR_GROWTH) return;

    // Need at least 2 warehouses or 30+ seconds elapsed for growth
    if (warehouses.length < 2 && (state.metrics?.timeSec ?? 0) < 30) return;

    // Spawn at random warehouse
    const wh = warehouses[Math.floor(Math.random() * warehouses.length)];
    const pos = tileToWorld(wh.ix, wh.iz, state.grid);
    const newWorker = createWorker(pos.x, pos.z, Math.random);
    state.agents.push(newWorker);
    state.resources.food -= FOOD_COST_PER_COLONIST;

    emitEvent(state, EVENT_TYPES.VISITOR_ARRIVED, {
      entityId: newWorker.id,
      entityName: newWorker.displayName ?? newWorker.id,
      reason: "colony_growth",
    });
  }
}
