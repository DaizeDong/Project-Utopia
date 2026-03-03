import { BALANCE } from "../../config/balance.js";
import { TILE, VISITOR_KIND } from "../../config/constants.js";
import { findNearestTileOfTypes, getTile, listTilesByType, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { canAttemptPath, clearPath, followPath, setTargetAndPath } from "../navigation/Navigation.js";

const WANDER_REFRESH_BASE_SEC = 2.1;
const WANDER_REFRESH_JITTER_SEC = 1.4;

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

function traderTick(visitor, state, dt, services) {
  visitor.stateLabel = "Trade";
  if (visitor.debug) visitor.debug.lastIntent = "trade";

  if (shouldTraderRetarget(visitor, state) && canAttemptPath(visitor, state)) {
    const warehouse = findNearestTileOfTypes(state.grid, visitor, [TILE.WAREHOUSE]);
    if (warehouse) setTargetAndPath(visitor, warehouse, state, services);
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
      return;
    }
  }

  visitor.stateLabel = "Wander";
  const blackboard = visitor.blackboard ?? (visitor.blackboard = {});
  const nowSec = state.metrics.timeSec;
  const nextWanderRefreshSec = Number(blackboard.nextWanderRefreshSec ?? -Infinity);
  if (!hasActivePath(visitor, state) && nowSec >= nextWanderRefreshSec && canAttemptPath(visitor, state)) {
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

function saboteurTick(visitor, state, dt, services) {
  if (visitor.debug) visitor.debug.lastIntent = "sabotage";
  const policy = state.ai.groupPolicies.get("visitors")?.data;
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

  if (visitor.targetTile && hasActivePath(visitor, state)) {
    const step = followPath(visitor, state, dt);
    visitor.desiredVel = step.desired;
    if (step.done && visitor.targetTile) {
      applySabotage(state, visitor.targetTile, services.rng);
      clearPath(visitor);
    }
    return;
  }

  visitor.stateLabel = "Wander";
  const blackboard = visitor.blackboard ?? (visitor.blackboard = {});
  const nowSec = state.metrics.timeSec;
  const nextWanderRefreshSec = Number(blackboard.nextWanderRefreshSec ?? -Infinity);
  if (!hasActivePath(visitor, state) && nowSec >= nextWanderRefreshSec && canAttemptPath(visitor, state)) {
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

export class VisitorAISystem {
  constructor() {
    this.name = "VisitorAISystem";
  }

  update(dt, state, services) {
    for (const visitor of state.agents) {
      if (visitor.type !== "VISITOR") continue;
      if (visitor.kind === VISITOR_KIND.TRADER) {
        traderTick(visitor, state, dt, services);
      } else {
        saboteurTick(visitor, state, dt, services);
      }
    }
  }
}
