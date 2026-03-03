import { BALANCE } from "../../config/balance.js";
import { TILE, VISITOR_KIND } from "../../config/constants.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, listTilesByType, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { canAttemptPath, clearPath, followPath, isPathStuck, setTargetAndPath } from "../navigation/Navigation.js";

const WANDER_REFRESH_BASE_SEC = 2.1;
const WANDER_REFRESH_JITTER_SEC = 1.4;
const EAT_RECOVERY_TARGET = 0.76;

function updateVisitorHunger(visitor, dt) {
  const decay = Number(BALANCE.visitorHungerDecayPerSecond ?? 0.01);
  visitor.hunger = clamp((visitor.hunger ?? 1) - decay * dt, 0, 1);
}

function restoreVisitorHunger(visitor, state, dt) {
  const eatRate = Number(BALANCE.visitorHungerRecoveryPerSecond ?? 0.18);
  const foodCost = Math.max(0.08, eatRate * 0.45) * dt;
  if ((state.resources.food ?? 0) <= 0) return;
  const eat = Math.min(foodCost, state.resources.food);
  state.resources.food -= eat;
  visitor.hunger = clamp((visitor.hunger ?? 0) + eatRate * dt, 0, 1);
}

function applySabotage(state, target, rng) {
  const idx = target.ix + target.iz * state.grid.width;
  const tile = state.grid.tiles[idx];
  if (tile !== TILE.FARM && tile !== TILE.LUMBER && tile !== TILE.WAREHOUSE) return;

  state.grid.tiles[idx] = TILE.RUINS;
  state.grid.version += 1;

  if (tile === TILE.WAREHOUSE) {
    state.resources.food = Math.max(0, state.resources.food - (3 + rng.next() * 6));
    state.resources.wood = Math.max(0, state.resources.wood - (3 + rng.next() * 6));
  }

  state.events.active.push({
    id: `evt_sabotage_${state.metrics.tick}`,
    type: "sabotage",
    status: "active",
    elapsedSec: 0,
    durationSec: 3,
    intensity: 1,
    payload: { ix: target.ix, iz: target.iz },
  });
}

function shouldTraderRetarget(visitor, state) {
  if (!visitor.targetTile) return true;
  if (visitor.pathGridVersion !== state.grid.version) return true;
  if (getTile(state.grid, visitor.targetTile.ix, visitor.targetTile.iz) !== TILE.WAREHOUSE) return true;
  if (isPathStuck(visitor, state, 2.3)) return true;

  const atTarget = (() => {
    const tile = worldToTile(visitor.x, visitor.z, state.grid);
    return tile.ix === visitor.targetTile.ix && tile.iz === visitor.targetTile.iz;
  })();
  const hasPath = Boolean(
    visitor.path &&
      visitor.pathIndex < visitor.path.length &&
      visitor.pathGridVersion === state.grid.version,
  );

  if (!hasPath && !atTarget) return true;
  return false;
}

function hasActivePath(visitor, state) {
  return Boolean(
    visitor.path &&
      visitor.pathIndex < visitor.path.length &&
      visitor.pathGridVersion === state.grid.version,
  );
}

function setIdleDesired(visitor) {
  if (!visitor.desiredVel) {
    visitor.desiredVel = { x: 0, z: 0 };
    return;
  }
  visitor.desiredVel.x = 0;
  visitor.desiredVel.z = 0;
}

function runWander(visitor, state, dt, services) {
  visitor.stateLabel = "Wander";
  const blackboard = visitor.blackboard ?? (visitor.blackboard = {});
  const nowSec = state.metrics.timeSec;
  const nextWanderRefreshSec = Number(blackboard.nextWanderRefreshSec ?? -Infinity);
  const shouldRetarget = !hasActivePath(visitor, state) || isPathStuck(visitor, state, 2.2);
  if (shouldRetarget && nowSec >= nextWanderRefreshSec && canAttemptPath(visitor, state)) {
    clearPath(visitor);
    if (setTargetAndPath(visitor, randomPassableTile(state.grid), state, services)) {
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
  visitor.stateLabel = "Eat";
  if (visitor.debug) visitor.debug.lastIntent = "eat";
  if (canAttemptPath(visitor, state)) {
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

  if (visitor.targetTile) {
    const tile = worldToTile(visitor.x, visitor.z, state.grid);
    if (tile.ix === visitor.targetTile.ix && tile.iz === visitor.targetTile.iz) {
      restoreVisitorHunger(visitor, state, dt);
      if ((visitor.hunger ?? 0) >= EAT_RECOVERY_TARGET) {
        clearPath(visitor);
      }
    }
  }
}

function traderTick(visitor, state, dt, services) {
  if ((visitor.hunger ?? 1) < 0.22 && state.buildings.warehouses > 0) {
    runEatBehavior(visitor, state, dt, services);
    return;
  }

  visitor.stateLabel = "Trade";
  if (visitor.debug) visitor.debug.lastIntent = "trade";

  const policy = state.ai.groupPolicies.get(visitor.groupId)?.data;
  const tradeWeight = Number(policy?.intentWeights?.trade ?? 1);
  const retargetWindowSec = Math.max(0.75, 1.5 / Math.max(0.35, tradeWeight));

  const bb = visitor.blackboard ?? (visitor.blackboard = {});
  const nowSec = state.metrics.timeSec;
  if (!Number.isFinite(bb.nextTradeRetargetSec)) bb.nextTradeRetargetSec = -Infinity;

  if ((shouldTraderRetarget(visitor, state) || nowSec >= bb.nextTradeRetargetSec) && canAttemptPath(visitor, state)) {
    const warehouse = findNearestTileOfTypes(state.grid, visitor, [TILE.WAREHOUSE]);
    if (warehouse && setTargetAndPath(visitor, warehouse, state, services)) {
      bb.nextTradeRetargetSec = nowSec + retargetWindowSec;
    }
  }

  if (hasActivePath(visitor, state)) {
    const step = followPath(visitor, state, dt);
    visitor.desiredVel = step.desired;
  } else {
    setIdleDesired(visitor);
  }

  if (visitor.targetTile) {
    const tile = worldToTile(visitor.x, visitor.z, state.grid);
    if (tile.ix === visitor.targetTile.ix && tile.iz === visitor.targetTile.iz) {
      const tradeYield = Number(state.gameplay?.modifiers?.tradeYield ?? 1);
      state.resources.food += 1.5 * dt * tradeYield;
      state.resources.wood += 1.2 * dt * tradeYield;
      restoreVisitorHunger(visitor, state, dt);
      return;
    }
  }

  runWander(visitor, state, dt, services);
}

function saboteurTick(visitor, state, dt, services) {
  if ((visitor.hunger ?? 1) < 0.2 && state.buildings.warehouses > 0) {
    runEatBehavior(visitor, state, dt, services);
    return;
  }

  if (visitor.debug) visitor.debug.lastIntent = "sabotage";
  const policy = state.ai.groupPolicies.get(visitor.groupId)?.data;
  const sabotageWeight = Number(policy?.intentWeights?.sabotage ?? 1);
  const resistance = Number(state.gameplay?.modifiers?.sabotageResistance ?? 1);
  const threatFactor = 1 + Number(state.gameplay?.threat ?? 0) / 220;
  const chanceScale = Math.max(0.35, Math.min(2.8, sabotageWeight * threatFactor / Math.max(0.6, resistance)));

  visitor.sabotageCooldown -= dt;
  if (visitor.sabotageCooldown <= 0) {
    const base = BALANCE.sabotageCooldownMinSec + services.rng.next() * (BALANCE.sabotageCooldownMaxSec - BALANCE.sabotageCooldownMinSec);
    visitor.sabotageCooldown = base / chanceScale;

    const candidates = listTilesByType(state.grid, [TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE]);
    if (candidates.length > 0) {
      const target = candidates[Math.floor(services.rng.next() * candidates.length)];
      if (canAttemptPath(visitor, state)) {
        setTargetAndPath(visitor, target, state, services);
      }
      visitor.stateLabel = "Sabotage";
    }
  }

  const pathInvalid = !hasActivePath(visitor, state) || isPathStuck(visitor, state, 2.0);
  if (visitor.targetTile && !pathInvalid) {
    const step = followPath(visitor, state, dt);
    visitor.desiredVel = step.desired;
    if (step.done && visitor.targetTile) {
      applySabotage(state, visitor.targetTile, services.rng);
      clearPath(visitor);
    }
    return;
  }

  runWander(visitor, state, dt, services);
}

export class VisitorAISystem {
  constructor() {
    this.name = "VisitorAISystem";
  }

  update(dt, state, services) {
    for (const visitor of state.agents) {
      if (visitor.type !== "VISITOR") continue;
      if (visitor.alive === false) continue;
      updateVisitorHunger(visitor, dt);
      if (visitor.kind === VISITOR_KIND.TRADER) {
        traderTick(visitor, state, dt, services);
      } else {
        saboteurTick(visitor, state, dt, services);
      }
    }
  }
}
