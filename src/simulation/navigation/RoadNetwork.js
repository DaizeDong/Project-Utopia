import { TILE } from "../../config/constants.js";
import { inBounds, toIndex } from "../../world/grid/Grid.js";

const ROAD_TILES = new Set([TILE.ROAD, TILE.BRIDGE, TILE.WAREHOUSE]);
const DIRS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

/**
 * Union-Find (Disjoint Set) with path compression and union by rank.
 * Tracks connected components of road/bridge/warehouse tiles.
 */
class UnionFind {
  constructor(n) {
    this.parent = new Int32Array(n);
    this.rank = new Uint8Array(n);
    this.size = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      this.parent[i] = i;
      this.size[i] = 1;
    }
  }

  find(x) {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
      this.size[rb] += this.size[ra];
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra;
      this.size[ra] += this.size[rb];
    } else {
      this.parent[rb] = ra;
      this.size[ra] += this.size[rb];
      this.rank[ra]++;
    }
    return true;
  }

  connected(a, b) {
    return this.find(a) === this.find(b);
  }

  componentSize(x) {
    return this.size[this.find(x)];
  }
}

/**
 * Road network connectivity graph built from the tile grid.
 * Lazily rebuilt when grid.version changes.
 */
export class RoadNetwork {
  constructor() {
    this._uf = null;
    this._gridVersion = -1;
    this._roadSet = null; // Set of flat indices that are road tiles
    this._warehouseIndices = null; // Array of flat indices for warehouses
    this._componentCount = 0;
    this._totalRoadTiles = 0;
  }

  /**
   * Rebuild the network if the grid has changed.
   * @param {object} grid - { tiles, width, height, version }
   */
  rebuild(grid) {
    if (this._gridVersion === grid.version) return;
    this._gridVersion = grid.version;

    const { tiles, width, height } = grid;
    const n = width * height;
    const uf = new UnionFind(n);
    const roadSet = new Set();
    const warehouseIndices = [];
    let components = 0;

    for (let iz = 0; iz < height; iz++) {
      for (let ix = 0; ix < width; ix++) {
        const idx = toIndex(ix, iz, width);
        const t = tiles[idx];
        if (!ROAD_TILES.has(t)) continue;
        roadSet.add(idx);
        if (t === TILE.WAREHOUSE) warehouseIndices.push(idx);

        for (const d of DIRS) {
          const nx = ix + d.x;
          const nz = iz + d.z;
          if (!inBounds(nx, nz, grid)) continue;
          const nIdx = toIndex(nx, nz, width);
          if (roadSet.has(nIdx)) {
            uf.union(idx, nIdx);
          }
        }
      }
    }

    // Count distinct components
    const roots = new Set();
    for (const idx of roadSet) {
      roots.add(uf.find(idx));
    }
    components = roots.size;

    this._uf = uf;
    this._roadSet = roadSet;
    this._warehouseIndices = warehouseIndices;
    this._componentCount = components;
    this._totalRoadTiles = roadSet.size;
  }

  /**
   * Check if two tiles are connected by the road network.
   * Both tiles must be road/bridge/warehouse tiles.
   */
  areConnected(ix1, iz1, ix2, iz2, grid) {
    this.rebuild(grid);
    const idx1 = toIndex(ix1, iz1, grid.width);
    const idx2 = toIndex(ix2, iz2, grid.width);
    if (!this._roadSet.has(idx1) || !this._roadSet.has(idx2)) return false;
    return this._uf.connected(idx1, idx2);
  }

  /**
   * Check if a tile is connected to any warehouse via road network.
   * Returns the warehouse index or -1.
   */
  connectedWarehouse(ix, iz, grid) {
    this.rebuild(grid);
    const idx = toIndex(ix, iz, grid.width);
    if (!this._roadSet.has(idx)) return -1;
    for (const wIdx of this._warehouseIndices) {
      if (this._uf.connected(idx, wIdx)) return wIdx;
    }
    return -1;
  }

  /**
   * Check if a non-road tile is adjacent (Manhattan distance 1) to a road
   * tile that is connected to a warehouse.
   */
  isAdjacentToConnectedRoad(ix, iz, grid) {
    this.rebuild(grid);
    for (const d of DIRS) {
      const nx = ix + d.x;
      const nz = iz + d.z;
      if (!inBounds(nx, nz, grid)) continue;
      const nIdx = toIndex(nx, nz, grid.width);
      if (!this._roadSet.has(nIdx)) continue;
      for (const wIdx of this._warehouseIndices) {
        if (this._uf.connected(nIdx, wIdx)) return true;
      }
    }
    return false;
  }

  /**
   * Get the size of the road component containing the given tile.
   * Returns 0 if the tile is not a road tile.
   */
  getComponentSize(ix, iz, grid) {
    this.rebuild(grid);
    const idx = toIndex(ix, iz, grid.width);
    if (!this._roadSet.has(idx)) return 0;
    return this._uf.componentSize(idx);
  }

  /**
   * Get road network stats for diagnostics.
   */
  get stats() {
    return {
      totalRoadTiles: this._totalRoadTiles,
      componentCount: this._componentCount,
      warehouseCount: this._warehouseIndices?.length ?? 0,
      gridVersion: this._gridVersion,
    };
  }

  /**
   * Check if the given flat index is a road tile.
   */
  isRoadTile(idx) {
    return this._roadSet?.has(idx) ?? false;
  }
}
