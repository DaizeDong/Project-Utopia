import { DEFAULT_GRID, TILE, TILE_INFO } from "../../config/constants.js";

export function createInitialGrid() {
  const { width, height, tileSize } = DEFAULT_GRID;
  const tiles = new Uint8Array(width * height);
  tiles.fill(TILE.GRASS);

  for (let x = 4; x < width - 4; x += 1) {
    tiles[toIndex(x, Math.floor(height / 2), width)] = TILE.ROAD;
  }
  for (let z = 3; z < height - 3; z += 1) {
    tiles[toIndex(Math.floor(width / 2), z, width)] = TILE.ROAD;
  }

  // river stripe to force bridge-like pathing choices later.
  for (let z = 6; z < height - 6; z += 1) {
    if (z % 3 !== 0) {
      tiles[toIndex(8, z, width)] = TILE.WATER;
    }
  }

  return {
    width,
    height,
    tileSize,
    tiles,
    version: 1,
  };
}

export function toIndex(ix, iz, width) {
  return ix + iz * width;
}

export function inBounds(ix, iz, grid) {
  return ix >= 0 && iz >= 0 && ix < grid.width && iz < grid.height;
}

export function worldToTile(x, z, grid) {
  const ix = Math.floor(x / grid.tileSize + grid.width / 2);
  const iz = Math.floor(z / grid.tileSize + grid.height / 2);
  return { ix, iz };
}

export function tileToWorld(ix, iz, grid) {
  return {
    x: (ix - grid.width / 2 + 0.5) * grid.tileSize,
    z: (iz - grid.height / 2 + 0.5) * grid.tileSize,
  };
}

export function getTile(grid, ix, iz) {
  if (!inBounds(ix, iz, grid)) return TILE.WALL;
  return grid.tiles[toIndex(ix, iz, grid.width)];
}

export function setTile(grid, ix, iz, tileType) {
  if (!inBounds(ix, iz, grid)) return false;
  const idx = toIndex(ix, iz, grid.width);
  if (grid.tiles[idx] === tileType) return false;
  grid.tiles[idx] = tileType;
  grid.version += 1;
  return true;
}

export function isPassable(grid, ix, iz) {
  const tile = getTile(grid, ix, iz);
  return TILE_INFO[tile].passable;
}

export function countTilesByType(grid, targetTileTypes) {
  const asSet = new Set(targetTileTypes);
  let count = 0;
  for (let i = 0; i < grid.tiles.length; i += 1) {
    if (asSet.has(grid.tiles[i])) count += 1;
  }
  return count;
}

export function listTilesByType(grid, targetTileTypes) {
  const out = [];
  const asSet = new Set(targetTileTypes);
  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      const t = grid.tiles[toIndex(ix, iz, grid.width)];
      if (asSet.has(t)) out.push({ ix, iz });
    }
  }
  return out;
}

export function findNearestTileOfTypes(grid, from, targetTileTypes) {
  const { ix: sx, iz: sz } = worldToTile(from.x, from.z, grid);
  let best = null;
  let bestD = Infinity;
  const asSet = new Set(targetTileTypes);

  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      const t = grid.tiles[toIndex(ix, iz, grid.width)];
      if (!asSet.has(t)) continue;
      const d = Math.abs(ix - sx) + Math.abs(iz - sz);
      if (d < bestD) {
        bestD = d;
        best = { ix, iz };
      }
    }
  }

  return best;
}

export function randomPassableTile(grid, random = Math.random) {
  for (let tries = 0; tries < 2000; tries += 1) {
    const ix = Math.floor(random() * grid.width);
    const iz = Math.floor(random() * grid.height);
    if (isPassable(grid, ix, iz)) return { ix, iz };
  }
  return { ix: Math.floor(grid.width / 2), iz: Math.floor(grid.height / 2) };
}

export function rebuildBuildingStats(grid) {
  return {
    warehouses: countTilesByType(grid, [TILE.WAREHOUSE]),
    farms: countTilesByType(grid, [TILE.FARM]),
    lumbers: countTilesByType(grid, [TILE.LUMBER]),
    walls: countTilesByType(grid, [TILE.WALL]),
  };
}
