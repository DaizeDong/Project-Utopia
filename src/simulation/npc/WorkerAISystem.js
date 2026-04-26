import { BALANCE } from "../../config/balance.js";
import { EVENT_TYPE, FOG_STATE, NODE_FLAGS, ROLE, TILE } from "../../config/constants.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, getTileState, listTilesByType, randomPassableTile, setTileField, worldToTile } from "../../world/grid/Grid.js";
import { BuildSystem } from "../construction/BuildSystem.js";
import { canAttemptPath, clearPath, followPath, hasActivePath, isPathStuck, setTargetAndPath } from "../navigation/Navigation.js";
import { mapStateToDisplayLabel, transitionEntityState } from "./state/StateGraph.js";
import { planEntityDesiredState } from "./state/StatePlanner.js";
import { getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";
import { drainFertility, getTileFertility } from "../economy/TileStateSystem.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";
import { enqueueEvent } from "../../world/events/WorldEventQueue.js";
import { JobReservation } from "./JobReservation.js";
import { RoadNetwork } from "../navigation/RoadNetwork.js";
import { LogisticsSystem, ISOLATION_PENALTY } from "../economy/LogisticsSystem.js";
import { recordProductionEntry } from "../economy/ResourceSystem.js";

const TARGET_REFRESH_BASE_SEC = 1.2;
const TARGET_REFRESH_JITTER_SEC = 0.7;
const WANDER_REFRESH_BASE_SEC = 1.8;
const WANDER_REFRESH_JITTER_SEC = 1.2;
const WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD = 0.18;
export const TASK_LOCK_STATES = new Set(["harvest", "deliver", "eat", "process", "seek_task"]);
const WORKER_EMERGENCY_RATION_COOLDOWN_SEC = 2.8;
const WORKER_MEMORY_RECENT_LIMIT = 6;
const WORKER_MEMORY_HISTORY_LIMIT = 24;

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

function chooseWorkerTarget(worker, state, targetTileTypes) {
  const candidates = listTilesByType(state.grid, targetTileTypes);
  if (candidates.length <= 0) return null;

  const policy = getWorkerPolicy(worker, state);
  const current = worldToTile(worker.x, worker.z, state.grid);
  const runtime = getScenarioRuntime(state);
  const brokenRouteTiles = getBrokenRouteGapTiles(runtime);
  const depotAnchors = getUnreadyDepotAnchors(runtime);
  const reservation = state._jobReservation;
  const { all: occupancy, sameRole: sameRoleOccupancy } = buildOccupancyMap(state, worker.id, worker.role);
  let best = null;

  for (const candidate of candidates) {
    const distance = manhattanTiles(current, candidate);
    const tileType = getTile(state.grid, candidate.ix, candidate.iz);
    const wallCoverage = countNearbyTiles(state, candidate, [TILE.WALL], 1);
    const roadNeighbors = countNearbyTiles(state, candidate, [TILE.ROAD, TILE.WAREHOUSE], 1);
    const frontierDistance = minDistanceToTiles(candidate, brokenRouteTiles);
    const depotDistance = minDistanceToTiles(candidate, depotAnchors);
    const frontierAffinity = Number.isFinite(frontierDistance)
      ? frontierDistance <= 2 ? 1 : frontierDistance <= 5 ? 0.45 : 0
      : 0;
    const depotAffinity = Number.isFinite(depotDistance)
      ? depotDistance <= 2 ? 1 : depotDistance <= 4 ? 0.4 : 0
      : 0;
    const ecologyPressure = tileType === TILE.FARM
      ? Math.max(0, Number(state.metrics?.ecology?.farmPressureByKey?.[tileKey(candidate)] ?? 0))
      : 0;
    const warehouseLoad = tileType === TILE.WAREHOUSE
      ? Number(state.metrics?.logistics?.warehouseLoadByKey?.[tileKey(candidate)] ?? 0)
      : 0;
    const occupants = occupancy.get(tileKey(candidate)) ?? 0;

    // Sqrt-based distance penalty: strong at short range, diminishing at long range
    // dist=1: -0.18, dist=4: -0.36, dist=9: -0.54, dist=16: -0.72, dist=25: -0.9
    let score = -Math.sqrt(distance) * 0.18;
    score += roadNeighbors * 0.1 * resolveTargetPriority(policy, "road", 1);
    score += wallCoverage * 0.07 * resolveTargetPriority(policy, "safety", 1);
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
      const sameRoleCount = sameRoleOccupancy.get(tileKey(candidate)) ?? 0;
      if (sameRoleCount > 0) score -= 0.25 * sameRoleCount;
    }

    if (reservation && tileType !== TILE.WAREHOUSE && reservation.isReserved(candidate.ix, candidate.iz, worker.id)) {
      score -= 2.0;
    }

    if (!best || score > best.score) {
      best = {
        tile: candidate,
        score,
        meta: {
          frontierAffinity,
          depotAffinity,
          warehouseLoad,
          ecologyPressure,
        },
      };
    }
  }

  worker.debug ??= {};
  worker.debug.policyTargetScore = Number(best?.score ?? 0);
  worker.debug.policyTargetFrontier = Number(best?.meta?.frontierAffinity ?? 0);
  worker.debug.policyTargetDepot = Number(best?.meta?.depotAffinity ?? 0);
  worker.debug.policyTargetWarehouseLoad = Number(best?.meta?.warehouseLoad ?? 0);
  worker.debug.policyTargetEcology = Number(best?.meta?.ecologyPressure ?? 0);
  return best?.tile ?? null;
}

function getWorkerHungerSeekThreshold(worker) {
  const base = Number(BALANCE.workerHungerSeekThreshold ?? 0.14);
  const override = Number(worker?.metabolism?.hungerSeekThreshold ?? base);
  return clamp(override, 0.05, 0.8);
}

function getWorkerEatRecoveryTarget(worker) {
  const base = Number(BALANCE.workerEatRecoveryTarget ?? 0.68);
  const override = Number(worker?.metabolism?.eatRecoveryTarget ?? base);
  return clamp(override, 0.2, 0.98);
}

function getWorkerHungerDecayPerSecond(worker) {
  const base = Math.max(0, Number(BALANCE.workerHungerDecayPerSecond ?? BALANCE.hungerDecayPerSecond ?? 0.014));
  const multiplier = Number(worker?.metabolism?.hungerDecayMultiplier ?? 1);
  return Math.max(0, base * clamp(multiplier, 0.5, 1.5));
}

function getWorkerRecoveryPerFoodUnit(worker) {
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

export function chooseWorkerIntent(worker, state) {
  const hasWarehouse = Number(state.buildings?.warehouses ?? 0) > 0;
  const hasCarry = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0) + Number(worker.carry?.stone ?? 0) + Number(worker.carry?.herbs ?? 0) > 0;
  const carryTotal = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0) + Number(worker.carry?.stone ?? 0) + Number(worker.carry?.herbs ?? 0);
  const carryAgeSec = Number(worker.blackboard?.carryAgeSec ?? 0);
  const noWorkSite = (worker.role === ROLE.FARM && Number(state.buildings?.farms ?? 0) <= 0)
    || (worker.role === ROLE.WOOD && Number(state.buildings?.lumbers ?? 0) <= 0)
    || (worker.role === ROLE.STONE && Number(state.buildings?.quarries ?? 0) <= 0)
    || (worker.role === ROLE.HERBS && Number(state.buildings?.herbGardens ?? 0) <= 0)
    || (worker.role === ROLE.COOK && Number(state.buildings?.kitchens ?? 0) <= 0)
    || (worker.role === ROLE.SMITH && Number(state.buildings?.smithies ?? 0) <= 0)
    || (worker.role === ROLE.HERBALIST && Number(state.buildings?.clinics ?? 0) <= 0)
    || (worker.role === ROLE.HAUL && Number(state.buildings?.warehouses ?? 0) <= 0);
  const alreadyDelivering = String(worker.stateLabel ?? "").toLowerCase().includes("deliver");
  const nearestWarehouseDistance = estimateNearestWarehouseDistance(worker, state);
  const deliverThreshold = Number(BALANCE.workerDeliverThreshold ?? 2.4);
  const carryPressureSec = Number(BALANCE.workerCarryPressureSec ?? 6);
  const farDepotDistance = Number(BALANCE.workerFarDepotDistance ?? 14);

  worker.debug ??= {};
  const hunger = Number(worker.hunger ?? 1);
  const hungerThreshold = getWorkerHungerSeekThreshold(worker);
  if (hunger < hungerThreshold && Number(state.resources?.food ?? 0) > 0) {
    worker.debug.lastIntentReason = `hunger=${hunger.toFixed(2)} < threshold=${hungerThreshold.toFixed(2)}, food=${Math.floor(state.resources.food)}`;
    return "eat";
  }
  if (
    hasCarry &&
    hasWarehouse &&
    (
      carryTotal >= deliverThreshold
      || alreadyDelivering
      || noWorkSite
      || carryAgeSec >= carryPressureSec
      || nearestWarehouseDistance >= farDepotDistance
    )
  ) {
    const trigReason = carryTotal >= deliverThreshold ? `carry=${carryTotal.toFixed(1)} ≥ threshold=${deliverThreshold.toFixed(1)}`
      : alreadyDelivering ? "already delivering"
      : noWorkSite ? `no worksite for role=${worker.role}`
      : carryAgeSec >= carryPressureSec ? `carry age ${carryAgeSec.toFixed(0)}s ≥ ${carryPressureSec}s`
      : `far depot dist=${nearestWarehouseDistance.toFixed(0)} ≥ ${farDepotDistance}`;
    worker.debug.lastIntentReason = trigReason;
    return "deliver";
  }
  if (worker.role === ROLE.FARM && Number(state.buildings?.farms ?? 0) > 0) {
    worker.debug.lastIntentReason = `role=FARM and farms=${state.buildings.farms}`;
    return "farm";
  }
  if (worker.role === ROLE.WOOD && Number(state.buildings?.lumbers ?? 0) > 0) {
    worker.debug.lastIntentReason = `role=WOOD and lumbers=${state.buildings.lumbers}`;
    return "lumber";
  }
  if (worker.role === ROLE.STONE && Number(state.buildings?.quarries ?? 0) > 0) {
    worker.debug.lastIntentReason = `role=STONE and quarries=${state.buildings.quarries}`;
    return "quarry";
  }
  if (worker.role === ROLE.HERBS && Number(state.buildings?.herbGardens ?? 0) > 0) {
    worker.debug.lastIntentReason = `role=HERBS and herb_gardens=${state.buildings.herbGardens}`;
    return "gather_herbs";
  }
  if (worker.role === ROLE.COOK && Number(state.buildings?.kitchens ?? 0) > 0) {
    worker.debug.lastIntentReason = `role=COOK and kitchens=${state.buildings.kitchens}`;
    return "cook";
  }
  if (worker.role === ROLE.SMITH && Number(state.buildings?.smithies ?? 0) > 0) {
    worker.debug.lastIntentReason = `role=SMITH and smithies=${state.buildings.smithies}`;
    return "smith";
  }
  if (worker.role === ROLE.HERBALIST && Number(state.buildings?.clinics ?? 0) > 0) {
    worker.debug.lastIntentReason = `role=HERBALIST and clinics=${state.buildings.clinics}`;
    return "heal";
  }
  if (worker.role === ROLE.HAUL && Number(state.buildings?.warehouses ?? 0) > 0) {
    worker.debug.lastIntentReason = `role=HAUL and warehouses=${state.buildings.warehouses}`;
    return "haul";
  }
  // Phase 3 / M1b — low-priority fog exploration fallback. Only surfaces when
  // no role-specific work is available AND the colony still has HIDDEN tiles
  // to scout. Sits below every normal role intent, above "wander".
  if (hasHiddenFrontier(state)) {
    worker.debug.lastIntentReason = `no role-matching worksite (role=${worker.role}); fog frontier present`;
    return "explore_fog";
  }
  worker.debug.lastIntentReason = `no role-matching worksite (role=${worker.role}); fog cleared`;
  return "wander";
}

function hasHiddenFrontier(state) {
  const vis = state?.fog?.visibility;
  if (!(vis instanceof Uint8Array)) return false;
  // v0.8.0 Phase 3 post-review — cache moved off state.fog (owned by
  // VisibilitySystem) onto state._fogFrontierCache so a fog reset cannot
  // orphan stale fields (legacy-sweep SHOULD-CLEAN #7).
  const cache = state._fogFrontierCache ??= { version: -1, grid: -1, found: false };
  const gridVersion = Number(state?.grid?.version ?? 0);
  const fogVersion = Number(state.fog.version ?? 0);
  if (cache.version === fogVersion && cache.grid === gridVersion) return cache.found;
  let found = false;
  for (let i = 0; i < vis.length; i += 1) {
    if (vis[i] === FOG_STATE.HIDDEN) { found = true; break; }
  }
  cache.version = fogVersion;
  cache.grid = gridVersion;
  cache.found = found;
  return found;
}

/**
 * Find the nearest HIDDEN tile that has at least one non-HIDDEN neighbor
 * (the fog frontier) relative to the worker's current tile. Manhattan metric.
 * Returns null if the grid is fully explored.
 */
export function findNearestHiddenTile(worker, state) {
  const vis = state?.fog?.visibility;
  const grid = state?.grid;
  if (!(vis instanceof Uint8Array) || !grid) return null;
  const width = Number(grid.width ?? 0);
  const height = Number(grid.height ?? 0);
  if (width <= 0 || height <= 0) return null;
  const current = worldToTile(worker.x, worker.z, grid);
  let best = null;
  let bestDist = Infinity;
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      if (vis[ix + iz * width] !== FOG_STATE.HIDDEN) continue;
      let onFrontier = false;
      if (ix + 1 < width && vis[(ix + 1) + iz * width] !== FOG_STATE.HIDDEN) onFrontier = true;
      else if (ix - 1 >= 0 && vis[(ix - 1) + iz * width] !== FOG_STATE.HIDDEN) onFrontier = true;
      else if (iz + 1 < height && vis[ix + (iz + 1) * width] !== FOG_STATE.HIDDEN) onFrontier = true;
      else if (iz - 1 >= 0 && vis[ix + (iz - 1) * width] !== FOG_STATE.HIDDEN) onFrontier = true;
      if (!onFrontier) continue;
      const d = Math.abs(ix - current.ix) + Math.abs(iz - current.iz);
      if (d < bestDist) {
        bestDist = d;
        best = { ix, iz };
      }
    }
  }
  return best;
}

function estimateNearestWarehouseDistance(worker, state) {
  if (!state?.grid || !Number.isFinite(worker?.x) || !Number.isFinite(worker?.z)) return 0;
  if (Number(state.buildings?.warehouses ?? 0) <= 0) return Infinity;
  const nearest = findNearestTileOfTypes(state.grid, worker, [TILE.WAREHOUSE]);
  if (!nearest) return Infinity;
  const current = worldToTile(worker.x, worker.z, state.grid);
  return Math.abs(current.ix - nearest.ix) + Math.abs(current.iz - nearest.iz);
}

function resolveWorkCooldown(worker, dt, amount, resourceType, rng, isNight) {
  if (worker.cooldown <= 0) {
    const baseDuration = Number(BALANCE.workerHarvestDurationSec ?? 2.5);
    const skillMultiplier = Number(worker.preferences?.workDurationMultiplier ?? 1);
    const nightPenalty = isNight ? (1 / Number(BALANCE.workerNightProductivityMultiplier ?? 0.6)) : 1;
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
    worker.carry[resourceType] += amount;
    worker.progress = 0;
    worker.workRemaining = 0;
  }
}

function isTargetTileType(worker, state, targetTileTypes) {
  if (!worker.targetTile) return false;
  const tile = getTile(state.grid, worker.targetTile.ix, worker.targetTile.iz);
  return targetTileTypes.includes(tile);
}

function isAtTargetTile(worker, state) {
  if (!worker.targetTile) return false;
  const current = worldToTile(worker.x, worker.z, state.grid);
  return current.ix === worker.targetTile.ix && current.iz === worker.targetTile.iz;
}

function setIdleDesired(worker) {
  if (!worker.desiredVel) {
    worker.desiredVel = { x: 0, z: 0 };
    return;
  }
  worker.desiredVel.x = 0;
  worker.desiredVel.z = 0;
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

function consumeEmergencyRation(worker, state, dt, nowSec) {
  const eatRecoveryTarget = getWorkerEatRecoveryTarget(worker);
  const hungerNow = Number(worker.hunger ?? 0);
  if (hungerNow >= WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD) return;
  const warehouseFood = Number(state.resources.food ?? 0);
  const carryFood = Number(worker.carry?.food ?? 0);
  // v0.8.2 Round-7 01e+02b — fall back to carry.food when warehouse is empty
  if (warehouseFood <= 0 && carryFood <= 0) return;
  if (worker.debug?.reachableFood) return;
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

function maybeRetarget(worker, state, services, intentKey, targetTileTypes) {
  const nowSec = state.metrics.timeSec;
  const blackboard = worker.blackboard ?? (worker.blackboard = {});

  const targetInvalid = !isTargetTileType(worker, state, targetTileTypes);
  const pathStale = Boolean(worker.path) && worker.pathGridVersion !== state.grid.version;
  const pathMissingAwayFromTarget = !hasActivePath(worker, state) && !isAtTargetTile(worker, state);
  const pathStuck = isPathStuck(worker, state, 2.4);
  const shouldRetarget = targetInvalid || pathStale || pathMissingAwayFromTarget || pathStuck;

  if (shouldRetarget) {
    if (!canAttemptPath(worker, state)) {
      return hasActivePath(worker, state) || isAtTargetTile(worker, state);
    }
    const reservation = state._jobReservation;
    if (reservation) reservation.releaseAll(worker.id);
    const target = chooseWorkerTarget(worker, state, targetTileTypes)
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

function handleEat(worker, state, services, dt) {
  const eatRecoveryTarget = getWorkerEatRecoveryTarget(worker);
  if ((worker.hunger ?? 0) >= eatRecoveryTarget) {
    clearPath(worker);
    setIdleDesired(worker);
    return;
  }

  const canUseWarehouse = state.buildings.warehouses > 0;
  if (canUseWarehouse && maybeRetarget(worker, state, services, "seek_food", [TILE.WAREHOUSE])) {
    if (hasActivePath(worker, state)) {
      const step = followPath(worker, state, dt);
      worker.desiredVel = step.desired;
      if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
    } else {
      setIdleDesired(worker);
    }
    if (isAtTargetTile(worker, state)) {
      const recoveryPerFood = getWorkerRecoveryPerFoodUnit(worker);
      const gainCap = Math.max(0, eatRecoveryTarget - Number(worker.hunger ?? 0));
      const desiredFood = Math.min(BALANCE.hungerEatRatePerSecond * dt, gainCap / recoveryPerFood);

      // Prefer meals over raw food
      if (Number(state.resources.meals ?? 0) > 0) {
        const recoveryPerMeal = recoveryPerFood * Number(BALANCE.mealHungerRecoveryMultiplier ?? 2.0);
        const mealGainCap = Math.max(0, eatRecoveryTarget - Number(worker.hunger ?? 0));
        const desiredMeals = Math.min(BALANCE.hungerEatRatePerSecond * dt, mealGainCap / recoveryPerMeal);
        const eatMeals = Math.min(desiredMeals, state.resources.meals);
        if (eatMeals > 0) {
          state.resources.meals -= eatMeals;
          worker.hunger = clamp(worker.hunger + eatMeals * recoveryPerMeal, 0, 1);
        }
      } else {
        const eat = Math.min(desiredFood, state.resources.food);
        if (eat <= 0) return;
        state.resources.food -= eat;
        worker.hunger = clamp(worker.hunger + eat * recoveryPerFood, 0, 1);
      }

      if ((worker.hunger ?? 0) >= eatRecoveryTarget) {
        clearPath(worker);
      }
    }
    return;
  }

  setIdleDesired(worker);
  consumeEmergencyRation(worker, state, dt, Number(state.metrics.timeSec ?? 0));
}

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
  const toolMultiplier = Number(state.gameplay?.toolProductionMultiplier ?? 1);
  const isNight = Boolean(state.environment?.isNight);
  // Logistics efficiency: buildings connected to warehouse via road get bonus, isolated get penalty
  const logistics = state._logisticsSystem;
  const logisticsBonus = (logistics && worker.targetTile)
    ? logistics.getEfficiency(worker.targetTile.ix, worker.targetTile.iz) : 1.0;
  // HAUL workers: determine resource type from tile they're standing on
  let effectiveRole = worker.role;
  if (worker.role === ROLE.HAUL && worker.targetTile) {
    const tileAtTarget = getTile(state.grid, worker.targetTile.ix, worker.targetTile.iz);
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
    resolveWorkCooldown(
      worker,
      dt,
      farmAmount,
      "food",
      services.rng,
      isNight,
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

function handleProcess(worker, state, services, dt) {
  const config = ROLE_PROCESS_CONFIG[worker.role];
  if (!config) {
    setIdleDesired(worker);
    return;
  }
  if (!maybeRetarget(worker, state, services, config.intentKey, config.tileTypes)) return;

  if (hasActivePath(worker, state)) {
    const step = followPath(worker, state, dt);
    worker.desiredVel = step.desired;
    if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
  } else {
    setIdleDesired(worker);
  }

  // Worker stays at the building; actual processing is handled by ProcessingSystem
}

function getActiveWorkerPolicy(state) {
  if (!state.ai?.groupPolicies) return null;
  return state.ai.groupPolicies.get("workers") ?? null;
}

function attemptAutoBuild(worker, state, services) {
  const policy = getActiveWorkerPolicy(state);
  if (!policy?.buildQueue?.length) return false;

  const buildItem = policy.buildQueue[0];
  const tool = String(buildItem.type ?? "");
  if (!tool) return false;

  // Find a grass tile near the worker for placement
  const workerTile = worldToTile(worker.x, worker.z, state.grid);
  const target = findNearestTileOfTypes(state.grid, workerTile, [0]); // TILE.GRASS = 0
  if (!target) return false;

  // Use BuildSystem to place (handles cost, validation, stats)
  const buildSystem = new BuildSystem();
  const result = buildSystem.placeToolAt(state, tool, target.ix, target.iz, { recordHistory: false, services });
  if (result.ok) {
    policy.buildQueue.shift();
    state.metrics.aiDecisions = (state.metrics.aiDecisions ?? 0) + 1;
    return true;
  }
  return false;
}

function handleRest(worker, state, services, dt) {
  // Workers rest in place — recover rest and morale
  setIdleDesired(worker);
  const restRecovery = Number(BALANCE.workerRestRecoveryPerSecond ?? 0.08);
  const moraleRecovery = Number(BALANCE.workerMoraleRecoveryPerSecond ?? 0.02);
  worker.rest = clamp(Number(worker.rest ?? 1) + restRecovery * dt, 0, 1);
  worker.morale = clamp(Number(worker.morale ?? 1) + moraleRecovery * dt, 0, 1);
  // Update progress for duration tracking
  worker.progress = clamp(Number(worker.rest ?? 0), 0, 1);
  worker.workRemaining = Math.max(0, Number(BALANCE.workerRestRecoverThreshold ?? 0.6) - Number(worker.rest ?? 0));
}

function handleWander(worker, state, services, dt) {
  if (attemptAutoBuild(worker, state, services)) {
    return; // Built something, skip normal wander
  }

  const blackboard = worker.blackboard ?? (worker.blackboard = {});
  // v0.8.0 Phase 3 M1b post-review — if fog has hidden tiles, bias the wander
  // destination toward the nearest frontier so "explore_fog" intent is actually
  // load-bearing (was dead label per legacy-sweep MUST #2 / silent-failure H2).
  const wantsFogExploration = hasHiddenFrontier(state);
  blackboard.intentTargetIntent = wantsFogExploration ? "explore_fog" : "wander";

  const nowSec = state.metrics.timeSec;
  const nextWanderRefreshSec = Number(blackboard.nextWanderRefreshSec ?? -Infinity);
  const stalePath = Boolean(worker.path) && worker.pathGridVersion !== state.grid.version;
  const pathStuck = isPathStuck(worker, state, 2.3);
  if (!hasActivePath(worker, state) || pathStuck) {
    const driftedFromTarget = worker.targetTile ? !isAtTargetTile(worker, state) : true;
    const shouldRetarget = stalePath || driftedFromTarget || nowSec >= nextWanderRefreshSec || pathStuck;
    if (shouldRetarget && canAttemptPath(worker, state)) {
      clearPath(worker);
      const fogTarget = wantsFogExploration ? findNearestHiddenTile(worker, state) : null;
      const target = fogTarget ?? randomPassableTile(state.grid, () => services.rng.next());
      if (setTargetAndPath(worker, target, state, services)) {
        blackboard.nextWanderRefreshSec = nowSec + WANDER_REFRESH_BASE_SEC + services.rng.next() * WANDER_REFRESH_JITTER_SEC;
      }
    }
  }

  if (hasActivePath(worker, state)) {
    worker.desiredVel = followPath(worker, state, dt).desired;
  } else {
    setIdleDesired(worker);
  }
}

function updateIdleWithoutReasonMetric(worker, stateNode, dt, state) {
  if (stateNode !== "idle" && stateNode !== "wander") return;
  const reason = String(worker.blackboard?.fsm?.reason ?? "");
  if (!reason.includes("no-worksite") && !reason.includes("idle")) return;

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
  }

  update(dt, state, services) {
    state._jobReservation ??= new JobReservation();
    const reservation = state._jobReservation;
    reservation.cleanupStale(state.metrics.timeSec);

    state._roadNetwork ??= new RoadNetwork();
    state._roadNetwork.rebuild(state.grid);

    state._logisticsSystem ??= new LogisticsSystem();
    state._logisticsSystem.update(dt, state);

    for (const worker of state.agents) {
      if (worker.type !== "WORKER") continue;
      if (worker.alive === false) {
        reservation.releaseAll(worker.id);
        continue;
      }

      worker.hunger = clamp(worker.hunger - getWorkerHungerDecayPerSecond(worker) * dt, 0, 1);

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
        if (!_onRoad) {
          const _ticks = Number(worker.blackboard.carryTicks ?? 0);
          const _graceTicks = Number(BALANCE.spoilageGracePeriodTicks ?? 0);
          const _rateScale = _ticks < _graceTicks ? 0.5 : 1.0;
          const _foodLoss = Number(BALANCE.foodSpoilageRatePerSec ?? 0) * dt * _rateScale;
          const _herbLoss = Number(BALANCE.herbSpoilageRatePerSec ?? 0) * dt * _rateScale;
          if (_foodLoss > 0) {
            worker.carry.food = Math.max(0, Number(worker.carry.food ?? 0) - _foodLoss);
          }
          if (_herbLoss > 0) {
            worker.carry.herbs = Math.max(0, Number(worker.carry.herbs ?? 0) - _herbLoss);
          }
          worker.blackboard.carryTicks = _ticks + 1;
        }
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
        for (const other of state.agents) {
          if (other === worker || other.type !== "WORKER" || other.alive === false) continue;
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
        for (const other of state.agents) {
          if (other === worker || other.type !== "WORKER" || other.alive === false) continue;
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
      worker.debug.nearestWarehouseDistance = Number.isFinite(estimateNearestWarehouseDistance(worker, state))
        ? estimateNearestWarehouseDistance(worker, state)
        : -1;

      const nowSec = Number(state.metrics.timeSec ?? 0);
      const fsm = worker.blackboard?.fsm ?? null;
      const currentState = String(fsm?.state ?? "");

      // Task Commitment Protocol: once a worker enters a work cycle
      // (seek_task/harvest/deliver/process/eat), it commits to finishing.
      // Only survival interrupts (hunger < 0.12) break commitment.
      const commitment = worker.blackboard.commitmentCycle;
      const survivalInterrupt = (worker.hunger ?? 1) < 0.12;

      // Clear commitment if worker left the work cycle
      if (commitment && !TASK_LOCK_STATES.has(currentState)) {
        worker.blackboard.commitmentCycle = null;
      }

      const inCommitment = worker.blackboard.commitmentCycle?.entered === true && !survivalInterrupt;

      // Re-planning cooldown: prevent oscillation from planning every tick.
      // Workers only re-plan if (a) survival interrupt, or (b) 0.5s since last plan.
      const lastPlanSec = Number(worker.blackboard.lastPlanSec ?? -Infinity);
      const planCooldownReady = nowSec - lastPlanSec >= 0.5;

      // v0.8.0 Phase 7.B — deliverWithoutCarry guard. `handleDeliver` records
      // the `deliverWithoutCarryCount` metric whenever the deliver action
      // executes while either (a) carry is empty, or (b) no warehouse exists
      // to deliver to. Both conditions mean "the worker is stuck in deliver
      // but cannot make progress". The plan-cooldown (0.5s), FSM hold (~0.8s),
      // and commitment-cycle latch can all keep the FSM pinned to "deliver"
      // after the unload completes OR after the only warehouse is destroyed,
      // producing silent no-op ticks. Force an immediate, high-priority
      // re-plan with no hold so the worker exits deliver the tick the
      // stuck-condition is detected.
      const hasWarehouse = Number(state.buildings?.warehouses ?? 0) > 0;
      const deliverStuckReplan = currentState === "deliver"
        && (carryNow <= 0 || !hasWarehouse);

      let plan;
      if (!planCooldownReady && !survivalInterrupt && !deliverStuckReplan && currentState) {
        plan = { desiredState: currentState, reason: "cooldown:hold" };
      } else {
        plan = planEntityDesiredState(worker, state);
        worker.blackboard.lastPlanSec = nowSec;

        if (deliverStuckReplan) {
          // Break the commitment cycle so the planner's non-deliver choice
          // (seek_task / idle / seek_food / etc.) is allowed through.
          worker.blackboard.commitmentCycle = null;
          if (plan.desiredState === "deliver") {
            // Feasibility already blocks deliver when the preconditions fail,
            // but if any upstream override still asks for it, reroute to a
            // safe fallback state.
            plan = { desiredState: "seek_task", reason: "deliver-stuck:seek_task" };
          }
        } else if (inCommitment) {
          // Commitment allows forward progression within work cycle (harvest→deliver→seek_task)
          // but blocks exits to non-work states (idle, wander)
          if (!TASK_LOCK_STATES.has(plan.desiredState)) {
            plan = { desiredState: currentState, reason: "commitment:hold" };
          }
        } else if (TASK_LOCK_STATES.has(plan.desiredState) && !worker.blackboard.commitmentCycle) {
          worker.blackboard.commitmentCycle = { startSec: nowSec, entered: true };
        }
      }

      const desiredState = plan.desiredState;
      let stateNode = transitionEntityState(
        worker,
        "workers",
        desiredState,
        nowSec,
        plan.reason,
        // Force bypasses the FSM hold window so a stuck-deliver worker cannot
        // stay pinned between the tick the stuck condition arises (unload
        // finishes OR warehouse lost) and the hold expiry ~0.8s later.
        deliverStuckReplan ? { force: true } : undefined,
      );

      // v0.8.0 Phase 7.B — defensive post-transition guard. Even after the
      // plan-time guard above and the feasibility pass, multi-step state
      // graph shortest-paths + hold windows can still land the FSM in
      // "deliver" the same tick the stuck condition appears (e.g. warehouse
      // just collapsed, or the force-transition from a non-deliver source
      // routed through deliver). If `stateNode` is deliver but the action
      // has no chance of progress (empty carry or no warehouse), immediately
      // redirect to seek_task so `handleDeliver` never fires a no-op.
      if (stateNode === "deliver" && (carryNow <= 0 || !hasWarehouse)) {
        stateNode = transitionEntityState(
          worker,
          "workers",
          "seek_task",
          nowSec,
          "deliver-stuck:post-guard",
          { force: true },
        );
        worker.blackboard.commitmentCycle = null;
      }

      worker.blackboard.intent = stateNode;
      worker.stateLabel = mapStateToDisplayLabel("workers", stateNode);
      // v0.8.2 Round-7 (01e+02b) — emotional decision-context prefix stored on
      // blackboard so EntityFocusPanel can render it alongside the intent reason.
      if (worker.debug?.lastIntentReason) {
        worker.blackboard.emotionalContext = addEmotionalPrefix(worker, state, worker.debug.lastIntentReason);
      }
      worker.debug ??= {};
      const prevStateNode = worker.debug.lastStateNode;
      // Map role to intent name for eval tracking (eval expects "farm"/"lumber" etc., not FSM states)
      const ROLE_TO_INTENT = {
        [ROLE.FARM]: "farm",
        [ROLE.WOOD]: "lumber",
        [ROLE.STONE]: "quarry",
        [ROLE.HERBS]: "gather_herbs",
        [ROLE.COOK]: "cook",
        [ROLE.SMITH]: "smith",
        [ROLE.HERBALIST]: "heal",
        [ROLE.HAUL]: "haul",
      };
      worker.debug.lastIntent = (stateNode === "harvest" || stateNode === "seek_task" || stateNode === "process")
        ? (ROLE_TO_INTENT[worker.role] ?? stateNode)
        : stateNode;
      worker.debug.lastStateNode = stateNode;

      if (stateNode === "seek_food" || stateNode === "eat") {
        handleEat(worker, state, services, dt);
      } else if (stateNode === "deliver") {
        handleDeliver(worker, state, services, dt);
      } else if (stateNode === "process") {
        handleProcess(worker, state, services, dt);
      } else if (stateNode === "seek_task" || stateNode === "harvest") {
        if (ROLE_PROCESS_CONFIG[worker.role]) {
          handleProcess(worker, state, services, dt);
        } else {
          handleHarvest(worker, state, services, dt);
        }
      } else if (stateNode === "seek_rest" || stateNode === "rest") {
        // Emit resting event on state transition
        if (stateNode === "rest" && prevStateNode !== "rest") {
          emitEvent(state, EVENT_TYPES.WORKER_RESTING, {
            entityId: worker.id, entityName: worker.displayName ?? worker.id,
            rest: worker.rest,
          });
        }
        handleRest(worker, state, services, dt);
      } else if (stateNode === "wander") {
        handleWander(worker, state, services, dt);
      } else {
        setIdleDesired(worker);
      }

      updateIdleWithoutReasonMetric(worker, stateNode, dt, state);
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
