import { BALANCE } from "../../config/balance.js";
import { TILE, VISITOR_KIND } from "../../config/constants.js";
import { findNearestTileOfTypes, listTilesByType, randomPassableTile } from "../../world/grid/Grid.js";
import { clearPath, followPath, setTargetAndPath } from "../navigation/Navigation.js";

function applySabotage(state, target) {
  const idx = target.ix + target.iz * state.grid.width;
  const tile = state.grid.tiles[idx];
  if (tile !== TILE.FARM && tile !== TILE.LUMBER && tile !== TILE.WAREHOUSE) return;

  state.grid.tiles[idx] = TILE.RUINS;
  state.grid.version += 1;

  if (tile === TILE.WAREHOUSE) {
    state.resources.food = Math.max(0, state.resources.food - (3 + Math.random() * 6));
    state.resources.wood = Math.max(0, state.resources.wood - (3 + Math.random() * 6));
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

function traderTick(visitor, state, dt, services) {
  visitor.stateLabel = "Trade";
  const warehouse = findNearestTileOfTypes(state.grid, visitor, [TILE.WAREHOUSE]);
  if (warehouse && setTargetAndPath(visitor, warehouse, state, services)) {
    const step = followPath(visitor, state, dt);
    visitor.desiredVel = step.desired;
    if (step.done) {
      state.resources.food += 1.5 * dt;
      state.resources.wood += 1.2 * dt;
    }
    return;
  }

  visitor.stateLabel = "Wander";
  if (!visitor.path || visitor.pathIndex >= visitor.path.length) {
    clearPath(visitor);
    setTargetAndPath(visitor, randomPassableTile(state.grid), state, services);
  }
  visitor.desiredVel = followPath(visitor, state, dt).desired;
}

function saboteurTick(visitor, state, dt, services) {
  const policy = state.ai.groupPolicies.get("visitors")?.data;
  const sabotageWeight = Number(policy?.intentWeights?.sabotage ?? 1);
  const chanceScale = Math.max(0.4, Math.min(2.4, sabotageWeight));

  visitor.sabotageCooldown -= dt;
  if (visitor.sabotageCooldown <= 0) {
    const base = BALANCE.sabotageCooldownMinSec + Math.random() * (BALANCE.sabotageCooldownMaxSec - BALANCE.sabotageCooldownMinSec);
    visitor.sabotageCooldown = base / chanceScale;

    const candidates = listTilesByType(state.grid, [TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE]);
    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      setTargetAndPath(visitor, target, state, services);
      visitor.stateLabel = "Sabotage";
    }
  }

  if (visitor.targetTile && visitor.path && visitor.pathIndex < visitor.path.length) {
    const step = followPath(visitor, state, dt);
    visitor.desiredVel = step.desired;
    if (step.done && visitor.targetTile) {
      applySabotage(state, visitor.targetTile);
      clearPath(visitor);
    }
    return;
  }

  visitor.stateLabel = "Wander";
  if (!visitor.path || visitor.pathIndex >= visitor.path.length) {
    clearPath(visitor);
    setTargetAndPath(visitor, randomPassableTile(state.grid), state, services);
  }
  visitor.desiredVel = followPath(visitor, state, dt).desired;
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
