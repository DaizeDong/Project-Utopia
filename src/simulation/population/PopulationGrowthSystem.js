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

    // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 3) — pick 1-2 nearest
    // living workers (manhattan-world distance < 8) as `parents` so the
    // birth event reads like "X was born to Y" instead of cloning out of
    // the warehouse. Walk uses the deterministic agents order; no rngNext
    // calls so RNG offset is preserved (long-horizon-determinism contract).
    // If no candidate is in range we fall back to the legacy "arrived at
    // the colony" copy and leave parents empty.
    const candidates = [];
    for (const agent of state.agents) {
      if (agent === newWorker || agent.type !== "WORKER" || agent.alive === false) continue;
      const dist = Math.abs(Number(agent.x ?? 0) - pos.x) + Math.abs(Number(agent.z ?? 0) - pos.z);
      if (dist >= 8) continue;
      candidates.push({ agent, dist });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    const parents = candidates.slice(0, 2).map((c) => c.agent);
    newWorker.lineage ??= { parents: [], children: [], deathSec: -1 };
    newWorker.lineage.parents = parents.map((p) => p.id);
    for (const parent of parents) {
      parent.lineage ??= { parents: [], children: [], deathSec: -1 };
      if (!Array.isArray(parent.lineage.children)) parent.lineage.children = [];
      if (!parent.lineage.children.includes(newWorker.id)) {
        parent.lineage.children.push(newWorker.id);
      }
    }
    const parentNames = parents.map((p) => p.displayName ?? p.id);

    // Legacy event (downstream listeners — EventPanel/Telemetry — already
    // consume VISITOR_ARRIVED with reason="colony_growth"). Bumped reason
    // to "colony_growth_birth" so listeners that want to differentiate from
    // raid-spawn / trade-spawn can branch without breaking tag invariants.
    emitEvent(state, EVENT_TYPES.VISITOR_ARRIVED, {
      entityId: newWorker.id,
      entityName: newWorker.displayName ?? newWorker.id,
      reason: parents.length > 0 ? "colony_growth_birth" : "colony_growth",
    });
    // New dedicated WORKER_BORN beat — narrative consumers (storytellerStrip
    // SALIENT pattern, voice-pack overlay) subscribe to this without
    // colour-filtering the legacy bus.
    emitEvent(state, EVENT_TYPES.WORKER_BORN, {
      entityId: newWorker.id,
      entityName: newWorker.displayName ?? newWorker.id,
      parentNames,
      lineageParentIds: parents.map((p) => p.id),
      reason: parents.length > 0 ? "colony_growth_birth" : "colony_growth",
    });

    // v0.8.2 Round-5b (02d Step 2a) — Push birth memory into nearby workers so
    // Entity Focus "Recent Memory" shows a human-readable birth event line.
    // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 3) — copy now reads "born to
    // {parent}" when at least one parent was picked (kinship signal) or
    // "arrived at the colony" otherwise (no warehouse literal — it spoiled
    // the scene per reviewer feedback). The line is also broadcast into the
    // global state.gameplay.objectiveLog so storytellerStrip's SALIENT
    // pattern can lift it into #storytellerBeat (Step 7 wires the regex).
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const newbornName = newWorker.displayName ?? newWorker.id;
    const birthLine = parents.length > 0
      ? `[${nowSec.toFixed(0)}s] ${newbornName} was born to ${parentNames.join(" and ")}`
      : `[${nowSec.toFixed(0)}s] ${newbornName} arrived at the colony`;
    for (const agent of state.agents) {
      if (agent === newWorker || agent.type !== "WORKER" || agent.alive === false) continue;
      const dist = Math.abs(agent.x - pos.x) + Math.abs(agent.z - pos.z);
      if (dist > 10) continue;
      agent.memory ??= { recentEvents: [], dangerTiles: [] };
      if (!Array.isArray(agent.memory.recentEvents)) agent.memory.recentEvents = [];
      if (!(agent.memory.recentKeys instanceof Map)) agent.memory.recentKeys = new Map();
      const key = `birth:${newWorker.id}`;
      if (agent.memory.recentKeys.has(key)) continue;
      agent.memory.recentKeys.set(key, nowSec);
      agent.memory.recentEvents.unshift(birthLine);
      agent.memory.recentEvents = agent.memory.recentEvents.slice(0, 6);
    }
    // Surface birth onto the player-visible log so storytellerStrip's beat
    // extractor can lift it (SALIENT pattern in Step 7). objectiveLog uses
    // unshift+slice(0,24) — same bound as ProgressionSystem.logObjective.
    if (state.gameplay) {
      if (!Array.isArray(state.gameplay.objectiveLog)) state.gameplay.objectiveLog = [];
      state.gameplay.objectiveLog.unshift(birthLine);
      state.gameplay.objectiveLog = state.gameplay.objectiveLog.slice(0, 24);
    }
    // Mirror to debug.eventTrace (storytellerStrip's primary scan source).
    if (state.debug) {
      if (!Array.isArray(state.debug.eventTrace)) state.debug.eventTrace = [];
      state.debug.eventTrace.unshift(birthLine);
      state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
    }
  }
}
