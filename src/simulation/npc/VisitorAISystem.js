import { BALANCE } from "../../config/balance.js";
import { EVENT_TYPE, TILE } from "../../config/constants.js";
import { getLongRunEventTuning, getLongRunVisitorTuning } from "../../config/longRunProfile.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, inBounds, listTilesByType, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { getScenarioEventCandidates, getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";
import { canAttemptPath, clearPath, followPath, hasActivePath, isPathStuck, setTargetAndPath } from "../navigation/Navigation.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";
import { mutateTile } from "../lifecycle/TileMutationHooks.js";
import { VisitorFSM } from "./fsm/VisitorFSM.js";

const WANDER_REFRESH_BASE_SEC = 2.1;
const WANDER_REFRESH_JITTER_SEC = 1.4;
const EAT_RECOVERY_TARGET = 0.76;

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

function manhattanTiles(a, b) {
  return Math.abs(Number(a?.ix ?? 0) - Number(b?.ix ?? 0)) + Math.abs(Number(a?.iz ?? 0) - Number(b?.iz ?? 0));
}

function resolveTargetPriority(policy, key, fallback = 1) {
  return Math.max(0, Math.min(3, Number(policy?.targetPriorities?.[key] ?? fallback)));
}

function isAtTargetTile(visitor, state) {
  if (!visitor.targetTile) return false;
  const tile = worldToTile(visitor.x, visitor.z, state.grid);
  return tile.ix === visitor.targetTile.ix && tile.iz === visitor.targetTile.iz;
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

function getSabotageGridChangeCooldownSec(state) {
  const runtimeProfile = String(state.ai?.runtimeProfile ?? "");
  const totalEntities = Number(state.agents?.length ?? 0) + Number(state.animals?.length ?? 0);
  const timeScale = Number(state.controls?.timeScale ?? 1);
  if (runtimeProfile === "long_run" || totalEntities >= 650 || timeScale >= 7) return 10;
  return 0;
}

function findScenarioZoneLabel(candidates, tile) {
  for (const candidate of candidates) {
    if (candidate.tiles.some((entry) => entry.ix === tile.ix && entry.iz === tile.iz)) {
      return candidate.label;
    }
  }
  return "";
}

function findScenarioAnchorLabel(state, zones = [], tile) {
  const anchors = state.gameplay?.scenario?.anchors ?? {};
  for (const zone of zones) {
    const anchor = anchors[zone.anchor];
    if (!anchor) continue;
    const radius = Math.max(1, Number(zone.radius ?? 2));
    if (manhattanTiles(anchor, tile) <= radius) return zone.label;
  }
  return "";
}

function getTradeTargetContext(state, tile, runtime = getScenarioRuntime(state), tradeCandidates = getScenarioEventCandidates(state, EVENT_TYPE.TRADE_CARAVAN)) {
  const zoneLabel = findScenarioZoneLabel(tradeCandidates, tile);
  const wallCoverage = countNearbyTiles(state, tile, [TILE.WALL], 1);
  const roadNeighbors = countNearbyTiles(state, tile, [TILE.ROAD], 1);
  const routeSupport = runtime.routes.length > 0 ? runtime.connectedRoutes / runtime.routes.length : 1;
  const defenseBonus = Math.min(BALANCE.visitorTradeMaxWallBonus, wallCoverage * BALANCE.visitorTradeWallBonusPerWall);
  const roadBonus = Math.min(0.24, roadNeighbors * BALANCE.visitorTradeRoadNeighborBonus);
  const tradeBonus = Number((
    1
    + (zoneLabel ? BALANCE.visitorTradeDepotZoneBonus : 0)
    + routeSupport * BALANCE.visitorTradeConnectedRouteBonus
    + defenseBonus
    + roadBonus
  ).toFixed(2));

  return {
    label: zoneLabel || "warehouse lane",
    zoneLabel,
    wallCoverage,
    roadNeighbors,
    routeSupport,
    tradeBonus,
  };
}

function pickTraderTarget(visitor, state, policy) {
  const candidates = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  if (candidates.length === 0) return null;

  const runtime = getScenarioRuntime(state);
  const tradeCandidates = getScenarioEventCandidates(state, EVENT_TYPE.TRADE_CARAVAN);
  const origin = worldToTile(visitor.x, visitor.z, state.grid);
  let best = null;

  for (const candidate of candidates) {
    const context = getTradeTargetContext(state, candidate, runtime, tradeCandidates);
    const score = context.tradeBonus
      + resolveTargetPriority(policy, "warehouse", 1) * 0.52
      + resolveTargetPriority(policy, "road", 1) * context.roadNeighbors * 0.09
      + resolveTargetPriority(policy, "safety", 1) * context.wallCoverage * 0.11
      + resolveTargetPriority(policy, "depot", 1) * (context.zoneLabel ? 0.34 : 0)
      + resolveTargetPriority(policy, "frontier", 1) * (context.routeSupport < 1 ? 0.22 : 0.05)
      - manhattanTiles(origin, candidate) * BALANCE.visitorTradeDistancePenalty;
    if (!best || score > best.score) {
      best = { tile: candidate, context, score };
    }
  }

  return best;
}

function getSabotageTargetContext(state, tile, raidCandidates = getScenarioEventCandidates(state, EVENT_TYPE.BANDIT_RAID), tradeCandidates = getScenarioEventCandidates(state, EVENT_TYPE.TRADE_CARAVAN)) {
  const frontierLabel = findScenarioZoneLabel(raidCandidates, tile);
  const depotLabel = findScenarioZoneLabel(tradeCandidates, tile);
  const chokeLabel = findScenarioAnchorLabel(state, state.gameplay?.scenario?.chokePoints ?? [], tile);
  const wallCoverage = countNearbyTiles(state, tile, [TILE.WALL], 1);
  const roadNeighbors = countNearbyTiles(state, tile, [TILE.ROAD, TILE.WAREHOUSE], 1);
  const tileType = getTile(state.grid, tile.ix, tile.iz);
  const label = chokeLabel || depotLabel || frontierLabel || (tileType === TILE.WAREHOUSE ? "warehouse" : tileType === TILE.FARM ? "farm belt" : "lumber line");

  return {
    label,
    frontierLabel,
    depotLabel,
    chokeLabel,
    wallCoverage,
    roadNeighbors,
    tileType,
  };
}

function pickSabotageTarget(visitor, state, policy) {
  const candidates = listTilesByType(state.grid, [TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE]);
  if (candidates.length === 0) return null;

  const tuning = getLongRunVisitorTuning(state);
  const raidCandidates = getScenarioEventCandidates(state, EVENT_TYPE.BANDIT_RAID);
  const tradeCandidates = getScenarioEventCandidates(state, EVENT_TYPE.TRADE_CARAVAN);
  const origin = worldToTile(visitor.x, visitor.z, state.grid);
  let best = null;

  for (const candidate of candidates) {
    const context = getSabotageTargetContext(state, candidate, raidCandidates, tradeCandidates);
    const wallPenalty = Math.min(BALANCE.sabotageMaxWallPenalty, context.wallCoverage * BALANCE.sabotageWallPenaltyPerWall);
    const warehousePriorityMultiplier = context.tileType === TILE.WAREHOUSE
      ? Number(tuning.warehousePriorityMultiplier ?? 1)
      : 1;
    const typeBonus = context.tileType === TILE.WAREHOUSE
      ? BALANCE.sabotageWarehousePriorityBonus * warehousePriorityMultiplier
      : 0;
    const zoneBonus = (context.frontierLabel ? BALANCE.sabotageFrontierZoneBonus : 0) + (context.depotLabel ? BALANCE.sabotageDepotZoneBonus : 0);
    const roadBonus = Math.min(0.24, context.roadNeighbors * BALANCE.sabotageRoadNeighborBonus);
    const distancePenalty = manhattanTiles(origin, candidate) * 0.03;
    const candidatePriority = context.tileType === TILE.WAREHOUSE
      ? resolveTargetPriority(policy, "warehouse", 1)
      : context.tileType === TILE.FARM
        ? resolveTargetPriority(policy, "farm", 1)
        : resolveTargetPriority(policy, "lumber", 1);
    const policyTypeBonus = context.tileType === TILE.WAREHOUSE
      ? candidatePriority * 0.34 * warehousePriorityMultiplier
      : context.tileType === TILE.FARM
        ? candidatePriority * 0.36
        : candidatePriority * 0.32;
    const score = 1 + typeBonus + zoneBonus + roadBonus + policyTypeBonus
      + (candidatePriority - 1) * 0.28
      + resolveTargetPriority(policy, "frontier", 1) * (context.frontierLabel ? 0.24 : 0)
      + resolveTargetPriority(policy, "choke", 1) * (context.chokeLabel ? 0.22 : 0)
      + resolveTargetPriority(policy, "road", 1) * context.roadNeighbors * 0.07
      + resolveTargetPriority(policy, "exit", 1) * (context.wallCoverage <= 0 ? 0.1 : 0)
      - wallPenalty
      - distancePenalty;
    if (!best || score > best.score) {
      best = { tile: candidate, context, score };
    }
  }

  return best;
}

function countWarehouseTiles(state) {
  return listTilesByType(state.grid, [TILE.WAREHOUSE]).length;
}

function updateVisitorHunger(visitor, dt) {
  const decay = Number(BALANCE.visitorHungerDecayPerSecond ?? 0.01);
  visitor.hunger = clamp((visitor.hunger ?? 1) - decay * dt, 0, 1);
}

function restoreVisitorHunger(visitor, state, dt) {
  const currentHunger = Number(visitor.hunger ?? 0);
  if (currentHunger >= EAT_RECOVERY_TARGET) return;
  const eatRate = Number(BALANCE.visitorHungerRecoveryPerSecond ?? 0.18);
  const gainCap = Math.max(0, EAT_RECOVERY_TARGET - currentHunger);
  const desiredGain = Math.min(eatRate * dt, gainCap);
  const foodCost = desiredGain * 0.45;
  if (foodCost <= 0) return;
  if ((state.resources.food ?? 0) <= 0) return;
  const eat = Math.min(foodCost, state.resources.food);
  if (eat <= 0) return;
  state.resources.food -= eat;
  const appliedGain = eat / 0.45;
  visitor.hunger = clamp((visitor.hunger ?? 0) + appliedGain, 0, 1);
}

function consumeVisitorRation(visitor, state, dt) {
  const currentHunger = Number(visitor.hunger ?? 0);
  if (currentHunger >= EAT_RECOVERY_TARGET) return;
  if ((state.resources.food ?? 0) <= 0) return;
  const eatRate = Number(BALANCE.visitorHungerRecoveryPerSecond ?? 0.16) * 0.58;
  const gainCap = Math.max(0, EAT_RECOVERY_TARGET - currentHunger);
  const desiredGain = Math.min(eatRate * dt, gainCap);
  const foodCost = desiredGain * 0.38;
  if (foodCost <= 0) return;
  const eat = Math.min(foodCost, state.resources.food);
  if (eat <= 0) return;
  state.resources.food -= eat;
  const appliedGain = eat / 0.38;
  visitor.hunger = clamp((visitor.hunger ?? 0) + appliedGain, 0, 1);
}

function applySabotage(state, target, context, rng) {
  const idx = target.ix + target.iz * state.grid.width;
  const tile = state.grid.tiles[idx];
  if (tile !== TILE.FARM && tile !== TILE.LUMBER && tile !== TILE.WAREHOUSE) return null;

  const tuning = getLongRunVisitorTuning(state);
  const eventTuning = getLongRunEventTuning(state);
  const warehouseCount = tile === TILE.WAREHOUSE ? countWarehouseTiles(state) : 0;
  const protectsLastWarehouse = tile === TILE.WAREHOUSE
    && warehouseCount <= Number(tuning.protectLastWarehousesCount ?? 0);
  const activeSabotageCount = (state.events.active ?? []).filter((event) => event.type === "sabotage").length;
  const sabotageCapReached = activeSabotageCount >= Number(eventTuning.maxConcurrentByType?.sabotage ?? Infinity);
  const defenseScore = Number(context?.wallCoverage ?? countNearbyTiles(state, target, [TILE.WALL], 1));
  const resistance = Math.max(0, Number(state.gameplay?.modifiers?.sabotageResistance ?? 1) - 1);
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const gridChangeCooldownSec = getSabotageGridChangeCooldownSec(state);
  const lastGridChangeSec = Number(state.gameplay?.lastSabotageGridChangeSec ?? -Infinity);
  const gridChangeRateLimited = gridChangeCooldownSec > 0 && nowSec - lastGridChangeSec < gridChangeCooldownSec;
  const blockChance = clamp(
    defenseScore * BALANCE.sabotageDefenseBlockPerWall + resistance * BALANCE.sabotageResistanceBlockWeight,
    0,
    0.85,
  );
  const blocked = protectsLastWarehouse || sabotageCapReached || gridChangeRateLimited || rng.next() < blockChance;

  if (!sabotageCapReached && !protectsLastWarehouse) {
    state.events.active.push({
      id: `evt_sabotage_${state.metrics.tick}`,
      type: "sabotage",
      status: "active",
      elapsedSec: 0,
      durationSec: 3,
      intensity: 1,
      payload: {
        ix: target.ix,
        iz: target.iz,
        targetLabel: context?.label ?? "",
        defenseScore,
        blockedByWalls: blocked,
        protectedWarehouse: protectsLastWarehouse,
        suppressedByAlert: sabotageCapReached,
        gridChangeRateLimited,
      },
    });
  }

  if (blocked) {
    if (protectsLastWarehouse) {
      const lossScale = Math.max(0, Number(tuning.protectedWarehouseLossScale ?? 1));
      state.resources.food = Math.max(0, state.resources.food - (3 + rng.next() * 6) * lossScale);
      state.resources.wood = Math.max(0, state.resources.wood - (3 + rng.next() * 6) * lossScale);
    }
    return { blocked: true, targetLabel: context?.label ?? "", defenseScore };
  }

  // Route through the central tile-mutation hook so reservations / worker
  // target+path / building counts / processing-timer dirty-key set all clear
  // synchronously. Raw grid.tiles[] writes left workers frozen on the now-
  // RUIN tile because cleanup didn't propagate until the next tick.
  mutateTile(state, target.ix, target.iz, TILE.RUINS);
  state.gameplay ??= {};
  state.gameplay.lastSabotageGridChangeSec = nowSec;

  if (tile === TILE.WAREHOUSE) {
    state.resources.food = Math.max(0, state.resources.food - (3 + rng.next() * 6));
    state.resources.wood = Math.max(0, state.resources.wood - (3 + rng.next() * 6));
  } else if (tile === TILE.FARM) {
    state.resources.food = Math.max(0, state.resources.food - (1.5 + rng.next() * 3.5));
  } else if (tile === TILE.LUMBER) {
    state.resources.wood = Math.max(0, state.resources.wood - (1.5 + rng.next() * 3.5));
  }

  return { blocked: false, targetLabel: context?.label ?? "", defenseScore };
}

function shouldTraderRetarget(visitor, state) {
  if (!visitor.targetTile) return true;
  if (visitor.pathGridVersion !== state.grid.version) return true;
  if (getTile(state.grid, visitor.targetTile.ix, visitor.targetTile.iz) !== TILE.WAREHOUSE) return true;
  if (isPathStuck(visitor, state, 2.3)) return true;

  const hasPath = Boolean(
    visitor.path &&
      visitor.pathIndex < visitor.path.length &&
      visitor.pathGridVersion === state.grid.version,
  );

  if (!hasPath && !isAtTargetTile(visitor, state)) return true;
  return false;
}

// v0.10.1 R3 wave-3.5 — exported so the FSM helper module
// (`fsm/VisitorHelpers.js`) and the legacy stride-skip movement branch
// (still in `update()` below) share a single implementation.
export function setIdleDesired(visitor) {
  if (!visitor.desiredVel) {
    visitor.desiredVel = { x: 0, z: 0 };
    return;
  }
  visitor.desiredVel.x = 0;
  visitor.desiredVel.z = 0;
}

function runWander(visitor, state, dt, services) {
  const blackboard = visitor.blackboard ?? (visitor.blackboard = {});
  const nowSec = state.metrics.timeSec;
  const nextWanderRefreshSec = Number(blackboard.nextWanderRefreshSec ?? -Infinity);
  const shouldRetarget = !hasActivePath(visitor, state) || isPathStuck(visitor, state, 2.2);
  if (shouldRetarget && nowSec >= nextWanderRefreshSec && canAttemptPath(visitor, state)) {
    clearPath(visitor);
    if (setTargetAndPath(visitor, randomPassableTile(state.grid, () => services.rng.next()), state, services)) {
      blackboard.nextWanderRefreshSec = nowSec + WANDER_REFRESH_BASE_SEC + services.rng.next() * WANDER_REFRESH_JITTER_SEC;
    }
  }
  if (hasActivePath(visitor, state)) {
    visitor.desiredVel = followPath(visitor, state, dt).desired;
  } else {
    setIdleDesired(visitor);
  }
}

function runEatBehavior(visitor, state, dt, services) {
  if ((visitor.hunger ?? 0) >= EAT_RECOVERY_TARGET) {
    clearPath(visitor);
    setIdleDesired(visitor);
    return;
  }

  const hasWarehouse = state.buildings.warehouses > 0;
  if (hasWarehouse && canAttemptPath(visitor, state)) {
    const warehouse = findNearestTileOfTypes(state.grid, visitor, [TILE.WAREHOUSE]);
    if (warehouse) {
      const stalePath = !hasActivePath(visitor, state) || isPathStuck(visitor, state, 2.0);
      if (stalePath || !visitor.targetTile || visitor.targetTile.ix !== warehouse.ix || visitor.targetTile.iz !== warehouse.iz) {
        setTargetAndPath(visitor, warehouse, state, services);
      }
    }
  }

  if (hasActivePath(visitor, state)) {
    visitor.desiredVel = followPath(visitor, state, dt).desired;
  } else {
    setIdleDesired(visitor);
  }

  if (visitor.targetTile && isAtTargetTile(visitor, state)) {
    restoreVisitorHunger(visitor, state, dt);
    if ((visitor.hunger ?? 0) >= EAT_RECOVERY_TARGET) {
      clearPath(visitor);
    }
    return;
  }

  consumeVisitorRation(visitor, state, dt);
  if ((visitor.hunger ?? 0) >= EAT_RECOVERY_TARGET) {
    clearPath(visitor);
  }
}

function traderTick(visitor, state, dt, services) {
  const policy = state.ai.groupPolicies.get(visitor.groupId)?.data;
  const tradeWeight = Number(policy?.intentWeights?.trade ?? 1);
  const retargetWindowSec = Math.max(0.75, 1.5 / Math.max(0.35, tradeWeight));

  const bb = visitor.blackboard ?? (visitor.blackboard = {});
  const nowSec = state.metrics.timeSec;
  if (!Number.isFinite(bb.nextTradeRetargetSec)) bb.nextTradeRetargetSec = -Infinity;

  if ((shouldTraderRetarget(visitor, state) || nowSec >= bb.nextTradeRetargetSec) && canAttemptPath(visitor, state)) {
    const nextTarget = pickTraderTarget(visitor, state, policy);
    if (nextTarget && setTargetAndPath(visitor, nextTarget.tile, state, services)) {
      bb.nextTradeRetargetSec = nowSec + retargetWindowSec;
      bb.tradeRetargetMisses = 0;
      bb._tradedThisStop = false;
      bb.tradeTargetLabel = nextTarget.context.label;
      bb.tradeTargetBonus = nextTarget.context.tradeBonus;
      bb.tradeTargetDefense = nextTarget.context.wallCoverage;
      bb.tradeTargetRouteSupport = nextTarget.context.routeSupport;
    } else {
      bb.tradeRetargetMisses = Number(bb.tradeRetargetMisses ?? 0) + 1;
      bb.nextTradeRetargetSec = nowSec + Math.min(3.5, 0.6 + bb.tradeRetargetMisses * 0.45);
    }
  }

  if (hasActivePath(visitor, state)) {
    const step = followPath(visitor, state, dt);
    visitor.desiredVel = step.desired;
  } else {
    setIdleDesired(visitor);
  }

  if (visitor.targetTile && isAtTargetTile(visitor, state)) {
    const tradeYield = Number(state.gameplay?.modifiers?.tradeYield ?? 1);
    const tradeBonus = Math.max(1, Number(bb.tradeTargetBonus ?? 1));
    state.resources.food += 1.5 * dt * tradeYield * tradeBonus;
    state.resources.wood += 1.2 * dt * tradeYield * tradeBonus;
    bb.lastTradeYieldBonus = tradeBonus;
    if (!bb._tradedThisStop) {
      bb._tradedThisStop = true;
      emitEvent(state, EVENT_TYPES.TRADE_COMPLETED, {
        entityId: visitor.id, entityName: visitor.name ?? visitor.id,
        tradeBonus, label: bb.tradeTargetLabel ?? "",
      });
    }
    restoreVisitorHunger(visitor, state, dt);
    return;
  }

  setIdleDesired(visitor);
}

function runScoutBehavior(visitor, state, dt, services) {
  const bb = visitor.blackboard ?? (visitor.blackboard = {});
  const nowSec = Number(state.metrics.timeSec ?? 0);
  const nextScoutMoveSec = Number(bb.nextScoutMoveSec ?? -Infinity);
  if ((!hasActivePath(visitor, state) || isPathStuck(visitor, state, 2.4)) && nowSec >= nextScoutMoveSec && canAttemptPath(visitor, state)) {
    clearPath(visitor);
    if (setTargetAndPath(visitor, randomPassableTile(state.grid, () => services.rng.next()), state, services)) {
      bb.nextScoutMoveSec = nowSec + 3.2 + services.rng.next() * 1.6;
    } else {
      bb.nextScoutMoveSec = nowSec + 1.8;
    }
  }
  if (hasActivePath(visitor, state)) {
    visitor.desiredVel = followPath(visitor, state, dt).desired;
  } else {
    setIdleDesired(visitor);
  }
}

// v0.8.4 strategic walls + GATE (Agent C). Wall-attack helper for
// saboteurs — find an adjacent WALL or GATE and chip its hp. When wallHp
// drops to 0 the tile mutates to RUINS, re-opening the path for everyone.
// Saboteurs are now faction="hostile" via getEntityFaction, so once a
// gate exists between them and the warehouse they were targeting, A* will
// fail; this fallback keeps them progressing toward the colony.
function findAdjacentBarrierVisitor(state, centerIx, centerIz) {
  if (!state?.grid) return null;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dz] of dirs) {
    const ix = centerIx + dx;
    const iz = centerIz + dz;
    if (!inBounds(ix, iz, state.grid)) continue;
    const t = getTile(state.grid, ix, iz);
    if (t === TILE.WALL || t === TILE.GATE) {
      return { ix, iz, tileType: t };
    }
  }
  return null;
}

function applyVisitorWallAttack(state, attacker, barrier, dt) {
  if (!state?.grid?.tileState || !barrier) return false;
  const idx = barrier.ix + barrier.iz * state.grid.width;
  const entry = state.grid.tileState.get(idx);
  if (!entry) return false;
  // v0.8.5 Tier 3: gates use gateMaxHp; walls keep wallMaxHp.
  if (entry.wallHp == null) {
    const isGate = barrier.tileType === TILE.GATE;
    entry.wallHp = isGate
      ? Number(BALANCE.gateMaxHp ?? BALANCE.wallMaxHp ?? 50)
      : Number(BALANCE.wallMaxHp ?? 50);
  }
  const dmg = Math.max(0, Number(BALANCE.wallAttackDamagePerSec ?? 5)) * Math.max(0, dt);
  entry.wallHp = Math.max(0, Number(entry.wallHp) - dmg);
  // v0.8.5 Tier 2 S2: track damage tick for regen safe-window check.
  entry.lastWallDamageTick = Number(state.metrics?.tick ?? 0);
  attacker.debug ??= {};
  attacker.debug.lastWallAttackHp = entry.wallHp;
  attacker.debug.lastWallAttackTile = { ix: barrier.ix, iz: barrier.iz };
  if (entry.wallHp <= 0) {
    mutateTile(state, barrier.ix, barrier.iz, TILE.RUINS);
    emitEvent(state, EVENT_TYPES.BUILDING_DESTROYED ?? "buildingDestroyed", {
      tool: barrier.tileType === TILE.GATE ? "gate" : "wall",
      ix: barrier.ix,
      iz: barrier.iz,
      oldType: barrier.tileType,
      newType: TILE.RUINS,
      cause: "wall-attack",
      attackerId: String(attacker.id ?? ""),
    });
    return true;
  }
  return false;
}

// PCC R10 — saboteurs strike back when adjacent to a worker. Pure addition
// to the existing tick: reuses `attackCooldownSec` (same field workers use,
// defaulted via `?? 0`), the existing `dealDamage`-equivalent inline pattern
// from WorkerStates.js FIGHTING, and the existing death-attribution pipeline
// (MortalitySystem coerces deathReason). No new entity field, no new event.
function findAdjacentWorkerForSaboteur(visitor, state) {
  const agents = state.agents;
  if (!agents || agents.length === 0) return null;
  let best = null;
  let bestDistSq = 4.0; // strike reach: ~2 world-units (tile size scale)
  for (let i = 0; i < agents.length; i += 1) {
    const a = agents[i];
    if (!a || a.type !== "WORKER") continue;
    if (a.alive === false) continue;
    if (Number(a.hp ?? 0) <= 0) continue;
    const dx = Number(a.x ?? 0) - Number(visitor.x ?? 0);
    const dz = Number(a.z ?? 0) - Number(visitor.z ?? 0);
    const d2 = dx * dx + dz * dz;
    if (d2 <= bestDistSq) {
      best = a;
      bestDistSq = d2;
    }
  }
  return best;
}

function saboteurTick(visitor, state, dt, services, stateNode) {
  const policy = state.ai.groupPolicies.get(visitor.groupId)?.data;
  const sabotageWeight = Number(policy?.intentWeights?.sabotage ?? 1);
  const resistance = Number(state.gameplay?.modifiers?.sabotageResistance ?? 1);
  const threatFactor = 1 + Number(state.gameplay?.threat ?? 0) / 220;
  const chanceScale = Math.max(0.35, Math.min(2.8, sabotageWeight * threatFactor / Math.max(0.6, resistance)));

  const bb = visitor.blackboard ?? (visitor.blackboard = {});

  // PCC R10 — adjacent-worker melee strike (cooldown-gated). Runs before
  // sabotage-target/path logic so an engaged saboteur fights instead of
  // disengaging to scout. No new state machine — the saboteur keeps its
  // sabotage path; this just adds an HP cost to the worker that closed in.
  visitor.attackCooldownSec = Math.max(0, Number(visitor.attackCooldownSec ?? 0) - dt);
  if (Number(visitor.attackCooldownSec ?? 0) <= 0) {
    const target = findAdjacentWorkerForSaboteur(visitor, state);
    if (target) {
      const dmg = Number(BALANCE.saboteurAttackDamage ?? 8);
      target.hp = Math.max(0, Number(target.hp ?? 0) - dmg);
      visitor.attackCooldownSec = Number(BALANCE.saboteurAttackCooldownSec ?? 2.0);
      if (target.hp <= 0 && target.alive !== false) {
        target.alive = false;
        target.deathReason = "killed-by-saboteur";
        target.deathSec = Number(state.metrics?.timeSec ?? 0);
      }
    }
  }

  visitor.sabotageCooldown -= dt;
  if (visitor.sabotageCooldown <= 0) {
    const base = BALANCE.sabotageCooldownMinSec + services.rng.next() * (BALANCE.sabotageCooldownMaxSec - BALANCE.sabotageCooldownMinSec);
    visitor.sabotageCooldown = (base / chanceScale) * Number(getLongRunVisitorTuning(state).sabotageCooldownMultiplier ?? 1);

    const nextTarget = pickSabotageTarget(visitor, state, policy);
    if (nextTarget && canAttemptPath(visitor, state) && setTargetAndPath(visitor, nextTarget.tile, state, services)) {
      bb.sabotageTargetLabel = nextTarget.context.label;
      bb.sabotageTargetDefense = nextTarget.context.wallCoverage;
      bb.sabotageTargetScore = Number(nextTarget.score.toFixed(2));
      bb.sabotageTargetType = nextTarget.context.tileType;
    }
  }

  const pathInvalid = !hasActivePath(visitor, state) || isPathStuck(visitor, state, 2.0);
  if (visitor.targetTile && !pathInvalid) {
    const step = followPath(visitor, state, dt);
    visitor.desiredVel = step.desired;
    if (step.done && visitor.targetTile) {
      const result = applySabotage(state, visitor.targetTile, {
        label: bb.sabotageTargetLabel,
        wallCoverage: bb.sabotageTargetDefense,
      }, services.rng);
      bb.lastSabotageBlocked = Boolean(result?.blocked);
      bb.lastSabotageTargetLabel = result?.targetLabel ?? bb.sabotageTargetLabel ?? "";
      bb.lastSabotageDefense = Number(result?.defenseScore ?? bb.sabotageTargetDefense ?? 0);
      emitEvent(state, EVENT_TYPES.SABOTAGE_OCCURRED, {
        entityId: visitor.id, entityName: visitor.name ?? visitor.id,
        blocked: result?.blocked ?? false, label: result?.targetLabel ?? "",
        defenseScore: result?.defenseScore ?? 0,
      });
      clearPath(visitor);
    }
    return;
  }

  // v0.8.4 strategic walls + GATE (Agent C). Saboteurs are faction="hostile"
  // (per getEntityFaction), so once gates exist between them and their
  // sabotage target, A* will fail. Fall back to wall-attack: chip the
  // adjacent WALL/GATE until it breaks. mutateTile then bumps grid.version
  // and the next plan-cycle gets a fresh path. Gated by a 1.5s dwell so a
  // transient one-tick path miss doesn't fire wall-attack — same gating
  // pattern as the predator branch in AnimalAISystem (keeps long-horizon
  // plains baselines from chipping walls every patrol cycle).
  if (visitor.targetTile && pathInvalid) {
    const dwell = Number(bb.pathFailDwellSec ?? 0) + dt;
    bb.pathFailDwellSec = dwell;
    if (dwell >= 1.5) {
      const here = worldToTile(visitor.x, visitor.z, state.grid);
      const barrier = findAdjacentBarrierVisitor(state, here.ix, here.iz);
      if (barrier) {
        bb.intent = "attack_structure";
        visitor.stateLabel = "Wall-attack";
        setIdleDesired(visitor);
        applyVisitorWallAttack(state, visitor, barrier, dt);
        return;
      }
    }
  } else if (bb.pathFailDwellSec) {
    bb.pathFailDwellSec = 0;
  }

  if (stateNode === "evade" || stateNode === "scout") {
    runScoutBehavior(visitor, state, dt, services);
    return;
  }
  setIdleDesired(visitor);
}

// v0.10.1 R3 wave-3.5 — named-exports map for the FSM helper module
// (`fsm/VisitorHelpers.js`). The four behaviour bodies stay in this
// file (they close over module-private helpers like pickTraderTarget /
// pickSabotageTarget / applySabotage that are not part of the public
// surface) but the FSM consumes them through this map to avoid a
// circular import on `VisitorAISystem` symbols inside FSM-only files.
export const __visitorBehaviorBodies = Object.freeze({
  runEatBehavior,
  traderTick,
  saboteurTick,
  runWander,
});

export class VisitorAISystem {
  constructor() {
    this.name = "VisitorAISystem";
    // v0.10.1 R3 wave-3.5 — Priority-FSM is now the only path. The
    // wave-2 dual-path + USE_VISITOR_FSM flag are retired. Lazy-init so
    // tests that construct VisitorAISystem without ever calling update()
    // (e.g. unit tests of helper functions) don't pay the cost.
    this._fsm = null;
  }

  update(dt, state, services) {
    const totalEntities = (state.agents?.length ?? 0) + (state.animals?.length ?? 0);
    const requestedScale = Number(state.controls?.timeScale ?? 1);
    const highLoad = totalEntities >= 650 || requestedScale >= 7;
    const stride = highLoad
      ? requestedScale >= 7
        ? (totalEntities >= 1000 ? 3 : totalEntities >= 650 ? 2 : 1)
        : (totalEntities >= 1000 ? 4 : totalEntities >= 650 ? 3 : 2)
      : 1;
    const phase = stride > 1 ? (Number(state.metrics?.tick ?? 0) % stride) : 0;
    let visitorIndex = 0;
    let processed = 0;
    let skipped = 0;

    if (!this._fsm) this._fsm = new VisitorFSM();

    for (const visitor of state.agents) {
      if (visitor.type !== "VISITOR") continue;
      if (visitor.alive === false) continue;
      const currentVisitorIndex = visitorIndex;
      visitorIndex += 1;
      updateVisitorHunger(visitor, dt);

      if (stride > 1 && (currentVisitorIndex % stride) !== phase) {
        visitor._visitorAiAccumDt = Number(visitor._visitorAiAccumDt ?? 0) + dt;
        if (hasActivePath(visitor, state)) {
          visitor.desiredVel = followPath(visitor, state, dt).desired;
        } else {
          setIdleDesired(visitor);
        }
        skipped += 1;
        continue;
      }

      const logicDt = Math.min(0.75, Number(visitor._visitorAiAccumDt ?? 0) + dt);
      visitor._visitorAiAccumDt = 0;
      processed += 1;

      this._fsm.tickVisitor(visitor, state, services, logicDt);
    }

    if (state.debug) {
      state.debug.visitorAiLod = {
        stride,
        processed,
        skipped,
        totalVisitors: visitorIndex,
        reason: stride > 1 ? "high-load cadence" : "full-rate",
      };
    }
  }
}
