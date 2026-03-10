import { EVENT_TYPE, TILE, VISITOR_KIND } from "../../config/constants.js";
import { getScenarioEventCandidates } from "../scenarios/ScenarioFactory.js";

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

function countWallsNearTiles(state, tiles, radius = 1) {
  let walls = 0;
  const seen = new Set();
  for (const tile of tiles) {
    for (let iz = tile.iz - radius; iz <= tile.iz + radius; iz += 1) {
      for (let ix = tile.ix - radius; ix <= tile.ix + radius; ix += 1) {
        if (ix < 0 || iz < 0 || ix >= state.grid.width || iz >= state.grid.height) continue;
        if (Math.abs(ix - tile.ix) + Math.abs(iz - tile.iz) > radius) continue;
        const key = tileKey(ix, iz);
        if (seen.has(key)) continue;
        seen.add(key);
        if (state.grid.tiles[ix + iz * state.grid.width] === TILE.WALL) walls += 1;
      }
    }
  }
  return walls;
}

function pickBanditRaidZone(state) {
  const candidates = getScenarioEventCandidates(state, EVENT_TYPE.BANDIT_RAID);

  candidates.sort((a, b) => {
    const aWalls = countWallsNearTiles(state, a.tiles, 1);
    const bWalls = countWallsNearTiles(state, b.tiles, 1);
    if (aWalls !== bWalls) return aWalls - bWalls;
    return a.label.localeCompare(b.label);
  });

  return candidates[0] ?? { label: "unknown", tiles: [] };
}

function pickImpactTile(state, tiles) {
  const priorities = [TILE.ROAD, TILE.LUMBER, TILE.FARM, TILE.GRASS, TILE.RUINS];
  for (const targetType of priorities) {
    for (const tile of tiles) {
      const current = state.grid.tiles[tile.ix + tile.iz * state.grid.width];
      if (current === targetType) return tile;
    }
  }
  return null;
}

function ensureSpatialPayload(event, state) {
  event.payload ??= {};
  if (event.type === EVENT_TYPE.BANDIT_RAID && !Array.isArray(event.payload.targetTiles)) {
    const zone = pickBanditRaidZone(state);
    event.payload.targetLabel = zone.label;
    event.payload.targetTiles = zone.tiles;
    event.payload.wallCoverage = countWallsNearTiles(state, zone.tiles, 1);
  }
  if (event.type === EVENT_TYPE.TRADE_CARAVAN && !Array.isArray(event.payload.targetTiles)) {
    const zone = getScenarioEventCandidates(state, EVENT_TYPE.TRADE_CARAVAN)[0] ?? { label: "trade-route", tiles: [] };
    event.payload.targetLabel = zone.label;
    event.payload.targetTiles = zone.tiles;
    event.payload.wallCoverage = countWallsNearTiles(state, event.payload.targetTiles, 1);
  }
  if (event.type === EVENT_TYPE.ANIMAL_MIGRATION && !Array.isArray(event.payload.targetTiles)) {
    const zone = getScenarioEventCandidates(state, EVENT_TYPE.ANIMAL_MIGRATION)[0] ?? { label: "wilds", tiles: [] };
    event.payload.targetLabel = zone.label;
    event.payload.targetTiles = zone.tiles;
    event.payload.focusTile = zone.tiles[0] ?? null;
  }
}

function applyBanditRaidImpact(event, state) {
  if (event.payload?.sabotageApplied) return;
  ensureSpatialPayload(event, state);
  const targetTiles = event.payload?.targetTiles ?? [];
  const defense = Number(event.payload?.wallCoverage ?? 0);
  const impactTile = pickImpactTile(state, targetTiles);

  event.payload.sabotageApplied = true;
  event.payload.impactTile = impactTile;
  event.payload.defenseScore = defense;

  if (!impactTile) return;

  const idx = impactTile.ix + impactTile.iz * state.grid.width;
  const current = state.grid.tiles[idx];
  if (current === TILE.WATER || current === TILE.WALL || current === TILE.WAREHOUSE) return;

  const shielded = defense >= 4;
  event.payload.blockedByWalls = shielded;
  if (shielded) return;

  state.grid.tiles[idx] = TILE.RUINS;
  state.grid.version = Number(state.grid.version ?? 0) + 1;
}

function applyActiveEvent(event, dt, state) {
  if (event.type === EVENT_TYPE.BANDIT_RAID) {
    const defense = Number(event.payload?.defenseScore ?? 0);
    const mitigation = Math.max(0.45, 1 - defense * 0.12);
    const loss = event.intensity * dt * 0.75 * mitigation;
    state.resources.food = Math.max(0, state.resources.food - loss);
    state.resources.wood = Math.max(0, state.resources.wood - loss * 0.8);

    const saboteurs = state.agents.filter((a) => a.type === "VISITOR" && a.kind === VISITOR_KIND.SABOTEUR);
    const boost = Math.max(0.3, 1.5 - saboteurs.length * 0.03);
    for (const s of saboteurs) {
      s.sabotageCooldown = Math.max(1.5, s.sabotageCooldown - dt * boost);
    }
  }

  if (event.type === EVENT_TYPE.TRADE_CARAVAN) {
    ensureSpatialPayload(event, state);
    const depotReady = (event.payload?.targetTiles ?? []).some((tile) => {
      const current = state.grid.tiles[tile.ix + tile.iz * state.grid.width];
      return current === TILE.WAREHOUSE;
    });
    const depotBonus = depotReady ? 1.45 : 1;
    state.resources.food += dt * 0.65 * event.intensity * depotBonus;
    state.resources.wood += dt * 0.45 * event.intensity * depotBonus;
  }

  if (event.type === EVENT_TYPE.ANIMAL_MIGRATION) {
    ensureSpatialPayload(event, state);
    const label = String(event.payload?.targetLabel ?? "migration");
    const focusTile = event.payload?.focusTile ?? null;
    for (const animal of state.animals) {
      if (animal.kind === "HERBIVORE") {
        animal.memory.recentEvents.unshift(label);
        animal.memory.recentEvents = animal.memory.recentEvents.slice(0, 6);
        animal.memory.migrationTarget = focusTile;
        animal.memory.migrationLabel = label;
      }
    }
  }
}

function advanceLifecycle(event, dt) {
  event.elapsedSec += dt;

  if (event.status === "prepare" && event.elapsedSec >= 1) {
    event.status = "active";
    event.elapsedSec = 0;
    return true;
  }

  if (event.status === "active" && event.elapsedSec >= event.durationSec) {
    event.status = "resolve";
    event.elapsedSec = 0;
    return true;
  }

  if (event.status === "resolve" && event.elapsedSec >= 1) {
    event.status = "cooldown";
    event.elapsedSec = 0;
    return true;
  }

  return false;
}

export class WorldEventSystem {
  constructor() {
    this.name = "WorldEventSystem";
  }

  update(dt, state) {
    if (state.events.queue.length > 0) {
      const spawned = state.events.queue.splice(0, state.events.queue.length);
      for (const event of spawned) ensureSpatialPayload(event, state);
      state.events.active.push(...spawned);
      if (state.debug?.eventTrace) {
        for (const event of spawned) {
          state.debug.eventTrace.unshift(
            `[${state.metrics.timeSec.toFixed(1)}s] spawn ${event.type} status=${event.status} target=${event.payload?.targetLabel ?? "-"}`,
          );
        }
        state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
      }
    }

    for (const event of state.events.active) {
      const prevStatus = event.status;
      if (event.status === "active") {
        applyActiveEvent(event, dt, state);
      }
      const changed = advanceLifecycle(event, dt);
      if (changed && event.status === "active") {
        if (event.type === EVENT_TYPE.BANDIT_RAID) {
          applyBanditRaidImpact(event, state);
        }
        // Apply activation side effects immediately so spatial targets and
        // first-frame consequences are visible without waiting another tick.
        applyActiveEvent(event, 0, state);
      }
      if (changed && state.debug?.eventTrace) {
        const impact = event.payload?.impactTile
          ? ` impact=(${event.payload.impactTile.ix},${event.payload.impactTile.iz})`
          : "";
        state.debug.eventTrace.unshift(
          `[${state.metrics.timeSec.toFixed(1)}s] ${event.type} ${prevStatus} -> ${event.status} target=${event.payload?.targetLabel ?? "-"}${impact}`,
        );
        state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
      }
    }

    state.events.active = state.events.active.filter((event) => {
      if (event.status !== "cooldown") return true;
      return event.elapsedSec < 4;
    });
  }
}
