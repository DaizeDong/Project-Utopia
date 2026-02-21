import { MOVE_DIRECTIONS_4, TILE_INFO } from "../../config/constants.js";
import { inBounds, toIndex } from "../../world/grid/Grid.js";

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
 */
export function aStar(grid, start, goal, weatherMoveCostMultiplier = 1) {
  const width = grid.width;
  const height = grid.height;
  const startKey = toIndex(start.ix, start.iz, width);
  const goalKey = toIndex(goal.ix, goal.iz, width);

  if (startKey === goalKey) return [start];

  const open = new MinHeap();
  const cameFrom = new Int32Array(width * height).fill(-1);
  const gScore = new Float32Array(width * height);
  gScore.fill(Infinity);

  gScore[startKey] = 0;
  open.push(startKey, heuristic(start, goal));

  while (!open.isEmpty()) {
    const current = open.pop();
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
      const tileType = grid.tiles[nKey];
      const tileInfo = TILE_INFO[tileType];
      if (!tileInfo.passable) continue;

      let stepCost = tileInfo.baseCost;
      if (tileType !== 1) {
        stepCost *= weatherMoveCostMultiplier;
      }

      const tentative = gScore[current] + stepCost;
      if (tentative < gScore[nKey]) {
        cameFrom[nKey] = current;
        gScore[nKey] = tentative;
        open.push(nKey, tentative + heuristic({ ix: nx, iz: nz }, goal));
      }
    }
  }

  return null;
}
