// v0.10.0-b — Worker FSM transition predicates. Phase 2 of 5 in the
// Priority-FSM rewrite per
// docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md.
//
// Each predicate is a single-purpose, pure boolean (no side effects). The
// transition table in WorkerTransitions.js wires these into priority-ordered
// transition rows. Keep each predicate small (≤ ~15 LOC) so a single bug
// fix lives in exactly one place when "hungry" / "carry full" / etc.
// semantics need to change.
//
// Reads `worker`, `state.grid`, `state.resources`, `state.buildings`,
// `state.constructionSites`, and `services.pathFailBlacklist`. Never mutates.

import { BALANCE } from "../../../config/balance.js";
import { ANIMAL_KIND, ROLE, TILE, VISITOR_KIND } from "../../../config/constants.js";
import { getTile, listTilesByType, worldToTile } from "../../../world/grid/Grid.js";

// Combat / hostile detection

/**
 * True when worker.role === GUARD and a hostile (PREDATOR animal or
 * SABOTEUR visitor) is within BALANCE.guardAggroRadius.
 *
 * TODO v0.10.0-d: dedupe with retired Job code (JobGuardEngage.findNearestHostile).
 */
export function hostileInAggroRadiusForGuard(worker, state, _services) {
  if (String(worker?.role ?? "").toUpperCase() !== ROLE.GUARD) return false;
  return findNearestHostile(worker, state) != null;
}

/** Internal: nearest predator/saboteur within aggro range, or null. */
export function findNearestHostile(worker, state) {
  const animals = Array.isArray(state?.animals) ? state.animals : [];
  const agents = Array.isArray(state?.agents) ? state.agents : [];
  const aggroRadius = Number(BALANCE.guardAggroRadius ?? 6);
  const aggro2 = aggroRadius * aggroRadius;
  let target = null;
  let bestD2 = Infinity;
  for (const a of animals) {
    if (!a || a.alive === false || a.kind !== ANIMAL_KIND.PREDATOR) continue;
    const dx = a.x - worker.x; const dz = a.z - worker.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= aggro2 && d2 < bestD2) { bestD2 = d2; target = a; }
  }
  for (const v of agents) {
    if (!v || v.alive === false || v.type !== "VISITOR" || v.kind !== VISITOR_KIND.SABOTEUR) continue;
    const dx = v.x - worker.x; const dz = v.z - worker.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= aggro2 && d2 < bestD2) { bestD2 = d2; target = v; }
  }
  return target;
}

/** True when no hostile is in range — used for FIGHTING → IDLE. */
export function noHostileInRange(worker, state, _services) {
  return findNearestHostile(worker, state) == null;
}

// Survival: hunger / rest

/**
 * True when worker.hunger < workerHungerSeekThreshold AND food is available
 * (warehouse stockpile OR carry). Mirrors v0.9.4 JobEat.canTake gate.
 *
 * TODO v0.10.0-d: dedupe with retired Job code (JobEat.canTake).
 */
export function hungryAndFoodAvailable(worker, state, _services) {
  const seek = Number(BALANCE.workerHungerSeekThreshold ?? 0.18);
  if (Number(worker?.hunger ?? 1) >= seek) return false;
  const wh = Number(state?.resources?.food ?? 0) + Number(state?.resources?.meals ?? 0);
  if (wh > 0) return true;
  if (Number(worker?.carry?.food ?? 0) > 0) return true;
  return false;
}

/** True when worker.rest < workerRestSeekThreshold. Mirrors JobRest.canTake. */
export function tooTired(worker, _state, _services) {
  const seek = Number(BALANCE.workerRestSeekThreshold ?? 0.2);
  return Number(worker?.rest ?? 1) < seek;
}

/**
 * True when EATING should end. Mirrors v0.9.4 effective behaviour: worker
 * either (a) recovered above the seek threshold or (b) has been in EATING
 * long enough to cycle out (consumeEmergencyRation cooldown is 2.8 s, so
 * after 3 s the worker has had a chance to eat once and should resume
 * other activities even if hunger is still low — they'll re-trigger
 * SURVIVAL_FOOD shortly).
 *
 * v0.10.0-c — earlier draft used `hunger >= eatRecoveryTarget` (0.68).
 * Combined with the consumeEmergencyRation slow-eat in EATING.tick,
 * workers would never reach 0.68 in established colonies (decay outpaces
 * cooldown-gated trickle) and stay latched in EATING for 100+ seconds,
 * triggering the trace stuck>3s metric. Leaving at seek-threshold OR
 * after 3 s in-state matches v0.9.4 cycle frequency.
 */
export function hungerRecovered(worker, state, _services) {
  const seek = Number(BALANCE.workerHungerSeekThreshold ?? 0.18);
  if (Number(worker?.hunger ?? 0) >= seek) return true;
  // Cycle out after 3 s in-state regardless of hunger — the worker has had
  // at least one consumeEmergencyRation cooldown cycle worth of eating;
  // re-evaluating the FSM lets them harvest, then re-trigger SURVIVAL_FOOD
  // when hungry again.
  if (worker?.fsm) {
    const nowSec = Number(state?.metrics?.timeSec ?? 0);
    const enteredAt = Number(worker.fsm.enteredAtSec ?? nowSec);
    if (nowSec - enteredAt >= 3.0) return true;
  }
  return false;
}

/**
 * True when no food source is available anywhere — warehouse stockpile = 0,
 * meals = 0, and worker carry food = 0. Used by EATING → IDLE so a worker
 * doesn't sit eating zero food forever while their colony starves.
 *
 * v0.10.0-c — without this transition, workers latch into EATING when the
 * stockpile drains mid-meal and never harvest more food, collapsing scenario
 * F (long-horizon 600s) into total famine.
 */
export function noFoodAvailable(worker, state, _services) {
  if (Number(state?.resources?.food ?? 0) > 0) return false;
  if (Number(state?.resources?.meals ?? 0) > 0) return false;
  if (Number(worker?.carry?.food ?? 0) > 0) return false;
  return true;
}

/** True when worker.rest has recovered above the rest-recover target. */
export function restRecovered(worker, _state, _services) {
  const target = Number(BALANCE.workerRestRecoverThreshold ?? 0.5);
  return Number(worker?.rest ?? 0) >= target;
}

// Carry / arrival predicates

function carryTotal(worker) {
  const c = worker?.carry ?? {};
  return Number(c.food ?? 0) + Number(c.wood ?? 0) + Number(c.stone ?? 0) + Number(c.herbs ?? 0);
}

/** True when carry total ≥ 2× workerDeliverThreshold (mirrors JobHarvestBase). */
export function carryFull(worker, _state, _services) {
  const carryCap = Number(BALANCE.workerDeliverThreshold ?? 1.6) * 2.0;
  return carryTotal(worker) >= carryCap;
}

/** True when carry total has been emptied (≤ 1e-4). */
export function carryEmpty(worker, _state, _services) {
  return carryTotal(worker) <= 1e-4;
}

/**
 * True when the worker has arrived at worker.fsm.target.
 *
 * v0.10.0-c bugfix — earlier draft compared world coordinates (worker.x,
 * worker.z; range ~-48..48) against tile indices (t.ix, t.iz; range 0..96)
 * with a 0.6 tolerance, which is meaningless: those scales never align
 * (worker at world.x=−0.5 → tile.ix=47 ⇒ |−0.5 − 47| ≈ 47.5). Mirrors
 * v0.9.4 isAtTargetTile: convert worker world coords to tile, then compare
 * indices.
 */
export function arrivedAtFsmTarget(worker, state, _services) {
  const t = worker?.fsm?.target;
  if (!t || !state?.grid) return false;
  const here = worldToTile(Number(worker.x ?? 0), Number(worker.z ?? 0), state.grid);
  return here.ix === Number(t.ix) && here.iz === Number(t.iz);
}

// Path failure / target validity

/**
 * True when the worker's current FSM target tile is in the path-fail
 * blacklist (A* refused it within the last TTL). Used as the SEEKING_X
 * fallback row so the worker drops back to IDLE → re-picks rather than
 * pinning on a known-unreachable tile.
 *
 * v0.10.0-c — earlier drafts used `nowSec - lastSuccessfulPathSec > 2 s`
 * but that fired on workers actively walking a path (walking ≠ acquiring
 * a new path). Revised to query the blacklist directly: only fire when
 * the target tile is currently blacklisted for this worker. The PathFail
 * blacklist already auto-marks A*-fail tiles via Navigation.setTargetAndPath,
 * so this catches walled-off / unreachable targets without false positives
 * during normal walking.
 */
export function pathFailedRecently(worker, state, services) {
  const t = worker?.fsm?.target;
  if (!t || !state?.grid) return false;
  const blacklist = services?.pathFailBlacklist;
  if (!blacklist?.isBlacklisted) return false;
  const nowSec = Number(state?.metrics?.timeSec ?? 0);
  const tileType = getTile(state.grid, Number(t.ix), Number(t.iz));
  return blacklist.isBlacklisted(worker.id, t.ix, t.iz, tileType, nowSec);
}

/**
 * True when the FSM target tile is no longer of the expected type (e.g. a
 * construction site finished, the FARM was demolished). Used by SEEKING_BUILD
 * and BUILDING transitions back to IDLE.
 */
export function fsmTargetGone(worker, state, _services) {
  const t = worker?.fsm?.target;
  if (!t || !state?.grid) return false;
  // For build sites: if no entry in state.constructionSites, gone.
  const sites = Array.isArray(state.constructionSites) ? state.constructionSites : [];
  if (sites.length > 0) {
    const found = sites.some((s) => s && s.ix === t.ix && s.iz === t.iz);
    if (!found) return true;
  }
  return false;
}

/**
 * True when worker.fsm.target is null. SEEKING_X states' onEnter sets the
 * target tile (e.g. via chooseWorkerTarget); if the picker returns null
 * (no eligible tile, allBlacklisted + no carry food, etc.) the worker
 * has no place to go and should drop back to IDLE rather than orbit
 * forever.
 *
 * v0.10.0-c — added to plug a SEEKING_FOOD-target-null latch in scenario
 * A bare-init: no warehouse, no carry food → onEnter sets target=null →
 * tick is a no-op → no transition fires (arrivedAtFsmTarget needs target,
 * pathFailedRecently is blacklist-based) → worker stuck for 20+ s.
 */
export function fsmTargetNull(worker, _state, _services) {
  return worker?.fsm?.target == null;
}

// Economy / role-based intent

const ROLE_HARVEST_TILES = {
  [ROLE.FARM]: [TILE.FARM],
  [ROLE.WOOD]: [TILE.LUMBER],
  [ROLE.STONE]: [TILE.QUARRY],
  [ROLE.HERBS]: [TILE.HERB_GARDEN],
  [ROLE.HAUL]: [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN],
};

const ROLE_PROCESS_TILES = {
  [ROLE.COOK]: { tile: TILE.KITCHEN, building: "kitchens", inputs: [{ resource: "food", min: 2 }] },
  [ROLE.SMITH]: { tile: TILE.SMITHY, building: "smithies", inputs: [{ resource: "stone", min: 3 }, { resource: "wood", min: 2 }] },
  [ROLE.HERBALIST]: { tile: TILE.CLINIC, building: "clinics", inputs: [{ resource: "herbs", min: 2 }] },
};

/** Returns the harvest tile types valid for this worker's role, or []. */
export function getRoleHarvestTiles(worker) {
  const role = String(worker?.role ?? "").toUpperCase();
  return ROLE_HARVEST_TILES[role] ?? [];
}

/** Returns the process config for this worker's role, or null. */
export function getRoleProcessConfig(worker) {
  const role = String(worker?.role ?? "").toUpperCase();
  return ROLE_PROCESS_TILES[role] ?? null;
}

/**
 * True when the worker's role can harvest AND at least one tile of an
 * eligible type exists with yieldPool > 0 (FARM excluded — fallow-aware).
 */
export function harvestAvailableForRole(worker, state, _services) {
  const tiles = getRoleHarvestTiles(worker);
  if (tiles.length === 0 || !state?.grid) return false;
  const list = listTilesByType(state.grid, tiles);
  if (list.length === 0) return false;
  // FARM tiles use TileStateSystem fallow recovery — treat all as eligible.
  if (tiles.includes(TILE.FARM)) return true;
  for (const t of list) {
    const idx = t.ix + t.iz * state.grid.width;
    const ts = state.grid.tileState?.get?.(idx);
    if (Number(ts?.yieldPool ?? 0) > 0) return true;
  }
  return false;
}

/** True when carry > 0 and at least one warehouse exists. */
export function shouldDeliverCarry(worker, state, _services) {
  if (carryTotal(worker) <= 0) return false;
  return Number(state?.buildings?.warehouses ?? 0) > 0;
}

/**
 * True when at least one construction site exists AND this role qualifies
 * (BUILDER unconditionally; HAUL/FARM only when sites > active workers,
 * mirroring v0.9.4 JobBuildSite.canTake).
 */
export function buildAvailableForRole(worker, state, _services) {
  const sites = Array.isArray(state?.constructionSites) ? state.constructionSites : [];
  if (sites.length === 0) return false;
  const role = String(worker?.role ?? "").toUpperCase();
  if (role === ROLE.BUILDER) return true;
  if (role !== ROLE.HAUL && role !== ROLE.FARM) return false;
  let activeCount = 0;
  if (Array.isArray(state?.agents)) {
    for (const a of state.agents) if (a?.type === "WORKER" && a.alive !== false) activeCount += 1;
  }
  return sites.length > activeCount;
}

/**
 * True when the worker's role qualifies for processing AND a process building
 * exists with raw inputs above the per-recipe minimum.
 */
export function processAvailableForRole(worker, state, _services) {
  const cfg = getRoleProcessConfig(worker);
  if (!cfg) return false;
  if (Number(state?.buildings?.[cfg.building] ?? 0) <= 0) return false;
  for (const inp of cfg.inputs) {
    if (Number(state?.resources?.[inp.resource] ?? 0) < Number(inp.min ?? 0)) return false;
  }
  return true;
}

// Yield-pool / tile-validity (HARVESTING-specific)

/** True when the FSM target tile has yieldPool ≤ 0 (FARM excluded). */
export function yieldPoolDriedUp(worker, state, _services) {
  const t = worker?.fsm?.target;
  if (!t || !state?.grid) return false;
  const tile = getTile(state.grid, t.ix, t.iz);
  if (tile === TILE.FARM) return false; // farms recover; carry-empty handles them.
  if (!state.grid.tileState) return false;
  const ts = state.grid.tileState.get(t.ix + t.iz * state.grid.width);
  return Number(ts?.yieldPool ?? 0) <= 0;
}

// Processing-specific

/**
 * True when raw inputs for the worker's process role have dropped below the
 * per-recipe minimum. Mirrors v0.9.4 JobProcessBase.canTake.
 */
export function processInputDepleted(worker, state, _services) {
  const cfg = getRoleProcessConfig(worker);
  if (!cfg) return true;
  for (const inp of cfg.inputs) {
    if (Number(state?.resources?.[inp.resource] ?? 0) < Number(inp.min ?? 0)) return true;
  }
  return false;
}

