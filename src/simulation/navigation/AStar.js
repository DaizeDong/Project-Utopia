import { MOVE_DIRECTIONS_4, TILE_INFO } from "../../config/constants.js";
import { TERRAIN_MECHANICS } from "../../config/balance.js";
import { inBounds, toIndex } from "../../world/grid/Grid.js";
// v0.8.4 strategic walls + GATE (Agent C). isTilePassableForFaction returns
// false on WALL for everyone and false on GATE for non-colony factions.
// Combined with the TILE_INFO.passable check (which still gates WATER, etc.)
// this lets a single search produce different paths for "colony" vs.
// "hostile" callers without ever rebuilding the grid.
import { isTilePassableForFaction } from "./Faction.js";

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(key, priority) {
    this.items.push({ key, priority });
    this.#up(this.items.length - 1);
  }

  pop() {
    const root = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.#down(0);
    }
    return root?.key ?? -1;
  }

  isEmpty() {
    return this.items.length === 0;
  }

  #up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].priority <= this.items[i].priority) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }

  #down(i) {
    const n = this.items.length;
    while (true) {
      let best = i;
      const l = i * 2 + 1;
      const r = i * 2 + 2;
      if (l < n && this.items[l].priority < this.items[best].priority) best = l;
      if (r < n && this.items[r].priority < this.items[best].priority) best = r;
      if (best === i) break;
      [this.items[best], this.items[i]] = [this.items[i], this.items[best]];
      i = best;
    }
  }
}

function heuristic(a, b) {
  return Math.abs(a.ix - b.ix) + Math.abs(a.iz - b.iz);
}

function reconstructPath(cameFrom, currentKey, width) {
  const out = [];
  let cur = currentKey;
  while (cur !== -1) {
    const ix = cur % width;
    const iz = Math.floor(cur / width);
    out.push({ ix, iz });
    cur = cameFrom[cur];
  }
  out.reverse();
  return out;
}

/**
 * @param {import("../../app/types.js").GridState} grid
 * @param {{ix:number,iz:number}} start
 * @param {{ix:number,iz:number}} goal
 * @param {number} weatherMoveCostMultiplier
 * @param {{
 *  tiles?: Set<string>,
 *  penaltyMultiplier?: number,
 *  hazards?: {tiles?: Set<string>, penaltyMultiplier?: number, penaltyByKey?: Record<string, number>|null},
 *  traffic?: {penaltyByKey?: Record<string, number>|null}
 * }|null} dynamicCosts
 * @param {{ faction?: "colony"|"hostile"|"neutral" }} [options]
 *   v0.8.4 Agent C — passed through to the per-tile faction check.
 *   Defaults to "colony" so pre-v0.8.4 callers keep their old behaviour:
 *   walls block everyone, gates are passable. Hostile callers (raiders,
 *   predators, saboteurs) pass `faction: "hostile"` so gates also block
 *   them.
 */
export function aStar(grid, start, goal, weatherMoveCostMultiplier = 1, dynamicCosts = null, options = {}) {
  // v0.8.4 strategic walls + GATE (Agent C). Default "colony" so the
  // existing test surface (which never threaded a faction) keeps treating
  // gates as passable doorways. Hostiles must opt in via options.faction.
  const faction = String(options?.faction ?? "colony");
  const width = grid.width;
  const height = grid.height;
  const startKey = toIndex(start.ix, start.iz, width);
  const goalKey = toIndex(goal.ix, goal.iz, width);
  const goalIx = goal.ix | 0;
  const goalIz = goal.iz | 0;
  const hazardTiles = dynamicCosts?.hazards?.tiles instanceof Set
    ? dynamicCosts.hazards.tiles
    : dynamicCosts?.tiles instanceof Set
      ? dynamicCosts.tiles
      : null;
  const hazardPenaltyMultiplier = Math.max(
    1,
    Number(dynamicCosts?.hazards?.penaltyMultiplier ?? dynamicCosts?.penaltyMultiplier ?? 1),
  );
  const hazardPenaltyByKey = dynamicCosts?.hazards && typeof dynamicCosts.hazards.penaltyByKey === "object"
    ? dynamicCosts.hazards.penaltyByKey
    : null;
  const trafficPenaltyByKey = dynamicCosts?.traffic && typeof dynamicCosts.traffic.penaltyByKey === "object"
    ? dynamicCosts.traffic.penaltyByKey
    : null;
  const hasHazardTiles = hazardTiles instanceof Set && hazardTiles.size > 0;
  const hasHazardPenaltyByKey = hazardPenaltyByKey && Object.keys(hazardPenaltyByKey).length > 0;
  const hasTrafficPenaltyByKey = trafficPenaltyByKey && Object.keys(trafficPenaltyByKey).length > 0;
  const hasDynamicTileCosts = Boolean(hasHazardTiles || hasHazardPenaltyByKey || hasTrafficPenaltyByKey);

  if (startKey === goalKey) return [start];

  const open = new MinHeap();
  const cameFrom = new Int32Array(width * height).fill(-1);
  const gScore = new Float32Array(width * height);
  const closed = new Uint8Array(width * height);
  gScore.fill(Infinity);

  gScore[startKey] = 0;
  open.push(startKey, heuristic(start, goal));

  while (!open.isEmpty()) {
    const current = open.pop();
    if (current < 0) break;
    if (closed[current]) continue;
    closed[current] = 1;

    if (current === goalKey) {
      return reconstructPath(cameFrom, current, width);
    }

    const cx = current % width;
    const cz = Math.floor(current / width);

    for (const d of MOVE_DIRECTIONS_4) {
      const nx = cx + d.dx;
      const nz = cz + d.dz;
      if (!inBounds(nx, nz, grid)) continue;

      const nKey = toIndex(nx, nz, width);
      if (closed[nKey]) continue;
      const tileType = grid.tiles[nKey];
      const tileInfo = TILE_INFO[tileType];
      if (!tileInfo.passable) continue;
      // v0.8.4 strategic walls + GATE (Agent C). After the base passable
      // check (which gates WATER and friends regardless of faction), apply
      // the faction-specific filter: hostiles cannot cross gates, and walls
      // are off-limits to everyone (handled here as a redundant safety net
      // — TILE_INFO marks WALL as not-passable so this is effectively a
      // no-op for walls today, but kept here so the rule is colocated with
      // the gate check should TILE_INFO.WALL.passable ever flip).
      if (!isTilePassableForFaction(tileType, faction)) continue;

      let stepCost = tileInfo.baseCost;
      if (grid.elevation) {
        stepCost += (grid.elevation[nKey] ?? 0.5) * TERRAIN_MECHANICS.elevationMovePenalty;
      }
      if (tileType !== 1) {
        stepCost *= weatherMoveCostMultiplier;
      }
      if (hasDynamicTileCosts) {
        const dynamicKey = `${nx},${nz}`;
        if (hazardTiles?.has?.(dynamicKey)) {
          stepCost *= Math.max(1, Number(hazardPenaltyByKey?.[dynamicKey] ?? hazardPenaltyMultiplier));
        }
        const trafficPenalty = Math.max(1, Number(trafficPenaltyByKey?.[dynamicKey] ?? 1));
        if (trafficPenalty > 1) {
          stepCost *= trafficPenalty;
        }
      }

      const tentative = gScore[current] + stepCost;
      if (tentative < gScore[nKey]) {
        cameFrom[nKey] = current;
        gScore[nKey] = tentative;
        open.push(nKey, tentative + Math.abs(nx - goalIx) + Math.abs(nz - goalIz));
      }
    }
  }

  return null;
}
