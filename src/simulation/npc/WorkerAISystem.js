import { BALANCE } from "../../config/balance.js";
// v0.10.0-d — FEATURE_FLAGS no longer consulted at runtime in this file
// (USE_FSM is the only flag and the FSM is now the only dispatcher); kept
// here only because EVENT_TYPE / NODE_FLAGS / ROLE / TILE / TILE_INFO are
// still consumed by helper bodies below.
import { EVENT_TYPE, NODE_FLAGS, ROLE, TILE, TILE_INFO } from "../../config/constants.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, getTileState, listTilesByType, randomPassableTile, setTileField, worldToTile } from "../../world/grid/Grid.js";
import { releaseBuilderSite } from "../construction/ConstructionSites.js";
import { canAttemptPath, clearPath, followPath, hasActivePath, hasPendingPathRequest, isPathStuck, setTargetAndPath } from "../navigation/Navigation.js";
// v0.10.1-f (P1b) — legacy display planner imports retired. The FSM
// dispatcher (this._workerFSM) is the only worker decision pipeline;
// VisitorAISystem + AnimalAISystem still import StatePlanner /
// StateGraph for their own legacy FSM ticks.
import { getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";
import { drainFertility, getTileFertility } from "../economy/TileStateSystem.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";
import { enqueueEvent } from "../../world/events/WorldEventQueue.js";
import { JobReservation } from "./JobReservation.js";
import { RoadNetwork } from "../navigation/RoadNetwork.js";
import { LogisticsSystem, ISOLATION_PENALTY } from "../economy/LogisticsSystem.js";
import { recordProductionEntry } from "../economy/ResourceSystem.js";
import { buildSpatialHash, queryNeighbors } from "../movement/SpatialHash.js";
import { WorkerFSM } from "./fsm/WorkerFSM.js";

// v0.8.11 worker-AI bare-init responsiveness (Fix 5) — lower retarget
// cooldown so a worker whose target was stolen mid-path resumes within
// ~0.7-1.2s instead of ~1.2-1.9s. Reduces visible idle stalls.
const TARGET_REFRESH_BASE_SEC = 0.7;
const TARGET_REFRESH_JITTER_SEC = 0.5;
// v0.10.0-d — WANDER_REFRESH_* constants live in fsm/WorkerStates.js
// alongside the IDLE state's wander loop; WorkerAISystem no longer drives
// a wander cadence directly.
const WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD = 0.18;
// v0.10.0-d — Job-utility scheduler retired. The Priority-FSM
// (fsm/WorkerFSM.js) is the only worker dispatcher; v0.9.x's
// TASK_LOCK_STATES + JobScheduler sticky-bonus hysteresis are subsumed by
// FSM state-transition priorities (see WorkerTransitions.js).
const WORKER_EMERGENCY_RATION_COOLDOWN_SEC = 2.8;
const WORKER_MEMORY_RECENT_LIMIT = 6;
const WORKER_MEMORY_HISTORY_LIMIT = 24;

export function resolveWorkerAiLoadShedding({
  requestedScale = 1,
  activeWorkerCount = 0,
  totalEntityCount = 0,
} = {}) {
  const scale = Number(requestedScale);
  const workers = Math.max(0, Number(activeWorkerCount) || 0);
  const entities = Math.max(workers, Number(totalEntityCount) || 0);

  if (scale >= 7) {
    const workerStride = (workers >= 1000 || entities >= 1200) ? 4
      : (workers >= 800 || entities >= 1000) ? 3
        : (workers >= 500 || entities >= 750) ? 2
          : workers >= 250 ? 1
            : 1;
    const pathBudget = (workers >= 1000 || entities >= 1200) ? 256
      : (workers >= 800 || entities >= 1000) ? 192
        : (workers >= 500 || entities >= 750) ? 128
          : workers >= 250 ? 96
          : Infinity;
    return { workerStride, pathBudget, pressureCount: entities };
  }

  const workerStride = (workers >= 1000 || entities >= 1200) ? 4
    : (workers >= 800 || entities >= 1000) ? 3
      : (workers >= 500 || entities >= 750) ? 2
        : 1;
  const pathBudget = (workers >= 1000 || entities >= 1200) ? 24
    : (workers >= 800 || entities >= 1000) ? 32
      : Infinity;
  return { workerStride, pathBudget, pressureCount: entities };
}

function tileKey(tile) {
  return `${tile.ix},${tile.iz}`;
}

function manhattanTiles(a, b) {
  return Math.abs(Number(a?.ix ?? 0) - Number(b?.ix ?? 0)) + Math.abs(Number(a?.iz ?? 0) - Number(b?.iz ?? 0));
}

function resolveTargetPriority(policy, key, fallback = 1) {
  return Math.max(0, Math.min(3, Number(policy?.targetPriorities?.[key] ?? fallback)));
}

function countNearbyTiles(state, center, tileTypes, radius = 1) {
  let count = 0;
  const targets = new Set(tileTypes);
  for (let iz = center.iz - radius; iz <= center.iz + radius; iz += 1) {
    for (let ix = center.ix - radius; ix <= center.ix + radius; ix += 1) {
      if (ix < 0 || iz < 0 || ix >= state.grid.width || iz >= state.grid.height) continue;
      if (Math.abs(ix - center.ix) + Math.abs(iz - center.iz) > radius) continue;
      if (targets.has(state.grid.tiles[ix + iz * state.grid.width])) count += 1;
    }
  }
  return count;
}

function minDistanceToTiles(origin, tiles = []) {
  let best = Infinity;
  for (const tile of tiles) {
    const dist = manhattanTiles(origin, tile);
    if (dist < best) best = dist;
  }
  return best;
}

function getWorkerPolicy(worker, state) {
  return worker.policy ?? state.ai.groupPolicies.get("workers")?.data ?? null;
}

function getBrokenRouteGapTiles(runtime) {
  const out = [];
  for (const route of runtime.routes ?? []) {
    if (route.connected) continue;
    for (const gap of route.gapTiles ?? []) out.push(gap);
  }
  return out;
}

function getUnreadyDepotAnchors(runtime) {
  const anchors = runtime.scenario?.anchors ?? {};
  return (runtime.depots ?? [])
    .filter((depot) => !depot.ready)
    .map((depot) => anchors[depot.anchor])
    .filter(Boolean);
}

function buildWorkerTargetContext(state) {
  const runtime = getScenarioRuntime(state);
  return {
    brokenRouteTiles: getBrokenRouteGapTiles(runtime),
    depotAnchors: getUnreadyDepotAnchors(runtime),
  };
}

function getWorkerTargetEntries(state, targetTileTypes, context) {
  const typesKey = [...targetTileTypes].sort((a, b) => a - b).join(",");
  const contextKey = `${state.grid.version}|${context.brokenRouteTiles.map(tileKey).join(";")}|${context.depotAnchors.map(tileKey).join(";")}`;
  const cache = state._workerTargetCandidateCache ??= { contextKey: "", byTypes: new Map() };
  if (cache.contextKey !== contextKey) {
    cache.contextKey = contextKey;
    cache.byTypes = new Map();
  }
  if (cache.byTypes.has(typesKey)) return cache.byTypes.get(typesKey);

  const entries = listTilesByType(state.grid, targetTileTypes).map((candidate) => {
    const candidateKey = tileKey(candidate);
    return {
      tile: candidate,
      candidateKey,
      tileType: getTile(state.grid, candidate.ix, candidate.iz),
      wallCoverage: countNearbyTiles(state, candidate, [TILE.WALL], 1),
      roadNeighbors: countNearbyTiles(state, candidate, [TILE.ROAD, TILE.WAREHOUSE], 1),
      frontierDistance: minDistanceToTiles(candidate, context.brokenRouteTiles),
      depotDistance: minDistanceToTiles(candidate, context.depotAnchors),
    };
  });
  cache.byTypes.set(typesKey, entries);
  return entries;
}

function buildOccupancyMap(state, excludeId, workerRole) {
  const map = new Map();
  const roleMap = new Map();
  for (const agent of state.agents) {
    if (agent.type !== "WORKER" || agent.alive === false || agent.id === excludeId) continue;
    const target = agent.targetTile;
    if (!target) continue;
    const key = `${target.ix},${target.iz}`;
    map.set(key, (map.get(key) ?? 0) + 1);
    if (agent.role === workerRole) {
      roleMap.set(key, (roleMap.get(key) ?? 0) + 1);
    }
  }
  return { all: map, sameRole: roleMap };
}

function buildWorkerTargetOccupancy(workers) {
  const all = new Map();
  const byRole = new Map();
  for (const agent of workers) {
    const target = agent.targetTile;
    if (!target) continue;
    const key = `${target.ix},${target.iz}`;
    all.set(key, (all.get(key) ?? 0) + 1);
    let roleMap = byRole.get(agent.role);
    if (!roleMap) {
      roleMap = new Map();
      byRole.set(agent.role, roleMap);
    }
    roleMap.set(key, (roleMap.get(key) ?? 0) + 1);
  }
  return { all, byRole };
}

function readOccupancyCount(map, key, worker) {
  let count = Number(map?.get(key) ?? 0);
  const target = worker.targetTile;
  if (target && `${target.ix},${target.iz}` === key) count -= 1;
  return Math.max(0, count);
}

// v0.10.0-d — Worker target-selection scorer. Used by the FSM SEEKING_*
// state bodies to pick the next tile to walk to (same scorer that the
// retired v0.9.x JobHarvestBase.findTarget consumed; behaviour preserved).
export function chooseWorkerTarget(worker, state, targetTileTypes, occupancyCache = null, services = null) {
  const targetContext = state._workerTargetContext ?? buildWorkerTargetContext(state);
  const candidates = getWorkerTargetEntries(state, targetTileTypes, targetContext);
  if (candidates.length <= 0) return null;

  const policy = getWorkerPolicy(worker, state);
  const current = worldToTile(worker.x, worker.z, state.grid);
  const reservation = state._jobReservation;
  const fallbackOccupancy = occupancyCache ? null : buildOccupancyMap(state, worker.id, worker.role);
  const occupancy = occupancyCache?.all ?? fallbackOccupancy?.all;
  const sameRoleOccupancy = occupancyCache?.byRole?.get(worker.role) ?? fallbackOccupancy?.sameRole;
  // v0.8.13 A6 — skip blacklisted candidates. Fall back to best-blacklisted
  // if every candidate is blacklisted (don't return null — that would
  // strand the worker even longer than retrying a blacklisted tile).
  const blacklist = services?.pathFailBlacklist;
  const nowSec = Number(state?.metrics?.timeSec ?? 0);
  let best = null;
  let bestBlacklisted = null;

  for (const entry of candidates) {
    const candidate = entry.tile;
    const candidateKey = entry.candidateKey;
    const distance = manhattanTiles(current, candidate);
    const tileType = entry.tileType;
    const frontierAffinity = Number.isFinite(entry.frontierDistance)
      ? entry.frontierDistance <= 2 ? 1 : entry.frontierDistance <= 5 ? 0.45 : 0
      : 0;
    const depotAffinity = Number.isFinite(entry.depotDistance)
      ? entry.depotDistance <= 2 ? 1 : entry.depotDistance <= 4 ? 0.4 : 0
      : 0;
    const ecologyPressure = tileType === TILE.FARM
      ? Math.max(0, Number(state.metrics?.ecology?.farmPressureByKey?.[candidateKey] ?? 0))
      : 0;
    const warehouseLoad = tileType === TILE.WAREHOUSE
      ? Number(state.metrics?.logistics?.warehouseLoadByKey?.[candidateKey] ?? 0)
      : 0;
    const occupants = readOccupancyCount(occupancy, candidateKey, worker);

    // Sqrt-based distance penalty: strong at short range, diminishing at long range
    // dist=1: -0.18, dist=4: -0.36, dist=9: -0.54, dist=16: -0.72, dist=25: -0.9
    let score = -Math.sqrt(distance) * 0.18;
    score += entry.roadNeighbors * 0.1 * resolveTargetPriority(policy, "road", 1);
    score += entry.wallCoverage * 0.07 * resolveTargetPriority(policy, "safety", 1);
    score += frontierAffinity * 0.42 * resolveTargetPriority(policy, "frontier", 1);
    score += depotAffinity * 0.38 * resolveTargetPriority(policy, "depot", 1);

    if (tileType === TILE.WAREHOUSE) {
      score += 0.58 * resolveTargetPriority(policy, "warehouse", 1);
      score -= Math.max(0, warehouseLoad - 1) * 0.18;
    } else if (tileType === TILE.FARM) {
      score += 0.54 * resolveTargetPriority(policy, "farm", 1);
      score -= ecologyPressure * Math.max(0.18, resolveTargetPriority(policy, "safety", 1) * 0.12);
    } else if (tileType === TILE.LUMBER) {
      score += 0.54 * resolveTargetPriority(policy, "lumber", 1);
    } else if (tileType === TILE.QUARRY) {
      score += 0.54 * resolveTargetPriority(policy, "quarry", 1);
    } else if (tileType === TILE.HERB_GARDEN) {
      score += 0.54 * resolveTargetPriority(policy, "herb_garden", 1);
    } else if (tileType === TILE.KITCHEN) {
      score += 0.58 * resolveTargetPriority(policy, "kitchen", 1);
    } else if (tileType === TILE.SMITHY) {
      score += 0.58 * resolveTargetPriority(policy, "smithy", 1);
    } else if (tileType === TILE.CLINIC) {
      score += 0.58 * resolveTargetPriority(policy, "clinic", 1);
    }

    // Occupancy penalty: steep diminishing returns per worker already targeting this tile
    if (occupants > 0 && tileType !== TILE.WAREHOUSE) {
      score -= 0.45 * occupants / (1 + 0.3 * (occupants - 1));
      // Extra penalty for same-role clustering (redundant work)
      const sameRoleCount = readOccupancyCount(sameRoleOccupancy, candidateKey, worker);
      if (sameRoleCount > 0) score -= 0.25 * sameRoleCount;
    }

    if (reservation && tileType !== TILE.WAREHOUSE && reservation.isReserved(candidate.ix, candidate.iz, worker.id)) {
      score -= 2.0;
    }

    // v0.8.13 A6 — blacklisted tiles drop into the fallback bucket. They are
    // never preferred over a non-blacklisted candidate, but the worker can
    // still pick the best-blacklisted if every other candidate is blacklisted
    // (audit recommendation: skip with last-resort fallback to avoid stranding).
    const isBlacklisted = blacklist
      ? blacklist.isBlacklisted(worker.id, candidate.ix, candidate.iz, tileType, nowSec)
      : false;

    const candidateEntry = {
      tile: candidate,
      score,
      meta: {
        frontierAffinity,
        depotAffinity,
        warehouseLoad,
        ecologyPressure,
      },
    };

    if (isBlacklisted) {
      if (!bestBlacklisted || score > bestBlacklisted.score) bestBlacklisted = candidateEntry;
    } else if (!best || score > best.score) {
      best = candidateEntry;
    }
  }

  // Prefer non-blacklisted; fall back to best-blacklisted only when every
  // candidate has been recently rejected by A*.
  const chosen = best ?? bestBlacklisted;
  worker.debug ??= {};
  worker.debug.policyTargetScore = Number(chosen?.score ?? 0);
  worker.debug.policyTargetFrontier = Number(chosen?.meta?.frontierAffinity ?? 0);
  worker.debug.policyTargetDepot = Number(chosen?.meta?.depotAffinity ?? 0);
  worker.debug.policyTargetWarehouseLoad = Number(chosen?.meta?.warehouseLoad ?? 0);
  worker.debug.policyTargetEcology = Number(chosen?.meta?.ecologyPressure ?? 0);
  return chosen?.tile ?? null;
}

function getWorkerHungerSeekThreshold(worker) {
  const base = Number(BALANCE.workerHungerSeekThreshold ?? 0.14);
  const override = Number(worker?.metabolism?.hungerSeekThreshold ?? base);
  return clamp(override, 0.05, 0.8);
}

// v0.9.0-e — exported so JobEat can resolve the per-worker (metabolism-aware)
// eat target and per-food recovery rate when inlining the eat body. Private
// callers (consumeEmergencyRation, …) still use them within this module.
export function getWorkerEatRecoveryTarget(worker) {
  const base = Number(BALANCE.workerEatRecoveryTarget ?? 0.68);
  const override = Number(worker?.metabolism?.eatRecoveryTarget ?? base);
  return clamp(override, 0.2, 0.98);
}

function getWorkerHungerDecayPerSecond(worker) {
  const base = Math.max(0, Number(BALANCE.workerHungerDecayPerSecond ?? BALANCE.hungerDecayPerSecond ?? 0.014));
  const multiplier = Number(worker?.metabolism?.hungerDecayMultiplier ?? 1);
  return Math.max(0, base * clamp(multiplier, 0.5, 1.5));
}

// v0.9.0-e — exported alongside getWorkerEatRecoveryTarget for the JobEat
// inline.
export function getWorkerRecoveryPerFoodUnit(worker) {
  const base = Number(BALANCE.workerHungerEatRecoveryPerFoodUnit ?? BALANCE.hungerEatRecoveryPerFoodUnit ?? 0.04);
  const multiplier = Number(worker?.metabolism?.eatRecoveryPerFoodMultiplier ?? 1);
  return Math.max(1e-4, base * clamp(multiplier, 0.5, 1.5));
}

// v0.8.2 Round-5b (02d Step 2b) — memory helper mirroring MortalitySystem pattern.
// Pushes a human-readable line with dedup guard; windowSec=9999 ensures band-crossings
// (once-per-lifetime) are never duplicated within a session.
function inferMemoryType(dedupKey) {
  const key = String(dedupKey ?? "");
  if (key.startsWith("friend:") || key.startsWith("rival:")) return "relationship";
  if (key.startsWith("birth:")) return "birth";
  if (key.startsWith("death:")) return "death";
  return "event";
}

function pushMemoryHistory(agent, line, dedupKey, nowSec) {
  agent.memory ??= { recentEvents: [], dangerTiles: [] };
  if (!Array.isArray(agent.memory.history)) agent.memory.history = [];
  if (dedupKey && agent.memory.history.some((entry) => entry?.key === dedupKey)) return;
  agent.memory.history.unshift({
    simSec: Number(nowSec ?? 0),
    type: inferMemoryType(dedupKey),
    label: String(line ?? ""),
    key: dedupKey ? String(dedupKey) : null,
  });
  agent.memory.history = agent.memory.history.slice(0, WORKER_MEMORY_HISTORY_LIMIT);
}

function pushFriendshipMemory(agent, line, dedupKey, windowSec, nowSec) {
  agent.memory ??= { recentEvents: [], dangerTiles: [] };
  if (!Array.isArray(agent.memory.recentEvents)) agent.memory.recentEvents = [];
  if (!(agent.memory.recentKeys instanceof Map)) agent.memory.recentKeys = new Map();
  if (agent.memory.recentKeys.has(dedupKey)) return;
  agent.memory.recentKeys.set(dedupKey, nowSec);
  agent.memory.recentEvents.unshift(line);
  agent.memory.recentEvents = agent.memory.recentEvents.slice(0, WORKER_MEMORY_RECENT_LIMIT);
  pushMemoryHistory(agent, line, dedupKey, nowSec);
}

// v0.8.2 Round-7 (01e+02b) — Worker trait behavioral wiring.
// Returns a modifier bundle read by WorkerAISystem.update to adjust decay
// rates, intent scores, and thresholds per trait.  When the master toggle
// `BALANCE.workerTraitEffectsEnabled` is false this is a zero-overhead no-op
// (all modifiers at neutral values).
function getWorkerTraitModifiers(worker) {
  if (!BALANCE.workerTraitEffectsEnabled) {
    return {
      weatherCostMult: 1.0,
      moraleDecayMult: 1.0,
      restDecayMult: 1.0,
      friendRestBonus: 0,
      taskCooldownMult: 1.0,
      deathThresholdDelta: 0,
    };
  }
  const traits = worker.traits ?? [];
  return {
    weatherCostMult: traits.includes("hardy") ? BALANCE.traitHardyWeatherMult : 1.0,
    moraleDecayMult: traits.includes("hardy") ? BALANCE.traitHardyMoraleDecayMult : 1.0,
    restDecayMult: traits.includes("social") ? BALANCE.traitSocialRestDecayMult : 1.0,
    friendRestBonus: traits.includes("social") ? BALANCE.traitSocialFriendBonus : 0,
    taskCooldownMult: traits.includes("efficient") ? BALANCE.traitEfficientTaskMult : 1.0,
    deathThresholdDelta: traits.includes("resilient") ? BALANCE.traitResilientDeathThresholdDelta : 0,
  };
}

// v0.8.2 Round-7 (01e+02b) — Emotional decision-context prefix.
// Prepends a short first-person line that reflects the worker's immediate
// emotional state before the standard decision-context text.  The grief
// branch surfaces blackboard.griefFriendName / griefUntilSec written by
// the colony's memorial system (not yet live as of Round-7, so the branch
// is a no-op unless future systems populate it).
function addEmotionalPrefix(worker, state, text) {
  const hunger = Number(worker.hunger ?? 1);
  const morale = Number(worker.morale ?? 1);
  if (hunger < 0.25) return `Running low — ${text}`;
  if (morale < 0.3) return `Barely holding — ${text}`;
  const griefName = worker.blackboard?.griefFriendName;
  const griefUntil = Number(worker.blackboard?.griefUntilSec ?? -Infinity);
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  if (griefName && nowSec < griefUntil) return `${griefName} is gone. ${text}`;
  return text;
}

// v0.10.0-d — chooseWorkerIntent + JobScheduler removed. The Priority-FSM
// (src/simulation/npc/fsm/) is the single source of truth for worker
// decisions. The intent string ("eat" / "deliver" / "farm" / etc.) is
// derived from FSM state via `worker.blackboard.intent`, written by
// each state body's onEnter / tick. EntityFocusPanel reads stateLabel
// (FSM-sourced) + blackboard.intent directly; the legacy
// worker.debug.lastIntent fallback is no longer wired up for workers
// (animals/visitors still own that surface via their own AI systems).

// v0.9.0-e — hasHiddenFrontier / findNearestHiddenTile deleted along with
// handleWander. v0.10.0-d — the fog-frontier wander bias has not been
// re-introduced; if a future phase adds an EXPLORING_FOG state, it will
// own that scan.

function estimateNearestWarehouseDistance(worker, state) {
  if (!state?.grid || !Number.isFinite(worker?.x) || !Number.isFinite(worker?.z)) return 0;
  if (Number(state.buildings?.warehouses ?? 0) <= 0) return Infinity;
  const nearest = findNearestTileOfTypes(state.grid, worker, [TILE.WAREHOUSE]);
  if (!nearest) return Infinity;
  const current = worldToTile(worker.x, worker.z, state.grid);
  return Math.abs(current.ix - nearest.ix) + Math.abs(current.iz - nearest.iz);
}

// v0.8.5 Tier 3: Rest-scaled night productivity multiplier. The previous
// flat 0.6 punished well-rested colonies the same as exhausted ones.
// Linear: floor + restBonus × clamp(rest, 0, 1). At rest=0 → floor (0.6);
// at rest=1 → floor+restBonus (1.0). Falls back to the legacy flat
// multiplier if the new fields are unset (backwards-compatible savegames).
function getNightProductivityMultiplier(worker) {
  const floor = Number(BALANCE.workerNightProductivityFloor ?? BALANCE.workerNightProductivityMultiplier ?? 0.6);
  const restBonus = Number(BALANCE.workerNightProductivityRestBonus ?? 0);
  if (restBonus <= 0) return floor;
  const rest = clamp(Number(worker?.rest ?? 1), 0, 1);
  return floor + restBonus * rest;
}

function resolveWorkCooldown(worker, dt, amount, resourceType, rng, isNight, directDepositState = null) {
  if (worker.cooldown <= 0) {
    const baseDuration = Number(BALANCE.workerHarvestDurationSec ?? 2.5);
    const skillMultiplier = Number(worker.preferences?.workDurationMultiplier ?? 1);
    // v0.8.5 Tier 3: rest-scaled night productivity. Well-rested workers
    // hit 1.0 productivity at night; exhausted ones still take the floor
    // penalty.
    const nightMult = isNight ? getNightProductivityMultiplier(worker) : 1;
    const nightPenalty = isNight ? (1 / Math.max(0.1, nightMult)) : 1;
    worker.cooldown = baseDuration * skillMultiplier * nightPenalty * (0.8 + rng.next() * 0.5);
    worker.workRemaining = worker.cooldown;
    worker.progress = 0;
    return;
  }

  worker.cooldown -= dt;
  // Track progress for action duration realism
  const total = Number(worker.workRemaining ?? worker.cooldown + dt);
  worker.progress = total > 0 ? clamp(1 - worker.cooldown / total, 0, 1) : 1;
  if (worker.cooldown <= 0) {
    // v0.8.5 Tier 3: careful trait yield bonus. Pre-v0.8.5 the careful
    // trait carried only a speed penalty (workDurationMultiplier > 1)
    // with no upside — strict-worse trait. Apply +traitCarefulYieldBonus
    // to harvest amounts when the worker has the careful trait, balancing
    // out the slower harvest cycle.
    let yielded = amount;
    if (BALANCE.workerTraitEffectsEnabled !== false
        && Array.isArray(worker.traits)
        && worker.traits.includes("careful")) {
      const carefulBonus = Number(BALANCE.traitCarefulYieldBonus ?? 0);
      if (carefulBonus > 0) yielded *= 1 + carefulBonus;
    }
    // v0.8.6 Tier 0 LR-C1: bypass carry → deposit directly into state.resources
    // when no warehouse exists. Caller passes `directDepositState=state` to opt
    // in; otherwise the standard carry path is preserved. Resource keys map
    // 1:1 with state.resources fields.
    if (directDepositState && directDepositState.resources) {
      const cur = Number(directDepositState.resources[resourceType] ?? 0);
      directDepositState.resources[resourceType] = cur + yielded;
    } else {
      worker.carry[resourceType] += yielded;
    }
    worker.progress = 0;
    worker.workRemaining = 0;
  }
}

function isTargetTileType(worker, state, targetTileTypes) {
  if (!worker.targetTile) return false;
  const tile = getTile(state.grid, worker.targetTile.ix, worker.targetTile.iz);
  return targetTileTypes.includes(tile);
}

// v0.10.0-d — exported so the FSM SEEKING_* state bodies share the same
// target-arrival predicate (used to be re-exported through JobHelpers.js).
export function isAtTargetTile(worker, state) {
  if (!worker.targetTile) return false;
  const current = worldToTile(worker.x, worker.z, state.grid);
  return current.ix === worker.targetTile.ix && current.iz === worker.targetTile.iz;
}

// v0.10.0-d — exported for FSM state bodies (no movement intent on this
// tick): see isAtTargetTile.
export function setIdleDesired(worker) {
  if (!worker.desiredVel) {
    worker.desiredVel = { x: 0, z: 0 };
    return;
  }
  worker.desiredVel.x = 0;
  worker.desiredVel.z = 0;
}

function getPendingPathTarget(worker) {
  const target = worker.blackboard?.pendingPathTargetTile ?? null;
  if (!target || !Number.isFinite(Number(target.ix)) || !Number.isFinite(Number(target.iz))) return null;
  return { ix: Number(target.ix), iz: Number(target.iz) };
}

function getFarmEcologyYieldMultiplier(worker, state) {
  const target = worker.targetTile ?? null;
  if (!target) return { multiplier: 1, pressure: 0 };
  const key = `${target.ix},${target.iz}`;
  const pressure = Math.max(0, Number(state.metrics?.ecology?.farmPressureByKey?.[key] ?? 0));
  const penalty = Math.min(
    Number(BALANCE.ecologyFarmYieldPenaltyMax ?? 0.7),
    pressure * Number(BALANCE.ecologyFarmYieldPenaltyPerPressure ?? 0.44),
  );
  return {
    multiplier: Math.max(0.15, 1 - penalty),
    pressure,
  };
}

function _emergencyRationStep(worker, state, dt, nowSec, services = null) {
  const eatRecoveryTarget = getWorkerEatRecoveryTarget(worker);
  const hungerNow = Number(worker.hunger ?? 0);
  if (hungerNow >= WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD) return;
  const warehouseFood = Number(state.resources.food ?? 0);
  const carryFood = Number(worker.carry?.food ?? 0);
  // v0.8.2 Round-7 01e+02b — fall back to carry.food when warehouse is empty
  if (warehouseFood <= 0 && carryFood <= 0) return;
  // v0.8.7 T0-3 (QA1-H1): Skip emergency-eat ONLY if the worker can actually
  // USE the reachable source.
  // v0.8.8 D1: tightened to make carry-eat truly emergency-only. Earlier
  // logic permitted carry-eat any time reachableFood was undefined, which
  // happened on the first MortalitySystem-skip tick of a worker's life.
  // Now we treat:
  //   - warehouse present + reachableFood !== false → skip (let regular
  //     seek_food path deliver to/from warehouse stockpile)
  //   - warehouse present + reachableFood === false → emergency carry-eat
  //   - no warehouse → emergency carry-eat permitted (LR-C1 path)
  // Net effect: workers with carry food who can route to a warehouse will
  // deposit + eat from stockpile rather than munching carry directly.
  // v0.8.13 A2: read fresh reachability from services.reachability rather
  // than the stale debug.reachableFood snapshot.
  const hasWarehouse = (state.buildings?.warehouses ?? 0) > 0;
  if (hasWarehouse) {
    let reachable;
    const cache = services?.reachability;
    if (cache && state.grid) {
      const fromTile = worldToTile(worker.x, worker.z, state.grid);
      let result = cache.isReachable(fromTile, [TILE.WAREHOUSE], state, services);
      if (!result) result = cache.probeAndCache(fromTile, [TILE.WAREHOUSE], state, services, worker);
      reachable = result ? result.reachable : worker.debug?.reachableFood;
    } else {
      reachable = worker.debug?.reachableFood;
    }
    if (reachable !== false) return;
  }
  worker.blackboard ??= {};
  const nextAllowed = Number(worker.blackboard.emergencyRationCooldownSec ?? -Infinity);
  if (nowSec < nextAllowed) return;
  const recoveryPerFood = getWorkerRecoveryPerFoodUnit(worker);
  const eatRate = Number(BALANCE.hungerEatRatePerSecond ?? 5) * 0.22;
  const gainCap = Math.max(0, eatRecoveryTarget - hungerNow);
  const desiredFood = Math.min(eatRate * dt, gainCap / recoveryPerFood);
  if (warehouseFood > 0) {
    // Prefer warehouse food
    const eat = Math.min(desiredFood, warehouseFood);
    if (eat <= 0) return;
    state.resources.food -= eat;
    worker.hunger = clamp(worker.hunger + eat * recoveryPerFood, 0, 1);
  } else {
    // Fall back to carry food when warehouse is depleted
    const eat = Math.min(desiredFood, carryFood);
    if (eat <= 0) return;
    worker.carry.food = Math.max(0, carryFood - eat);
    worker.hunger = clamp(worker.hunger + eat * recoveryPerFood, 0, 1);
  }
  worker.blackboard.emergencyRationCooldownSec = nowSec + WORKER_EMERGENCY_RATION_COOLDOWN_SEC;
}

// v0.10.0-d — Public entry point for the FSM EATING / SEEKING_FOOD states
// (and IDLE wander branch when hunger crosses the seek threshold). Wraps
// the module-private _emergencyRationStep with the standard nowSec lookup.
// Renamed from _consumeEmergencyRationForJobLayer when the Job layer
// retired in v0.10.0-d.
export function consumeEmergencyRation(worker, state, dt, services = null) {
  const nowSec = Number(state?.metrics?.timeSec ?? 0);
  _emergencyRationStep(worker, state, dt, nowSec, services);
}

function maybeRetarget(worker, state, services, intentKey, targetTileTypes) {
  const nowSec = state.metrics.timeSec;
  const blackboard = worker.blackboard ?? (worker.blackboard = {});

  const targetInvalid = !isTargetTileType(worker, state, targetTileTypes);
  const pathStale = Boolean(worker.path) && worker.pathGridVersion !== state.grid.version;
  const pathMissingAwayFromTarget = !hasActivePath(worker, state) && !isAtTargetTile(worker, state);
  const pathStuck = isPathStuck(worker, state, 2.4);
  const shouldRetarget = targetInvalid || pathStale || pathMissingAwayFromTarget || pathStuck;

  if (shouldRetarget) {
    if (hasPendingPathRequest(worker, services)) {
      return hasActivePath(worker, state) || isAtTargetTile(worker, state);
    }
    if (!canAttemptPath(worker, state)) {
      return hasActivePath(worker, state) || isAtTargetTile(worker, state);
    }
    if (Number.isFinite(state._workerPathBudget) && state._workerPathBudget <= 0) {
      setIdleDesired(worker);
      return hasActivePath(worker, state) || isAtTargetTile(worker, state);
    }
    if (Number.isFinite(state._workerPathBudget)) {
      state._workerPathBudget -= 1;
      state._workerPathBudgetUsed = Number(state._workerPathBudgetUsed ?? 0) + 1;
    }
    const reservation = state._jobReservation;
    if (reservation) reservation.releaseAll(worker.id);
    const target = getPendingPathTarget(worker)
      ?? chooseWorkerTarget(worker, state, targetTileTypes, state._workerTargetOccupancy, services)
      ?? findNearestTileOfTypes(state.grid, worker, targetTileTypes);
    if (!target || !setTargetAndPath(worker, target, state, services)) {
      return false;
    }
    if (reservation) reservation.reserve(worker.id, target.ix, target.iz, intentKey, nowSec);
    blackboard.intentTargetIntent = intentKey;
    // Phase offset per worker to desynchronize re-evaluation waves
    const workerPhase = ((worker.id?.charCodeAt?.(0) ?? 0) % 7) * 0.12;
    blackboard.nextTargetRefreshSec = nowSec + TARGET_REFRESH_BASE_SEC + workerPhase + services.rng.next() * TARGET_REFRESH_JITTER_SEC;
  }

  return hasActivePath(worker, state) || isAtTargetTile(worker, state);
}

// v0.10.0-d — Legacy handleGuardCombat / handleEat / Job classes have all
// been retired. Engage logic + at-warehouse eat live inline in the FSM
// FIGHTING / EATING state bodies. The legacy GUARD short-circuit at the
// top of WorkerAISystem.update was retired in v0.9.0-d; FSM
// FIGHTING transitions priority=0 from every state when a hostile is in
// aggro range.

// v0.10.0-d KEPT: handleDeliver is exercised by warehouse-queue.test.js as
// a yield-equivalence harness (drives unloads at a stationary worker
// without running the full WorkerAISystem.update path) and the FSM
// DEPOSITING state inlines the same body via this export.
export function handleDeliver(worker, state, services, dt) {
  const carryTotal = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0) + Number(worker.carry?.stone ?? 0) + Number(worker.carry?.herbs ?? 0);
  if (carryTotal <= 0 || Number(state.buildings?.warehouses ?? 0) <= 0) {
    clearPath(worker);
    setIdleDesired(worker);
    worker.blackboard ??= {};
    worker.blackboard.intentTargetIntent = "seek_task";
    worker.blackboard.taskLock = { state: "", untilSec: -Infinity };
    state.metrics.deliverWithoutCarryCount = Number(state.metrics.deliverWithoutCarryCount ?? 0) + 1;
    return;
  }
  if (!maybeRetarget(worker, state, services, "deliver", [TILE.WAREHOUSE])) return;

  if (hasActivePath(worker, state)) {
    const step = followPath(worker, state, dt);
    worker.desiredVel = step.desired;
    if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
  } else {
    setIdleDesired(worker);
  }

  if (isAtTargetTile(worker, state)) {
    const key = `${worker.targetTile?.ix ?? -1},${worker.targetTile?.iz ?? -1}`;
    // M2 warehouse throughput queue: enforce per-tick intake cap before unload.
    state.warehouseQueues ??= {};
    const queueEntry = (state.warehouseQueues[key] ??= {
      intakeTokensUsed: 0,
      queue: [],
      lastResetTick: Number(state.metrics?.tick ?? 0),
    });
    queueEntry.queue ??= [];
    const intakeCap = Number(BALANCE.warehouseIntakePerTick ?? 2);
    if (Number(queueEntry.intakeTokensUsed ?? 0) >= intakeCap) {
      // No intake slot this tick — enqueue and skip unload.
      worker.blackboard ??= {};
      if (!queueEntry.queue.includes(worker.id)) {
        queueEntry.queue.push(worker.id);
        worker.blackboard.queueEnteredTick = Number(state.metrics?.tick ?? 0);
      }
      return;
    }
    // Intake available — consume a token, unload, and remove from queue if present.
    queueEntry.intakeTokensUsed = Number(queueEntry.intakeTokensUsed ?? 0) + 1;
    const qIdx = queueEntry.queue.indexOf(worker.id);
    if (qIdx >= 0) queueEntry.queue.splice(qIdx, 1);
    if (worker.blackboard) worker.blackboard.queueEnteredTick = null;

    const logistics = state.metrics?.logistics ?? {};
    const inboundLoad = Math.max(1, Number(logistics.warehouseLoadByKey?.[key] ?? 1));
    const penalty = Math.max(1, 1 + Math.max(0, inboundLoad - 1) * Number(BALANCE.warehouseQueuePenalty ?? 0.32));
    // M4 isolation deposit penalty: if the warehouse tile's logistics efficiency
    // matches the isolation value (i.e., no connected road path), slow down unload.
    const isolationPenalty = Number(
      logistics.isolationDepositPenalty ?? BALANCE.isolationDepositPenalty ?? 1,
    );
    const tileEfficiency = Number(logistics.buildingEfficiency?.[key] ?? 1);
    // Treat efficiency at or below LogisticsSystem.ISOLATION_PENALTY as isolated.
    const isolatedMultiplier = tileEfficiency <= ISOLATION_PENALTY + 1e-6 ? isolationPenalty : 1;
    // v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 5) — mood→output
    // coupling on the unload leg. Default 1.0 if blackboard missing.
    const moodUnloadMult = Number(worker.blackboard?.moodOutputMultiplier ?? 1);
    const unloadBudget = Math.max(0.2, Number(BALANCE.workerUnloadRatePerSecond ?? 4.2) / penalty)
      * dt
      * isolatedMultiplier
      * moodUnloadMult;
    let remaining = unloadBudget;
    const unloadFood = Math.min(Number(worker.carry.food ?? 0), remaining);
    worker.carry.food = Math.max(0, Number(worker.carry.food ?? 0) - unloadFood);
    state.resources.food += unloadFood;
    remaining -= unloadFood;
    const unloadWood = Math.min(Number(worker.carry.wood ?? 0), remaining);
    worker.carry.wood = Math.max(0, Number(worker.carry.wood ?? 0) - unloadWood);
    state.resources.wood += unloadWood;
    remaining -= unloadWood;
    const unloadStone = Math.min(Number(worker.carry.stone ?? 0), remaining);
    worker.carry.stone = Math.max(0, Number(worker.carry.stone ?? 0) - unloadStone);
    state.resources.stone = (state.resources.stone ?? 0) + unloadStone;
    remaining -= unloadStone;
    const unloadHerbs = Math.min(Number(worker.carry.herbs ?? 0), remaining);
    worker.carry.herbs = Math.max(0, Number(worker.carry.herbs ?? 0) - unloadHerbs);
    state.resources.herbs = (state.resources.herbs ?? 0) + unloadHerbs;
    worker.debug ??= {};
    worker.debug.targetWarehouseLoad = inboundLoad;
    worker.debug.lastUnloadRate = unloadBudget;
    if (Number(worker.carry.food ?? 0) + Number(worker.carry.wood ?? 0) + Number(worker.carry.stone ?? 0) + Number(worker.carry.herbs ?? 0) <= 1e-4) {
      worker.carry.food = 0;
      worker.carry.wood = 0;
      worker.carry.stone = 0;
      worker.carry.herbs = 0;
      worker.blackboard ??= {};
      worker.blackboard.carryAgeSec = 0;
      // M3: carryTicks tracks the current carry leg for spoilage grace; reset
      // on full unload so the next pickup starts with a fresh grace window.
      worker.blackboard.carryTicks = 0;
      state.metrics.deliveries = (state.metrics.deliveries ?? 0) + 1;
    }
  }
}

const ROLE_HARVEST_CONFIG = {
  [ROLE.FARM]: { intentKey: "farm", tileTypes: [TILE.FARM] },
  [ROLE.WOOD]: { intentKey: "lumber", tileTypes: [TILE.LUMBER] },
  [ROLE.STONE]: { intentKey: "quarry", tileTypes: [TILE.QUARRY] },
  [ROLE.HERBS]: { intentKey: "gather_herbs", tileTypes: [TILE.HERB_GARDEN] },
  [ROLE.HAUL]: { intentKey: "haul", tileTypes: [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN] },
};

const ROLE_PROCESS_CONFIG = {
  [ROLE.COOK]: { intentKey: "cook", tileTypes: [TILE.KITCHEN] },
  [ROLE.SMITH]: { intentKey: "smith", tileTypes: [TILE.SMITHY] },
  [ROLE.HERBALIST]: { intentKey: "heal", tileTypes: [TILE.CLINIC] },
};

export function handleHarvest(worker, state, services, dt) {
  const config = ROLE_HARVEST_CONFIG[worker.role];
  const intentKey = config?.intentKey ?? (worker.role === ROLE.FARM ? "farm" : "lumber");
  const targetTypes = config?.tileTypes ?? (worker.role === ROLE.FARM ? [TILE.FARM] : [TILE.LUMBER]);
  if (!maybeRetarget(worker, state, services, intentKey, targetTypes)) return;

  if (hasActivePath(worker, state)) {
    const step = followPath(worker, state, dt);
    worker.desiredVel = step.desired;
    if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
  } else {
    setIdleDesired(worker);
  }

  if (!isAtTargetTile(worker, state)) return;
  // v0.10.0-d — extracted body. The FSM HARVESTING state body calls
  // applyHarvestStep so the yield-pool / soil-salinization / fertility-
  // drain / telemetry semantics remain in a single place. Resource is
  // auto-resolved from the tile the worker is standing on (HAUL handling
  // preserved).
  applyHarvestStep(worker, state, services, dt);
}

// v0.10.0-d — Shared harvest mechanic used by the FSM HARVESTING state
// body (and by the legacy handleHarvest export for warehouse-queue test).
//
// Preconditions: worker has arrived at a valid target tile of the correct
// type (caller verifies via isAtTargetTile). Performs one tick of the
// harvest cooldown machinery, including:
//   - cooldown roll on entry, decrement on subsequent ticks
//   - completion-tick credit into worker.carry[resourceKey] (or
//     state.resources.food when no warehouse exists, food only)
//   - yieldPool decrement + carry refund when pool is exhausted
//   - soil salinization + fallow trigger (FARM only)
//   - fertility drain (FARM/HERBS/LUMBER)
//   - production telemetry recording (idle-reason inference)
//
// `tileType` and `resourceKey` are optional overrides; when omitted, both
// are resolved from the tile under worker.targetTile (HAUL preserved).
export function applyHarvestStep(worker, state, services, dt, tileTypeOverride = null, resourceKeyOverride = null) {
  if (!worker?.targetTile) return;
  const toolMultiplier = Number(state.gameplay?.toolProductionMultiplier ?? 1);
  const isNight = Boolean(state.environment?.isNight);
  // Logistics efficiency: buildings connected to warehouse via road get bonus, isolated get penalty
  const logistics = state._logisticsSystem;
  const logisticsBonus = (logistics && worker.targetTile)
    ? logistics.getEfficiency(worker.targetTile.ix, worker.targetTile.iz) : 1.0;
  // Resolve tile + role for this harvest step. Callers may pass explicit
  // overrides (constrained tile type from FSM SEEKING_HARVEST.onEnter);
  // otherwise we resolve from the tile under worker.targetTile and
  // HAUL→specific role. Both arrive at the same effectiveRole.
  const tileAtTarget = tileTypeOverride
    ?? getTile(state.grid, worker.targetTile.ix, worker.targetTile.iz);
  let effectiveRole = worker.role;
  if (resourceKeyOverride) {
    if (resourceKeyOverride === "food") effectiveRole = ROLE.FARM;
    else if (resourceKeyOverride === "wood") effectiveRole = ROLE.WOOD;
    else if (resourceKeyOverride === "stone") effectiveRole = ROLE.STONE;
    else if (resourceKeyOverride === "herbs") effectiveRole = ROLE.HERBS;
  } else if (worker.role === ROLE.HAUL) {
    if (tileAtTarget === TILE.FARM) effectiveRole = ROLE.FARM;
    else if (tileAtTarget === TILE.LUMBER) effectiveRole = ROLE.WOOD;
    else if (tileAtTarget === TILE.QUARRY) effectiveRole = ROLE.STONE;
    else if (tileAtTarget === TILE.HERB_GARDEN) effectiveRole = ROLE.HERBS;
  }
  // v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 5) — mood→output
  // coupling. Defaults to 1.0 if blackboard hasn't been populated yet (e.g.
  // first-tick before mood compositor ran). Forced to 0 while MORALE_BREAK
  // is active (set in the per-tick mood block).
  const moodMult = Number(worker.blackboard?.moodOutputMultiplier ?? 1);
  if (effectiveRole === ROLE.FARM) {
    const doctrine = Number(state.gameplay?.modifiers?.farmYield ?? 1);
    const ecology = getFarmEcologyYieldMultiplier(worker, state);
    const fertility = worker.targetTile ? getTileFertility(state.grid, worker.targetTile.ix, worker.targetTile.iz) : 1;
    worker.debug ??= {};
    worker.debug.lastFarmPressure = ecology.pressure;
    worker.debug.lastFarmYieldMultiplier = ecology.multiplier;
    const farmAmount = Math.max(0.2, state.weather.farmProductionMultiplier * doctrine * ecology.multiplier * toolMultiplier * fertility * logisticsBonus) * moodMult;
    // Capture pre-resolve cooldown so we can tell whether this tick was the
    // completion tick (amount was added inside resolveWorkCooldown).
    const preCooldown = Number(worker.cooldown ?? 0);
    // v0.8.6 Tier 0 LR-C1: when no warehouse exists, route harvested food
    // directly into state.resources.food (the "communal cache"). Without this,
    // workers harvest into carry.food but cannot deposit (no warehouse to
    // path to) and the colony starves while carry rots — observed live as
    // 19/23 dead in 180s on Broken Frontier scenario.
    const noWarehouse = Number(state.buildings?.warehouses ?? 0) <= 0;
    resolveWorkCooldown(
      worker,
      dt,
      farmAmount,
      "food",
      services.rng,
      isNight,
      noWarehouse ? state : null,
    );
    // Drain tile fertility on harvest
    if (worker.cooldown <= 0 && worker.targetTile) {
      drainFertility(state.grid, worker.targetTile.ix, worker.targetTile.iz);
      // M1 soil salinization + yieldPool cap: only on the completion tick,
      // i.e. resolveWorkCooldown decremented a positive cooldown to ≤0 and
      // credited carry.food. (The "start tick" has preCooldown ≤ 0 and exits
      // resolveWorkCooldown with a positive cooldown, so it won't enter this
      // branch — but guard anyway to make intent explicit.)
      if (preCooldown > 0 && worker.targetTile) {
        // Lazy-create tileState so M1 cap/salinization cannot be silently
        // bypassed when the entry was wiped (e.g. by wildfire) mid-harvest
        // (silent-failure H3). setTileField handles the create-if-missing.
        let tileState = getTileState(state.grid, worker.targetTile.ix, worker.targetTile.iz);
        if (!tileState) {
          setTileField(state.grid, worker.targetTile.ix, worker.targetTile.iz, "fertility", 0.9);
          setTileField(state.grid, worker.targetTile.ix, worker.targetTile.iz, "yieldPool", Number(BALANCE.farmYieldPoolInitial ?? 120));
          tileState = getTileState(state.grid, worker.targetTile.ix, worker.targetTile.iz);
        } else if (
          Number(tileState.yieldPool ?? 0) <= 0
          && Number(tileState.fertility ?? 0) > 0
          && Number(tileState.fallowUntil ?? 0) === 0
        ) {
          // Stale entry post-fallow before TileStateSystem reseeds: if fertility
          // has recovered and we're no longer fallowing, restore the yieldPool
          // so this harvest isn't silently voided (R1-HIGH1).
          setTileField(state.grid, worker.targetTile.ix, worker.targetTile.iz, "yieldPool", Number(BALANCE.farmYieldPoolInitial ?? 120));
          tileState = getTileState(state.grid, worker.targetTile.ix, worker.targetTile.iz);
        }
        if (tileState) {
          // Cap harvest by remaining yieldPool — the excess is refunded back
          // out of carry.food so a depleted pool effectively zeros the yield.
          const pool = Math.max(0, Number(tileState.yieldPool ?? 0));
          const effective = Math.min(farmAmount, pool);
          const refund = Math.max(0, farmAmount - effective);
          if (refund > 0) {
            worker.carry.food = Math.max(0, Number(worker.carry.food ?? 0) - refund);
          }
          setTileField(state.grid, worker.targetTile.ix, worker.targetTile.iz, "yieldPool", Math.max(0, pool - effective));

          // Accumulate salinization; trigger fallow if threshold reached.
          const perHarvest = Number(BALANCE.soilSalinizationPerHarvest ?? 0);
          const threshold = Number(BALANCE.soilSalinizationThreshold ?? 1);
          const newSalinized = Number(tileState.salinized ?? 0) + perHarvest;
          setTileField(state.grid, worker.targetTile.ix, worker.targetTile.iz, "salinized", newSalinized);
          if (newSalinized >= threshold) {
            const nowTick = Number(state.metrics?.tick ?? 0);
            const fallowTicks = Number(BALANCE.soilFallowRecoveryTicks ?? 1800);
            setTileField(state.grid, worker.targetTile.ix, worker.targetTile.iz, "fallowUntil", nowTick + fallowTicks);
            setTileField(state.grid, worker.targetTile.ix, worker.targetTile.iz, "fertility", 0);
          }
        }
      }
      // v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Step 3) — production
      // telemetry for InspectorPanel "Last Yield" / "Idle Reason". Reads
      // the latest tile-state to derive an idle reason when this completion
      // tick produced 0 (depleted node / fallow soil); reports farmAmount
      // (the credited yield, post-refund).
      if (worker.targetTile) {
        const ts = getTileState(state.grid, worker.targetTile.ix, worker.targetTile.iz);
        const reason = (Number(ts?.fertility ?? 1) <= 0 && Number(ts?.fallowUntil ?? 0) > 0)
          ? "fallow soil"
          : ((Number(ts?.yieldPool ?? 0) <= 0) ? "depleted node" : null);
        recordProductionEntry(
          state,
          worker.targetTile.ix,
          worker.targetTile.iz,
          "farm",
          Math.max(0, Number(farmAmount) || 0),
          reason,
        );
      }
    }
  } else if (effectiveRole === ROLE.STONE) {
    worker.debug ??= {};
    worker.debug.lastFarmPressure = 0;
    worker.debug.lastFarmYieldMultiplier = 1;
    const quarryWeather = Number(BALANCE.quarryWeatherModifiers?.[state.weather?.current ?? "clear"] ?? 1);
    const stoneAmount = Math.max(0.2, quarryWeather * toolMultiplier * logisticsBonus) * moodMult;
    const preCooldown = Number(worker.cooldown ?? 0);
    resolveWorkCooldown(worker, dt, stoneAmount, "stone", services.rng, isNight);
    // v0.8.0 Phase 3 M1a: decrement the STONE node yieldPool on the completion tick.
    if (preCooldown > 0 && worker.cooldown <= 0 && worker.targetTile) {
      applyNodeYieldHarvest(state, worker, "stone", stoneAmount);
      // v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Step 3) — telemetry.
      const ts = getTileState(state.grid, worker.targetTile.ix, worker.targetTile.iz);
      const reason = (Number(ts?.yieldPool ?? 0) <= 0) ? "depleted node" : null;
      recordProductionEntry(state, worker.targetTile.ix, worker.targetTile.iz, "quarry", Math.max(0, Number(stoneAmount) || 0), reason);
    }
  } else if (effectiveRole === ROLE.HERBS) {
    const herbFertility = worker.targetTile ? getTileFertility(state.grid, worker.targetTile.ix, worker.targetTile.iz) : 1;
    worker.debug ??= {};
    worker.debug.lastFarmPressure = 0;
    worker.debug.lastFarmYieldMultiplier = 1;
    const herbWeather = Number(BALANCE.herbGardenWeatherModifiers?.[state.weather?.current ?? "clear"] ?? 1);
    const herbAmount = Math.max(0.2, herbWeather * toolMultiplier * herbFertility * logisticsBonus) * moodMult;
    const preCooldown = Number(worker.cooldown ?? 0);
    resolveWorkCooldown(worker, dt, herbAmount, "herbs", services.rng, isNight);
    if (worker.cooldown <= 0 && worker.targetTile) {
      drainFertility(state.grid, worker.targetTile.ix, worker.targetTile.iz);
      if (preCooldown > 0) applyNodeYieldHarvest(state, worker, "herbs", herbAmount);
      // v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Step 3) — telemetry.
      const ts = getTileState(state.grid, worker.targetTile.ix, worker.targetTile.iz);
      const reason = (Number(ts?.yieldPool ?? 0) <= 0)
        ? "depleted node"
        : ((Number(ts?.fertility ?? 1) <= 0) ? "fallow soil" : null);
      recordProductionEntry(state, worker.targetTile.ix, worker.targetTile.iz, "herb_garden", Math.max(0, Number(herbAmount) || 0), reason);
    }
  } else {
    const doctrine = Number(state.gameplay?.modifiers?.lumberYield ?? 1);
    const lumberFertility = worker.targetTile ? getTileFertility(state.grid, worker.targetTile.ix, worker.targetTile.iz) : 1;
    worker.debug ??= {};
    worker.debug.lastFarmPressure = 0;
    worker.debug.lastFarmYieldMultiplier = 1;
    const woodAmount = Math.max(0.2, state.weather.lumberProductionMultiplier * doctrine * toolMultiplier * lumberFertility * logisticsBonus) * moodMult;
    const preCooldown = Number(worker.cooldown ?? 0);
    resolveWorkCooldown(worker, dt, woodAmount, "wood", services.rng, isNight);
    if (worker.cooldown <= 0 && worker.targetTile) {
      drainFertility(state.grid, worker.targetTile.ix, worker.targetTile.iz);
      if (preCooldown > 0) applyNodeYieldHarvest(state, worker, "wood", woodAmount);
      // v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Step 3) — telemetry.
      const ts = getTileState(state.grid, worker.targetTile.ix, worker.targetTile.iz);
      const reason = (Number(ts?.yieldPool ?? 0) <= 0)
        ? "depleted node"
        : ((Number(ts?.fertility ?? 1) <= 0) ? "fallow soil" : null);
      recordProductionEntry(state, worker.targetTile.ix, worker.targetTile.iz, "lumber", Math.max(0, Number(woodAmount) || 0), reason);
    }
  }
}

// v0.8.0 Phase 3 M1a: deduct yieldPool on the tile the worker just harvested.
// When the node is exhausted, refund the excess carry so depleted nodes stop
// producing. Also marks the tile as harvested-this-tick so the regen pass
// can skip it until a fresh tick.
function applyNodeYieldHarvest(state, worker, carryKey, amount) {
  if (!worker?.targetTile) return;
  const { ix, iz } = worker.targetTile;
  // Lazy-create tileState so harvest+regen bookkeeping cannot be silently
  // skipped when the entry is missing (silent-failure H4). BuildAdvisor's
  // node-gate normally prevents this, but scenario-stamped / save-loaded
  // tiles can land here without a backing entry.
  let entry = getTileState(state.grid, ix, iz);
  if (!entry) {
    setTileField(state.grid, ix, iz, "lastHarvestTick", -1);
    entry = getTileState(state.grid, ix, iz);
  }
  if (!entry) return;
  const pool = Math.max(0, Number(entry.yieldPool ?? 0));
  const effective = Math.min(amount, pool);
  const refundAmount = Math.max(0, amount - effective);
  if (refundAmount > 0 && worker.carry) {
    worker.carry[carryKey] = Math.max(0, Number(worker.carry[carryKey] ?? 0) - refundAmount);
  }
  setTileField(state.grid, ix, iz, "yieldPool", Math.max(0, pool - effective));
  setTileField(state.grid, ix, iz, "lastHarvestTick", Number(state.metrics?.tick ?? 0));
}

// v0.9.0-e — handleProcess / handleRest deleted. JobProcessBase and JobRest
// inline their bodies; ProcessingSystem still owns the actual production
// cycle (yield-equivalence preserved).

/**
 * v0.8.11 worker-AI bare-init responsiveness (Fix 3) — pick a wander
 * destination biased toward useful local tiles instead of a uniform-random
 * distant tile across the 96×72 map. Distribution:
 *   70% — passable tile within Manhattan radius 8 of worker's current position
 *   20% — passable tile within radius 4 of a random construction site
 *         (so idle workers cluster near work, not far away)
 *   10% — fall back to randomPassableTile (full-map random)
 * Returns null if no nearby passable tile is found within the retry budget;
 * caller falls back to randomPassableTile.
 */
// v0.8.12 F5 — gentle dispersion: prefer wander destinations not adjacent to
// other workers. Builds a per-tick worker-tile occupancy map (cached on
// state._workerTileMap keyed by tick so multiple wandering workers in the same
// tick reuse the same map). The 3x3-neighbour count is cheap O(workers).
function getWorkerTileMap(state) {
  const tick = Number(state.metrics?.tick ?? 0);
  const cached = state._workerTileMap;
  if (cached && cached.tick === tick) return cached.map;
  const map = new Map();
  const agents = Array.isArray(state.agents) ? state.agents : [];
  for (const a of agents) {
    if (!a || a.type !== "WORKER" || a.alive === false) continue;
    const t = worldToTile(a.x, a.z, state.grid);
    if (!t) continue;
    const key = `${t.ix},${t.iz}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  state._workerTileMap = { tick, map };
  return map;
}

function neighborWorkerCount(map, ix, iz) {
  let n = 0;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const k = `${ix + dx},${iz + dz}`;
      n += map.get(k) ?? 0;
    }
  }
  return n;
}

// v0.10.0-d — wander-target picker exported for the FSM IDLE state's
// wander loop. (v0.9.x's JobWander shared this picker before the Job
// layer retired.)
export function pickWanderNearby(worker, state, services) {
  const grid = state.grid;
  if (!grid) return null;
  const random = () => services.rng.next();
  const origin = worldToTile(worker.x, worker.z, grid);
  const sites = Array.isArray(state.constructionSites) ? state.constructionSites : [];
  const roll = random();
  let cx = origin.ix; let cz = origin.iz; let radius = 8;
  if (roll >= 0.70 && roll < 0.90 && sites.length > 0) {
    const site = sites[Math.floor(random() * sites.length) % sites.length] ?? sites[0];
    cx = Number(site.ix ?? origin.ix); cz = Number(site.iz ?? origin.iz); radius = 4;
  } else if (roll >= 0.90) {
    return null;
  }
  const tileMap = getWorkerTileMap(state);
  // Subtract self so the worker's own tile doesn't penalise its own picks.
  const selfTile = origin;
  let firstPassable = null;
  for (let i = 0; i < 12; i += 1) {
    const dx = Math.floor((random() * 2 - 1) * radius);
    const dz = Math.floor((random() * 2 - 1) * radius);
    const ix = Math.max(0, Math.min(grid.width - 1, cx + dx));
    const iz = Math.max(0, Math.min(grid.height - 1, cz + dz));
    if (!TILE_INFO[getTile(grid, ix, iz)]?.passable) continue;
    if (!firstPassable) firstPassable = { ix, iz };
    let neighbors = neighborWorkerCount(tileMap, ix, iz);
    // Remove self from the neighbour count if the candidate tile's 3x3 contains
    // the worker's own tile (else we would always count ourselves as a neighbour).
    if (Math.abs(selfTile.ix - ix) <= 1 && Math.abs(selfTile.iz - iz) <= 1) {
      neighbors -= 1;
    }
    if (neighbors <= 0) return { ix, iz };
  }
  return firstPassable;
}

// v0.9.0-e — handleWander / attemptAutoBuild / getActiveWorkerPolicy deleted.
// JobWander.tick replicates the wander cadence (carry-bypass eat + path
// retarget loop). The fog-frontier bias was specific to the legacy intent
// "explore_fog" and is not currently restored in JobWander; if a future
// phase re-introduces fog exploration as a Job, it would call findNearestHiddenTile
// itself.

function chooseStressPatrolTile(worker, state, services) {
  const origin = worldToTile(worker.x, worker.z, state.grid);
  const random = () => services.rng.next();
  const radius = 18;
  for (let i = 0; i < 16; i += 1) {
    const ix = Math.max(0, Math.min(state.grid.width - 1, origin.ix + Math.floor((random() * 2 - 1) * radius)));
    const iz = Math.max(0, Math.min(state.grid.height - 1, origin.iz + Math.floor((random() * 2 - 1) * radius)));
    if (Math.abs(ix - origin.ix) + Math.abs(iz - origin.iz) < 5) continue;
    const tile = getTile(state.grid, ix, iz);
    if (TILE_INFO[tile]?.passable) return { ix, iz };
  }
  return randomPassableTile(state.grid, random);
}

function handleStressWorkerPatrol(worker, state, services, dt) {
  worker.blackboard ??= {};
  worker.debug ??= {};
  worker.hunger = 1;
  worker.rest = 1;
  worker.morale = 1;
  worker.social = Math.max(0.7, Number(worker.social ?? 0.7));
  worker.mood = 1;
  worker.starvationSec = 0;
  worker.blackboard.intent = "stress_patrol";
  worker.blackboard.moodOutputMultiplier = 1;
  worker.stateLabel = "Stress patrol";
  worker.debug.lastIntent = "stress_patrol";

  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const pathStuck = isPathStuck(worker, state, 2.0);
  const shouldRetarget = !hasActivePath(worker, state)
    || isAtTargetTile(worker, state)
    || pathStuck
    || nowSec >= Number(worker.blackboard.nextStressPatrolSec ?? -Infinity);

  if (shouldRetarget && !hasPendingPathRequest(worker, services) && canAttemptPath(worker, state)) {
    if (pathStuck || isAtTargetTile(worker, state)) clearPath(worker);
    const target = getPendingPathTarget(worker) ?? chooseStressPatrolTile(worker, state, services);
    if (target && setTargetAndPath(worker, target, state, services)) {
      worker.blackboard.nextStressPatrolSec = nowSec + 3 + services.rng.next() * 4;
    }
  }

  if (hasActivePath(worker, state)) {
    worker.desiredVel = followPath(worker, state, dt).desired;
  } else {
    setIdleDesired(worker);
  }
}

// v0.9.0-e — handleSeekConstruct / handleConstruct / isAtTile deleted.
// JobBuildSite now owns the seek + construct loop directly: it pathfinds
// to the site claim, then calls applyConstructionWork in place.

function updateIdleWithoutReasonMetric(worker, stateNode, dt, state) {
  if (stateNode !== "idle" && stateNode !== "wander") return;
  // v0.10.1-f (P1b) — legacy planner's `blackboard.fsm.reason` no longer
  // populated for workers. Substitute equivalent FSM-derived signal: a
  // worker in IDLE/WANDER without an active path is a stuck worker for
  // telemetry purposes (covers the previous "no-worksite" + "idle"
  // reasons; both led to no path being acquired).
  const hasPath = Array.isArray(worker.path) && worker.path.length > 0;
  if (hasPath) return;

  const metrics = state.metrics;
  metrics.idleWithoutReasonSec ??= {};
  const group = String(worker.groupId ?? "workers");
  metrics.idleWithoutReasonSec[group] = Number(metrics.idleWithoutReasonSec[group] ?? 0) + dt;

  const logic = state.debug.logic ?? (state.debug.logic = {
    invalidTransitions: 0,
    goalFlipCount: 0,
    totalPathRecalcs: 0,
    idleWithoutReasonSecByGroup: {},
    pathRecalcByEntity: {},
    lastGoalsByEntity: {},
    deathByReasonAndReachability: {},
  });
  logic.idleWithoutReasonSecByGroup[group] = Number(logic.idleWithoutReasonSecByGroup[group] ?? 0) + dt;
}

export class WorkerAISystem {
  constructor() {
    this.name = "WorkerAISystem";
    this.activeWorkers = [];
    this.socialHash = { map: new Map(), cellSize: 4 };
    this.socialNeighborBuffer = [];
    this.relationshipNeighborBuffer = [];
    this.highLoadStride = 1;
    // v0.10.0-d — Single dispatcher: WorkerFSM. Lazily allocated on the
    // first update() call so test harnesses that never tick the system
    // pay nothing. Replaced the v0.9.x dual-allocator (JobScheduler +
    // WorkerFSM) when the Job layer retired. See
    // docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md.
    this._workerFSM = null;
  }

  update(dt, state, services) {
    state._jobReservation ??= new JobReservation();
    const reservation = state._jobReservation;
    reservation.cleanupStale(state.metrics.timeSec);

    // v0.8.13 A6 — purge expired blacklist entries once per tick before
    // any worker queries it. TTL is 5 s simulated time.
    if (services?.pathFailBlacklist?.purgeExpired) {
      services.pathFailBlacklist.purgeExpired(Number(state.metrics?.timeSec ?? 0));
    }
    // v0.8.13 A2 — reset the per-tick reachability probe budget. Default 8;
    // ReachabilityCache.probeAndCache decrements this and skips when ≤ 0.
    state._reachabilityProbeBudget = 8;

    state._roadNetwork ??= new RoadNetwork();
    state._roadNetwork.rebuild(state.grid);

    state._logisticsSystem ??= new LogisticsSystem();
    state._logisticsSystem.update(dt, state);

    this.activeWorkers.length = 0;
    for (const worker of state.agents) {
      if (worker.alive === false) {
        if (worker.type === "WORKER") {
          reservation.releaseAll(worker.id);
          // v0.8.4 building-construction (Agent A) — also free any builder
          // reservation so a different BUILDER can claim the half-built site.
          releaseBuilderSite(state, worker);
        }
        continue;
      }
      if (worker.type === "WORKER") this.activeWorkers.push(worker);
    }
    state._workerTargetOccupancy = buildWorkerTargetOccupancy(this.activeWorkers);
    state._workerTargetContext = buildWorkerTargetContext(state);
    buildSpatialHash(this.activeWorkers, 4, this.socialHash);

    const totalEntityCount = Number(state.agents?.length ?? 0) + Number(state.animals?.length ?? 0);
    const { workerStride, pathBudget, pressureCount } = resolveWorkerAiLoadShedding({
      requestedScale: state.controls?.timeScale,
      activeWorkerCount: this.activeWorkers.length,
      totalEntityCount,
    });
    state._workerPathBudget = pathBudget;
    state._workerPathBudgetUsed = 0;
    state._workerNoPathBootstrapBudget = Number.isFinite(pathBudget)
      ? Math.max(8, Math.floor(pathBudget * 0.75))
      : Infinity;
    state._workerNoPathBootstrapUsed = 0;
    this.highLoadStride = workerStride;
    const tick = Number(state.metrics?.tick ?? 0);
    let processedWorkers = 0;
    let skippedWorkers = 0;

    for (const worker of this.activeWorkers) {
      const blackboard = worker.blackboard ?? (worker.blackboard = {});
      let workerDt = dt;
      if (workerStride > 1) {
        blackboard.aiLodDt = Number(blackboard.aiLodDt ?? 0) + dt;
        if (!Number.isFinite(blackboard.aiLodPhase)) {
          let phaseSeed = 0;
          const id = String(worker.id ?? "");
          for (let i = 0; i < id.length; i += 1) phaseSeed += id.charCodeAt(i);
          blackboard.aiLodPhase = Math.abs(phaseSeed);
        }
        const phase = blackboard.aiLodPhase % workerStride;
        const canBootstrapNoPath = !hasPendingPathRequest(worker, services)
          && !hasActivePath(worker, state)
          && Number(state._workerNoPathBootstrapBudget ?? 0) > 0;
        if ((tick + phase) % workerStride !== 0 && !canBootstrapNoPath) {
          if (hasActivePath(worker, state)) {
            worker.desiredVel = followPath(worker, state, dt).desired;
          } else {
            setIdleDesired(worker);
          }
          skippedWorkers += 1;
          continue;
        }
        if (canBootstrapNoPath && (tick + phase) % workerStride !== 0) {
          state._workerNoPathBootstrapBudget -= 1;
          state._workerNoPathBootstrapUsed = Number(state._workerNoPathBootstrapUsed ?? 0) + 1;
        }
        workerDt = Math.max(dt, Number(blackboard.aiLodDt ?? dt));
        blackboard.aiLodDt = 0;
      }
      processedWorkers += 1;

      {
        const dt = workerDt;

        if (worker.isStressWorker) {
          handleStressWorkerPatrol(worker, state, services, dt);
          continue;
        }

        // v0.10.0-d — GUARD pre-emption is owned by the FSM transition
        // table: every state has FIGHTING at priority 0 (highest) when
        // findNearestHostile() returns non-null in aggro range. Outside
        // aggro range, GUARDs flow through SEEKING_HARVEST / IDLE /
        // wander naturally via role-based transitions.

      worker.hunger = clamp(worker.hunger - getWorkerHungerDecayPerSecond(worker) * dt, 0, 1);
      // v0.8.3 worker-vs-raider combat — tick worker attack cooldown so the
      // counter-attack site in AnimalAISystem can fire repeatedly. Non-guard
      // workers never reset this themselves (only the predator-hit branch
      // does), so without this tick the cooldown would stay >0 after the
      // first counter and silently disable bidirectional combat.
      worker.attackCooldownSec = Math.max(0, Number(worker.attackCooldownSec ?? 0) - dt);

      // v0.8.2 Round-7 (01e+02b) — trait modifiers loaded once per worker per tick.
      const _traitMods = getWorkerTraitModifiers(worker);

      // M3a — Carry fatigue: a loaded worker tires faster. Multiplier stacks with night modifier.
      const _carryTotal = Number(worker.carry?.food ?? 0)
        + Number(worker.carry?.wood ?? 0)
        + Number(worker.carry?.stone ?? 0)
        + Number(worker.carry?.herbs ?? 0);
      const _fatigueMult = _carryTotal > 0
        ? Number(BALANCE.carryFatigueLoadedMultiplier ?? 1.0)
        : 1;

      // Rest & morale decay
      const isNight = Boolean(state.environment?.isNight);
      const restDecay = Number(BALANCE.workerRestDecayPerSecond ?? 0.004)
        * (isNight ? Number(BALANCE.workerRestNightDecayMultiplier ?? 2.4) : 1)
        * _fatigueMult
        * _traitMods.restDecayMult;  // social trait: rest decays slower (bonds regenerate rest)
      worker.rest = clamp(Number(worker.rest ?? 1) - restDecay * dt, 0, 1);

      // M3b — In-transit spoilage: perishables (food, herbs) decay off-road.
      worker.blackboard ??= {};
      if (_carryTotal <= 1e-4) {
        worker.blackboard.carryTicks = 0;
      } else if (Number(worker.carry?.food ?? 0) > 0 || Number(worker.carry?.herbs ?? 0) > 0) {
        const _cur = worldToTile(worker.x, worker.z, state.grid);
        const _curTile = getTile(state.grid, _cur.ix, _cur.iz);
        const _onRoad = (_curTile === TILE.ROAD || _curTile === TILE.BRIDGE);
        // v0.8.8 C1 — spoilage-on-road exemption is now an explicit
        // multiplier (default 0.3) instead of a binary skip. Roads still
        // give a strong but non-absolute spoilage advantage so a worker
        // who happens to dwell on a road for a long deposit doesn't ferry
        // perishables forever; this also makes the road-roi exploit test
        // pass since road-trips meaningfully preserve carry food.
        const _spoilageRoadMult = Number(BALANCE.spoilageOnRoadMultiplier ?? 0.3);
        const _ticks = Number(worker.blackboard.carryTicks ?? 0);
        const _graceTicks = Number(BALANCE.spoilageGracePeriodTicks ?? 0);
        const _rateScale = (_ticks < _graceTicks ? 0.5 : 1.0) * (_onRoad ? _spoilageRoadMult : 1.0);
        if (_rateScale > 0) {
          const _foodLoss = Number(BALANCE.foodSpoilageRatePerSec ?? 0) * dt * _rateScale;
          const _herbLoss = Number(BALANCE.herbSpoilageRatePerSec ?? 0) * dt * _rateScale;
          if (_foodLoss > 0) {
            worker.carry.food = Math.max(0, Number(worker.carry.food ?? 0) - _foodLoss);
          }
          if (_herbLoss > 0) {
            worker.carry.herbs = Math.max(0, Number(worker.carry.herbs ?? 0) - _herbLoss);
          }
        }
        worker.blackboard.carryTicks = _ticks + 1;
      }
      // Morale decay: faster during adverse weather.
      // hardy trait: adverse-weather morale penalty reduced by traitHardyMoraleDecayMult.
      const weatherMoraleMult = (state.weather?.current === "storm") ? 2.5
        : (state.weather?.current === "drought" || state.weather?.current === "rain") ? 1.5 : 1.0;
      const effectiveWeatherMoraleMult = weatherMoraleMult <= 1.0
        ? weatherMoraleMult  // neutral / clear: trait has no effect
        : 1.0 + (weatherMoraleMult - 1.0) * _traitMods.moraleDecayMult;
      worker.morale = clamp(Number(worker.morale ?? 1) - Number(BALANCE.workerMoraleDecayPerSecond ?? 0.001) * effectiveWeatherMoraleMult * dt, 0, 1);

      // Social need: decays when isolated, recovers when near other workers
      let nearbyWorkers = 0;
      let hasNearbyCloseFriend = false;
      if (state.metrics.tick % 30 === 0) {
        const neighbors = queryNeighbors(this.socialHash, worker, this.socialNeighborBuffer, 128);
        for (const other of neighbors) {
          if (other === worker || other.alive === false) continue;
          const dist = Math.abs(worker.x - other.x) + Math.abs(worker.z - other.z);
          if (dist < 4) nearbyWorkers++;
          // v0.8.2 Round-7 (01e+02b): detect Close Friend within 3 tiles for social trait rest bonus
          if (_traitMods.friendRestBonus > 0 && dist < 3) {
            const opinionOfOther = Number(worker.relationships?.[other.id] ?? 0);
            if (opinionOfOther >= 0.45) hasNearbyCloseFriend = true;
          }
        }
        worker._nearbyWorkers = nearbyWorkers;
        worker._hasNearbyCloseFriend = hasNearbyCloseFriend;
        // Emit social interaction events periodically when workers are near each other
        if (nearbyWorkers > 0 && state.metrics.tick % 300 === 0) {
          emitEvent(state, EVENT_TYPES.WORKER_SOCIALIZED, {
            entityId: worker.id, entityName: worker.displayName ?? worker.id,
            nearbyCount: nearbyWorkers,
          });
        }
      }
      nearbyWorkers = worker._nearbyWorkers ?? 0;
      hasNearbyCloseFriend = worker._hasNearbyCloseFriend ?? false;
      const socialDelta = nearbyWorkers > 0 ? 0.005 * nearbyWorkers : -0.003;
      worker.social = clamp(Number(worker.social ?? 0.5) + socialDelta * dt, 0, 1);
      // social trait + Close Friend nearby: apply rest bonus (accelerate rest recovery)
      if (_traitMods.friendRestBonus > 0 && hasNearbyCloseFriend) {
        worker.rest = clamp(Number(worker.rest ?? 1) + _traitMods.friendRestBonus * dt, 0, 1);
      }

      // Mood composite: weighted average of hunger, rest, morale, social
      const prevMood = worker.mood ?? 0.5;
      worker.mood = clamp(
        0.35 * Number(worker.hunger ?? 0.5) + 0.30 * Number(worker.rest ?? 0.5)
        + 0.20 * Number(worker.morale ?? 0.5) + 0.15 * Number(worker.social ?? 0.5), 0, 1);

      // v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 5) — mood→output
      // coupling. Linear ramp: mood=0 → moodOutputMin (default 0.5×); mood=1
      // → 1.0×. handleHarvest + handleDeliver read this from blackboard.
      // Forced to 0× while a MORALE_BREAK is active (sub-tick check).
      worker.blackboard ??= {};
      const moodOutputMin = Number(BALANCE.moodOutputMin ?? 0.5);
      const baseMult = clamp(moodOutputMin + (1 - moodOutputMin) * Number(worker.mood ?? 0.5), 0, 1);
      const nowSecMood = Number(state.metrics?.timeSec ?? 0);
      const breakState = worker.blackboard.moraleBreak;
      const onBreak = breakState && Number(breakState.untilSec ?? -Infinity) > nowSecMood;
      worker.blackboard.moodOutputMultiplier = onBreak ? 0 : baseMult;
      if (!onBreak && breakState) {
        // Clear once expired so EntityFocusPanel doesn't render a stale flag.
        worker.blackboard.moraleBreak = null;
      }

      // Emit mood_low event when mood drops below threshold (once per episode)
      if (worker.mood < 0.3 && prevMood >= 0.3) {
        emitEvent(state, EVENT_TYPES.WORKER_MOOD_LOW, {
          entityId: worker.id, entityName: worker.displayName ?? worker.id,
          mood: worker.mood,
        });
      }

      // v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 5) — MORALE_BREAK
      // enqueue on a downward 0.25 crossing. 50% chance + per-worker 90s
      // cooldown so a chronically miserable colony doesn't flood the queue.
      if (worker.mood < 0.25 && prevMood >= 0.25) {
        const lastBreakSec = Number(worker.blackboard.lastMoraleBreakEnqueueSec ?? -Infinity);
        const cooldown = Number(BALANCE.moraleBreakCooldownSec ?? 90);
        if (nowSecMood - lastBreakSec >= cooldown) {
          // Deterministic-ish gate: 50% via tick parity (no extra rng draw to
          // preserve seeded benchmark RNG offsets).
          if ((Number(state.metrics?.tick ?? 0) % 2) === 0) {
            enqueueEvent(
              state,
              EVENT_TYPE.MORALE_BREAK,
              { ix: worker.x | 0, iz: worker.z | 0, workerId: worker.id },
              30,
              1,
            );
            worker.blackboard.lastMoraleBreakEnqueueSec = nowSecMood;
          }
        }
      }

      // Relationship updates: proximity-based opinion drift (every ~5s)
      if (worker.relationships && (state.metrics.tick % 300 === (worker.id?.charCodeAt?.(7) ?? 0) % 300)) {
        const relNowSec = Number(state.metrics?.timeSec ?? 0);
        const neighbors = queryNeighbors(this.socialHash, worker, this.relationshipNeighborBuffer, 128);
        for (const other of neighbors) {
          if (other === worker || other.alive === false) continue;
          const dist = Math.abs(worker.x - other.x) + Math.abs(worker.z - other.z);
          if (dist < 3) {
            const oldOp = Number(worker.relationships[other.id] ?? 0);
            // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 6) — negative
            // delta path. Two workers colliding on the same tile while
            // both empty-handed reads as "competing for nothing": small
            // -0.02 penalty (kept ≤ 0.4× the +0.05 positive delta so the
            // long-horizon-bench social CI still trends net-up). All other
            // proximity ticks keep the legacy +0.05 friendship drift.
            const aCarry = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0)
              + Number(worker.carry?.stone ?? 0) + Number(worker.carry?.herbs ?? 0);
            const bCarry = Number(other.carry?.food ?? 0) + Number(other.carry?.wood ?? 0)
              + Number(other.carry?.stone ?? 0) + Number(other.carry?.herbs ?? 0);
            const isResourceCollision = aCarry <= 0 && bCarry <= 0
              && String(worker.stateLabel ?? "").toLowerCase().includes("deliver")
              && String(other.stateLabel ?? "").toLowerCase().includes("deliver");
            const delta = isResourceCollision ? -0.02 : 0.05;
            const newOp = clamp(oldOp + delta, -1, 1);
            worker.relationships[other.id] = newOp;
            // v0.8.2 Round-5b (02d Step 2b) — emit memory on Friend / Close friend band crossing.
            const crossedClose = oldOp < 0.45 && newOp >= 0.45;
            const crossedFriend = !crossedClose && oldOp < 0.15 && newOp >= 0.15;
            // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 6) — negative
            // band-crossings (Strained at -0.15, Rival at -0.45) emit
            // memory + WORKER_RIVALRY event so the storyteller / Entity
            // Focus surfaces friction. Mirrors the positive WORKER_SOCIALIZED
            // payload shape so consumers don't need a new schema.
            const crossedRival = oldOp > -0.45 && newOp <= -0.45;
            const crossedStrained = !crossedRival && oldOp > -0.15 && newOp <= -0.15;
            if (crossedFriend || crossedClose) {
              const label = crossedClose ? "Close friend" : "Friend";
              const otherName = other.displayName ?? other.id;
              const workerName = worker.displayName ?? worker.id;
              const reason = `worked adjacent (${Math.round(worker.x)},${Math.round(worker.z)})`;
              pushFriendshipMemory(worker, `[${relNowSec.toFixed(0)}s] Became ${label} with ${otherName}`, `friend:${label}:${other.id}`, 9999, relNowSec);
              pushFriendshipMemory(other, `[${relNowSec.toFixed(0)}s] Became ${label} with ${workerName}`, `friend:${label}:${worker.id}`, 9999, relNowSec);
              worker.relationships[`__reason__${other.id}`] = reason;
              other.relationships[`__reason__${worker.id}`] = reason;
              emitEvent(state, EVENT_TYPES.WORKER_SOCIALIZED, {
                entityId: worker.id, otherId: other.id, band: label, opinion: newOp,
              });
            } else if (crossedStrained || crossedRival) {
              const label = crossedRival ? "Rival" : "Strained";
              const otherName = other.displayName ?? other.id;
              const workerName = worker.displayName ?? worker.id;
              const reason = `clashed at (${Math.round(worker.x)},${Math.round(worker.z)})`;
              pushFriendshipMemory(worker, `[${relNowSec.toFixed(0)}s] Became ${label} with ${otherName}`, `rival:${label}:${other.id}`, 9999, relNowSec);
              pushFriendshipMemory(other, `[${relNowSec.toFixed(0)}s] Became ${label} with ${workerName}`, `rival:${label}:${worker.id}`, 9999, relNowSec);
              worker.relationships[`__reason__${other.id}`] = reason;
              other.relationships[`__reason__${worker.id}`] = reason;
              emitEvent(state, EVENT_TYPES.WORKER_RIVALRY, {
                entityId: worker.id, otherId: other.id, band: label, opinion: newOp,
              });
            }
          }
        }
      }

      worker.blackboard ??= {};
      const carryNow = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0) + Number(worker.carry?.stone ?? 0) + Number(worker.carry?.herbs ?? 0);
      worker.blackboard.carryAgeSec = carryNow > 0
        ? Number(worker.blackboard.carryAgeSec ?? 0) + dt
        : 0;
      worker.debug ??= {};
      worker.debug.carryAgeSec = Number(worker.blackboard.carryAgeSec ?? 0);
      const nearestWarehouseDistanceDebug = estimateNearestWarehouseDistance(worker, state);
      worker.debug.nearestWarehouseDistance = Number.isFinite(nearestWarehouseDistanceDebug)
        ? nearestWarehouseDistanceDebug
        : -1;

      const nowSec = Number(state.metrics.timeSec ?? 0);

      // v0.10.1-f (P1b) — legacy display-FSM planner retired for workers.
      // The Priority-FSM (`this._workerFSM`) is the sole worker dispatcher;
      // it writes `worker.fsm.state`, `worker.stateLabel`, and
      // `worker.blackboard.intent` directly. The pre-tick
      // `planEntityDesiredState` + `transitionEntityState` call that used
      // to populate `worker.blackboard.fsm.*` for EntityFocusPanel +
      // WorldSummary + NPCBrainAnalytics is gone — those consumers
      // migrated to FSM-first reads in v0.10.1-b. Visitor + Animal AI
      // still tick the legacy planner via their own systems.
      worker.debug ??= {};
      const prevFsmState = worker.fsm?.state;

      this._workerFSM ??= new WorkerFSM();
      this._workerFSM.tickWorker(worker, state, services, dt);

      // Mirror FSM state name into the legacy `worker.debug.lastStateNode`
      // surface (lowercased) so EntityFocusPanel's fallback chain still
      // resolves correctly for any code path that hasn't migrated to
      // `worker.fsm.state` directly.
      const fsmStateLower = worker.fsm?.state ? String(worker.fsm.state).toLowerCase() : "";
      worker.debug.lastStateNode = fsmStateLower;

      // Emit resting event on state transition (legacy parity). FSM
      // RESTING transition replaces the legacy planner's "rest" state
      // entry as the trigger.
      if (worker.fsm?.state === "RESTING" && prevFsmState !== "RESTING") {
        emitEvent(state, EVENT_TYPES.WORKER_RESTING, {
          entityId: worker.id, entityName: worker.displayName ?? worker.id,
          rest: worker.rest,
        });
      }

      // v0.8.2 Round-7 (01e+02b) — emotional decision-context prefix stored on
      // blackboard so EntityFocusPanel can render it alongside the intent reason.
      if (worker.debug?.lastIntentReason) {
        worker.blackboard.emotionalContext = addEmotionalPrefix(worker, state, worker.debug.lastIntentReason);
      }

      updateIdleWithoutReasonMetric(worker, fsmStateLower, dt, state);
      }
    }
    state._workerTargetOccupancy = null;
    if (state.debug) {
      state.debug.workerAiLod = {
        stride: workerStride,
        processed: processedWorkers,
        skipped: skippedWorkers,
        activeWorkerCount: this.activeWorkers.length,
        pressureCount,
        pathBudget: Number.isFinite(pathBudget) ? pathBudget : "unlimited",
        pathBudgetUsed: Number(state._workerPathBudgetUsed ?? 0),
        noPathBootstrapUsed: Number(state._workerNoPathBootstrapUsed ?? 0),
      };
    }

    // v0.8.0 Phase 3 M1a: per-tile node regen. Scan tileState entries and
    // bump yieldPool on tiles carrying a node flag, skipping any tile that
    // was harvested this tick. Stone nodes have a 0 regen rate by default
    // (permanent deposit) so they are left alone.
    applyResourceNodeRegen(state);
  }
}

function applyResourceNodeRegen(state) {
  const grid = state?.grid;
  if (!grid?.tileState?.forEach) return;
  const tick = Number(state.metrics?.tick ?? 0);
  const forestRegen = Number(BALANCE.nodeRegenPerTickForest ?? 0);
  const stoneRegen = Number(BALANCE.nodeRegenPerTickStone ?? 0);
  const herbRegen = Number(BALANCE.nodeRegenPerTickHerb ?? 0);
  const forestCap = Number(BALANCE.nodeYieldPoolForest ?? 0);
  const stoneCap = Number(BALANCE.nodeYieldPoolStone ?? 0);
  const herbCap = Number(BALANCE.nodeYieldPoolHerb ?? 0);
  grid.tileState.forEach((entry, idx) => {
    if (!entry) return;
    const flags = Number(entry.nodeFlags ?? 0) | 0;
    if (!flags) return;
    const lastHarvest = Number(entry.lastHarvestTick ?? -1);
    if (lastHarvest === tick) return;
    let add = 0;
    let cap = 0;
    if (flags & NODE_FLAGS.FOREST) { add += forestRegen; cap = Math.max(cap, forestCap); }
    if (flags & NODE_FLAGS.STONE) { add += stoneRegen; cap = Math.max(cap, stoneCap); }
    if (flags & NODE_FLAGS.HERB) { add += herbRegen; cap = Math.max(cap, herbCap); }
    if (add <= 0) return;
    const pool = Number(entry.yieldPool ?? 0);
    if (cap > 0 && pool >= cap) return;
    const next = cap > 0 ? Math.min(cap, pool + add) : pool + add;
    if (next === pool) return;
    const ix = idx % grid.width;
    const iz = (idx - ix) / grid.width;
    setTileField(grid, ix, iz, "yieldPool", next);
  });
}
