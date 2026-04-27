import { DEFAULT_GRID, TILE, TILE_INFO } from "../../config/constants.js";
import { BALANCE } from "../../config/balance.js";

export const MAP_TEMPLATES = Object.freeze([
  {
    id: "temperate_plains",
    name: "Temperate Plains",
    description: "Balanced starter plains where the first roads and warehouse decide how fast the colony can spread.",
    tags: ["starter", "balanced", "logistics"],
  },
  {
    id: "rugged_highlands",
    name: "Rugged Highlands",
    description: "Broken highland basins with rough traversal and hard chokepoints; every route you open also becomes a line you must hold.",
    tags: ["mountain", "chokepoint", "challenging"],
  },
  {
    id: "archipelago_isles",
    name: "Archipelago Isles",
    description: "Split island chains with narrow crossings; bridges and storage matter before the colony can expand.",
    tags: ["island", "bridges", "fragmented"],
  },
  {
    id: "coastal_ocean",
    name: "Coastal Ocean",
    description: "A coastline of deep water and narrow land bridges; the first harbor routes decide whether the colony connects.",
    tags: ["ocean", "coastal", "navigation"],
  },
  {
    id: "fertile_riverlands",
    name: "Fertile Riverlands",
    description: "Rich floodplains with fast food growth, but the opening haul lines have to stay open or the river becomes a bottleneck.",
    tags: ["fertile", "river", "throughput"],
  },
  {
    id: "fortified_basin",
    name: "Fortified Basin",
    description: "A defended interior basin with natural gates; the opening build is about sealing pressure, not just growing outward.",
    tags: ["defense", "fortified", "walls"],
  },
]);

export const DEFAULT_MAP_TEMPLATE_ID = MAP_TEMPLATES[0].id;
const DEFAULT_MAP_SEED = 1337;
const TILE_LIST_CACHE = new WeakMap();
const NEIGHBORS_4 = Object.freeze([
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
]);
const TILE_EMPTY_SENTINEL = 255;

export const TERRAIN_WALL_MODES = Object.freeze(["none", "border", "spokes", "fortress"]);
export const TERRAIN_OCEAN_SIDES = Object.freeze(["none", "north", "south", "east", "west"]);

const TEMPLATE_PROFILES = Object.freeze({
  temperate_plains: Object.freeze({
    waterLevel: 0.16,
    riverCount: 1,
    riverWidth: 2.2,
    riverAmp: 0.12,
    riverVertical: false,
    roadHubs: 14,
    roadJitter: 0.24,
    sideRoads: 15,
    farmBlobs: 5,
    lumberBlobs: 3,
    quarryBlobs: 2,
    herbGardenBlobs: 2,
    ruinsBlobs: 3,
    wallMode: "none",
    edgeWaterBoost: 0.02,
    valleyFactor: 0.16,
    islandBias: 0.03,
    oceanBias: 0,
    oceanSide: "none",
    mountainStrength: 0.08,
    roadDensity: 0.72,
    settlementDensity: 0.78,
    validation: { waterMinRatio: 0.03, waterMaxRatio: 0.35, passableMin: 0.60, passableMax: 0.96, roadMinRatio: 0.02 },
  }),
  rugged_highlands: Object.freeze({
    waterLevel: 0.16,
    riverCount: 2,
    riverWidth: 1.6,
    riverAmp: 0.24,
    riverVertical: false,
    roadHubs: 10,
    roadJitter: 0.5,
    sideRoads: 8,
    farmBlobs: 5,
    lumberBlobs: 11,
    quarryBlobs: 2,
    herbGardenBlobs: 1,
    ruinsBlobs: 8,
    wallMode: "none",
    edgeWaterBoost: 0.01,
    valleyFactor: 0.08,
    islandBias: 0.02,
    oceanBias: 0,
    oceanSide: "none",
    mountainStrength: 0.52,
    roadDensity: 0.44,
    settlementDensity: 0.42,
    validation: { waterMinRatio: 0.04, waterMaxRatio: 0.50, passableMin: 0.10, passableMax: 0.94, roadMinRatio: 0.005 },
  }),
  archipelago_isles: Object.freeze({
    waterLevel: 0.22,
    riverCount: 1,
    riverWidth: 1.4,
    riverAmp: 0.28,
    riverVertical: false,
    roadHubs: 9,
    roadJitter: 0.54,
    sideRoads: 6,
    farmBlobs: 6,
    lumberBlobs: 6,
    quarryBlobs: 1,
    herbGardenBlobs: 1,
    ruinsBlobs: 7,
    wallMode: "none",
    edgeWaterBoost: 0.06,
    valleyFactor: 0.06,
    islandBias: 0.46,
    oceanBias: 0,
    oceanSide: "none",
    mountainStrength: 0.16,
    roadDensity: 0.24,
    settlementDensity: 0.45,
    validation: { waterMinRatio: 0.32, waterMaxRatio: 1.0, passableMin: 0.0, passableMax: 0.78, roadMinRatio: 0.0, farmMin: 0, lumberMin: 0, warehouseMin: 0 },
  }),
  coastal_ocean: Object.freeze({
    waterLevel: 0.27,
    riverCount: 0,
    riverWidth: 2.2,
    riverAmp: 0.12,
    riverVertical: true,
    roadHubs: 10,
    roadJitter: 0.34,
    sideRoads: 7,
    farmBlobs: 7,
    lumberBlobs: 6,
    quarryBlobs: 1,
    herbGardenBlobs: 1,
    ruinsBlobs: 5,
    wallMode: "none",
    edgeWaterBoost: 0.08,
    valleyFactor: 0.08,
    islandBias: 0.12,
    oceanBias: 0.33,
    oceanSide: "east",
    mountainStrength: 0.06,
    roadDensity: 0.22,
    settlementDensity: 0.5,
    validation: { waterMinRatio: 0.4, waterMaxRatio: 1.0, passableMin: 0.0, passableMax: 0.68, roadMinRatio: 0.0, farmMin: 0, lumberMin: 0, warehouseMin: 0 },
  }),
  fertile_riverlands: Object.freeze({
    waterLevel: 0.21,
    riverCount: 2,
    riverWidth: 2.8,
    riverAmp: 0.18,
    riverVertical: true,
    roadHubs: 15,
    roadJitter: 0.27,
    sideRoads: 16,
    farmBlobs: 6,
    lumberBlobs: 4,
    quarryBlobs: 1,
    herbGardenBlobs: 2,
    ruinsBlobs: 3,
    wallMode: "none",
    edgeWaterBoost: 0.025,
    valleyFactor: 0.2,
    islandBias: 0.03,
    oceanBias: 0,
    oceanSide: "none",
    mountainStrength: 0.1,
    roadDensity: 0.8,
    settlementDensity: 0.86,
    validation: { waterMinRatio: 0.03, waterMaxRatio: 0.45, passableMin: 0.45, passableMax: 0.96, roadMinRatio: 0.02 },
  }),
  fortified_basin: Object.freeze({
    waterLevel: 0.19,
    riverCount: 0,
    riverWidth: 1.9,
    riverAmp: 0.11,
    riverVertical: false,
    roadHubs: 8,
    roadJitter: 0.22,
    sideRoads: 6,
    farmBlobs: 4,
    lumberBlobs: 4,
    quarryBlobs: 1,
    herbGardenBlobs: 1,
    ruinsBlobs: 2,
    wallMode: "none",
    edgeWaterBoost: 0.02,
    valleyFactor: 0.2,
    islandBias: 0.04,
    oceanBias: 0,
    oceanSide: "none",
    mountainStrength: 0.22,
    roadDensity: 0.56,
    settlementDensity: 0.65,
    validation: { waterMinRatio: 0.0, waterMaxRatio: 0.40, passableMin: 0.35, passableMax: 0.95, roadMinRatio: 0.015 },
  }),
});

function tileTypeCacheKey(targetTileTypes) {
  return [...new Set(targetTileTypes)].sort((a, b) => a - b).join(",");
}

function getGridTileListCache(grid) {
  const cached = TILE_LIST_CACHE.get(grid);
  if (cached && cached.version === grid.version) return cached;
  const next = { version: grid.version, byKey: new Map() };
  TILE_LIST_CACHE.set(grid, next);
  return next;
}

function normalizeSeed(seed) {
  if (Number.isFinite(seed)) return (seed >>> 0) || DEFAULT_MAP_SEED;
  if (typeof seed === "string" && seed.trim().length > 0) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h || DEFAULT_MAP_SEED;
  }
  return DEFAULT_MAP_SEED;
}

function createRng(seed) {
  let s = normalizeSeed(seed);
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function hash2D(ix, iz, seed) {
  let h = seed >>> 0;
  h ^= Math.imul(ix | 0, 374761393) >>> 0;
  h ^= Math.imul(iz | 0, 668265263) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  h ^= h >>> 16;
  return h / 4294967295;
}

function valueNoise2D(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const fx = x - x0;
  const fz = z - z0;
  const sx = smoothstep(fx);
  const sz = smoothstep(fz);

  const n00 = hash2D(x0, z0, seed);
  const n10 = hash2D(x1, z0, seed);
  const n01 = hash2D(x0, z1, seed);
  const n11 = hash2D(x1, z1, seed);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sz);
}

function fbm2D(x, z, seed, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  let freq = 1;
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise2D(x * freq, z * freq, seed + i * 977) * amp;
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return norm > 0 ? sum / norm : 0;
}

function domainWarpedFbm(x, z, seed, warpAmp = 0.22) {
  const wx = fbm2D(x * 2.4 + 13.2, z * 2.4 - 9.7, seed + 101, 3, 2.15, 0.55) - 0.5;
  const wz = fbm2D(x * 2.4 - 7.1, z * 2.4 + 5.9, seed + 202, 3, 2.15, 0.55) - 0.5;
  return fbm2D(x + wx * warpAmp, z + wz * warpAmp, seed + 303, 5, 2.0, 0.5);
}

function recursiveWarp(x, z, seed, depth = 2, amp = 0.3) {
  let px = x, pz = z;
  for (let i = 0; i < depth; i += 1) {
    const wx = fbm2D(px * 2.2 + 13.2 + i * 5.3, pz * 2.2 - 9.7, seed + 101 + i * 400, 3, 2.1, 0.5) - 0.5;
    const wz = fbm2D(px * 2.2 - 7.1, pz * 2.2 + 5.9 + i * 4.1, seed + 202 + i * 400, 3, 2.1, 0.5) - 0.5;
    px = x + wx * amp;
    pz = z + wz * amp;
  }
  return fbm2D(px, pz, seed + 303, 5, 2.0, 0.5);
}

function worleyNoise(x, z, seed, cellSize = 1.0) {
  const cx = Math.floor(x / cellSize);
  const cz = Math.floor(z / cellSize);
  let minDist = 999;
  let secondDist = 999;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const ncx = cx + dx;
      const ncz = cz + dz;
      const px = (ncx + hash2D(ncx, ncz, seed + 1)) * cellSize;
      const pz = (ncz + hash2D(ncx, ncz, seed + 2)) * cellSize;
      const d = Math.hypot(x - px, z - pz);
      if (d < minDist) { secondDist = minDist; minDist = d; }
      else if (d < secondDist) { secondDist = d; }
    }
  }
  return { f1: minDist / cellSize, f2: secondDist / cellSize, edge: (secondDist - minDist) / cellSize };
}

function poissonDiskSample(width, height, minDist, rng, maxPoints = 200) {
  const cellSize = minDist / Math.SQRT2;
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);
  const grid = new Int32Array(gridW * gridH).fill(-1);
  const points = [];
  const active = [];

  function gridIdx(x, z) { return Math.floor(x / cellSize) + Math.floor(z / cellSize) * gridW; }

  const x0 = width * (0.3 + rng() * 0.4);
  const z0 = height * (0.3 + rng() * 0.4);
  points.push({ x: x0, z: z0 });
  active.push(0);
  grid[gridIdx(x0, z0)] = 0;

  while (active.length > 0 && points.length < maxPoints) {
    const ai = Math.floor(rng() * active.length);
    const pi = active[ai];
    const p = points[pi];
    let found = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const angle = rng() * Math.PI * 2;
      const r = minDist * (1 + rng());
      const nx = p.x + Math.cos(angle) * r;
      const nz = p.z + Math.sin(angle) * r;
      if (nx < 1 || nz < 1 || nx >= width - 1 || nz >= height - 1) continue;
      const gi = gridIdx(nx, nz);
      const gx = Math.floor(nx / cellSize);
      const gz = Math.floor(nz / cellSize);
      let ok = true;
      for (let dz = -2; dz <= 2 && ok; dz += 1) {
        for (let dx = -2; dx <= 2 && ok; dx += 1) {
          const cgx = gx + dx, cgz = gz + dz;
          if (cgx < 0 || cgz < 0 || cgx >= gridW || cgz >= gridH) continue;
          const ci = grid[cgx + cgz * gridW];
          if (ci >= 0 && Math.hypot(points[ci].x - nx, points[ci].z - nz) < minDist) ok = false;
        }
      }
      if (ok) {
        const ni = points.length;
        points.push({ x: nx, z: nz });
        active.push(ni);
        grid[gi] = ni;
        found = true;
        break;
      }
    }
    if (!found) active.splice(ai, 1);
  }
  return points;
}

function chooseWeighted(rng, weighted) {
  let total = 0;
  for (const item of weighted) total += Math.max(0, item.w);
  if (total <= 0) return weighted[weighted.length - 1]?.v ?? null;
  let t = rng() * total;
  for (const item of weighted) {
    t -= Math.max(0, item.w);
    if (t <= 0) return item.v;
  }
  return weighted[weighted.length - 1]?.v ?? null;
}

function toTileCoord(index, width) {
  const iz = Math.floor(index / width);
  const ix = index - iz * width;
  return { ix, iz };
}

function setTileRaw(tiles, width, height, ix, iz, tileType) {
  if (ix < 0 || iz < 0 || ix >= width || iz >= height) return;
  tiles[toIndex(ix, iz, width)] = tileType;
}

function drawLine(tiles, width, height, x0, z0, x1, z1, tileType, overwriteBlockSet = null) {
  let x = x0 | 0;
  let z = z0 | 0;
  const tx = x1 | 0;
  const tz = z1 | 0;
  const dx = Math.abs(tx - x);
  const sx = x < tx ? 1 : -1;
  const dz = -Math.abs(tz - z);
  const sz = z < tz ? 1 : -1;
  let err = dx + dz;

  while (true) {
    const idx = toIndex(x, z, width);
    if (!overwriteBlockSet || !overwriteBlockSet.has(tiles[idx])) {
      tiles[idx] = tileType;
    }
    if (x === tx && z === tz) break;
    const e2 = err * 2;
    if (e2 >= dz) {
      err += dz;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      z += sz;
    }
  }
}

function paintBlob(tiles, width, height, cx, cz, rx, rz, tileType, seed, overwrite = null) {
  const minX = Math.max(0, Math.floor(cx - rx - 1));
  const maxX = Math.min(width - 1, Math.ceil(cx + rx + 1));
  const minZ = Math.max(0, Math.floor(cz - rz - 1));
  const maxZ = Math.min(height - 1, Math.ceil(cz + rz + 1));

  for (let iz = minZ; iz <= maxZ; iz += 1) {
    for (let ix = minX; ix <= maxX; ix += 1) {
      const dx = (ix - cx) / Math.max(1e-5, rx);
      const dz = (iz - cz) / Math.max(1e-5, rz);
      const base = dx * dx + dz * dz;
      const jitter = (hash2D(ix, iz, seed) - 0.5) * 0.36;
      if (base + jitter > 1.0) continue;
      const idx = toIndex(ix, iz, width);
      if (overwrite && !overwrite.has(tiles[idx])) continue;
      tiles[idx] = tileType;
    }
  }
}

function getProfile(templateId) {
  return TEMPLATE_PROFILES[templateId] ?? TEMPLATE_PROFILES[DEFAULT_MAP_TEMPLATE_ID];
}

function clampInt(v, min, max) {
  return Math.round(clamp(v, min, max));
}

function normalizeWallMode(wallMode, fallback = "none") {
  return TERRAIN_WALL_MODES.includes(wallMode) ? wallMode : fallback;
}

function normalizeOceanSide(oceanSide, fallback = "none") {
  return TERRAIN_OCEAN_SIDES.includes(oceanSide) ? oceanSide : fallback;
}

function toNumberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function profileToTuning(profile) {
  return {
    waterLevel: profile.waterLevel,
    edgeWaterBoost: profile.edgeWaterBoost,
    valleyFactor: profile.valleyFactor,
    mountainStrength: profile.mountainStrength ?? 0,
    islandBias: profile.islandBias ?? 0,
    oceanBias: profile.oceanBias ?? 0,
    oceanSide: normalizeOceanSide(profile.oceanSide, "none"),
    riverCount: profile.riverCount,
    riverWidth: profile.riverWidth,
    riverAmp: profile.riverAmp,
    riverVertical: profile.riverVertical,
    roadDensity: profile.roadDensity ?? 0.5,
    settlementDensity: profile.settlementDensity ?? 0.6,
    roadJitter: profile.roadJitter,
    wallMode: normalizeWallMode(profile.wallMode, "none"),
  };
}

export function getTerrainTuningDefaults(templateId = DEFAULT_MAP_TEMPLATE_ID) {
  return profileToTuning(getProfile(templateId));
}

export function sanitizeTerrainTuning(tuning = {}, templateId = DEFAULT_MAP_TEMPLATE_ID) {
  const base = getTerrainTuningDefaults(templateId);
  const riverVerticalRaw = tuning.riverVertical;
  const riverVertical = riverVerticalRaw === true || riverVerticalRaw === false
    ? riverVerticalRaw
    : base.riverVertical;

  return {
    waterLevel: clamp(toNumberOr(tuning.waterLevel, base.waterLevel), 0.02, 0.58),
    edgeWaterBoost: clamp(toNumberOr(tuning.edgeWaterBoost, base.edgeWaterBoost), 0, 0.22),
    valleyFactor: clamp(toNumberOr(tuning.valleyFactor, base.valleyFactor), 0, 0.45),
    mountainStrength: clamp(toNumberOr(tuning.mountainStrength, base.mountainStrength), 0, 0.85),
    islandBias: clamp(toNumberOr(tuning.islandBias, base.islandBias), 0, 0.85),
    oceanBias: clamp(toNumberOr(tuning.oceanBias, base.oceanBias), 0, 0.85),
    oceanSide: normalizeOceanSide(tuning.oceanSide, base.oceanSide),
    riverCount: clampInt(toNumberOr(tuning.riverCount, base.riverCount), 0, 4),
    riverWidth: clamp(toNumberOr(tuning.riverWidth, base.riverWidth), 0.8, 6.5),
    riverAmp: clamp(toNumberOr(tuning.riverAmp, base.riverAmp), 0, 0.45),
    riverVertical,
    roadDensity: clamp(toNumberOr(tuning.roadDensity, base.roadDensity), 0, 1),
    settlementDensity: clamp(toNumberOr(tuning.settlementDensity, base.settlementDensity), 0, 1),
    roadJitter: clamp(toNumberOr(tuning.roadJitter, base.roadJitter), 0.05, 0.75),
    wallMode: normalizeWallMode(tuning.wallMode, base.wallMode),
  };
}

function deriveProfile(baseProfile, tuning) {
  const effective = {
    ...baseProfile,
    ...tuning,
  };
  effective.roadHubs = clampInt(4 + tuning.roadDensity * 14, 3, 22);
  effective.sideRoads = clampInt(tuning.roadDensity * 16, 0, 24);
  effective.farmBlobs = clampInt((baseProfile.farmBlobs ?? 8) * lerp(0.5, 1.7, tuning.settlementDensity), 2, 26);
  effective.lumberBlobs = clampInt((baseProfile.lumberBlobs ?? 8) * lerp(0.55, 1.65, tuning.settlementDensity), 2, 28);
  effective.quarryBlobs = clampInt((baseProfile.quarryBlobs ?? 1) * lerp(0.6, 1.5, tuning.settlementDensity), 1, 6);
  effective.herbGardenBlobs = clampInt((baseProfile.herbGardenBlobs ?? 1) * lerp(0.6, 1.5, tuning.settlementDensity), 1, 6);
  effective.ruinsBlobs = clampInt((baseProfile.ruinsBlobs ?? 4) * lerp(1.35, 0.45, tuning.settlementDensity), 1, 24);
  return effective;
}

function oceanEdgeFactor(ix, iz, width, height, side) {
  if (side === "north") return 1 - iz / Math.max(1, height - 1);
  if (side === "south") return iz / Math.max(1, height - 1);
  if (side === "west") return 1 - ix / Math.max(1, width - 1);
  if (side === "east") return ix / Math.max(1, width - 1);
  return 0;
}

function baseTerrainPass(tiles, width, height, seed, profile) {
  const area = width * height;
  const elevation = new Float32Array(area);
  const moisture = new Float32Array(area);
  const ridge = new Float32Array(area);
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;
  const invDiag = 1 / Math.max(1, Math.hypot(cx, cz));

  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      const n0 = domainWarpedFbm(nx * 2.25, nz * 2.25, seed + 11, 0.18);
      const n1 = domainWarpedFbm(nx * 4.8 + 5.1, nz * 4.8 - 3.3, seed + 29, 0.1);
      ridge[idx] = Math.abs((fbm2D(nx * 7.2 + 9.7, nz * 7.2 - 4.4, seed + 71, 3, 2.2, 0.5) * 2) - 1);
      const valley = 1 - Math.abs((Math.hypot(ix - cx, iz - cz) * invDiag) * 2 - 1);
      const mountainLift = ridge[idx] * profile.mountainStrength * 0.34;
      const mountainCompression = profile.mountainStrength * 0.11;
      elevation[idx] = clamp(n0 * 0.72 + n1 * 0.2 + valley * profile.valleyFactor + mountainLift - mountainCompression, 0, 1);
      moisture[idx] = clamp(fbm2D(nx * 3.4 - 1.3, nz * 3.4 + 0.7, seed + 47, 4, 2, 0.55), 0, 1);
    }
  }

  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      const edgeDx = Math.min(ix, width - 1 - ix) / Math.max(1, Math.floor(width * 0.18));
      const edgeDz = Math.min(iz, height - 1 - iz) / Math.max(1, Math.floor(height * 0.18));
      const edgeFactor = clamp(Math.min(edgeDx, edgeDz), 0, 1);
      const edgeWaterPenalty = (1 - edgeFactor) * profile.edgeWaterBoost;
      const wetness = moisture[idx] * 0.42 + (1 - ridge[idx]) * 0.24;
      const distNorm = Math.hypot(ix - cx, iz - cz) * invDiag;
      const islandPenalty = distNorm * profile.islandBias;
      const oceanPenalty = oceanEdgeFactor(ix, iz, width, height, profile.oceanSide) * profile.oceanBias;
      const threshold = profile.waterLevel - 0.1 + edgeWaterPenalty + islandPenalty + oceanPenalty - wetness * 0.12;
      tiles[idx] = elevation[idx] < threshold ? TILE.WATER : TILE.GRASS;
    }
  }

  return { elevation, moisture, ridge };
}
function carveRiver(tiles, width, height, profile, seed, riverIndex = 0) {
  const axisLen = profile.riverVertical ? height : width;
  const span = profile.riverVertical ? width : height;
  const baseCenter = span * (0.22 + ((riverIndex + 1) / (profile.riverCount + 1)) * 0.58);
  const phase = (seed % 1024) / 1024;
  const amp = span * profile.riverAmp;
  const widthMin = Math.max(1, Math.floor(profile.riverWidth));
  const widthMax = Math.max(widthMin + 1, Math.ceil(profile.riverWidth + 1.6));

  for (let t = 0; t < axisLen; t += 1) {
    const nt = t / Math.max(1, axisLen - 1);
    const sway = Math.sin((nt * 2.2 + phase) * Math.PI * 2) * amp;
    const localJitter = (hash2D(t + riverIndex * 97, t * 2 + 17, seed + 401) - 0.5) * (span * 0.08);
    const center = baseCenter + sway + localJitter;
    const widthNoise = hash2D(t + 91, riverIndex * 131 + 7, seed + 419);
    const half = lerp(widthMin, widthMax, widthNoise) * 0.5;
    const c = Math.round(center);
    const minK = Math.max(0, Math.floor(c - half));
    const maxK = Math.min(span - 1, Math.ceil(c + half));

    for (let k = minK; k <= maxK; k += 1) {
      if (profile.riverVertical) {
        setTileRaw(tiles, width, height, k, t, TILE.WATER);
      } else {
        setTileRaw(tiles, width, height, t, k, TILE.WATER);
      }
    }
  }
}

function findLandCandidates(tiles, width, height, maxCount, seed, minEdgeMargin = 3) {
  const out = [];
  for (let iz = minEdgeMargin; iz < height - minEdgeMargin; iz += 1) {
    for (let ix = minEdgeMargin; ix < width - minEdgeMargin; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] === TILE.WATER) continue;
      const r = hash2D(ix, iz, seed + 901);
      if (r < 0.12) out.push({ ix, iz, w: 0.12 + r * 0.88 });
    }
  }
  out.sort((a, b) => b.w - a.w);
  return out.slice(0, maxCount);
}

function pickHub(candidates, used, minDistanceSq, rng) {
  if (candidates.length === 0) return null;
  const shuffled = candidates.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const c of shuffled) {
    let ok = true;
    for (const u of used) {
      const dx = c.ix - u.ix;
      const dz = c.iz - u.iz;
      if (dx * dx + dz * dz < minDistanceSq) {
        ok = false;
        break;
      }
    }
    if (ok) return c;
  }
  return shuffled[0];
}

function writeRoadCell(tiles, width, height, ix, iz) {
  if (ix < 0 || iz < 0 || ix >= width || iz >= height) return;
  const idx = toIndex(ix, iz, width);
  const current = tiles[idx];
  if (current === TILE.WALL || current === TILE.WATER) return;
  tiles[idx] = TILE.ROAD;
}

function drawOrganicRoad(tiles, width, height, from, to, rng, jitter = 0.3) {
  let cx = from.ix | 0;
  let cz = from.iz | 0;
  const tx = to.ix | 0;
  const tz = to.iz | 0;
  const initialDist = Math.abs(tx - cx) + Math.abs(tz - cz);
  const maxSteps = Math.max(48, initialDist * 5 + 96);
  let steps = 0;
  let bestDist = initialDist;
  let staleSteps = 0;

  while ((cx !== tx || cz !== tz) && steps < maxSteps) {
    writeRoadCell(tiles, width, height, cx, cz);
    steps += 1;

    const dx = tx - cx;
    const dz = tz - cz;
    const absX = Math.abs(dx);
    const absZ = Math.abs(dz);
    const directionalBias = absX > absZ ? "x" : "z";

    const move = chooseWeighted(rng, [
      { v: "x", w: directionalBias === "x" ? 3.2 : 1.8 },
      { v: "z", w: directionalBias === "z" ? 3.2 : 1.8 },
      { v: "noise", w: jitter * 2.2 },
    ]);

    if (move === "x") {
      cx += dx > 0 ? 1 : dx < 0 ? -1 : 0;
    } else if (move === "z") {
      cz += dz > 0 ? 1 : dz < 0 ? -1 : 0;
    } else {
      const n = Math.floor(rng() * 4);
      if (n === 0) cx += 1;
      if (n === 1) cx -= 1;
      if (n === 2) cz += 1;
      if (n === 3) cz -= 1;
    }

    cx = clamp(cx, 0, width - 1);
    cz = clamp(cz, 0, height - 1);

    const dist = Math.abs(tx - cx) + Math.abs(tz - cz);
    if (dist < bestDist) {
      bestDist = dist;
      staleSteps = 0;
    } else {
      staleSteps += 1;
    }
    if (staleSteps > 34 && steps > 56) break;
  }

  writeRoadCell(tiles, width, height, tx, tz);
}

function softenRoadEdges(tiles, width, height) {
  for (let iz = 1; iz < height - 1; iz += 1) {
    for (let ix = 1; ix < width - 1; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.ROAD) continue;
      let roadNeighbors = 0;
      for (const n of NEIGHBORS_4) {
        if (tiles[toIndex(ix + n.x, iz + n.z, width)] === TILE.ROAD) roadNeighbors += 1;
      }
      if (roadNeighbors <= 1 && hash2D(ix, iz, width * 13 + height * 17) > 0.55) {
        tiles[idx] = TILE.GRASS;
      }
    }
  }
}

function trimRoadOverflow(tiles, width, height, profile, seed) {
  const area = width * height;
  let roadCount = countTileInternal(tiles, new Set([TILE.ROAD]));
  const waterCount = countTileInternal(tiles, new Set([TILE.WATER]));
  const waterRatio = waterCount / Math.max(1, area);

  const minRoads = Math.max(40, Math.round(area * 0.02));
  const targetRoadRatio = clamp(0.035 + (profile.roadDensity ?? 0.5) * 0.14 - waterRatio * 0.2, 0.03, 0.19);
  const maxRoads = Math.max(minRoads, Math.round(area * targetRoadRatio));
  if (roadCount <= maxRoads) return;

  const candidates = [];
  for (let iz = 1; iz < height - 1; iz += 1) {
    for (let ix = 1; ix < width - 1; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.ROAD) continue;

      let roadNeighbors = 0;
      let waterNeighbors = 0;
      let warehouseNeighbors = 0;
      for (const n of NEIGHBORS_4) {
        const t = tiles[toIndex(ix + n.x, iz + n.z, width)];
        if (t === TILE.ROAD) roadNeighbors += 1;
        if (t === TILE.WATER) waterNeighbors += 1;
        if (t === TILE.WAREHOUSE) warehouseNeighbors += 1;
      }
      if (warehouseNeighbors > 0) continue;

      const keepScore = roadNeighbors * 1.4 + waterNeighbors * 1.8 + hash2D(ix, iz, seed + 3901) * 0.6;
      candidates.push({ ix, iz, keepScore });
    }
  }

  candidates.sort((a, b) => a.keepScore - b.keepScore);
  for (const c of candidates) {
    if (roadCount <= maxRoads) break;
    const idx = toIndex(c.ix, c.iz, width);
    if (tiles[idx] !== TILE.ROAD) continue;
    tiles[idx] = TILE.GRASS;
    roadCount -= 1;
  }
}

function placeWarehouses(tiles, width, height, hubs, rng) {
  let placed = 0;
  for (const hub of hubs) {
    const ix = clamp(hub.ix + Math.floor((rng() - 0.5) * 3), 1, width - 2);
    const iz = clamp(hub.iz + Math.floor((rng() - 0.5) * 3), 1, height - 2);
    const idx = toIndex(ix, iz, width);
    if (tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL) continue;
    tiles[idx] = TILE.WAREHOUSE;
    drawLine(tiles, width, height, hub.ix, hub.iz, ix, iz, TILE.ROAD, new Set([TILE.WALL, TILE.WATER]));
    placed += 1;
    if (placed >= 3) break;
  }
}

function pickDistrictCenter(tiles, width, height, seed, matcher) {
  let best = null;
  let bestScore = -Infinity;
  for (let iz = 2; iz < height - 2; iz += 1) {
    for (let ix = 2; ix < width - 2; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL || tiles[idx] === TILE.WAREHOUSE) continue;
      const s = matcher(ix, iz, idx);
      if (s <= bestScore) continue;
      const jitter = hash2D(ix, iz, seed + 1171) * 0.17;
      const score = s + jitter;
      if (score > bestScore) {
        bestScore = score;
        best = { ix, iz };
      }
    }
  }
  return best;
}

// Minimum-distance spread between same-type blob centers. Blobs of the same
// tile type that land within BLOB_MIN_SPREAD tiles of an already-placed center
// are skipped to prevent all blobs from piling up at the same map edge.
const BLOB_MIN_SPREAD = 12;

function placeDistrictBlobs(tiles, width, height, count, tileType, seed, pickCenter, minRadius = 2.4, maxRadius = 5.1) {
  const overwrite = new Set([TILE.GRASS, TILE.ROAD, TILE.RUINS, TILE.FARM, TILE.LUMBER]);
  // Accumulate centers of already-painted blobs so subsequent picks can
  // check distance and skip candidates that are too close.
  const placedCenters = [];
  for (let i = 0; i < count; i += 1) {
    const center = pickCenter(i);
    if (!center) continue;

    // Reject centers that are too close to an existing blob of the same type.
    // Using 0.5x BLOB_MIN_SPREAD (6 tiles) as the hard veto threshold prevents
    // visible overlap/merger between adjacent blobs of the same type.
    let tooClose = false;
    for (const pc of placedCenters) {
      const dx = center.ix - pc.ix;
      const dz = center.iz - pc.iz;
      if (dx * dx + dz * dz < BLOB_MIN_SPREAD * BLOB_MIN_SPREAD * 0.25) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    placedCenters.push({ ix: center.ix, iz: center.iz });
    const r0 = lerp(minRadius, maxRadius, hash2D(center.ix + i * 13, center.iz + i * 7, seed + 1409));
    const r1 = r0 * lerp(0.74, 1.28, hash2D(center.ix + i * 19, center.iz + i * 11, seed + 1423));
    paintBlob(tiles, width, height, center.ix, center.iz, r0, r1, tileType, seed + i * 17, overwrite);
  }
}

function carveBridgesOnMainAxis(tiles, width, height, profile, seed) {
  const step = Math.max(8, Math.floor((profile.riverVertical ? height : width) / 6));
  const start = Math.max(4, Math.floor(step * 0.65));
  const MAX_BRIDGE_SPAN = 14;

  const tryBridgeLine = (indices) => {
    let segStart = -1;
    let segLen = 0;
    let bestSegStart = -1;
    let bestSegLen = 0;

    for (let i = 0; i <= indices.length; i += 1) {
      const isWater = i < indices.length && tiles[indices[i]] === TILE.WATER;
      if (isWater) {
        if (segStart < 0) segStart = i;
        segLen += 1;
      } else {
        if (segLen >= 2 && segLen <= MAX_BRIDGE_SPAN) {
          if (bestSegLen === 0 || segLen < bestSegLen) {
            bestSegStart = segStart;
            bestSegLen = segLen;
          }
        }
        segStart = -1;
        segLen = 0;
      }
    }

    if (bestSegLen >= 2) {
      for (let i = bestSegStart; i < bestSegStart + bestSegLen; i += 1) {
        tiles[indices[i]] = TILE.BRIDGE;
      }
    }
  };

  if (profile.riverVertical) {
    for (let z = start; z < height - start; z += step) {
      const indices = [];
      for (let x = 0; x < width; x += 1) indices.push(toIndex(x, z, width));
      tryBridgeLine(indices);
    }
  } else {
    for (let x = start; x < width - start; x += step) {
      const indices = [];
      for (let z = 0; z < height; z += 1) indices.push(toIndex(x, z, width));
      tryBridgeLine(indices);
    }
  }

  for (let iz = 1; iz < height - 1; iz += 1) {
    for (let ix = 1; ix < width - 1; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.BRIDGE) continue;
      if (hash2D(ix, iz, seed + 2003) < 0.1) {
        if (tiles[toIndex(ix + 1, iz, width)] === TILE.WATER) tiles[toIndex(ix + 1, iz, width)] = TILE.BRIDGE;
        if (tiles[toIndex(ix - 1, iz, width)] === TILE.WATER) tiles[toIndex(ix - 1, iz, width)] = TILE.BRIDGE;
        if (tiles[toIndex(ix, iz + 1, width)] === TILE.WATER) tiles[toIndex(ix, iz + 1, width)] = TILE.BRIDGE;
        if (tiles[toIndex(ix, iz - 1, width)] === TILE.WATER) tiles[toIndex(ix, iz - 1, width)] = TILE.BRIDGE;
      }
    }
  }
}
function applyWalls(tiles, width, height, profile, seed) {
  const cx = Math.floor(width / 2);
  const cz = Math.floor(height / 2);
  const block = new Set([TILE.WAREHOUSE, TILE.WATER]);

  if (profile.wallMode === "none") return;

  if (profile.wallMode === "border") {
    const margin = Math.max(2, Math.floor(Math.min(width, height) * 0.045));
    for (let x = margin; x < width - margin; x += 1) {
      if (x % 9 === 0 || x % 11 === 0) continue;
      setTileRaw(tiles, width, height, x, margin, TILE.WALL);
      setTileRaw(tiles, width, height, x, height - 1 - margin, TILE.WALL);
    }
    for (let z = margin; z < height - margin; z += 1) {
      if (z % 9 === 0 || z % 11 === 0) continue;
      setTileRaw(tiles, width, height, margin, z, TILE.WALL);
      setTileRaw(tiles, width, height, width - 1 - margin, z, TILE.WALL);
    }
  }

  if (profile.wallMode === "spokes") {
    const rays = 6;
    const radius = Math.min(width, height) * 0.38;
    for (let i = 0; i < rays; i += 1) {
      const a = (i / rays) * Math.PI * 2 + hash2D(i, rays, seed + 2501) * 0.28;
      const x = clamp(Math.round(cx + Math.cos(a) * radius), 1, width - 2);
      const z = clamp(Math.round(cz + Math.sin(a) * radius), 1, height - 2);
      drawLine(tiles, width, height, cx, cz, x, z, TILE.WALL, block);
    }
  }

  if (profile.wallMode === "fortress") {
    const rx = Math.max(8, Math.floor(width * 0.2));
    const rz = Math.max(7, Math.floor(height * 0.2));
    for (let z = cz - rz - 1; z <= cz + rz + 1; z += 1) {
      for (let x = cx - rx - 1; x <= cx + rx + 1; x += 1) {
        if (x < 1 || z < 1 || x >= width - 1 || z >= height - 1) continue;
        const dx = (x - cx) / Math.max(1, rx);
        const dz = (z - cz) / Math.max(1, rz);
        const d = Math.abs(dx * dx + dz * dz - 1);
        if (d > 0.13) continue;
        const idx = toIndex(x, z, width);
        if (!block.has(tiles[idx])) tiles[idx] = TILE.WALL;
      }
    }
  }

  const gates = [
    { x: cx, z: 2 },
    { x: cx, z: height - 3 },
    { x: 2, z: cz },
    { x: width - 3, z: cz },
  ];
  for (const g of gates) {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = g.x + dx;
        const z = g.z + dz;
        if (x < 0 || z < 0 || x >= width || z >= height) continue;
        const idx = toIndex(x, z, width);
        if (tiles[idx] === TILE.WALL) tiles[idx] = TILE.ROAD;
      }
    }
  }
}

function ensureMinimumInfrastructure(tiles, width, height, seed) {
  const area = width * height;
  const minRoads = Math.max(80, Math.round(area * 0.05));
  const minFarm = 2;
  const minLumber = 2;
  const minWarehouse = 1;

  let roads = 0;
  let farms = 0;
  let lumbers = 0;
  let warehouses = 0;
  const roadCandidates = [];
  const farmCandidates = [];
  const lumberCandidates = [];
  const warehouseCandidates = [];

  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i];
    if (t === TILE.ROAD) roads += 1;
    if (t === TILE.FARM) farms += 1;
    if (t === TILE.LUMBER) lumbers += 1;
    if (t === TILE.WAREHOUSE) warehouses += 1;
    if (t === TILE.GRASS || t === TILE.RUINS) {
      const c = toTileCoord(i, width);
      const h = hash2D(c.ix, c.iz, seed + 2801);
      if (h > 0.4) roadCandidates.push(c);
      if (h > 0.2) farmCandidates.push(c);
      if (h > 0.15) lumberCandidates.push(c);
      if (h > 0.55) warehouseCandidates.push(c);
    }
  }

  const center = { ix: Math.floor(width / 2), iz: Math.floor(height / 2) };
  if (warehouseCandidates.length === 0) warehouseCandidates.push(center);
  if (farmCandidates.length === 0) farmCandidates.push(center);
  if (lumberCandidates.length === 0) lumberCandidates.push(center);
  if (roadCandidates.length === 0) roadCandidates.push(center);

  let cursor = 0;
  while (roads < minRoads && cursor < roadCandidates.length) {
    const c = roadCandidates[cursor];
    cursor += 1;
    const idx = toIndex(c.ix, c.iz, width);
    if (tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL) continue;
    tiles[idx] = TILE.ROAD;
    roads += 1;
  }

  cursor = 0;
  const _farmCx = Math.floor(width / 2);
  const _farmCz = Math.floor(height / 2);
  while (farms < minFarm && cursor < farmCandidates.length) {
    const c = farmCandidates[cursor];
    cursor += 1;
    // Skip tiles within 10 tiles of center — mirrors the radialZoneBias hard
    // exclusion zone so fallback farms don't land at the spawn point.
    const _fdx = c.ix - _farmCx;
    const _fdz = c.iz - _farmCz;
    if (_fdx * _fdx + _fdz * _fdz < 10 * 10) continue;
    const idx = toIndex(c.ix, c.iz, width);
    if (tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL || tiles[idx] === TILE.WAREHOUSE) continue;
    tiles[idx] = TILE.FARM;
    farms += 1;
  }

  cursor = 0;
  while (lumbers < minLumber && cursor < lumberCandidates.length) {
    const c = lumberCandidates[cursor];
    cursor += 1;
    const idx = toIndex(c.ix, c.iz, width);
    if (tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL || tiles[idx] === TILE.WAREHOUSE) continue;
    tiles[idx] = TILE.LUMBER;
    lumbers += 1;
  }

  cursor = 0;
  while (warehouses < minWarehouse && cursor < warehouseCandidates.length) {
    const c = warehouseCandidates[cursor];
    cursor += 1;
    const idx = toIndex(c.ix, c.iz, width);
    if (tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL) continue;
    tiles[idx] = TILE.WAREHOUSE;
    warehouses += 1;
  }

  if (warehouses < minWarehouse) {
    const cx = Math.floor(width / 2);
    const cz = Math.floor(height / 2);
    for (let r = 0; r < Math.max(width, height); r += 1) {
      let placed = false;
      for (let dz = -r; dz <= r; dz += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const ix = cx + dx;
          const iz = cz + dz;
          if (ix < 0 || iz < 0 || ix >= width || iz >= height) continue;
          const idx = toIndex(ix, iz, width);
          if (tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL) continue;
          tiles[idx] = TILE.WAREHOUSE;
          warehouses += 1;
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (placed) break;
    }
  }

  const sx = clamp(10, 1, width - 2);
  const sz = clamp(10, 1, height - 2);
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const ix = sx + dx;
      const iz = sz + dz;
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] === TILE.WALL) continue;
      if (tiles[idx] === TILE.WATER) tiles[idx] = TILE.GRASS;
    }
  }
  tiles[toIndex(sx, sz, width)] = TILE.GRASS;
}

function countTileInternal(tiles, typeSet) {
  let c = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    if (typeSet.has(tiles[i])) c += 1;
  }
  return c;
}

function finalizeTileCoverage(tiles) {
  let emptyBaseTiles = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i] !== TILE_EMPTY_SENTINEL) continue;
    emptyBaseTiles += 1;
    tiles[i] = TILE.GRASS;
  }
  return emptyBaseTiles;
}

function generateArchipelagoTerrain(tiles, width, height, seed, profile) {
  const area = width * height;
  const elevation = new Float32Array(area);
  const moisture = new Float32Array(area);
  const ridge = new Float32Array(area);

  // Fill everything with water first
  tiles.fill(TILE.WATER);

  const rng = createRng(seed + 7001);
  const islandCount = Math.max(4, Math.min(9, Math.round(Math.min(width, height) / 12)));
  const cx = width / 2;
  const cz = height / 2;

  // Generate island centers with minimum spacing
  const islands = [];
  const minSpacing = Math.max(10, Math.min(width, height) * 0.14);
  for (let attempt = 0; attempt < islandCount * 20 && islands.length < islandCount; attempt += 1) {
    const ix = Math.floor(rng() * (width - 12) + 6);
    const iz = Math.floor(rng() * (height - 12) + 6);
    let tooClose = false;
    for (const existing of islands) {
      const dx = ix - existing.x;
      const dz = iz - existing.z;
      if (Math.sqrt(dx * dx + dz * dz) < minSpacing) { tooClose = true; break; }
    }
    if (tooClose) continue;
    const distFromCenter = Math.sqrt((ix - cx) * (ix - cx) + (iz - cz) * (iz - cz));
    const maxDim = Math.max(width, height) * 0.42;
    if (distFromCenter > maxDim) continue;
    islands.push({ x: ix, z: iz, idx: islands.length });
  }

  // Ensure at least one central island
  if (islands.length === 0) {
    islands.push({ x: Math.floor(cx), z: Math.floor(cz), idx: 0 });
  }

  // Sort by distance to center — first island is main (largest)
  islands.sort((a, b) => {
    const da = Math.hypot(a.x - cx, a.z - cz);
    const db = Math.hypot(b.x - cx, b.z - cz);
    return da - db;
  });

  // Paint islands with domain-warped shapes for organic coastlines
  for (let i = 0; i < islands.length; i += 1) {
    const isl = islands[i];
    const baseRadius = i === 0
      ? Math.max(10, Math.min(width, height) * 0.18)
      : lerp(5, Math.min(width, height) * 0.13, rng());
    const rx = baseRadius * lerp(0.75, 1.35, rng());
    const rz = baseRadius * lerp(0.75, 1.35, rng());
    // Use noise-distorted distance for organic island shapes
    const islandSeed = seed + 7100 + i * 31;
    for (let iz2 = Math.max(0, Math.floor(isl.z - rz - 3)); iz2 <= Math.min(height - 1, Math.ceil(isl.z + rz + 3)); iz2 += 1) {
      for (let ix2 = Math.max(0, Math.floor(isl.x - rx - 3)); ix2 <= Math.min(width - 1, Math.ceil(isl.x + rx + 3)); ix2 += 1) {
        const dx = (ix2 - isl.x) / Math.max(1, rx);
        const dz = (iz2 - isl.z) / Math.max(1, rz);
        const baseDist = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dz, dx);
        const wobble = fbm2D(angle * 4.0, baseDist * 3.0, islandSeed, 3, 2.0, 0.5) * 0.3;
        if (baseDist + wobble < 1.0) {
          tiles[toIndex(ix2, iz2, width)] = TILE.GRASS;
        }
      }
    }
  }

  // Connect some island pairs with narrow land strips (60%)
  for (let i = 1; i < islands.length; i += 1) {
    if (rng() > 0.6) continue;
    const from = islands[i];
    const to = islands[Math.floor(rng() * i)];
    const steps = Math.abs(from.x - to.x) + Math.abs(from.z - to.z);
    for (let t = 0; t <= steps; t += 1) {
      const frac = steps > 0 ? t / steps : 0;
      const bx = Math.round(lerp(from.x, to.x, frac));
      const bz = Math.round(lerp(from.z, to.z, frac));
      setTileRaw(tiles, width, height, bx, bz, TILE.GRASS);
      if (rng() > 0.5) setTileRaw(tiles, width, height, bx + (rng() > 0.5 ? 1 : 0), bz + (rng() > 0.5 ? 1 : 0), TILE.GRASS);
    }
  }

  // Compute elevation/moisture with terrain variation per island
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      if (tiles[idx] === TILE.WATER) {
        elevation[idx] = 0.08;
      } else {
        // Varied elevation within islands using recursive warping
        elevation[idx] = clamp(recursiveWarp(nx * 3.0, nz * 3.0, seed + 11, 2, 0.2) * 0.5 + 0.4, 0.2, 0.9);
      }
      moisture[idx] = clamp(domainWarpedFbm(nx * 3.0, nz * 3.0, seed + 47, 0.18), 0, 1);
      ridge[idx] = tiles[idx] === TILE.WATER ? 0 : fbm2D(nx * 5, nz * 5, seed + 71, 2, 2.0, 0.4) * 0.3;
    }
  }

  return { elevation, moisture, ridge };
}

function generateCoastlineTerrain(tiles, width, height, seed, profile) {
  const area = width * height;
  const elevation = new Float32Array(area);
  const moisture = new Float32Array(area);
  const ridge = new Float32Array(area);

  const side = profile.oceanSide || "east";
  const isVertical = side === "east" || side === "west";
  const isFlipped = side === "west" || side === "north";
  const rng = createRng(seed + 8100);

  // Domain-warped coastline for organic shape
  const axisLen = isVertical ? height : width;
  const crossLen = isVertical ? width : height;
  const coastBase = Math.floor(crossLen * (isFlipped ? 0.38 : 0.62));
  const coastline = new Float32Array(axisLen);

  for (let t = 0; t < axisLen; t += 1) {
    const nt = t / Math.max(1, axisLen - 1);
    // Multi-scale coastline with domain warping for organic fractal shape
    const warp = fbm2D(nt * 6.0, 2.0, seed + 7999, 2, 2.0, 0.5) * 0.15;
    const n1 = fbm2D((nt + warp) * 4.5, 0.5, seed + 8001, 4, 2.1, 0.5) - 0.5;
    const n2 = fbm2D((nt + warp) * 9.0, 1.5, seed + 8002, 3, 2.3, 0.45) - 0.5;
    const n3 = fbm2D((nt + warp) * 18.0, 3.5, seed + 8003, 2, 2.0, 0.4) - 0.5;
    const jag = n1 * crossLen * 0.20 + n2 * crossLen * 0.10 + n3 * crossLen * 0.04;
    coastline[t] = coastBase + jag;
  }

  // Fill tiles with domain-warped elevation for cliff terraces
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      const t = isVertical ? iz : ix;
      const cross = isVertical ? ix : iz;
      const coastPos = coastline[t];
      const distToCoast = isFlipped ? (cross - coastPos) : (coastPos - cross);

      const isOcean = distToCoast < 0;
      tiles[idx] = isOcean ? TILE.WATER : TILE.GRASS;

      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      if (isOcean) {
        elevation[idx] = 0.08;
      } else {
        // Cliff terraces: elevation rises steeply near coast, then plateaus
        const coastFrac = clamp(distToCoast / crossLen, 0, 1);
        const terrace = recursiveWarp(nx * 3.0, nz * 3.0, seed + 8050, 2, 0.2);
        elevation[idx] = clamp(coastFrac * 0.8 + terrace * 0.35, 0.15, 0.95);
      }
      // Moisture highest near coast, decreasing inland
      const coastDist = Math.abs(distToCoast) / crossLen;
      moisture[idx] = clamp(0.85 - coastDist * 0.6 + fbm2D(nx * 4, nz * 4, seed + 47, 3, 2, 0.5) * 0.25, 0, 1);
      ridge[idx] = isOcean ? 0 : clamp(fbm2D(nx * 6, nz * 6, seed + 71, 2, 2.2, 0.5) * 0.4, 0, 1);
    }
  }

  // Tidal pools: small water patches carved into land near coastline
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.GRASS) continue;
      const t = isVertical ? iz : ix;
      const cross = isVertical ? ix : iz;
      const distToCoast = isFlipped ? (cross - coastline[t]) : (coastline[t] - cross);
      if (distToCoast > 6 || distToCoast < 1) continue;
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      const poolNoise = worleyNoise(nx * 12, nz * 12, seed + 8400, 1.0);
      if (poolNoise.f1 < 0.15 && rng() < 0.6) {
        tiles[idx] = TILE.WATER;
        elevation[idx] = 0.12;
      }
    }
  }

  // Offshore islands with varied shapes (3-5)
  const islandCount = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < islandCount; i += 1) {
    let ox = 0, oz = 0;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      ox = Math.floor(rng() * (width - 10) + 5);
      oz = Math.floor(rng() * (height - 10) + 5);
      const t = isVertical ? oz : ox;
      const cross = isVertical ? ox : oz;
      const coastPos = coastline[Math.min(t, axisLen - 1)];
      const inOcean = isFlipped ? (cross < coastPos - 6) : (cross > coastPos + 6);
      if (inOcean) break;
    }
    const r = lerp(2.5, 6, rng());
    // Noise-shaped islands
    const islSeed = seed + 8200 + i * 17;
    for (let dz = -Math.ceil(r) - 2; dz <= Math.ceil(r) + 2; dz += 1) {
      for (let dx = -Math.ceil(r) - 2; dx <= Math.ceil(r) + 2; dx += 1) {
        const px = ox + dx, pz = oz + dz;
        if (px < 0 || pz < 0 || px >= width || pz >= height) continue;
        const nd = Math.sqrt((dx / r) ** 2 + (dz / (r * lerp(0.7, 1.3, rng()))) ** 2);
        const wobble = fbm2D(Math.atan2(dz, dx) * 3, nd * 2, islSeed, 2, 2, 0.5) * 0.25;
        if (nd + wobble < 1.0) {
          const pidx = toIndex(px, pz, width);
          tiles[pidx] = TILE.GRASS;
          elevation[pidx] = clamp(0.3 + (1 - nd) * 0.4, 0.2, 0.7);
        }
      }
    }
  }

  // Bays carved with domain-warped depth
  for (let t = 0; t < axisLen; t += 1) {
    const bayNoise = fbm2D(t / axisLen * 6.0, 3.3, seed + 8300, 3, 2, 0.5);
    if (bayNoise < 0.42) continue;
    const depth = Math.floor((bayNoise - 0.42) * crossLen * 0.22);
    const coastPos = Math.round(coastline[t]);
    for (let d = 0; d < depth; d += 1) {
      const cross = isFlipped ? (coastPos + d) : (coastPos - d);
      if (isVertical) {
        setTileRaw(tiles, width, height, cross, t, TILE.WATER);
      } else {
        setTileRaw(tiles, width, height, t, cross, TILE.WATER);
      }
    }
  }

  return { elevation, moisture, ridge };
}

function convertHighlandRidgesToWalls(tiles, width, height, ridge, seed) {
  // Target ~15-25% wall coverage: sort ridge values and pick threshold dynamically
  const ridgeValues = [];
  for (let iz = 1; iz < height - 1; iz += 1) {
    for (let ix = 1; ix < width - 1; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.WATER && tiles[idx] !== TILE.WAREHOUSE) {
        ridgeValues.push(ridge[idx]);
      }
    }
  }
  ridgeValues.sort((a, b) => b - a);
  const targetWallCount = Math.floor(ridgeValues.length * 0.18);
  const wallThreshold = targetWallCount > 0 && targetWallCount < ridgeValues.length
    ? ridgeValues[targetWallCount]
    : 0.85;
  const wallTiles = [];

  for (let iz = 1; iz < height - 1; iz += 1) {
    for (let ix = 1; ix < width - 1; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] === TILE.WATER || tiles[idx] === TILE.WAREHOUSE) continue;
      if (ridge[idx] > wallThreshold) {
        tiles[idx] = TILE.WALL;
        wallTiles.push({ ix, iz });
      }
    }
  }

  // Ensure connectivity: flood fill from center, carve passes through walls to reach isolated land
  const cx = Math.floor(width / 2);
  const cz = Math.floor(height / 2);

  // Find nearest passable tile to center
  let startIdx = toIndex(cx, cz, width);
  if (tiles[startIdx] === TILE.WALL || tiles[startIdx] === TILE.WATER) {
    for (let r = 1; r < Math.max(width, height); r += 1) {
      let found = false;
      for (let dz = -r; dz <= r && !found; dz += 1) {
        for (let dx = -r; dx <= r && !found; dx += 1) {
          const ix = cx + dx;
          const iz = cz + dz;
          if (ix < 0 || iz < 0 || ix >= width || iz >= height) continue;
          const idx = toIndex(ix, iz, width);
          if (tiles[idx] !== TILE.WALL && tiles[idx] !== TILE.WATER) {
            startIdx = idx;
            found = true;
          }
        }
      }
      if (found) break;
    }
  }

  // Flood fill to find main connected landmass
  const visited = new Uint8Array(width * height);
  const queue = [startIdx];
  visited[startIdx] = 1;
  while (queue.length > 0) {
    const cur = queue.pop();
    const ci = cur % width;
    const cj = Math.floor(cur / width);
    for (const n of NEIGHBORS_4) {
      const ni = ci + n.x;
      const nj = cj + n.z;
      if (ni < 0 || nj < 0 || ni >= width || nj >= height) continue;
      const nIdx = toIndex(ni, nj, width);
      if (visited[nIdx]) continue;
      if (tiles[nIdx] === TILE.WALL || tiles[nIdx] === TILE.WATER) continue;
      visited[nIdx] = 1;
      queue.push(nIdx);
    }
  }

  // Find disconnected land regions and carve 2-wide passes to connect them
  for (let iz = 2; iz < height - 2; iz += 3) {
    for (let ix = 2; ix < width - 2; ix += 3) {
      const idx = toIndex(ix, iz, width);
      if (visited[idx] || tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL) continue;
      // This is an isolated land tile — carve toward the center
      let px = ix;
      let pz = iz;
      const maxCarveSteps = width + height;
      for (let step = 0; step < maxCarveSteps; step += 1) {
        if (visited[toIndex(px, pz, width)]) break;
        const dirX = cx - px;
        const dirZ = cz - pz;
        if (Math.abs(dirX) >= Math.abs(dirZ)) {
          px += dirX > 0 ? 1 : -1;
        } else {
          pz += dirZ > 0 ? 1 : -1;
        }
        px = clamp(px, 1, width - 2);
        pz = clamp(pz, 1, height - 2);
        const pIdx = toIndex(px, pz, width);
        if (tiles[pIdx] === TILE.WALL) {
          tiles[pIdx] = TILE.ROAD;
          // Widen pass
          for (const n of NEIGHBORS_4) {
            const wi = px + n.x;
            const wj = pz + n.z;
            if (wi >= 0 && wj >= 0 && wi < width && wj < height) {
              const wIdx = toIndex(wi, wj, width);
              if (tiles[wIdx] === TILE.WALL && hash2D(wi, wj, seed + 9001) > 0.4) {
                tiles[wIdx] = TILE.ROAD;
              }
            }
          }
        }
      }
    }
  }
}

function generateFertileRiverlandsTerrain(tiles, width, height, seed, profile) {
  const area = width * height;
  const elevation = new Float32Array(area);
  const moisture = new Float32Array(area);
  const ridge = new Float32Array(area);
  const rng = createRng(seed + 6000);

  // Gentle rolling terrain — recursive warp for organic variation
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      elevation[idx] = clamp(recursiveWarp(nx * 2.0, nz * 2.0, seed + 11, 2, 0.15) * 0.45 + 0.35, 0.1, 0.7);
      moisture[idx] = clamp(domainWarpedFbm(nx * 3.0, nz * 3.0, seed + 47, 0.15) * 0.6 + 0.4, 0, 1);
      ridge[idx] = Math.abs(fbm2D(nx * 5, nz * 5, seed + 71, 2, 2.2, 0.5) * 2 - 1) * 0.2;
      tiles[idx] = TILE.GRASS;
    }
  }

  // Generate 2-3 convergent rivers with deep domain-warped meanders
  const cx = Math.floor(width * (0.4 + hash2D(7, 13, seed + 6001) * 0.2));
  const cz = Math.floor(height * (0.4 + hash2D(11, 17, seed + 6002) * 0.2));
  const riverCount = 2 + (hash2D(3, 5, seed + 6003) > 0.5 ? 1 : 0);

  // Store river center-line for oxbow and floodplain generation
  const riverCenterLines = [];
  for (let r = 0; r < riverCount; r += 1) {
    const angle = (r / riverCount) * Math.PI * 2 + hash2D(r, 0, seed + 6010) * 0.6;
    let startX, startZ;
    if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) {
      startX = Math.cos(angle) > 0 ? width - 2 : 1;
      startZ = clamp(Math.round(cz + Math.sin(angle) * height * 0.4), 2, height - 3);
    } else {
      startZ = Math.sin(angle) > 0 ? height - 2 : 1;
      startX = clamp(Math.round(cx + Math.cos(angle) * width * 0.4), 2, width - 3);
    }

    const centerLine = [];
    const baseWidth = lerp(2.0, 3.5, hash2D(r, 7, seed + 6020));
    const steps = Math.abs(startX - cx) + Math.abs(startZ - cz) + 20;

    for (let s = 0; s <= steps; s += 1) {
      const frac = s / Math.max(1, steps);
      // Domain-warped meander — 2 layers of warp for deep sinuosity
      const warpX = fbm2D(frac * 3.0 + r * 2.7, 1.5, seed + 6050 + r * 100, 2, 2.0, 0.5) * 0.12;
      const m1 = fbm2D((frac + warpX) * 5.0 + r * 3.1, 0.5, seed + 6100 + r * 311, 4, 2.0, 0.5) - 0.5;
      const m2 = fbm2D((frac + warpX) * 10.0 + r * 1.7, 1.5, seed + 6150 + r * 211, 3, 2.2, 0.45) - 0.5;
      const meander = m1 * 0.16 + m2 * 0.06;
      const dim = Math.min(width, height);
      const px = clamp(Math.round(lerp(startX, cx, frac) + meander * dim), 1, width - 2);
      const pz = clamp(Math.round(lerp(startZ, cz, frac) + meander * dim * 0.7), 1, height - 2);
      // River widens approaching confluence
      const widthMult = lerp(0.8, 1.6, frac);
      centerLine.push({ x: px, z: pz, w: baseWidth * widthMult });
    }
    riverCenterLines.push(centerLine);

    // Paint river tiles
    for (const pt of centerLine) {
      const half = Math.max(1, Math.round(pt.w * lerp(0.8, 1.2, hash2D(pt.x, pt.z, seed + 6200)) * 0.5));
      for (let dz = -half; dz <= half; dz += 1) {
        for (let dx = -half; dx <= half; dx += 1) {
          if (dx * dx + dz * dz > (half + 0.5) * (half + 0.5)) continue;
          const wx = pt.x + dx;
          const wz = pt.z + dz;
          if (wx >= 0 && wz >= 0 && wx < width && wz < height) {
            tiles[toIndex(wx, wz, width)] = TILE.WATER;
          }
        }
      }
    }
  }

  // Noise-distorted confluence lake
  const confluenceR = Math.max(4, Math.floor(Math.min(width, height) * 0.065));
  for (let dz = -confluenceR - 2; dz <= confluenceR + 2; dz += 1) {
    for (let dx = -confluenceR - 2; dx <= confluenceR + 2; dx += 1) {
      const wx = cx + dx;
      const wz = cz + dz;
      if (wx < 0 || wz < 0 || wx >= width || wz >= height) continue;
      const nd = Math.sqrt((dx / confluenceR) ** 2 + (dz / confluenceR) ** 2);
      const wobble = fbm2D(Math.atan2(dz, dx) * 3.0, nd * 2.0, seed + 6250, 2, 2.0, 0.5) * 0.25;
      if (nd + wobble < 1.0) {
        tiles[toIndex(wx, wz, width)] = TILE.WATER;
      }
    }
  }

  // Oxbow lakes — abandoned meander loops alongside rivers
  for (let r = 0; r < riverCenterLines.length; r += 1) {
    const line = riverCenterLines[r];
    const oxbowCount = 1 + Math.floor(rng() * 2);
    for (let o = 0; o < oxbowCount; o += 1) {
      // Pick a mid-section of the river (avoid endpoints)
      const startFrac = 0.2 + rng() * 0.5;
      const startIdx = Math.floor(startFrac * line.length);
      const arcLen = Math.floor(line.length * lerp(0.08, 0.18, rng()));
      if (startIdx + arcLen >= line.length) continue;
      const offsetDir = rng() > 0.5 ? 1 : -1;
      const offsetDist = lerp(4, 8, rng());
      // Carve a crescent-shaped water body offset from the river
      for (let i = 0; i < arcLen; i += 1) {
        const pt = line[startIdx + i];
        // Compute perpendicular offset from river direction
        const nextPt = line[Math.min(startIdx + i + 1, line.length - 1)];
        const dirX = nextPt.x - pt.x;
        const dirZ = nextPt.z - pt.z;
        const len = Math.max(1, Math.sqrt(dirX * dirX + dirZ * dirZ));
        const perpX = -dirZ / len;
        const perpZ = dirX / len;
        // Arc shape: thickest in middle, thin at ends
        const arcFrac = i / Math.max(1, arcLen - 1);
        const thickness = Math.sin(arcFrac * Math.PI) * lerp(1.5, 2.5, rng());
        const ox = Math.round(pt.x + perpX * offsetDist * offsetDir);
        const oz = Math.round(pt.z + perpZ * offsetDist * offsetDir);
        const half = Math.max(1, Math.round(thickness));
        for (let dz2 = -half; dz2 <= half; dz2 += 1) {
          for (let dx2 = -half; dx2 <= half; dx2 += 1) {
            if (dx2 * dx2 + dz2 * dz2 > half * half) continue;
            const fx = ox + dx2;
            const fz = oz + dz2;
            if (fx >= 1 && fz >= 1 && fx < width - 1 && fz < height - 1) {
              tiles[toIndex(fx, fz, width)] = TILE.WATER;
            }
          }
        }
      }
    }
  }

  // Delta / distributary channels downstream of confluence
  const deltaCount = 2 + Math.floor(rng() * 2);
  const deltaAngleBase = rng() * Math.PI * 2;
  for (let d = 0; d < deltaCount; d += 1) {
    const angle = deltaAngleBase + (d / deltaCount) * Math.PI * 0.8 - Math.PI * 0.2;
    const length = lerp(12, 22, rng());
    let dx2 = cx;
    let dz2 = cz;
    const channelWidth = lerp(1.0, 1.8, rng());
    for (let s = 0; s < length; s += 1) {
      const frac = s / length;
      const wobble = fbm2D(frac * 6.0 + d * 4.1, 0.5, seed + 6300 + d * 71, 2, 2.0, 0.5) - 0.5;
      dx2 = clamp(Math.round(dx2 + Math.cos(angle + wobble * 1.5) * 1.3), 1, width - 2);
      dz2 = clamp(Math.round(dz2 + Math.sin(angle + wobble * 1.5) * 1.3), 1, height - 2);
      const half = Math.max(1, Math.round(channelWidth * (1 - frac * 0.4)));
      for (let ddz = -half; ddz <= half; ddz += 1) {
        for (let ddx = -half; ddx <= half; ddx += 1) {
          const fx = dx2 + ddx;
          const fz = dz2 + ddz;
          if (fx >= 0 && fz >= 0 && fx < width && fz < height) {
            tiles[toIndex(fx, fz, width)] = TILE.WATER;
          }
        }
      }
    }
  }

  // Marshland / wetland zones — Worley noise patches near water
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.GRASS) continue;
      // Check proximity to water
      let nearWater = false;
      for (const n of NEIGHBORS_4) {
        const ni = ix + n.x;
        const nj = iz + n.z;
        if (ni >= 0 && nj >= 0 && ni < width && nj < height && tiles[toIndex(ni, nj, width)] === TILE.WATER) {
          nearWater = true;
          break;
        }
      }
      if (!nearWater) continue;
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      const marsh = worleyNoise(nx * 10, nz * 10, seed + 6500, 1.0);
      // Scattered marsh ponds where Worley cell centers are close
      if (marsh.f1 < 0.12 && rng() < 0.45) {
        tiles[idx] = TILE.WATER;
      }
    }
  }

  // Floodplain ponds via Poisson disk sampling
  const pondCenters = poissonDiskSample(width, height, 10, createRng(seed + 6600), 12);
  for (const pt of pondCenters) {
    const pix = Math.floor(pt.x);
    const piz = Math.floor(pt.y);
    if (pix < 3 || piz < 3 || pix >= width - 3 || piz >= height - 3) continue;
    // Only place ponds near rivers (within 12 tiles of water)
    let distToWater = Infinity;
    for (let dz = -12; dz <= 12; dz += 3) {
      for (let dx = -12; dx <= 12; dx += 3) {
        const ci = pix + dx;
        const cj = piz + dz;
        if (ci >= 0 && cj >= 0 && ci < width && cj < height && tiles[toIndex(ci, cj, width)] === TILE.WATER) {
          distToWater = Math.min(distToWater, Math.sqrt(dx * dx + dz * dz));
        }
      }
    }
    if (distToWater > 10) continue;
    const pr = lerp(1.5, 3.5, rng());
    paintBlob(tiles, width, height, pix, piz, pr, pr * lerp(0.7, 1.3, rng()), TILE.WATER, seed + 6700 + pix * 7, new Set([TILE.GRASS]));
  }

  // Compute moisture — distance-to-water gradient with domain-warped variation
  const waterDist = new Float32Array(area).fill(255);
  const wQueue = [];
  for (let i = 0; i < area; i += 1) {
    if (tiles[i] === TILE.WATER) { waterDist[i] = 0; wQueue.push(i); }
  }
  // BFS distance to water
  let qi = 0;
  while (qi < wQueue.length) {
    const cur = wQueue[qi++];
    const ci = cur % width;
    const cj = Math.floor(cur / width);
    const nd = waterDist[cur] + 1;
    if (nd > 12) continue;
    for (const n of NEIGHBORS_4) {
      const ni = ci + n.x;
      const nj = cj + n.z;
      if (ni < 0 || nj < 0 || ni >= width || nj >= height) continue;
      const nIdx = toIndex(ni, nj, width);
      if (waterDist[nIdx] <= nd) continue;
      waterDist[nIdx] = nd;
      wQueue.push(nIdx);
    }
  }
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      const wd = waterDist[idx];
      const baseMoist = tiles[idx] === TILE.WATER ? 1.0 : clamp(1.0 - wd * 0.07, 0.15, 1.0);
      const variation = fbm2D(nx * 4.0, nz * 4.0, seed + 47, 3, 2.0, 0.5) * 0.15;
      moisture[idx] = clamp(baseMoist + variation, 0, 1);
      // Lower elevation near water (floodplain)
      if (tiles[idx] !== TILE.WATER && wd < 6) {
        elevation[idx] = clamp(elevation[idx] - (6 - wd) * 0.03, 0.1, 0.7);
      }
    }
  }

  return { elevation, moisture, ridge };
}

function generateFortifiedBasinTerrain(tiles, width, height, seed, profile) {
  const area = width * height;
  const elevation = new Float32Array(area);
  const moisture = new Float32Array(area);
  const ridge = new Float32Array(area);
  const rng = createRng(seed + 5500);

  const cx = Math.floor(width / 2);
  const cz = Math.floor(height / 2);
  const wallRx = Math.max(12, Math.floor(width * 0.30));
  const wallRz = Math.max(10, Math.floor(height * 0.30));

  // Base terrain with recursive warping for organic variation
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      elevation[idx] = clamp(recursiveWarp(nx * 2.2, nz * 2.2, seed + 11, 2, 0.25) * 0.65 + 0.3, 0, 1);
      moisture[idx] = clamp(domainWarpedFbm(nx * 3.0, nz * 3.0, seed + 47, 0.2), 0, 1);
      ridge[idx] = Math.abs(fbm2D(nx * 6, nz * 6, seed + 71, 3, 2.2, 0.5) * 2 - 1);
      tiles[idx] = TILE.GRASS;
    }
  }

  // Heavily irregular fortress wall — recursive domain warping + anisotropic radius
  const wallNoiseSeed = seed + 8800;
  // Pre-compute angular radius variation: 16 control points with smooth interpolation
  const radialPts = 16;
  const radialR = new Float32Array(radialPts);
  for (let i = 0; i < radialPts; i += 1) {
    radialR[i] = lerp(0.7, 1.3, hash2D(i, 0, wallNoiseSeed + 500));
  }
  function wallRadius(angle) {
    const t = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
    const fi = t * radialPts;
    const i0 = Math.floor(fi) % radialPts;
    const i1 = (i0 + 1) % radialPts;
    const frac = fi - Math.floor(fi);
    // Smooth hermite interpolation between control points
    const s = frac * frac * (3 - 2 * frac);
    return lerp(radialR[i0], radialR[i1], s);
  }

  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const dx = (ix - cx) / Math.max(1, wallRx);
      const dz = (iz - cz) / Math.max(1, wallRz);
      const baseD = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);
      // Anisotropic radius from control points
      const rScale = wallRadius(angle);
      // Deep recursive warp for highly irregular outline
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      const warpVal = recursiveWarp(nx * 4.0, nz * 4.0, wallNoiseSeed, 2, 0.3) - 0.5;
      const d = baseD / rScale + warpVal * 0.22;
      const wallDist = Math.abs(d - 1.0) * Math.min(wallRx, wallRz);

      if (wallDist < 1.6) {
        const idx = toIndex(ix, iz, width);
        tiles[idx] = TILE.WALL;
      }
    }
  }

  // Irregular moat outside walls — independent warp for offset from wall
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const dx = (ix - cx) / Math.max(1, wallRx);
      const dz = (iz - cz) / Math.max(1, wallRz);
      const baseD = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);
      const rScale = wallRadius(angle);
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      const warpVal = recursiveWarp(nx * 4.0, nz * 4.0, wallNoiseSeed, 2, 0.3) - 0.5;
      const moatWarp = fbm2D(nx * 6.0, nz * 6.0, wallNoiseSeed + 300, 2, 2.0, 0.5) * 0.06;
      const d = baseD / rScale + warpVal * 0.22 + moatWarp;
      const moatDist = Math.abs(d - 1.14) * Math.min(wallRx, wallRz);
      if (moatDist < 1.4 && d > 1.0) {
        const idx = toIndex(ix, iz, width);
        if (tiles[idx] !== TILE.WALL) tiles[idx] = TILE.WATER;
      }
    }
  }

  // Asymmetric gate positions (3-5 gates at irregular angles)
  const gateCount = 3 + Math.floor(rng() * 3);
  const gateAngles = [];
  const baseAngle = rng() * Math.PI * 2;
  for (let g = 0; g < gateCount; g += 1) {
    gateAngles.push(baseAngle + (g / gateCount) * Math.PI * 2 + (rng() - 0.5) * 0.6);
  }
  const gatePositions = gateAngles.map(a => ({
    x: Math.round(cx + Math.cos(a) * wallRx),
    z: Math.round(cz + Math.sin(a) * wallRz),
  }));

  for (const gate of gatePositions) {
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const gx = gate.x + dx;
        const gz = gate.z + dz;
        if (gx < 0 || gz < 0 || gx >= width || gz >= height) continue;
        const idx = toIndex(gx, gz, width);
        if (tiles[idx] === TILE.WALL || tiles[idx] === TILE.WATER) tiles[idx] = TILE.ROAD;
      }
    }
  }

  // Interior: Voronoi-based districts instead of grid roads
  const districtSeeds = poissonDiskSample(wallRx * 1.6, wallRz * 1.6, Math.max(5, Math.min(wallRx, wallRz) * 0.35), rng, 12);
  const districts = districtSeeds.map((p, i) => ({
    x: Math.round(cx - wallRx * 0.8 + p.x),
    z: Math.round(cz - wallRz * 0.8 + p.z),
    type: [TILE.FARM, TILE.LUMBER, TILE.FARM, TILE.QUARRY, TILE.HERB_GARDEN, TILE.FARM][i % 6],
  }));

  // Assign interior tiles to nearest district, paint cluster around center
  for (const dist of districts) {
    const dr = Math.max(3, Math.floor(Math.min(wallRx, wallRz) * lerp(0.12, 0.22, rng())));
    const dxn = (dist.x - cx) / Math.max(1, wallRx);
    const dzn = (dist.z - cz) / Math.max(1, wallRz);
    if (dxn * dxn + dzn * dzn > 0.7) continue;
    paintBlob(tiles, width, height, dist.x, dist.z,
      dr, dr * lerp(0.7, 1.3, rng()), dist.type, seed + 5600 + dist.x * 7,
      new Set([TILE.GRASS]));
  }

  // Connect districts to center with organic roads
  for (const dist of districts) {
    const dxn = (dist.x - cx) / Math.max(1, wallRx);
    const dzn = (dist.z - cz) / Math.max(1, wallRz);
    if (dxn * dxn + dzn * dzn > 0.7) continue;
    drawOrganicRoad(tiles, width, height, { ix: cx, iz: cz }, { ix: dist.x, iz: dist.z }, rng, 0.3);
  }
  // Connect gates to center
  for (const gate of gatePositions) {
    drawOrganicRoad(tiles, width, height, { ix: cx, iz: cz }, { ix: gate.x, iz: gate.z }, rng, 0.25);
  }

  // Outer wilderness: Poisson-distributed ruins, lumber, herb gardens
  const outerFeatures = poissonDiskSample(width, height, 6, rng, 60);
  for (const feat of outerFeatures) {
    const fx = Math.round(feat.x);
    const fz = Math.round(feat.z);
    if (fx < 2 || fz < 2 || fx >= width - 2 || fz >= height - 2) continue;
    const dxn = Math.abs(fx - cx) / (width * 0.5);
    const dzn = Math.abs(fz - cz) / (height * 0.5);
    if (Math.sqrt(dxn * dxn + dzn * dzn) < 0.55) continue;
    const idx = toIndex(fx, fz, width);
    if (tiles[idx] !== TILE.GRASS) continue;
    const roll = rng();
    const tileType = roll < 0.35 ? TILE.RUINS : roll < 0.65 ? TILE.LUMBER : TILE.GRASS;
    if (tileType !== TILE.GRASS) {
      const r = lerp(1.5, 3.5, rng());
      paintBlob(tiles, width, height, fx, fz, r, r * lerp(0.7, 1.3, rng()), tileType, seed + 5800 + fx * 7, new Set([TILE.GRASS]));
    }
  }

  return { elevation, moisture, ridge };
}

function generateRuggedHighlandsTerrain(tiles, width, height, seed, profile) {
  const area = width * height;
  const elevation = new Float32Array(area);
  const moisture = new Float32Array(area);
  const ridge = new Float32Array(area);
  const rng = createRng(seed + 9000);
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;

  // High-elevation terrain with recursive warp for dramatic peaks and valleys
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      // Multi-layered elevation: recursive warp base + ridge overlay
      const base = recursiveWarp(nx * 2.5, nz * 2.5, seed + 11, 3, 0.25);
      const ridgeVal = Math.abs(fbm2D(nx * 7.2 + 9.7, nz * 7.2 - 4.4, seed + 71, 4, 2.2, 0.5) * 2 - 1);
      ridge[idx] = ridgeVal;
      // Highland bias: overall higher elevation with valley carving
      const valleyDist = Math.hypot(ix - cx, iz - cz) / Math.max(1, Math.hypot(cx, cz));
      const valleyCarve = (1 - valleyDist) * 0.08;
      elevation[idx] = clamp(base * 0.5 + 0.45 + ridgeVal * 0.22 - valleyCarve, 0.15, 1.0);
      moisture[idx] = clamp(domainWarpedFbm(nx * 3.5, nz * 3.5, seed + 47, 0.15) * 0.5 + 0.15, 0, 0.7);
      tiles[idx] = TILE.GRASS;
    }
  }

  // Worley crevasses — deep fissures cutting through the highlands
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.GRASS) continue;
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      const w = worleyNoise(nx * 6.0, nz * 6.0, seed + 9100, 1.0);
      // Edge detection: where f2-f1 is small, we're on a Voronoi edge = crevasse
      const edgeDist = w.f2 - w.f1;
      if (edgeDist < 0.05) {
        // Deep crevasse — water at the bottom (narrow fissures only)
        tiles[idx] = TILE.WATER;
        elevation[idx] = 0.1;
        moisture[idx] = clamp(moisture[idx] + 0.3, 0, 1);
      } else if (edgeDist < 0.10 && ridge[idx] > 0.45) {
        // Crevasse walls — steep sides become natural walls (sparse)
        tiles[idx] = TILE.WALL;
        elevation[idx] = clamp(elevation[idx] + 0.1, 0, 1);
      }
    }
  }

  // Highland plateaus — flat elevated areas using Worley cell interiors
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.GRASS) continue;
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);
      const w = worleyNoise(nx * 3.5, nz * 3.5, seed + 9200, 1.0);
      // Interior of cells = plateaus — flatten elevation
      if (w.f1 < 0.2) {
        const flatness = 1 - w.f1 / 0.2;
        const plateauElev = 0.7 + fbm2D(nx * 2, nz * 2, seed + 9250, 2, 2.0, 0.4) * 0.08;
        elevation[idx] = lerp(elevation[idx], plateauElev, flatness * 0.6);
      }
    }
  }

  // Mountain ridge walls — high ridge areas become impassable rock
  const ridgeValues = [];
  for (let iz = 1; iz < height - 1; iz += 1) {
    for (let ix = 1; ix < width - 1; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] === TILE.GRASS) {
        ridgeValues.push(ridge[idx]);
      }
    }
  }
  ridgeValues.sort((a, b) => b - a);
  const targetWallPct = 0.08 + rng() * 0.05;
  const targetWallCount = Math.floor(ridgeValues.length * targetWallPct);
  const wallThreshold = targetWallCount > 0 && targetWallCount < ridgeValues.length
    ? ridgeValues[targetWallCount] : 0.85;

  for (let iz = 1; iz < height - 1; iz += 1) {
    for (let ix = 1; ix < width - 1; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.GRASS) continue;
      if (ridge[idx] > wallThreshold) {
        tiles[idx] = TILE.WALL;
        elevation[idx] = clamp(elevation[idx] + 0.15, 0, 1);
      }
    }
  }

  // Mountain streams — narrow water ribbons flowing down from peaks
  const streamCount = 3 + Math.floor(rng() * 3);
  for (let s = 0; s < streamCount; s += 1) {
    // Start from a high-elevation point
    let sx = Math.floor(rng() * (width - 10) + 5);
    let sz = Math.floor(rng() * (height - 10) + 5);
    // Walk downhill with noise perturbation
    for (let step = 0; step < 40; step += 1) {
      const sIdx = toIndex(sx, sz, width);
      if (tiles[sIdx] === TILE.WATER) break;
      if (tiles[sIdx] === TILE.GRASS || tiles[sIdx] === TILE.WALL) {
        tiles[sIdx] = TILE.WATER;
        elevation[sIdx] = Math.min(elevation[sIdx], 0.15);
        moisture[sIdx] = 1.0;
      }
      // Find lowest neighbor with noise jitter
      let bestX = sx;
      let bestZ = sz;
      let bestElev = Infinity;
      for (const n of NEIGHBORS_4) {
        const ni = sx + n.x;
        const nj = sz + n.z;
        if (ni < 1 || nj < 1 || ni >= width - 1 || nj >= height - 1) continue;
        const nIdx = toIndex(ni, nj, width);
        const jitter = hash2D(ni + step, nj, seed + 9300 + s * 37) * 0.15;
        if (elevation[nIdx] + jitter < bestElev) {
          bestElev = elevation[nIdx] + jitter;
          bestX = ni;
          bestZ = nj;
        }
      }
      if (bestX === sx && bestZ === sz) break;
      sx = bestX;
      sz = bestZ;
    }
  }

  // Boost moisture near water features
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.WATER) continue;
      for (let dz = -3; dz <= 3; dz += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const ni = ix + dx;
          const nj = iz + dz;
          if (ni < 0 || nj < 0 || ni >= width || nj >= height) continue;
          const nIdx = toIndex(ni, nj, width);
          if (tiles[nIdx] === TILE.WATER) continue;
          const dist = Math.sqrt(dx * dx + dz * dz);
          moisture[nIdx] = Math.max(moisture[nIdx], 0.7 - dist * 0.15);
        }
      }
    }
  }

  // Scattered ruins on exposed plateaus
  const ruinPts = poissonDiskSample(width, height, 8, createRng(seed + 9400), 15);
  for (const pt of ruinPts) {
    const rx = Math.round(pt.x);
    const rz = Math.round(pt.y);
    if (rx < 2 || rz < 2 || rx >= width - 2 || rz >= height - 2) continue;
    const rIdx = toIndex(rx, rz, width);
    if (tiles[rIdx] !== TILE.GRASS) continue;
    if (elevation[rIdx] < 0.5) continue;
    const r = lerp(1.2, 2.5, rng());
    paintBlob(tiles, width, height, rx, rz, r, r * lerp(0.8, 1.2, rng()), TILE.RUINS, seed + 9500 + rx * 7, new Set([TILE.GRASS]));
  }

  // Ensure connectivity: flood fill from center, carve passes through walls
  let startIdx = toIndex(Math.floor(cx), Math.floor(cz), width);
  if (tiles[startIdx] === TILE.WALL || tiles[startIdx] === TILE.WATER) {
    for (let r2 = 1; r2 < Math.max(width, height); r2 += 1) {
      let found = false;
      for (let dz = -r2; dz <= r2 && !found; dz += 1) {
        for (let dx = -r2; dx <= r2 && !found; dx += 1) {
          const ix = Math.floor(cx) + dx;
          const iz = Math.floor(cz) + dz;
          if (ix < 0 || iz < 0 || ix >= width || iz >= height) continue;
          const idx = toIndex(ix, iz, width);
          if (tiles[idx] !== TILE.WALL && tiles[idx] !== TILE.WATER) {
            startIdx = idx;
            found = true;
          }
        }
      }
      if (found) break;
    }
  }
  const visited = new Uint8Array(area);
  const queue = [startIdx];
  visited[startIdx] = 1;
  while (queue.length > 0) {
    const cur = queue.pop();
    const ci = cur % width;
    const cj = Math.floor(cur / width);
    for (const n of NEIGHBORS_4) {
      const ni = ci + n.x;
      const nj = cj + n.z;
      if (ni < 0 || nj < 0 || ni >= width || nj >= height) continue;
      const nIdx = toIndex(ni, nj, width);
      if (visited[nIdx]) continue;
      if (tiles[nIdx] === TILE.WALL || tiles[nIdx] === TILE.WATER) continue;
      visited[nIdx] = 1;
      queue.push(nIdx);
    }
  }
  for (let iz = 2; iz < height - 2; iz += 3) {
    for (let ix = 2; ix < width - 2; ix += 3) {
      const idx = toIndex(ix, iz, width);
      if (visited[idx] || tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL) continue;
      let px = ix;
      let pz = iz;
      for (let step = 0; step < width + height; step += 1) {
        if (visited[toIndex(px, pz, width)]) break;
        const dirX = Math.floor(cx) - px;
        const dirZ = Math.floor(cz) - pz;
        if (Math.abs(dirX) >= Math.abs(dirZ)) { px += dirX > 0 ? 1 : -1; }
        else { pz += dirZ > 0 ? 1 : -1; }
        px = clamp(px, 1, width - 2);
        pz = clamp(pz, 1, height - 2);
        const pIdx = toIndex(px, pz, width);
        if (tiles[pIdx] === TILE.WALL || tiles[pIdx] === TILE.WATER) {
          tiles[pIdx] = TILE.ROAD;
          // Widen pass for better accessibility
          for (const n2 of NEIGHBORS_4) {
            const wi = px + n2.x;
            const wj = pz + n2.z;
            if (wi >= 0 && wj >= 0 && wi < width && wj < height) {
              const wIdx = toIndex(wi, wj, width);
              if ((tiles[wIdx] === TILE.WALL || tiles[wIdx] === TILE.WATER) && hash2D(wi, wj, seed + 9001) > 0.3) {
                tiles[wIdx] = TILE.ROAD;
              }
            }
          }
        }
      }
    }
  }

  return { elevation, moisture, ridge };
}

function generateTemperatePlainsTerrain(tiles, width, height, seed, profile) {
  const area = width * height;
  const elevation = new Float32Array(area);
  const moisture = new Float32Array(area);
  const ridge = new Float32Array(area);
  const rng = createRng(seed + 4300);

  // Domain-warped terrain with gentle rolling hills
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const idx = toIndex(ix, iz, width);
      const nx = ix / Math.max(1, width - 1);
      const nz = iz / Math.max(1, height - 1);

      // Recursive warping for organic terrain instead of flat FBM
      const base = recursiveWarp(nx * 1.8, nz * 1.8, seed + 11, 2, 0.18);
      const detail = fbm2D(nx * 4.0, nz * 4.0, seed + 29, 3, 2.0, 0.4) * 0.12;
      elevation[idx] = clamp(base * 0.55 + detail + 0.32, 0, 1);
      moisture[idx] = clamp(domainWarpedFbm(nx * 3.0, nz * 3.0, seed + 47, 0.15), 0, 1);
      ridge[idx] = Math.abs(fbm2D(nx * 5, nz * 5, seed + 71, 2, 2.2, 0.4) * 2 - 1) * 0.25;
      tiles[idx] = TILE.GRASS;
    }
  }

  // Meandering river with varied width
  const riverVertical = hash2D(1, 1, seed + 4001) > 0.5;
  const axisLen = riverVertical ? height : width;
  const span = riverVertical ? width : height;
  const basePos = span * 0.5;

  for (let t = 0; t < axisLen; t += 1) {
    const nt = t / Math.max(1, axisLen - 1);
    const warp = fbm2D(nt * 5.0, 1.5, seed + 4050, 2, 2.0, 0.5) * 0.08;
    const meander = fbm2D((nt + warp) * 3.5, 0.5, seed + 4100, 4, 2.0, 0.5) - 0.5;
    const center = basePos + meander * span * 0.28;
    const half = lerp(1, 3, hash2D(t, 0, seed + 4200));

    for (let k = Math.max(0, Math.floor(center - half)); k <= Math.min(span - 1, Math.ceil(center + half)); k += 1) {
      const rx = riverVertical ? k : t;
      const rz = riverVertical ? t : k;
      setTileRaw(tiles, width, height, rx, rz, TILE.WATER);
      const ridx = toIndex(clamp(rx, 0, width - 1), clamp(rz, 0, height - 1), width);
      moisture[ridx] = 1.0;
      elevation[ridx] = 0.1;
    }
    // Boost moisture near river
    for (let d = -4; d <= 4; d += 1) {
      const k = Math.round(center + d);
      if (k < 0 || k >= span) continue;
      const rx = riverVertical ? k : t;
      const rz = riverVertical ? t : k;
      if (rx < 0 || rz < 0 || rx >= width || rz >= height) continue;
      const ridx = toIndex(rx, rz, width);
      moisture[ridx] = clamp(moisture[ridx] + 0.3 * (1 - Math.abs(d) / 5), 0, 1);
    }
  }

  // Scattered lakes using Worley noise (2-4 lakes)
  const lakeSeeds = poissonDiskSample(width, height, Math.min(width, height) * 0.25, rng, 4);
  for (const lake of lakeSeeds) {
    const lx = Math.round(lake.x);
    const lz = Math.round(lake.z);
    if (lx < 4 || lz < 4 || lx >= width - 4 || lz >= height - 4) continue;
    const lakeR = lerp(3, 6, rng());
    for (let dz = -Math.ceil(lakeR) - 1; dz <= Math.ceil(lakeR) + 1; dz += 1) {
      for (let dx = -Math.ceil(lakeR) - 1; dx <= Math.ceil(lakeR) + 1; dx += 1) {
        const px = lx + dx, pz = lz + dz;
        if (px < 0 || pz < 0 || px >= width || pz >= height) continue;
        const nd = Math.sqrt((dx / lakeR) ** 2 + (dz / (lakeR * lerp(0.7, 1.4, rng()))) ** 2);
        const wobble = fbm2D(Math.atan2(dz, dx) * 3, nd, seed + 4800 + lx, 2, 2, 0.5) * 0.2;
        if (nd + wobble < 1.0) {
          const pidx = toIndex(px, pz, width);
          tiles[pidx] = TILE.WATER;
          elevation[pidx] = 0.1;
          moisture[pidx] = 1.0;
        }
      }
    }
  }

  // Lumber clusters with Poisson distribution (not just edges)
  const lumberPoints = poissonDiskSample(width, height, 12, rng, 12);
  for (const pt of lumberPoints) {
    const lx = Math.round(pt.x);
    const lz = Math.round(pt.z);
    if (lx < 3 || lz < 3 || lx >= width - 3 || lz >= height - 3) continue;
    if (tiles[toIndex(lx, lz, width)] === TILE.WATER) continue;
    const r = lerp(2, 5, rng());
    paintBlob(tiles, width, height, lx, lz, r, r * lerp(0.7, 1.3, rng()), TILE.LUMBER, seed + 4400 + lx * 13, new Set([TILE.GRASS]));
  }

  // Farm clusters near river and lakes (Poisson distributed)
  const farmPoints = poissonDiskSample(width, height, 8, rng, 16);
  for (const pt of farmPoints) {
    const fx = Math.round(pt.x);
    const fz = Math.round(pt.z);
    if (fx < 3 || fz < 3 || fx >= width - 3 || fz >= height - 3) continue;
    const fidx = toIndex(fx, fz, width);
    if (tiles[fidx] !== TILE.GRASS) continue;
    if (moisture[fidx] < 0.25) continue;
    paintBlob(tiles, width, height, fx, fz, lerp(2, 3.5, rng()), lerp(1.5, 3, rng()), TILE.FARM, seed + 4700 + fx * 7, new Set([TILE.GRASS]));
  }

  return { elevation, moisture, ridge };
}

function generateTerrainTiles(width, height, templateId, seed, tuning = {}) {
  const baseProfile = getProfile(templateId);
  const normalizedTuning = sanitizeTerrainTuning(tuning, templateId);
  const profile = deriveProfile(baseProfile, normalizedTuning);
  const rng = createRng(seed);
  const tiles = new Uint8Array(width * height);
  tiles.fill(TILE_EMPTY_SENTINEL);

  let fields;

  if (templateId === "archipelago_isles") {
    fields = generateArchipelagoTerrain(tiles, width, height, seed, profile);
  } else if (templateId === "coastal_ocean") {
    fields = generateCoastlineTerrain(tiles, width, height, seed, profile);
  } else if (templateId === "fertile_riverlands") {
    fields = generateFertileRiverlandsTerrain(tiles, width, height, seed, profile);
  } else if (templateId === "fortified_basin") {
    fields = generateFortifiedBasinTerrain(tiles, width, height, seed, profile);
  } else if (templateId === "rugged_highlands") {
    fields = generateRuggedHighlandsTerrain(tiles, width, height, seed, profile);
  } else if (templateId === "temperate_plains") {
    fields = generateTemperatePlainsTerrain(tiles, width, height, seed, profile);
  } else {
    fields = baseTerrainPass(tiles, width, height, seed, profile);
    for (let i = 0; i < profile.riverCount; i += 1) {
      carveRiver(tiles, width, height, profile, seed + i * 311, i);
    }
  }

  const hubs = [];
  const centerHub = { ix: Math.floor(width / 2), iz: Math.floor(height / 2) };
  hubs.push(centerHub);
  const candidates = findLandCandidates(tiles, width, height, profile.roadHubs * 8, seed + 1201);
  const minHubDist = Math.max(10, Math.floor(Math.min(width, height) * 0.11));

  for (let i = 0; i < profile.roadHubs; i += 1) {
    const picked = pickHub(candidates, hubs, minHubDist * minHubDist, rng);
    if (!picked) break;
    hubs.push({ ix: picked.ix, iz: picked.iz });
  }

  for (let i = 1; i < hubs.length; i += 1) {
    const from = hubs[i - 1];
    const to = hubs[i];
    drawOrganicRoad(tiles, width, height, from, to, rng, profile.roadJitter);
    if (i % 2 === 0) {
      drawOrganicRoad(tiles, width, height, centerHub, to, rng, profile.roadJitter * 0.75);
    }
  }
  for (let i = 0; i < profile.sideRoads; i += 1) {
    if (hubs.length < 2) break;
    const a = hubs[Math.floor(rng() * hubs.length)];
    const b = hubs[Math.floor(rng() * hubs.length)];
    if (a === b) continue;
    drawOrganicRoad(tiles, width, height, a, b, rng, profile.roadJitter * 1.1);
  }
  softenRoadEdges(tiles, width, height);
  placeWarehouses(tiles, width, height, hubs, rng);

  // Radial zone bias for resource placement. Resources placed too close to
  // the colony center gave players everything within arm's reach and removed
  // exploration incentive. Zone thresholds (in tiles):
  //   starting zone  dist < ZONE_NEAR  : heavy penalty — keep start area sparse
  //   mid zone       ZONE_NEAR..FAR    : neutral
  //   far zone       dist >= ZONE_FAR  : bonus — reward exploring outward
  // Distances use Euclidean from grid center (spawn point).
  // ZONE_NEAR raised from 8→16 and max penalty raised from -1.8→-4.0 so that
  // high moisture+road scores (up to ~2.3) can no longer overcome the penalty.
  // Additionally, any tile within 12 tiles of center returns -Infinity so
  // no blob center can ever be placed in the immediate spawn zone.
  const ZONE_NEAR = 16;
  const ZONE_FAR = 25;
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;
  const ZONE_HARD_EXCLUSION = 12;
  function radialZoneBias(ix, iz) {
    const dx = ix - cx;
    const dz = iz - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < ZONE_HARD_EXCLUSION) return -Infinity;
    if (dist < ZONE_NEAR) return -4.0 * (1 - dist / ZONE_NEAR);
    if (dist >= ZONE_FAR) return 0.6 * Math.min(1, (dist - ZONE_FAR) / 15);
    return 0;
  }

  placeDistrictBlobs(
    tiles,
    width,
    height,
    profile.farmBlobs,
    TILE.FARM,
    seed + 1801,
    (i) => pickDistrictCenter(tiles, width, height, seed + 1801 + i * 17, (ix, iz, idx) => {
      const nearRoad = NEIGHBORS_4.some((n) => {
        const nx = ix + n.x;
        const nz = iz + n.z;
        if (nx < 0 || nz < 0 || nx >= width || nz >= height) return false;
        return tiles[toIndex(nx, nz, width)] === TILE.ROAD;
      });
      const moistureScore = fields.moisture[idx] * 1.4;
      const terrainPenalty = tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL ? -10 : 0;
      // Farm-specific bias: softer near-zone penalty (–4→–2) so blobs land at 8–20 tiles,
      // cutting food-transport distance for seeds whose river pushes farms to 30–40 tiles.
      const fdx = ix - cx, fdz = iz - cz;
      const fdist = Math.sqrt(fdx * fdx + fdz * fdz);
      const farmZoneBias = fdist < ZONE_HARD_EXCLUSION ? -Infinity
        : fdist < ZONE_NEAR ? -2.0 * (1 - fdist / ZONE_NEAR)
        : fdist >= ZONE_FAR ? 0.3 * Math.min(1, (fdist - ZONE_FAR) / 15)
        : 0;
      return moistureScore + (nearRoad ? 0.9 : 0) + terrainPenalty + farmZoneBias;
    }),
    2.8,
    5.5,
  );

  // Guarantee one FARM tile within STARTER_BFS_MAX walkable steps of the colony center
  // (warehouse spawn point). Euclidean-distance checks are insufficient because rivers can
  // inflate A* paths to 17-18 steps even when Euclidean distance is ~13 tiles, cutting off
  // zombie-mode coverage and triggering starvation spirals by day 21–44.
  {
    const STARTER_BFS_MAX = 14;
    const STARTER_BFS_MIN = 10;
    const totalTiles = width * height;
    const bfsVisited = new Uint8Array(totalTiles);
    const bfsDepth = new Uint8Array(totalTiles);
    const bfsQueue = new Int32Array(totalTiles);
    let bfsHead = 0, bfsTail = 0;
    const startIdx = cx + cz * width;
    bfsVisited[startIdx] = 1;
    bfsDepth[startIdx] = 0;
    bfsQueue[bfsTail++] = startIdx;
    const bfsDC = [1, -1, 0, 0];
    const bfsDR = [0, 0, 1, -1];
    while (bfsHead < bfsTail) {
      const idx = bfsQueue[bfsHead++];
      const d = bfsDepth[idx];
      if (d >= STARTER_BFS_MAX) continue;
      const ix = idx % width;
      const iz = (idx - ix) / width;
      for (let di = 0; di < 4; di++) {
        const nx = ix + bfsDC[di], nz = iz + bfsDR[di];
        if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
        const ni = nx + nz * width;
        if (bfsVisited[ni]) continue;
        if (tiles[ni] === TILE.WATER) continue;
        bfsVisited[ni] = 1;
        bfsDepth[ni] = d + 1;
        bfsQueue[bfsTail++] = ni;
      }
    }

    let hasReachableFarm = false;
    for (let i = 0; i < totalTiles; i++) {
      if (tiles[i] !== TILE.FARM || !bfsVisited[i]) continue;
      const d = bfsDepth[i];
      if (d >= STARTER_BFS_MIN && d <= STARTER_BFS_MAX) { hasReachableFarm = true; break; }
    }

    if (!hasReachableFarm) {
      let bestIdx = -1, bestScore = -Infinity;
      for (let i = 0; i < totalTiles; i++) {
        if (tiles[i] !== TILE.GRASS || !bfsVisited[i]) continue;
        const d = bfsDepth[i];
        if (d < STARTER_BFS_MIN || d > STARTER_BFS_MAX) continue;
        const score = -Math.abs(d - 12);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
      if (bestIdx >= 0) tiles[bestIdx] = TILE.FARM;
    }
  }

  placeDistrictBlobs(
    tiles,
    width,
    height,
    profile.lumberBlobs,
    TILE.LUMBER,
    seed + 1901,
    (i) => pickDistrictCenter(tiles, width, height, seed + 1901 + i * 19, (ix, iz, idx) => {
      const noise = fields.ridge[idx] * 1.2 + (1 - fields.moisture[idx]) * 0.4;
      const nearRoad = NEIGHBORS_4.some((n) => {
        const nx = ix + n.x;
        const nz = iz + n.z;
        if (nx < 0 || nz < 0 || nx >= width || nz >= height) return false;
        return tiles[toIndex(nx, nz, width)] === TILE.ROAD;
      });
      const terrainPenalty = tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL ? -10 : 0;
      return noise + (nearRoad ? 0.45 : 0) + terrainPenalty + radialZoneBias(ix, iz);
    }),
    2.2,
    4.9,
  );

  placeDistrictBlobs(
    tiles,
    width,
    height,
    profile.quarryBlobs,
    TILE.QUARRY,
    seed + 1951,
    (i) => pickDistrictCenter(tiles, width, height, seed + 1951 + i * 29, (ix, iz, idx) => {
      const ridge = fields.ridge[idx] * 1.6;
      const distEdge = Math.min(ix, iz, width - 1 - ix, height - 1 - iz);
      const edgeBias = 1 - clamp(distEdge / Math.max(4, Math.min(width, height) * 0.28), 0, 1);
      const terrainPenalty = tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL ? -10 : 0;
      return ridge + edgeBias * 0.5 + terrainPenalty + radialZoneBias(ix, iz);
    }),
    1.8,
    3.8,
  );

  placeDistrictBlobs(
    tiles,
    width,
    height,
    profile.herbGardenBlobs,
    TILE.HERB_GARDEN,
    seed + 1976,
    (i) => pickDistrictCenter(tiles, width, height, seed + 1976 + i * 31, (ix, iz, idx) => {
      const moistureScore = fields.moisture[idx] * 1.6;
      const nearFarm = NEIGHBORS_4.some((n) => {
        const nx = ix + n.x;
        const nz = iz + n.z;
        if (nx < 0 || nz < 0 || nx >= width || nz >= height) return false;
        return tiles[toIndex(nx, nz, width)] === TILE.FARM;
      });
      const terrainPenalty = tiles[idx] === TILE.WATER || tiles[idx] === TILE.WALL ? -10 : 0;
      return moistureScore + (nearFarm ? 0.8 : 0) + terrainPenalty + radialZoneBias(ix, iz);
    }),
    2.0,
    4.2,
  );

  placeDistrictBlobs(
    tiles,
    width,
    height,
    profile.ruinsBlobs,
    TILE.RUINS,
    seed + 2001,
    (i) => pickDistrictCenter(tiles, width, height, seed + 2001 + i * 23, (ix, iz, idx) => {
      const distEdge = Math.min(ix, iz, width - 1 - ix, height - 1 - iz);
      const edgeBias = 1 - clamp(distEdge / Math.max(4, Math.min(width, height) * 0.28), 0, 1);
      const rough = fields.ridge[idx];
      return rough * 1.2 + edgeBias * 0.7;
    }),
    1.8,
    3.6,
  );

  applyWalls(tiles, width, height, profile, seed + 2101);
  ensureMinimumInfrastructure(tiles, width, height, seed + 2301);
  trimRoadOverflow(tiles, width, height, profile, seed + 3301);

  const emptyBaseTiles = finalizeTileCoverage(tiles);
  return { tiles, emptyBaseTiles, tuning: normalizedTuning, profile, elevation: fields.elevation, moisture: fields.moisture };
}
export function describeMapTemplate(templateId) {
  return MAP_TEMPLATES.find((tpl) => tpl.id === templateId) ?? MAP_TEMPLATES[0];
}

export function createInitialGrid(options = {}) {
  const width = Math.max(24, Number(options.width) || DEFAULT_GRID.width);
  const height = Math.max(24, Number(options.height) || DEFAULT_GRID.height);
  const tileSize = Number(options.tileSize) || DEFAULT_GRID.tileSize;
  const templateIdInput = typeof options.templateId === "string" ? options.templateId : DEFAULT_MAP_TEMPLATE_ID;
  const templateId = TEMPLATE_PROFILES[templateIdInput] ? templateIdInput : DEFAULT_MAP_TEMPLATE_ID;
  const seedInput = options.seed ?? DEFAULT_MAP_SEED;
  const seed = normalizeSeed(seedInput);
  const tuning = sanitizeTerrainTuning(options.terrainTuning ?? {}, templateId);

  const generated = generateTerrainTiles(width, height, templateId, seed, tuning);

  // Initialize tile state metadata for production/wear tiles. v0.8.0 Phase 3 fields:
  //   salinized    (0..1)    — M1 soil exhaustion accumulator
  //   fallowUntil  (tickNum)  — M1 soil recovery gate
  //   yieldPool    (number)   — M1/M1a remaining harvestable yield on this tile
  //   nodeFlags    (Uint8)    — M1a node bitmask: FOREST=1, STONE=2, HERB=4
  // Seed production tiles with an initial yieldPool so harvest-gating works
  // from tick 0 (silent-failure H3 regression fix — tests that skip
  // TileStateSystem still need non-zero pool on FARM/LUMBER/HERB_GARDEN).
  const farmPoolInit = Number(BALANCE.farmYieldPoolInitial ?? 120);
  const lumberPoolInit = Number(BALANCE.nodeYieldPoolForest ?? 80);
  const herbPoolInit = Number(BALANCE.nodeYieldPoolHerb ?? 60);
  const tileState = new Map();
  // Seeded fertility init — previously Math.random() created run-to-run
  // divergence for identical seeds, polluting long-horizon benchmarks.
  const fertilityRng = createRng(seed + 9973);
  for (let i = 0; i < generated.tiles.length; i++) {
    const type = generated.tiles[i];
    if (type === TILE.FARM) {
      tileState.set(i, createTileStateEntry({ fertility: 0.8 + fertilityRng() * 0.2, yieldPool: farmPoolInit }));
    } else if (type === TILE.LUMBER) {
      tileState.set(i, createTileStateEntry({ fertility: 0.8 + fertilityRng() * 0.2, yieldPool: lumberPoolInit }));
    } else if (type === TILE.HERB_GARDEN) {
      tileState.set(i, createTileStateEntry({ fertility: 0.8 + fertilityRng() * 0.2, yieldPool: herbPoolInit }));
    } else if (type === TILE.ROAD || type === TILE.BRIDGE || type === TILE.WALL) {
      tileState.set(i, createTileStateEntry());
    }
  }

  return {
    width,
    height,
    tileSize,
    tiles: generated.tiles,
    tileState,
    tileStateVersion: 1,
    version: 1,
    templateId,
    seed: seedInput,
    terrainTuning: generated.tuning,
    emptyBaseTiles: generated.emptyBaseTiles,
    elevation: generated.elevation,
    moisture: generated.moisture,
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

// v0.8.0 Phase 3 — single source of truth for a new tileState entry. All three
// init sites (createInitialGrid, setTile, setTileField) route through this to
// avoid schema drift (silent-failure H3/H4, legacy-sweep MUST-CLEAN #1).
export function createTileStateEntry(overrides = {}) {
  return {
    fertility: 0,
    wear: 0,
    growthStage: 0,
    salinized: 0,
    fallowUntil: 0,
    yieldPool: 0,
    nodeFlags: 0,
    lastHarvestTick: -1,
    ...overrides,
  };
}

export function setTile(grid, ix, iz, tileType) {
  if (!inBounds(ix, iz, grid)) return false;
  const idx = toIndex(ix, iz, grid.width);
  if (grid.tiles[idx] === tileType) return false;
  grid.tiles[idx] = tileType;
  grid.version += 1;
  if (grid.tileState) {
    // v0.8.0 Phase 3 M1a — persistent node flags (FOREST/STONE/HERB) are a
    // property of the map, not the building. Preserve across both build AND
    // erase so demolishing a LUMBER keeps its forest node intact (reviewer #2).
    const prev = grid.tileState.get(idx);
    const preservedNodeFlags = Number(prev?.nodeFlags ?? 0);
    const preservedYieldPool = Number(prev?.yieldPool ?? 0);
    if (tileType === TILE.FARM) {
      // Preserve a non-zero pool if one was already there (rebuild on an old
      // node), otherwise seed to the Phase 3 initial value (silent-failure H3).
      const initPool = preservedYieldPool > 0 ? preservedYieldPool : Number(BALANCE.farmYieldPoolInitial ?? 120);
      grid.tileState.set(idx, createTileStateEntry({ fertility: 0.9, nodeFlags: preservedNodeFlags, yieldPool: initPool }));
    } else if (tileType === TILE.LUMBER) {
      const initPool = preservedYieldPool > 0 ? preservedYieldPool : Number(BALANCE.nodeYieldPoolForest ?? 80);
      grid.tileState.set(idx, createTileStateEntry({ fertility: 0.9, nodeFlags: preservedNodeFlags, yieldPool: initPool }));
    } else if (tileType === TILE.HERB_GARDEN) {
      const initPool = preservedYieldPool > 0 ? preservedYieldPool : Number(BALANCE.nodeYieldPoolHerb ?? 60);
      grid.tileState.set(idx, createTileStateEntry({ fertility: 0.9, nodeFlags: preservedNodeFlags, yieldPool: initPool }));
    } else if (tileType === TILE.ROAD || tileType === TILE.BRIDGE || tileType === TILE.WALL) {
      grid.tileState.set(idx, createTileStateEntry({ nodeFlags: preservedNodeFlags, yieldPool: preservedYieldPool }));
    } else if (tileType === TILE.QUARRY || tileType === TILE.KITCHEN || tileType === TILE.SMITHY || tileType === TILE.CLINIC) {
      grid.tileState.set(idx, createTileStateEntry({ nodeFlags: preservedNodeFlags, yieldPool: preservedYieldPool }));
    } else if (preservedNodeFlags !== 0 || preservedYieldPool !== 0) {
      // Erase-to-bare-tile path: keep a minimal entry so nodeFlags persist.
      grid.tileState.set(idx, createTileStateEntry({ nodeFlags: preservedNodeFlags, yieldPool: preservedYieldPool }));
    } else {
      grid.tileState.delete(idx);
    }
    grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
  }
  return true;
}

export function getTileState(grid, ix, iz) {
  if (!inBounds(ix, iz, grid) || !grid.tileState) return null;
  return grid.tileState.get(toIndex(ix, iz, grid.width)) ?? null;
}

export function setTileField(grid, ix, iz, field, value) {
  if (!inBounds(ix, iz, grid) || !grid.tileState) return;
  const idx = toIndex(ix, iz, grid.width);
  let entry = grid.tileState.get(idx);
  if (!entry) {
    entry = createTileStateEntry();
    grid.tileState.set(idx, entry);
  }
  entry[field] = value;
  grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
}

export function isPassable(grid, ix, iz) {
  const tile = getTile(grid, ix, iz);
  return TILE_INFO[tile]?.passable ?? false;
}

export function countTilesByType(grid, targetTileTypes) {
  const typeSet = new Set(targetTileTypes);
  return countTileInternal(grid.tiles, typeSet);
}

export function listTilesByType(grid, targetTileTypes) {
  const cache = getGridTileListCache(grid);
  const key = tileTypeCacheKey(targetTileTypes);
  const cached = cache.byKey.get(key);
  if (cached) return cached;

  const out = [];
  const asSet = new Set(targetTileTypes);
  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      const t = grid.tiles[toIndex(ix, iz, grid.width)];
      if (asSet.has(t)) out.push({ ix, iz });
    }
  }
  cache.byKey.set(key, out);
  return out;
}

export function findNearestTileOfTypes(grid, from, targetTileTypes) {
  const list = listTilesByType(grid, targetTileTypes);
  if (list.length === 0) return null;
  const { ix: sx, iz: sz } = worldToTile(from.x, from.z, grid);
  let best = null;
  let bestDist = Infinity;

  for (let i = 0; i < list.length; i += 1) {
    const tile = list[i];
    const d = Math.abs(tile.ix - sx) + Math.abs(tile.iz - sz);
    if (d < bestDist) {
      bestDist = d;
      best = tile;
    }
  }
  return best;
}

export function randomTileOfTypes(grid, targetTileTypes, random = Math.random) {
  const list = listTilesByType(grid, targetTileTypes);
  if (list.length === 0) return randomPassableTile(grid, random);
  const idx = Math.floor(clamp(random(), 0, 0.999999) * list.length);
  return list[idx];
}

export function randomPassableTile(grid, random = Math.random) {
  const passableTypes = Object.entries(TILE_INFO)
    .filter(([, info]) => info.passable)
    .map(([type]) => Number(type));
  const passableList = listTilesByType(grid, passableTypes);
  if (passableList.length > 0) {
    const idx = Math.floor(clamp(random(), 0, 0.999999) * passableList.length);
    return passableList[idx];
  }

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
    roads: countTilesByType(grid, [TILE.ROAD]),
    walls: countTilesByType(grid, [TILE.WALL]),
    quarries: countTilesByType(grid, [TILE.QUARRY]),
    herbGardens: countTilesByType(grid, [TILE.HERB_GARDEN]),
    kitchens: countTilesByType(grid, [TILE.KITCHEN]),
    smithies: countTilesByType(grid, [TILE.SMITHY]),
    clinics: countTilesByType(grid, [TILE.CLINIC]),
    bridges: countTilesByType(grid, [TILE.BRIDGE]),
  };
}

export function validateGeneratedGrid(grid) {
  const issues = [];
  if (!grid || typeof grid !== "object") {
    return { ok: false, issues: ["grid missing"] };
  }
  if (!Number.isFinite(grid.width) || !Number.isFinite(grid.height) || grid.width <= 0 || grid.height <= 0) {
    issues.push("invalid dimensions");
  }
  if (!(grid.tiles instanceof Uint8Array)) {
    issues.push("tiles is not Uint8Array");
  } else if (grid.tiles.length !== grid.width * grid.height) {
    issues.push("tiles length mismatch");
  }
  if (issues.length > 0) return { ok: false, issues };

  const area = grid.width * grid.height;
  const profile = getProfile(grid.templateId ?? DEFAULT_MAP_TEMPLATE_ID);
  const validation = profile.validation ?? {};

  let unknownTiles = 0;
  for (let i = 0; i < grid.tiles.length; i += 1) {
    if (TILE_INFO[grid.tiles[i]] === undefined) unknownTiles += 1;
  }

  const roads = countTilesByType(grid, [TILE.ROAD]);
  const farms = countTilesByType(grid, [TILE.FARM]);
  const lumbers = countTilesByType(grid, [TILE.LUMBER]);
  const warehouses = countTilesByType(grid, [TILE.WAREHOUSE]);
  const walls = countTilesByType(grid, [TILE.WALL]);
  const ruins = countTilesByType(grid, [TILE.RUINS]);
  const water = countTilesByType(grid, [TILE.WATER]);
  const passable = countTilesByType(grid, [TILE.GRASS, TILE.ROAD, TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE, TILE.RUINS, TILE.QUARRY, TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC, TILE.BRIDGE]);
  const roadMinRatio = toNumberOr(validation.roadMinRatio, 0.02);
  const roadMin = roadMinRatio <= 0 ? 0 : Math.max(40, Math.round(area * roadMinRatio));
  const waterMin = Math.max(8, Math.round(area * toNumberOr(validation.waterMinRatio, 0.03)));
  const waterMax = Math.round(area * toNumberOr(validation.waterMaxRatio, 0.6));
  const passableRatio = passable / Math.max(1, area);
  const passableMin = toNumberOr(validation.passableMin, 0.42);
  const passableMax = toNumberOr(validation.passableMax, 0.94);

  const farmMin = toNumberOr(validation.farmMin, 2);
  const lumberMin = toNumberOr(validation.lumberMin, 2);
  const warehouseMin = toNumberOr(validation.warehouseMin, 1);

  if (unknownTiles > 0) issues.push(`unknown tiles present (${unknownTiles})`);
  if (roads < roadMin) issues.push(`road too low (${roads} < ${roadMin})`);
  if (farms < farmMin) issues.push("farm too low");
  if (lumbers < lumberMin) issues.push("lumber too low");
  if (warehouses < warehouseMin) issues.push("warehouse too low");
  if (water < waterMin) issues.push(`water too low (${water} < ${waterMin})`);
  if (water > waterMax) issues.push(`water too high (${water} > ${waterMax})`);
  if (passableRatio < passableMin) issues.push(`passable ratio too low (${passableRatio.toFixed(3)})`);
  if (passableRatio > passableMax) issues.push(`passable ratio too high (${passableRatio.toFixed(3)})`);
  if (walls > Math.round(area * 0.35)) issues.push("wall too dense");
  if (ruins > Math.round(area * 0.2)) issues.push("ruins too dense");

  // Connectivity check: largest connected passable region should cover ≥40% of passable tiles
  if (passable > 0) {
    const passableSet = new Set();
    for (const info of Object.entries(TILE_INFO)) {
      if (info[1].passable) passableSet.add(Number(info[0]));
    }
    const visited = new Uint8Array(area);
    let largestRegion = 0;

    for (let start = 0; start < area; start += 1) {
      if (visited[start] || !passableSet.has(grid.tiles[start])) continue;
      let regionSize = 0;
      const stack = [start];
      visited[start] = 1;
      while (stack.length > 0) {
        const cur = stack.pop();
        regionSize += 1;
        const ci = cur % grid.width;
        const cj = Math.floor(cur / grid.width);
        for (const n of NEIGHBORS_4) {
          const ni = ci + n.x;
          const nj = cj + n.z;
          if (ni < 0 || nj < 0 || ni >= grid.width || nj >= grid.height) continue;
          const nIdx = ni + nj * grid.width;
          if (visited[nIdx] || !passableSet.has(grid.tiles[nIdx])) continue;
          visited[nIdx] = 1;
          stack.push(nIdx);
        }
      }
      if (regionSize > largestRegion) largestRegion = regionSize;
    }

    const connectivityRatio = largestRegion / Math.max(1, passable);
    if (connectivityRatio < 0.4) {
      issues.push(`connectivity too low (${(connectivityRatio * 100).toFixed(1)}% of passable in largest region)`);
    }
  }

  return { ok: issues.length === 0, issues };
}
