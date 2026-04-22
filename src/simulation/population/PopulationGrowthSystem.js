import { TILE } from "../../config/constants.js";
import { createWorker } from "../../entities/EntityFactory.js";
import { listTilesByType, tileToWorld } from "../../world/grid/Grid.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";

const CHECK_INTERVAL_SEC = 10;
// v0.8.1 Phase 8.C iteration 2: 6 → 10. Phase 8.A fixes (yieldPool/kitchen/
// fog/salinization) opened food production, but DevIndex stayed at 44 because
// demand-side growth was runaway — cheap 6-food births + generous pop-cap
// spawned workers faster than food regen could sustain. Iteration 1 raised
// this to 15 + infra penalty + 2x buffer, which *collapsed* the colony by
// day 26 (pop 5 → 2) because birth rate fell below death rate. 10 is the
// middle ground: real cost without starving birth rate.
const FOOD_COST_PER_COLONIST = 10;
// v0.8.1 Phase 8.C iteration 2: 25 → 30. Mild bump over the old 25 threshold
// so growth requires a modest buffer, but not the 40 (→ collapse) we tried
// first. Exported so AI perceiver/summary sites stay in sync.
export const MIN_FOOD_FOR_GROWTH = 30;

export class PopulationGrowthSystem {
  constructor() {
    this.name = "PopulationGrowthSystem";
    this._timer = CHECK_INTERVAL_SEC * 0.5; // first check after half interval
  }

  update(dt, state, services = null) {
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = CHECK_INTERVAL_SEC;

    const workers = state.agents.filter(a => a.type === "WORKER" && a.alive !== false);
    const warehouses = listTilesByType(state.grid, [TILE.WAREHOUSE]);
    if (warehouses.length === 0) return;
    // v0.8.0 Phase 4 silent-failure C1: seeded RNG is required so benchmark
    // runs stay reproducible. services.rng.next is the deterministic source;
    // fall back to Math.random only when no services are threaded (legacy
    // tests that construct the system directly).
    const rngNext = typeof services?.rng?.next === "function"
      ? () => services.rng.next()
      : Math.random;

    // Dynamic population cap based on infrastructure
    const farms = state.buildings?.farms ?? 0;
    const quarries = state.buildings?.quarries ?? 0;
    const kitchens = state.buildings?.kitchens ?? 0;
    const lumbers = state.buildings?.lumbers ?? 0;
    const smithies = state.buildings?.smithies ?? 0;
    const clinics = state.buildings?.clinics ?? 0;
    const herbGardens = state.buildings?.herbGardens ?? 0;
    // v0.8.1 Phase 8.C iteration 2: tighten pop-cap modestly — removed the
    // infrastructure-balance penalty from iteration 1 because it created a
    // doom spiral (once pop fell below warehouses*3, penalty stayed 0, but
    // combined with high MIN_FOOD_FOR_GROWTH it froze birth rate below
    // death rate). Kept farm 0.8 → 0.5 and warehouse 4 → 3 coefficient
    // reductions since the runaway they targeted was real.
    const cap = Math.min(80, 8 + warehouses.length * 3 + Math.floor(farms * 0.5)
      + Math.floor(lumbers * 0.5) + quarries * 2 + kitchens * 2
      + smithies * 2 + clinics * 2 + herbGardens);
    if (workers.length >= cap) return;

    // Need sufficient food
    const food = state.resources?.food ?? 0;
    if (food < MIN_FOOD_FOR_GROWTH) return;

    // Spawn at a seeded-random warehouse.
    const wh = warehouses[Math.floor(rngNext() * warehouses.length)];
    const pos = tileToWorld(wh.ix, wh.iz, state.grid);
    const newWorker = createWorker(pos.x, pos.z, rngNext);
    state.agents.push(newWorker);
    state.resources.food -= FOOD_COST_PER_COLONIST;

    // v0.8.0 Phase 4 — Survival Mode. Bump a monotonic counter so the scoring
    // path can diff exact birth count (silent-failure C2: a timestamp cursor
    // drops births that collide on the same integer `timeSec`).
    state.metrics ??= {};
    state.metrics.birthsTotal = Number(state.metrics.birthsTotal ?? 0) + 1;
    // Preserve lastBirthGameSec for HUD / telemetry reads; no longer the
    // cursor for survival-score bookkeeping.
    state.metrics.lastBirthGameSec = Number(state.metrics.timeSec ?? 0);

    emitEvent(state, EVENT_TYPES.VISITOR_ARRIVED, {
      entityId: newWorker.id,
      entityName: newWorker.displayName ?? newWorker.id,
      reason: "colony_growth",
    });
  }
}
