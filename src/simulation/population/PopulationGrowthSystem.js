import { TILE } from "../../config/constants.js";
import { createWorker } from "../../entities/EntityFactory.js";
import { listTilesByType, tileToWorld } from "../../world/grid/Grid.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";

const CHECK_INTERVAL_SEC = 10;
const FOOD_COST_PER_COLONIST = 5;
const MIN_FOOD_FOR_GROWTH = 20;

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
    const quarries = state.buildings?.quarries ?? 0;
    const kitchens = state.buildings?.kitchens ?? 0;
    const lumbers = state.buildings?.lumbers ?? 0;
    const smithies = state.buildings?.smithies ?? 0;
    const clinics = state.buildings?.clinics ?? 0;
    const herbGardens = state.buildings?.herbGardens ?? 0;
    const cap = Math.min(80, 8 + warehouses.length * 4 + Math.floor(farms * 0.8)
      + Math.floor(lumbers * 0.5) + quarries * 2 + kitchens * 2
      + smithies * 2 + clinics * 2 + herbGardens);
    if (workers.length >= cap) return;

    // Need sufficient food
    if ((state.resources?.food ?? 0) < MIN_FOOD_FOR_GROWTH) return;

    // Need at least 1 warehouse or 20+ seconds elapsed for growth
    if (warehouses.length < 1 && (state.metrics?.timeSec ?? 0) < 20) return;

    // Spawn at random warehouse
    const wh = warehouses[Math.floor(Math.random() * warehouses.length)];
    const pos = tileToWorld(wh.ix, wh.iz, state.grid);
    const newWorker = createWorker(pos.x, pos.z, Math.random);
    state.agents.push(newWorker);
    state.resources.food -= FOOD_COST_PER_COLONIST;

    // v0.8.0 Phase 4 — Survival Mode. Flag the spawn as a birth event so
    // ProgressionSystem.updateSurvivalScore can grant the birth bonus exactly
    // once. Storing the sim-time of the latest birth lets the scoring path
    // detect new events by comparing against its cached cursor.
    state.metrics ??= {};
    state.metrics.lastBirthGameSec = Number(state.metrics.timeSec ?? 0);

    emitEvent(state, EVENT_TYPES.VISITOR_ARRIVED, {
      entityId: newWorker.id,
      entityName: newWorker.displayName ?? newWorker.id,
      reason: "colony_growth",
    });
  }
}
