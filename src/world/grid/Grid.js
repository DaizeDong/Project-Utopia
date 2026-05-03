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
export { DEFAULT_MAP_SEED };

/**
 * v0.10.1 A7-rationality-audit R2 (P0 #7) — boot-seed picker.
 *
 * Resolves the initial map seed for a fresh page load. Order of precedence:
 *   1. URL query `?seed=<n>` (explicit player choice; reproducible link)
 *   2. `localStorage.utopia:bootSeed` (pinned seed for repeat runs)
 *   3. random 31-bit integer (every fresh boot gets a unique world)
 *
 * Returning a randomized seed by default fixes finding #7 (the leaderboard
 * was recording every loss as `seed 1337 · loss` because every fresh boot
 * funnelled through `DEFAULT_MAP_SEED`). Tests / benchmarks that need
 * determinism still call `createServices(1337, ...)` / `createInitialGrid({
 * seed: 1337 })` explicitly — this helper is only invoked from the GameApp
 * boot path via `createServicesForFreshBoot`.
 *
 * Pure function — both `urlParams` and `storage` are injectable so the
 * helper is unit-testable without a live window/localStorage.
 *
 * @param {object} [opts]
 * @param {URLSearchParams} [opts.urlParams]
 * @param {Storage|null}    [opts.storage]
 * @param {() => number}    [opts.random]   defaults to Math.random
 * @returns {number} 31-bit unsigned integer
 */
export function pickBootSeed({ urlParams, storage, random = Math.random } = {}) {
  if (urlParams) {
    try {
      const raw = urlParams.get("seed");
      if (raw != null) {
        const n = Number(raw);
        if (Number.isFinite(n)) return (n >>> 0) || DEFAULT_MAP_SEED;
      }
    } catch {
      /* malformed URLSearchParams — fall through */
    }
  }
  if (storage) {
    try {
      const raw = storage.getItem("utopia:bootSeed");
      if (raw != null) {
        const n = Number(raw);
        if (Number.isFinite(n)) return (n >>> 0) || DEFAULT_MAP_SEED;
      }
    } catch {
      /* storage may throw in privacy mode — fall through */
    }
  }
  // Math.random() returns a float in [0, 1); scale to 31-bit unsigned int
  // and OR with 1 to guarantee non-zero (zero would feed back through
  // resolveSeed → DEFAULT_MAP_SEED, defeating the randomization).
  const r = Math.floor((Number(random()) || 0) * 0x7fffffff) | 1;
  return r >>> 0;
}
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
    validation: { waterMinRatio: 0.03, waterMaxRatio: 0.35, passableMin: 0.60, passableMax: 0.96, roadMinRatio: 0.0 },
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
    validation: { waterMinRatio: 0.04, waterMaxRatio: 0.50, passableMin: 0.10, passableMax: 0.94, roadMinRatio: 0.0 },
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
    validation: { waterMinRatio: 0.03, waterMaxRatio: 0.45, passableMin: 0.45, passableMax: 0.96, roadMinRatio: 0.0 },
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
    validation: { waterMinRatio: 0.0, waterMaxRatio: 0.40, passableMin: 0.35, passableMax: 0.95, roadMinRatio: 0.0 },
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

/**
 * v0.8.9 Terrain rewrite — branching river network.
 *
 * Replaces the single sine-wave `carveRiver` for templates that want
 * realistic-feeling hydrology. Picks elevated source points via Poisson-like
 * spread, walks downhill following the elevation gradient with small RNG
 * jitter, and recursively spawns perpendicular tributary branches with
 * tapered width.
 *
 * Determinism: fully driven by `opts.seed` through `createRng`. No use of
 * `Math.random` anywhere — same seed always reproduces the exact same
 * branching topology and width pattern.
 *
 * @param {object} opts
 * @param {Uint8Array} opts.tiles
 * @param {Float32Array} [opts.elevation]  — read-only elevation field used for
 *                                            source picking and downhill walks.
 * @param {Float32Array} [opts.moisture]   — boosted in a 3-tile radius around
 *                                            every carved tile.
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} opts.seed
 * @param {number} [opts.mainCount=2]
 * @param {number} [opts.branchProb=0.06]
 * @param {number} [opts.maxBranchDepth=2]
 * @param {number} [opts.minWidth=1]
 * @param {number} [opts.maxWidth=3]
 * @param {number} [opts.maxLen=120]
 */
export function carveRiverNetwork(opts) {
  const {
    tiles,
    elevation,
    moisture,
    width,
    height,
    seed,
    mainCount = 2,
    branchProb = 0.10,
    maxBranchDepth = 3,
    minWidth = 1,
    maxWidth = 2,
    maxLen = 120,
  } = opts;
  if (!tiles || !elevation || !width || !height) return;
  // Independent RNG so adding the network doesn't shift downstream RNG state.
  const rng = createRng((normalizeSeed(seed) ^ 0x52315633) >>> 0); // 0xR1V3R-ish
  const area = width * height;

  // ---- Source picking: high-elevation tiles spaced at least minSourceDist apart.
  const minSourceDist = 12;
  const minSourceDistSq = minSourceDist * minSourceDist;
  const margin = 3;
  const candidates = [];
  for (let iz = margin; iz < height - margin; iz += 1) {
    for (let ix = margin; ix < width - margin; ix += 1) {
      const idx = ix + iz * width;
      if (tiles[idx] === TILE.WATER) continue;
      if (elevation[idx] <= 0.6) continue;
      // weight ~ elevation^2 so the highest tiles are strongly preferred.
      const w = elevation[idx] * elevation[idx] + rng() * 0.05;
      candidates.push({ ix, iz, w });
    }
  }
  // Fallback: if no high-elevation tiles exist (e.g. low-relief plains), pick
  // from anywhere with elevation > 0.4.
  if (candidates.length < mainCount) {
    for (let iz = margin; iz < height - margin; iz += 1) {
      for (let ix = margin; ix < width - margin; ix += 1) {
        const idx = ix + iz * width;
        if (tiles[idx] === TILE.WATER) continue;
        if (elevation[idx] <= 0.4) continue;
        candidates.push({ ix, iz, w: elevation[idx] + rng() * 0.05 });
      }
    }
  }
  candidates.sort((a, b) => b.w - a.w);

  const sources = [];
  for (const c of candidates) {
    if (sources.length >= mainCount) break;
    let ok = true;
    for (const s of sources) {
      const dx = c.ix - s.ix;
      const dz = c.iz - s.iz;
      if (dx * dx + dz * dz < minSourceDistSq) { ok = false; break; }
    }
    if (ok) sources.push(c);
  }
  if (sources.length === 0) return;

  // ---- Carve helpers (closures capture tiles/elevation/moisture).
  const carved = []; // list of {ix, iz} for moisture pass.

  function paintDisc(cx, cz, radius) {
    // Always paint center tile (single-tile rivers shouldn't disappear).
    const cIdx = cx + cz * width;
    if (cx >= 0 && cz >= 0 && cx < width && cz < height) {
      if (tiles[cIdx] !== TILE.WATER) {
        tiles[cIdx] = TILE.WATER;
        carved.push({ ix: cx, iz: cz });
      }
    }
    if (radius < 1) return;
    const r = radius;
    const rSq = r * r + 0.25; // include diagonal-1 at r=1
    for (let dz = -r; dz <= r; dz += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        if (dx * dx + dz * dz > rSq) continue;
        const px = cx + dx;
        const pz = cz + dz;
        if (px < 0 || pz < 0 || px >= width || pz >= height) continue;
        const pIdx = px + pz * width;
        if (tiles[pIdx] === TILE.WATER) continue;
        tiles[pIdx] = TILE.WATER;
        carved.push({ ix: px, iz: pz });
      }
    }
  }

  function bestDownhillNeighbor(ix, iz, prevIx, prevIz) {
    const idx = ix + iz * width;
    const here = elevation[idx];
    let bestE = Infinity;
    let bestX = ix;
    let bestZ = iz;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= width || nz >= height) return { hit: "edge", nx, nz };
        // Avoid immediately reversing.
        if (nx === prevIx && nz === prevIz) continue;
        const nIdx = nx + nz * width;
        if (tiles[nIdx] === TILE.WATER) return { hit: "water", nx, nz };
        const jitter = (rng() - 0.5) * 0.05;
        const e = elevation[nIdx] + jitter;
        if (e < bestE) {
          bestE = e;
          bestX = nx;
          bestZ = nz;
        }
      }
    }
    if (bestX === ix && bestZ === iz) return { hit: "sink", nx: ix, nz: iz };
    if (bestE >= here + 0.04) return { hit: "sink", nx: ix, nz: iz };
    return { hit: "step", nx: bestX, nz: bestZ };
  }

  function walkRiver(startIx, startIz, startWidth, depth, initialDir) {
    let ix = startIx | 0;
    let iz = startIz | 0;
    let prevIx = initialDir ? ix - initialDir.dx : -1;
    let prevIz = initialDir ? iz - initialDir.dz : -1;
    const wMin = Math.max(1, minWidth);
    const wMax = Math.max(wMin, maxWidth);
    let curWidth = clamp(startWidth, wMin, wMax);

    for (let step = 0; step < maxLen; step += 1) {
      // Width tapers FROM full near source TO half near mouth — counter to
      // real hydrology, but visually clearer for gameplay (sources read as
      // "lakes" / wide pools and tributaries thin out).
      const taper = 1 - 0.5 * (step / Math.max(1, maxLen));
      const localWidth = Math.max(wMin, Math.round(curWidth * taper));
      paintDisc(ix, iz, Math.floor(localWidth / 2));

      const stepRes = bestDownhillNeighbor(ix, iz, prevIx, prevIz);
      if (stepRes.hit === "sink") break;
      if (stepRes.hit === "water") {
        paintDisc(stepRes.nx, stepRes.nz, Math.floor(localWidth / 2));
        break;
      }
      if (stepRes.hit === "edge") break;

      // Branch decision (only on a real downhill step, after the source).
      if (depth < maxBranchDepth && step > 3 && rng() < branchProb) {
        // Direction perpendicular-ish to flow.
        const dx = stepRes.nx - ix;
        const dz = stepRes.nz - iz;
        // Two perpendiculars; pick one randomly. v0.8.9 Phase B: branches now
        // depart at ±60-90° from flow direction (was ±45-135°). We start at
        // perpendicular (90° from flow) and pull back toward forward by 0-30°,
        // keeping the angle in [60°, 90°] for visibly tree-like branching.
        const side = rng() < 0.5 ? 1 : -1;
        const perpDx = -dz * side;
        const perpDz = dx * side;
        const flowAng = Math.atan2(dz, dx);
        const perpAng = Math.atan2(perpDz, perpDx);
        // Pull the perpendicular back toward the flow direction by 0..30°.
        // Sign of pull is chosen so the result lies between perp and flow,
        // which keeps the branch angle in [60°, 90°] from flow.
        let pullSign = 0;
        const dAng = ((perpAng - flowAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        pullSign = dAng > 0 ? -1 : 1;
        const ang = perpAng + pullSign * rng() * (Math.PI / 6);
        const branchDx = Math.round(Math.cos(ang));
        const branchDz = Math.round(Math.sin(ang));
        // Sharper visual contrast: branch width = max(1, parent - 1) rather
        // than parent * 0.65 — so a width-3 main spawns width-2 tributaries
        // and width-1 minors.
        const childWidth = Math.max(wMin, curWidth - 1);
        // Start the branch one tile in the perpendicular direction so it
        // doesn't immediately collapse back into the parent.
        const bx = clamp(ix + branchDx, 1, width - 2);
        const bz = clamp(iz + branchDz, 1, height - 2);
        walkRiver(bx, bz, childWidth, depth + 1, { dx: branchDx, dz: branchDz });
      }

      prevIx = ix;
      prevIz = iz;
      ix = stepRes.nx;
      iz = stepRes.nz;
    }
  }

  // ---- Drive each main river.
  for (let i = 0; i < sources.length; i += 1) {
    const src = sources[i];
    const startWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(lerp(minWidth, maxWidth, rng()))));
    walkRiver(src.ix, src.iz, startWidth, 0, null);
  }

  // ---- Moisture boost in radius 2 around every carved tile (was 3 in
  // Phase A — tighter band prevents the visual "wide green ribbon" effect
  // and lets biomes downstream show the mid-moisture zones away from rivers).
  if (moisture && carved.length > 0) {
    for (const c of carved) {
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = c.ix + dx;
          const nz = c.iz + dz;
          if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 2) continue;
          const nIdx = nx + nz * width;
          const fall = 0.85 * (1 - dist / 2.5);
          if (moisture[nIdx] < fall) moisture[nIdx] = fall;
        }
      }
    }
  }
}

/**
 * v0.8.9 Terrain rewrite — per-seed macro features.
 *
 * Stamps 1-3 large-scale terrain features onto the elevation/moisture fields
 * BEFORE biome assignment / river carving so the same template feels visibly
 * different across seeds. Pool of 6 features; per-template weights nudge
 * selection toward the template's identity (e.g. highlands favour
 * mountainRidge+canyon, riverlands favour basin+peninsula).
 *
 * Determinism: same `seed`+`templateId` always picks the same features with
 * the same parameters. Each feature uses its own derived RNG so picking the
 * same feature on different seeds still varies orientation/amplitude.
 *
 * @param {object} opts
 * @param {Float32Array} opts.elevation
 * @param {Float32Array} opts.moisture
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} opts.seed
 * @param {string}  [opts.templateId]
 * @param {number}  [opts.count]  — override 1..3 feature count.
 */
export function applyMacroFeatures({ elevation, moisture, width, height, seed, templateId = DEFAULT_MAP_TEMPLATE_ID, count }) {
  if (!elevation || !moisture || !width || !height) return;
  const rng = createRng((normalizeSeed(seed) ^ 0x4D41435F) >>> 0); // "MAC_"

  // ---- Feature implementations. Each mutates elevation/moisture in [0..1].
  function gaussianStamp(cx, cz, radius, dE, dM) {
    const r = Math.max(1, radius);
    const r2 = r * r;
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(width - 1, Math.ceil(cx + r));
    const minZ = Math.max(0, Math.floor(cz - r));
    const maxZ = Math.min(height - 1, Math.ceil(cz + r));
    for (let iz = minZ; iz <= maxZ; iz += 1) {
      for (let ix = minX; ix <= maxX; ix += 1) {
        const dx = ix - cx;
        const dz = iz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        const fall = Math.exp(-3 * d2 / r2); // smooth ~Gaussian
        const idx = ix + iz * width;
        if (dE !== 0) elevation[idx] = clamp(elevation[idx] + dE * fall, 0, 1);
        if (dM !== 0) moisture[idx] = clamp(moisture[idx] + dM * fall, 0, 1);
      }
    }
  }

  // Each feature derives its own RNG so the same feature on different seeds
  // still varies, and so adding/removing features doesn't shift other RNG
  // state for downstream phases.
  function rngFor(name) {
    return createRng((normalizeSeed(seed) + name.charCodeAt(0) * 99) >>> 0);
  }

  const FEATURES = {
    mountainRidge(p) {
      // Linear high-elevation stripe at random orientation.
      const r = rngFor("mountainRidge");
      const cx = width * (0.3 + r() * 0.4);
      const cz = height * (0.3 + r() * 0.4);
      const angle = r() * Math.PI;
      const length = Math.min(width, height) * lerp(0.45, 0.85, r());
      const halfThick = Math.max(2.5, Math.min(width, height) * lerp(0.04, 0.09, r()));
      const amp = lerp(0.18, 0.32, r()) * (p?.intensity ?? 1);
      const ux = Math.cos(angle);
      const uz = Math.sin(angle);
      const stamps = Math.floor(length / 2);
      for (let s = 0; s <= stamps; s += 1) {
        const t = s / Math.max(1, stamps) - 0.5;
        const px = cx + ux * t * length + (r() - 0.5) * 1.5;
        const pz = cz + uz * t * length + (r() - 0.5) * 1.5;
        gaussianStamp(px, pz, halfThick, amp, -0.05);
      }
    },
    basin(p) {
      const r = rngFor("basin");
      const cx = width * (0.3 + r() * 0.4);
      const cz = height * (0.3 + r() * 0.4);
      const radius = Math.min(width, height) * lerp(0.16, 0.28, r());
      const amp = -lerp(0.18, 0.30, r()) * (p?.intensity ?? 1);
      gaussianStamp(cx, cz, radius, amp, 0.18);
    },
    mesa(p) {
      // Cluster of 3-5 small high-elevation patches.
      const r = rngFor("mesa");
      const groupCx = width * (0.25 + r() * 0.5);
      const groupCz = height * (0.25 + r() * 0.5);
      const patches = 3 + Math.floor(r() * 3);
      const spread = Math.min(width, height) * 0.15;
      for (let i = 0; i < patches; i += 1) {
        const px = groupCx + (r() - 0.5) * spread * 2;
        const pz = groupCz + (r() - 0.5) * spread * 2;
        const radius = Math.min(width, height) * lerp(0.04, 0.09, r());
        const amp = lerp(0.20, 0.32, r()) * (p?.intensity ?? 1);
        gaussianStamp(px, pz, radius, amp, -0.05);
      }
    },
    canyon(p) {
      // Linear low-elevation cut.
      const r = rngFor("canyon");
      const cx = width * 0.5 + (r() - 0.5) * width * 0.2;
      const cz = height * 0.5 + (r() - 0.5) * height * 0.2;
      const angle = r() * Math.PI;
      const length = Math.min(width, height) * lerp(0.55, 0.95, r());
      const halfThick = Math.max(1.8, Math.min(width, height) * lerp(0.025, 0.05, r()));
      const amp = -lerp(0.22, 0.36, r()) * (p?.intensity ?? 1);
      const ux = Math.cos(angle);
      const uz = Math.sin(angle);
      const stamps = Math.floor(length / 1.5);
      for (let s = 0; s <= stamps; s += 1) {
        const t = s / Math.max(1, stamps) - 0.5;
        const px = cx + ux * t * length + (r() - 0.5) * 1.0;
        const pz = cz + uz * t * length + (r() - 0.5) * 1.0;
        gaussianStamp(px, pz, halfThick, amp, 0.18);
      }
    },
    peninsula(p) {
      // Arm of high terrain extending into water from an edge.
      const r = rngFor("peninsula");
      const side = Math.floor(r() * 4); // 0=N, 1=E, 2=S, 3=W
      let baseX, baseZ, dirX, dirZ;
      if (side === 0) { baseX = width * (0.25 + r() * 0.5); baseZ = 1; dirX = 0; dirZ = 1; }
      else if (side === 1) { baseX = width - 2; baseZ = height * (0.25 + r() * 0.5); dirX = -1; dirZ = 0; }
      else if (side === 2) { baseX = width * (0.25 + r() * 0.5); baseZ = height - 2; dirX = 0; dirZ = -1; }
      else { baseX = 1; baseZ = height * (0.25 + r() * 0.5); dirX = 1; dirZ = 0; }
      const length = Math.min(width, height) * lerp(0.30, 0.55, r());
      const halfThick = Math.max(2.2, Math.min(width, height) * lerp(0.05, 0.10, r()));
      const amp = lerp(0.22, 0.34, r()) * (p?.intensity ?? 1);
      const stamps = Math.floor(length / 2);
      for (let s = 0; s <= stamps; s += 1) {
        const px = baseX + dirX * s * 2 + (r() - 0.5) * 2;
        const pz = baseZ + dirZ * s * 2 + (r() - 0.5) * 2;
        gaussianStamp(px, pz, halfThick * (1 - s / (stamps + 1) * 0.5), amp, -0.05);
      }
    },
    ancientCrater(p) {
      // Round depression with a raised rim.
      const r = rngFor("ancientCrater");
      const cx = width * (0.3 + r() * 0.4);
      const cz = height * (0.3 + r() * 0.4);
      const radius = Math.min(width, height) * lerp(0.12, 0.20, r());
      const innerAmp = -lerp(0.22, 0.32, r()) * (p?.intensity ?? 1);
      const rimAmp = lerp(0.20, 0.30, r()) * (p?.intensity ?? 1);
      // Ring of stamps for the rim.
      const ringStamps = 16;
      for (let s = 0; s < ringStamps; s += 1) {
        const a = (s / ringStamps) * Math.PI * 2;
        const px = cx + Math.cos(a) * radius;
        const pz = cz + Math.sin(a) * radius;
        gaussianStamp(px, pz, radius * 0.32, rimAmp, 0);
      }
      // Inner depression.
      gaussianStamp(cx, cz, radius * 0.85, innerAmp, 0.10);
    },
  };

  // ---- Per-template weight tables.
  const TEMPLATE_WEIGHTS = {
    rugged_highlands: { mountainRidge: 4, mesa: 3, canyon: 3, basin: 1, peninsula: 1, ancientCrater: 1 },
    fertile_riverlands: { basin: 4, peninsula: 3, ancientCrater: 2, mesa: 1, mountainRidge: 1, canyon: 1 },
    temperate_plains: { mesa: 3, ancientCrater: 3, basin: 2, mountainRidge: 1, canyon: 1, peninsula: 1 },
    fortified_basin: { basin: 5, ancientCrater: 2, mountainRidge: 2, mesa: 1, canyon: 1, peninsula: 1 },
    archipelago_isles: { peninsula: 4, mesa: 3, ancientCrater: 1, basin: 1, mountainRidge: 1, canyon: 0 },
    coastal_ocean: { peninsula: 4, mesa: 3, basin: 1, mountainRidge: 2, canyon: 0, ancientCrater: 1 },
  };
  const weights = TEMPLATE_WEIGHTS[templateId] || TEMPLATE_WEIGHTS[DEFAULT_MAP_TEMPLATE_ID];

  // ---- Pick count + features.
  const featureCount = Number.isFinite(count) ? clamp(count | 0, 1, 3) : 1 + Math.floor(rng() * 3);
  const picked = [];
  // Special case: fortified_basin always has at least one basin (its identity).
  if (templateId === "fortified_basin") {
    picked.push("basin");
  }
  const remaining = { ...weights };
  while (picked.length < featureCount) {
    let total = 0;
    for (const k of Object.keys(remaining)) total += Math.max(0, remaining[k]);
    if (total <= 0) break;
    let t = rng() * total;
    let chosen = null;
    for (const k of Object.keys(remaining)) {
      t -= Math.max(0, remaining[k]);
      if (t <= 0) { chosen = k; break; }
    }
    if (!chosen) chosen = Object.keys(remaining)[0];
    picked.push(chosen);
    // Halve the weight rather than zero it so duplicates are unlikely but
    // possible (e.g. two mesas), which is the kind of variation we want.
    remaining[chosen] = (remaining[chosen] ?? 0) * 0.25;
  }

  for (const name of picked) {
    const fn = FEATURES[name];
    if (typeof fn !== "function") continue;
    fn({ intensity: 1 });
  }
}

// ---------------------------------------------------------------------------
// v0.8.9 Phase B — Biome classification.
// ---------------------------------------------------------------------------

export const BIOME = Object.freeze({
  OPEN_PLAINS: 0,
  LUSH_VALLEY: 1,
  WOODLAND: 2,
  ROCKY_HILL: 3,
  MOUNTAIN: 4,
  WETLAND: 5,
  SCRUB: 6,
});

export const BIOME_NAMES = Object.freeze([
  "OPEN_PLAINS", "LUSH_VALLEY", "WOODLAND", "ROCKY_HILL", "MOUNTAIN", "WETLAND", "SCRUB",
]);

/**
 * Classify each tile into one of N biomes from elevation+moisture+ridge.
 * Returns Uint8Array same length as tiles. Biomes are *advisory* — they
 * inform downstream placement weights, not the tile id itself (tiles are
 * still GRASS/WATER/etc.).
 *
 * Biome ids:
 *   0 OPEN_PLAINS    — low elevation + low moisture
 *   1 LUSH_VALLEY    — low elevation + high moisture (river-adjacent)
 *   2 WOODLAND       — mid elevation + mid moisture
 *   3 ROCKY_HILL     — mid-high elevation, dry-ish
 *   4 MOUNTAIN       — high elevation, ridge-adjacent
 *   5 WETLAND        — very low + very high moisture (near water)
 *   6 SCRUB          — mid elevation, very dry
 *
 * @param {object} opts
 * @param {Float32Array} opts.elevation
 * @param {Float32Array} opts.moisture
 * @param {Float32Array} opts.ridge
 * @param {number} opts.width
 * @param {number} opts.height
 * @returns {Uint8Array}
 */
export function classifyBiomes({ elevation, moisture, ridge, width, height }) {
  const area = width * height;
  const out = new Uint8Array(area);
  if (!elevation || !moisture || !width || !height) return out;
  const r = ridge || null;
  // First pass: compute moisture and elevation thresholds adaptive to the
  // map's actual distribution. Templates have different moisture means
  // (riverlands ~0.5, plains ~0.25, archipelago varied), so a single absolute
  // threshold (e.g. m<0.28 == SCRUB) collapses entire templates into one
  // biome. We sample percentile cuts instead.
  const sampleStride = Math.max(1, Math.floor(Math.sqrt(area / 800)));
  const mSamples = [];
  const eSamples = [];
  for (let i = 0; i < area; i += sampleStride) {
    mSamples.push(moisture[i]);
    eSamples.push(elevation[i]);
  }
  mSamples.sort((a, b) => a - b);
  eSamples.sort((a, b) => a - b);
  const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)))];
  const M_DRY = pct(mSamples, 0.30);   // bottom 30%
  const M_WET = pct(mSamples, 0.70);   // top 30%
  const M_VWET = pct(mSamples, 0.88);  // top 12%
  const E_LOW = pct(eSamples, 0.30);
  const E_MID = pct(eSamples, 0.60);
  const E_HIGH = pct(eSamples, 0.85);

  for (let i = 0; i < area; i += 1) {
    const e = elevation[i];
    const m = moisture[i];
    const rd = r ? r[i] : 0;

    // Mountain: top-elevation tier, optionally bumped by ridge.
    if (e >= E_HIGH || (e >= E_MID + 0.05 && rd >= 0.45)) { out[i] = BIOME.MOUNTAIN; continue; }
    // Wetland: very low elevation + very high moisture (riverbank, marsh).
    if (e < E_LOW && m >= M_VWET) { out[i] = BIOME.WETLAND; continue; }
    // Lush valley: low elevation + high moisture.
    if (e < E_MID && m >= M_WET) { out[i] = BIOME.LUSH_VALLEY; continue; }
    // Rocky hill: mid-high elevation, dry-ish.
    if (e >= E_MID && m < M_WET) { out[i] = BIOME.ROCKY_HILL; continue; }
    // Scrub: dry across the moisture distribution.
    if (m < M_DRY) { out[i] = BIOME.SCRUB; continue; }
    // Woodland: mid elevation + mid moisture (default forest band).
    if (e >= E_LOW && m >= M_DRY && m < M_WET) { out[i] = BIOME.WOODLAND; continue; }
    // Otherwise: open plains (low elevation, low/mid moisture).
    out[i] = BIOME.OPEN_PLAINS;
  }
  return out;
}

/**
 * Multiplier on a placement candidate's score based on its biome.
 * Returns 1.6 if the biome is in `preferred`, 0.5 if in `disliked`, 1.0
 * otherwise. Used by the resource-blob picker to bias placement toward
 * biome-appropriate zones without overriding road/zone weights.
 */
export function biomeAffinity(biome, preferred, disliked) {
  if (preferred && preferred.includes(biome)) return 1.6;
  if (disliked && disliked.includes(biome)) return 0.5;
  return 1.0;
}

// ---------------------------------------------------------------------------
// v0.8.9 Phase B — Quirks.
//
// Hand-crafted local detail features. Each seed picks 0-2 quirks at generation
// time; the same seed always picks the same quirks (independent RNG stream
// keyed off the seed). Quirks add visible personality to a map without
// shifting balance — they're sized small and search for plausible host
// regions before committing.
// ---------------------------------------------------------------------------

const QUIRK_SPECIAL_TILES = new Set([
  TILE.WAREHOUSE, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC, TILE.WALL, TILE.GATE, TILE.BRIDGE,
]);

function quirkTileSafe(t) {
  // Quirks may write to GRASS / FARM / LUMBER / RUINS / HERB_GARDEN / QUARRY /
  // ROAD-edges, but never on warehouses, processing buildings, walls, gates,
  // or pre-existing bridges.
  return !QUIRK_SPECIAL_TILES.has(t);
}

/**
 * Apply 0-2 small "quirk" features per seed. Each quirk is a hand-crafted
 * local detail that gives a seed unique flavor without disrupting balance.
 *
 * Quirk pool (each is independent of template):
 *   - ruinsCluster      — 5-9 RUINS in a tight blob (size 3-4 radius)
 *   - oasis             — 1 small WATER pool with HERB_GARDEN ring,
 *                         placed in a low-moisture area
 *   - ancientRoad       — short ROAD segment (8-14 tiles) in the wilderness,
 *                         disconnected from main road network
 *   - marshPatch        — irregular WATER patch with raised moisture (+0.2)
 *                         in a low-elevation area
 *   - stoneOutcrop      — small QUARRY-eligible cluster (3-5 raised tiles)
 *                         in a non-mountain area
 *   - lostFarm          — single FARM tile far from warehouses (decayed
 *                         memory of a former settlement)
 *
 * Selection: seedRng picks 0-2 quirks. Same seed -> same quirks. Quirks
 * never overlap macro features or warehouses (skip placement if the chosen
 * tile is already special).
 *
 * @param {object} opts
 * @param {Uint8Array} opts.tiles
 * @param {Float32Array} opts.elevation
 * @param {Float32Array} opts.moisture
 * @param {Uint8Array} opts.biomes
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} opts.seed
 * @param {string} [opts.templateId]
 */
export function applyQuirks({ tiles, elevation, moisture, biomes, width, height, seed, templateId = DEFAULT_MAP_TEMPLATE_ID }) {
  if (!tiles || !width || !height) return;
  // Independent RNG stream so adding quirks doesn't shift downstream RNG.
  // 0x9CA2D — phonetic "9-card" sentinel as requested in the task.
  const rng = createRng((normalizeSeed(seed) ^ 0x9CA2D) >>> 0);

  // Find a tile matching `predicate`, scanning a randomized linear sequence.
  // Returns null if no suitable tile is found within `maxTries`.
  function findTile(predicate, maxTries = 1200) {
    const area = width * height;
    const start = Math.floor(rng() * area);
    const stride = 1 + (Math.floor(rng() * 7) | 1); // odd stride to cover all
    let cur = start;
    for (let t = 0; t < maxTries && t < area; t += 1) {
      const idx = cur % area;
      const ix = idx % width;
      const iz = (idx - ix) / width;
      if (ix >= 2 && iz >= 2 && ix < width - 2 && iz < height - 2) {
        if (predicate(ix, iz, idx)) return { ix, iz, idx };
      }
      cur += stride;
    }
    return null;
  }

  function nearestTileDist(ix, iz, tileType, maxR = 12) {
    for (let r = 1; r <= maxR; r += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const nx = ix + dx;
          const nz = iz + dz;
          if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
          if (tiles[nx + nz * width] === tileType) return r;
        }
      }
    }
    return maxR + 1;
  }

  const QUIRKS = {
    ruinsCluster() {
      const target = findTile((ix, iz, idx) => {
        const t = tiles[idx];
        if (t !== TILE.GRASS && t !== TILE.RUINS) return false;
        const b = biomes ? biomes[idx] : 0;
        return b === BIOME.SCRUB || b === BIOME.WOODLAND || b === BIOME.OPEN_PLAINS;
      });
      if (!target) return false;
      const radius = 3 + Math.floor(rng() * 2); // 3-4
      const want = 5 + Math.floor(rng() * 5); // 5-9
      let placed = 0;
      for (let dz = -radius; dz <= radius && placed < want; dz += 1) {
        for (let dx = -radius; dx <= radius && placed < want; dx += 1) {
          if (dx * dx + dz * dz > radius * radius) continue;
          const nx = target.ix + dx;
          const nz = target.iz + dz;
          if (nx < 1 || nz < 1 || nx >= width - 1 || nz >= height - 1) continue;
          const ni = nx + nz * width;
          if (!quirkTileSafe(tiles[ni])) continue;
          if (tiles[ni] === TILE.WATER) continue;
          if (rng() < 0.55) {
            tiles[ni] = TILE.RUINS;
            placed += 1;
          }
        }
      }
      return placed > 0;
    },
    oasis() {
      // Small water pool + herb-garden ring in a low-moisture area, far from
      // existing water.
      const target = findTile((ix, iz, idx) => {
        if (tiles[idx] !== TILE.GRASS) return false;
        if (moisture && moisture[idx] > 0.35) return false;
        if (nearestTileDist(ix, iz, TILE.WATER, 8) <= 8) return false;
        const b = biomes ? biomes[idx] : 0;
        return b === BIOME.OPEN_PLAINS || b === BIOME.SCRUB;
      });
      if (!target) return false;
      // Center: 2-3 water tiles.
      tiles[target.idx] = TILE.WATER;
      if (moisture) moisture[target.idx] = 1.0;
      for (const n of NEIGHBORS_4) {
        if (rng() < 0.6) {
          const nx = target.ix + n.x;
          const nz = target.iz + n.z;
          if (nx < 1 || nz < 1 || nx >= width - 1 || nz >= height - 1) continue;
          const ni = nx + nz * width;
          if (!quirkTileSafe(tiles[ni])) continue;
          tiles[ni] = TILE.WATER;
          if (moisture) moisture[ni] = 1.0;
        }
      }
      // Herb ring at radius 2.
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const r2 = dx * dx + dz * dz;
          if (r2 < 3 || r2 > 5) continue;
          const nx = target.ix + dx;
          const nz = target.iz + dz;
          if (nx < 1 || nz < 1 || nx >= width - 1 || nz >= height - 1) continue;
          const ni = nx + nz * width;
          if (tiles[ni] !== TILE.GRASS) continue;
          if (rng() < 0.55) tiles[ni] = TILE.HERB_GARDEN;
        }
      }
      return true;
    },
    ancientRoad() {
      // Short ROAD segment 8-14 tiles long in wilderness (no road within 5 tiles).
      const target = findTile((ix, iz, idx) => {
        if (tiles[idx] !== TILE.GRASS) return false;
        if (nearestTileDist(ix, iz, TILE.ROAD, 5) <= 5) return false;
        return true;
      });
      if (!target) return false;
      const length = 8 + Math.floor(rng() * 7); // 8-14
      const dirIx = rng() < 0.5 ? 1 : -1;
      const dirIz = rng() < 0.5 ? 1 : -1;
      const horizontal = rng() < 0.5;
      let placed = 0;
      let cx = target.ix;
      let cz = target.iz;
      for (let s = 0; s < length; s += 1) {
        if (cx < 1 || cz < 1 || cx >= width - 1 || cz >= height - 1) break;
        const ni = cx + cz * width;
        if (quirkTileSafe(tiles[ni]) && tiles[ni] !== TILE.WATER) {
          tiles[ni] = TILE.ROAD;
          placed += 1;
        }
        if (horizontal) {
          cx += dirIx;
          if (rng() < 0.18) cz += dirIz;
        } else {
          cz += dirIz;
          if (rng() < 0.18) cx += dirIx;
        }
      }
      return placed >= 4;
    },
    marshPatch() {
      // Irregular water patch + moisture boost in a low-elevation area.
      const target = findTile((ix, iz, idx) => {
        if (tiles[idx] !== TILE.GRASS) return false;
        if (elevation && elevation[idx] > 0.40) return false;
        const b = biomes ? biomes[idx] : 0;
        return b === BIOME.LUSH_VALLEY || b === BIOME.WETLAND || b === BIOME.OPEN_PLAINS;
      });
      if (!target) return false;
      const blobR = 2 + Math.floor(rng() * 2); // 2-3
      let placed = 0;
      for (let dz = -blobR - 1; dz <= blobR + 1; dz += 1) {
        for (let dx = -blobR - 1; dx <= blobR + 1; dx += 1) {
          const nx = target.ix + dx;
          const nz = target.iz + dz;
          if (nx < 1 || nz < 1 || nx >= width - 1 || nz >= height - 1) continue;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const wobble = (rng() - 0.5) * 1.2;
          if (dist + wobble > blobR) continue;
          const ni = nx + nz * width;
          if (!quirkTileSafe(tiles[ni])) continue;
          tiles[ni] = TILE.WATER;
          if (moisture) moisture[ni] = 1.0;
          placed += 1;
        }
      }
      // Moisture boost +0.2 in a wider radius.
      if (moisture) {
        for (let dz = -blobR - 2; dz <= blobR + 2; dz += 1) {
          for (let dx = -blobR - 2; dx <= blobR + 2; dx += 1) {
            const nx = target.ix + dx;
            const nz = target.iz + dz;
            if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > blobR + 2) continue;
            const ni = nx + nz * width;
            moisture[ni] = clamp(moisture[ni] + 0.2 * (1 - dist / (blobR + 2)), 0, 1);
          }
        }
      }
      return placed > 0;
    },
    stoneOutcrop() {
      // Small QUARRY cluster (3-5 tiles) in a non-mountain area.
      const target = findTile((ix, iz, idx) => {
        if (tiles[idx] !== TILE.GRASS) return false;
        const b = biomes ? biomes[idx] : 0;
        if (b === BIOME.MOUNTAIN) return false;
        return b === BIOME.OPEN_PLAINS || b === BIOME.SCRUB || b === BIOME.WOODLAND || b === BIOME.ROCKY_HILL;
      });
      if (!target) return false;
      const want = 3 + Math.floor(rng() * 3); // 3-5
      let placed = 0;
      // Spiral outward from center.
      const candidates = [];
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (dx * dx + dz * dz > 5) continue;
          candidates.push({ dx, dz, w: rng() });
        }
      }
      candidates.sort((a, b) => a.w - b.w);
      for (const c of candidates) {
        if (placed >= want) break;
        const nx = target.ix + c.dx;
        const nz = target.iz + c.dz;
        if (nx < 1 || nz < 1 || nx >= width - 1 || nz >= height - 1) continue;
        const ni = nx + nz * width;
        if (tiles[ni] !== TILE.GRASS) continue;
        tiles[ni] = TILE.QUARRY;
        if (elevation) elevation[ni] = clamp(elevation[ni] + 0.10, 0, 1);
        placed += 1;
      }
      return placed > 0;
    },
    lostFarm() {
      // Single FARM tile far from any warehouse (>= 18 tiles Manhattan).
      const target = findTile((ix, iz, idx) => {
        if (tiles[idx] !== TILE.GRASS) return false;
        // Manhattan distance to nearest warehouse.
        let nearest = 999;
        for (let z = 0; z < height; z += 2) {
          for (let x = 0; x < width; x += 2) {
            if (tiles[x + z * width] === TILE.WAREHOUSE) {
              const d = Math.abs(x - ix) + Math.abs(z - iz);
              if (d < nearest) nearest = d;
            }
          }
        }
        return nearest >= 18;
      });
      if (!target) return false;
      tiles[target.idx] = TILE.FARM;
      return true;
    },
  };

  // ---- Per-template weights (light nudge per spec).
  const TEMPLATE_QUIRK_WEIGHTS = {
    rugged_highlands: { stoneOutcrop: 3, ruinsCluster: 2, ancientRoad: 2, marshPatch: 1, oasis: 1, lostFarm: 1 },
    fertile_riverlands: { marshPatch: 3, lostFarm: 2, ruinsCluster: 2, ancientRoad: 1, oasis: 1, stoneOutcrop: 1 },
    temperate_plains: { ruinsCluster: 2, lostFarm: 2, ancientRoad: 2, oasis: 2, stoneOutcrop: 2, marshPatch: 1 },
    fortified_basin: { ruinsCluster: 4, ancientRoad: 2, stoneOutcrop: 2, lostFarm: 1, oasis: 1, marshPatch: 1 },
    archipelago_isles: { marshPatch: 4, oasis: 2, ruinsCluster: 2, lostFarm: 1, stoneOutcrop: 1, ancientRoad: 1 },
    coastal_ocean: { marshPatch: 3, oasis: 2, lostFarm: 2, ruinsCluster: 1, stoneOutcrop: 1, ancientRoad: 1 },
  };
  const weights = TEMPLATE_QUIRK_WEIGHTS[templateId] || TEMPLATE_QUIRK_WEIGHTS[DEFAULT_MAP_TEMPLATE_ID];

  // 0-2 quirks per seed. Distribution: 0=20%, 1=50%, 2=30%.
  const r0 = rng();
  const quirkCount = r0 < 0.20 ? 0 : (r0 < 0.70 ? 1 : 2);
  const remaining = { ...weights };
  for (let pick = 0; pick < quirkCount; pick += 1) {
    let total = 0;
    for (const k of Object.keys(remaining)) total += Math.max(0, remaining[k]);
    if (total <= 0) break;
    let t = rng() * total;
    let chosen = null;
    for (const k of Object.keys(remaining)) {
      t -= Math.max(0, remaining[k]);
      if (t <= 0) { chosen = k; break; }
    }
    if (!chosen) chosen = Object.keys(remaining)[0];
    const fn = QUIRKS[chosen];
    if (typeof fn === "function") fn(); // bail-graceful inside
    // Don't pick the same quirk twice.
    remaining[chosen] = 0;
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

// v0.8.9 Terrain rewrite: pre-generated bridges removed. Players still build
// bridges manually (BuildSystem); we no longer stamp them into scenario output
// because they trivialised river crossings and made every template's hydrology
// feel "solved". carveBridgesOnMainAxis was deleted; its 3 call sites in the
// per-template generators are gone. Connectivity is now ensured by the
// branching river network leaving thin land strips between branches.

// v0.10.2 PL-terrain-min-guarantee R7: hard floor for FARM/LUMBER/QUARRY counts.
// Walks GRASS tiles outside the spawn-ring exclusion in (Manhattan-) distance
// order from grid center and stamps the closest qualifying tile when the
// resource count is below the floor. Only mutates GRASS — never WATER, WALL,
// WAREHOUSE, ROAD, or other resources — so it is purely additive.
const RESOURCE_FLOOR = Object.freeze({ farms: 2, lumbers: 2, quarries: 1 });
function enforceResourceFloor(tiles, width, height, cx, cz, hardExclusion) {
  let farms = 0, lumbers = 0, quarries = 0;
  const total = width * height;
  for (let i = 0; i < total; i += 1) {
    const t = tiles[i];
    if (t === TILE.FARM) farms += 1;
    else if (t === TILE.LUMBER) lumbers += 1;
    else if (t === TILE.QUARRY) quarries += 1;
  }
  if (farms >= RESOURCE_FLOOR.farms && lumbers >= RESOURCE_FLOOR.lumbers && quarries >= RESOURCE_FLOOR.quarries) return;
  const candidates = [];
  for (let iz = 1; iz < height - 1; iz += 1) {
    for (let ix = 1; ix < width - 1; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.GRASS) continue;
      const dx = ix - cx, dz = iz - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < hardExclusion) continue;
      candidates.push({ idx, dist });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);
  let cursor = 0;
  const stamp = (tileType, currentCount, target) => {
    let n = currentCount;
    while (n < target && cursor < candidates.length) {
      const c = candidates[cursor++];
      if (tiles[c.idx] !== TILE.GRASS) continue;
      tiles[c.idx] = tileType;
      n += 1;
    }
    return n;
  };
  stamp(TILE.FARM, farms, RESOURCE_FLOOR.farms);
  stamp(TILE.LUMBER, lumbers, RESOURCE_FLOOR.lumbers);
  stamp(TILE.QUARRY, quarries, RESOURCE_FLOOR.quarries);
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

  // v0.8.9: macro features (peninsula/mesa) on top of island elevation; we
  // intentionally do NOT call carveRiverNetwork here — archipelago is
  // water-dominated and tributaries would just dissolve into ocean.
  applyMacroFeatures({ elevation, moisture, width, height, seed, templateId: "archipelago_isles" });

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

  // v0.8.9: macro features for coastal — peninsulas push extra arms of land
  // into the ocean per seed. No carveRiverNetwork (water-dominated template).
  applyMacroFeatures({ elevation, moisture, width, height, seed, templateId: "coastal_ocean" });

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

  // v0.8.9: per-seed macro features stamp 1-3 large-scale shapes onto the
  // elevation field BEFORE water carving so the same template feels different
  // across seeds. Riverlands favours basins + peninsulas (see template
  // weight table).
  applyMacroFeatures({ elevation, moisture, width, height, seed, templateId: "fertile_riverlands" });

  // v0.8.9 Phase B: 4 mains + branchProb 0.12 / depth 3 — riverlands is the
  // most-branched template by design (more sources = more branching
  // opportunity = visibly different hydrology each seed).
  carveRiverNetwork({
    tiles, elevation, moisture, width, height, seed,
    mainCount: 4, branchProb: 0.12, maxBranchDepth: 3,
    minWidth: 1, maxWidth: 2, maxLen: Math.max(width, height),
  });

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

  // v0.8.9: macro features run before the fortress wall pass so basins/ridges
  // shape the elevation underneath. fortified_basin always gets at least one
  // basin (its identity) plus 1-2 random additions per seed.
  applyMacroFeatures({ elevation, moisture, width, height, seed, templateId: "fortified_basin" });

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

  // v0.8.9: per-seed macro features. Highlands favours mountainRidge / mesa /
  // canyon — these stack on top of the base elevation field for visible
  // seed-to-seed variation.
  applyMacroFeatures({ elevation, moisture, width, height, seed, templateId: "rugged_highlands" });

  // v0.8.9 Phase B: 3 mains + branchProb 0.10 / depth 3 — these run alongside
  // the existing carveStream pass below; the mountain watershed reads as a
  // true tree of tributaries flowing down from peaks.
  carveRiverNetwork({
    tiles, elevation, moisture, width, height, seed,
    mainCount: 3, branchProb: 0.10, maxBranchDepth: 3,
    minWidth: 1, maxWidth: 2, maxLen: Math.max(width, height),
  });

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

  // v0.8.9: macro features. Plains favour mesa + ancientCrater — these are
  // the main visual "what's different about this seed" hooks since the base
  // terrain is intentionally flat.
  applyMacroFeatures({ elevation, moisture, width, height, seed, templateId: "temperate_plains" });

  // v0.8.9 Phase B: 2 mains + branchProb 0.10 / depth 3 on top of the existing
  // meander river. Plains gets visible tributaries that taper from the
  // dominant river network.
  carveRiverNetwork({
    tiles, elevation, moisture, width, height, seed,
    mainCount: 2, branchProb: 0.10, maxBranchDepth: 3,
    minWidth: 1, maxWidth: 2, maxLen: Math.max(width, height),
  });

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
    // v0.8.9: fallback (unknown template) gets macro features + branching
    // network so even legacy callers see seed-to-seed variation.
    applyMacroFeatures({ elevation: fields.elevation, moisture: fields.moisture, width, height, seed, templateId });
    carveRiverNetwork({
      tiles, elevation: fields.elevation, moisture: fields.moisture, width, height, seed,
      mainCount: Math.max(1, profile.riverCount), branchProb: 0.10, maxBranchDepth: 3,
      minWidth: 1, maxWidth: Math.max(2, Math.round(profile.riverWidth ?? 2)), maxLen: Math.max(width, height),
    });
  }

  // v0.8.9 Phase B: classify biomes once after macro features + rivers have
  // shaped elevation/moisture. The biomes Uint8Array is consumed by the
  // resource-blob picker (FARM/LUMBER/QUARRY/HERB_GARDEN/RUINS) for
  // biome-aware placement, then persisted onto the grid for downstream
  // systems / tests to read.
  const biomes = classifyBiomes({
    elevation: fields.elevation,
    moisture: fields.moisture,
    ridge: fields.ridge,
    width,
    height,
  });

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
      // v0.8.9 Phase B: biome affinity. FARM prefers OPEN_PLAINS / LUSH_VALLEY,
      // dislikes MOUNTAIN / SCRUB. The base composite score is multiplied by
      // 0.5x (disliked) / 1.0x (neutral) / 1.6x (preferred); zone/terrain
      // penalties stay additive so they can still hard-veto.
      const aff = biomeAffinity(biomes[idx], [BIOME.OPEN_PLAINS, BIOME.LUSH_VALLEY], [BIOME.MOUNTAIN, BIOME.SCRUB]);
      const baseScore = moistureScore + (nearRoad ? 0.9 : 0);
      return baseScore * aff + terrainPenalty + farmZoneBias;
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
      // v0.8.9 Phase B: LUMBER prefers WOODLAND / WETLAND-edges; avoids OPEN_PLAINS / MOUNTAIN.
      const aff = biomeAffinity(biomes[idx], [BIOME.WOODLAND, BIOME.WETLAND], [BIOME.OPEN_PLAINS, BIOME.MOUNTAIN]);
      return (noise + (nearRoad ? 0.45 : 0)) * aff + terrainPenalty + radialZoneBias(ix, iz);
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
      // v0.8.9 Phase B: QUARRY prefers ROCKY_HILL / MOUNTAIN; avoids LUSH_VALLEY / WETLAND.
      const aff = biomeAffinity(biomes[idx], [BIOME.ROCKY_HILL, BIOME.MOUNTAIN], [BIOME.LUSH_VALLEY, BIOME.WETLAND]);
      return (ridge + edgeBias * 0.5) * aff + terrainPenalty + radialZoneBias(ix, iz);
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
      // v0.8.9 Phase B: HERB_GARDEN prefers LUSH_VALLEY / WETLAND; avoids ROCKY_HILL / MOUNTAIN / SCRUB.
      const aff = biomeAffinity(biomes[idx], [BIOME.LUSH_VALLEY, BIOME.WETLAND], [BIOME.ROCKY_HILL, BIOME.MOUNTAIN, BIOME.SCRUB]);
      return (moistureScore + (nearFarm ? 0.8 : 0)) * aff + terrainPenalty + radialZoneBias(ix, iz);
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
      // v0.8.9 Phase B: RUINS prefers SCRUB / WOODLAND (decay narrative);
      // avoids LUSH_VALLEY / WETLAND (overgrowth would hide ruins lore).
      const aff = biomeAffinity(biomes[idx], [BIOME.SCRUB, BIOME.WOODLAND], [BIOME.LUSH_VALLEY, BIOME.WETLAND]);
      return (rough * 1.2 + edgeBias * 0.7) * aff;
    }),
    1.8,
    3.6,
  );

  // v0.10.2 PL-terrain-min-guarantee R7: defensive minimum-resource floor pass.
  // The biome-aware placeDistrictBlobs picker can return null (no qualifying
  // GRASS center) or skip on too-close blob centers; combined with per-template
  // painters that paint FARM/LUMBER tiles into WATER-heavy zones, some seeds
  // historically shipped with 0 farms / 0 lumbers / 0 quarries (PL R7 P0
  // opening-stall). This pass guarantees a FLOOR of farms>=2, lumbers>=2,
  // quarries>=1 across all 6 templates by stamping the closest qualifying
  // GRASS tiles outside the spawn-ring hard exclusion (12 tiles) — additive
  // only, never overwrites WATER/WALL/WAREHOUSE/ROAD/existing resources.
  enforceResourceFloor(tiles, width, height, cx, cz, ZONE_HARD_EXCLUSION);

  applyWalls(tiles, width, height, profile, seed + 2101);
  ensureMinimumInfrastructure(tiles, width, height, seed + 2301);
  trimRoadOverflow(tiles, width, height, profile, seed + 3301);

  // v0.8.9 Phase B: per-seed quirks. Run AFTER warehouse/wall/road
  // placement so quirks don't get clobbered, but BEFORE final tile coverage
  // finalization. Quirks have their own RNG stream so adding/removing them
  // doesn't shift any existing seed's output.
  applyQuirks({
    tiles,
    elevation: fields.elevation,
    moisture: fields.moisture,
    biomes,
    width,
    height,
    seed,
    templateId,
  });

  const emptyBaseTiles = finalizeTileCoverage(tiles);
  return { tiles, emptyBaseTiles, tuning: normalizedTuning, profile, elevation: fields.elevation, moisture: fields.moisture, ridge: fields.ridge, biomes };
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
    ridge: generated.ridge,
    // v0.8.9 Phase B: biome map (Uint8Array same length as tiles). Advisory
    // metadata used by the resource-blob picker; downstream systems / tests
    // can read it for biome-aware logic. See classifyBiomes / BIOME constants.
    biomes: generated.biomes,
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

/**
 * v0.8.10 — Strip every player-buildable tile back to GRASS for the bare-
 * initial-map mode. Generation phases (roads, warehouses, farm/lumber/quarry/
 * herb blobs, walls, gates), scenario stamping, and the bootstrap safety net
 * all run normally; this sweep wipes their tile output afterward so the
 * player starts from zero. tileState (FOREST/STONE/HERB nodeFlags +
 * yieldPool) is preserved via setTile's Erase-to-bare-tile branch so the
 * player can still see "this is a forest tile, build LUMBER here". WATER
 * and RUINS stay untouched (terrain features, not buildings).
 *
 * @param {object} grid
 * @returns {number} count of tiles converted to GRASS
 */
export function stripInitialBuildings(grid) {
  if (!grid?.tiles) return 0;
  const buildingTiles = new Set([
    TILE.WAREHOUSE, TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN,
    TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC, TILE.WALL, TILE.GATE,
    TILE.ROAD, TILE.BRIDGE,
  ]);
  let stripped = 0;
  const { width, height } = grid;
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      if (buildingTiles.has(grid.tiles[ix + iz * width])) {
        if (setTile(grid, ix, iz, TILE.GRASS)) stripped += 1;
      }
    }
  }
  return stripped;
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
    // v0.8.6 Tier 1 BC1: include GATE in building stats so the
    // BUILD_COST_ESCALATOR `gate` softTarget / hardCap / perExtra escalator
    // actually fires. Pre-fix `state.buildings.gates` was always undefined,
    // collapsing the escalator to base cost regardless of how many gates the
    // player/AI had already placed.
    gates: countTilesByType(grid, [TILE.GATE]),
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
  // v0.8.9 Phase B: biomes Uint8Array sanity check. Advisory map shipped
  // alongside tiles; if present, must be the same shape. Absence is fine
  // (legacy callers / downstream loaders may not populate it).
  if (grid.biomes !== undefined && grid.biomes !== null) {
    if (!(grid.biomes instanceof Uint8Array)) {
      issues.push("biomes is not Uint8Array");
    } else if (grid.tiles instanceof Uint8Array && grid.biomes.length !== grid.tiles.length) {
      issues.push(`biomes length mismatch (${grid.biomes.length} vs tiles ${grid.tiles.length})`);
    }
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
  // v0.8.9: BRIDGE removed from pre-generated tiles. Player can still build
  // bridges at runtime — TILE.BRIDGE remains a valid tile in TILE_INFO and is
  // included by the connectivity check below (which scans TILE_INFO.passable).
  // The static count list intentionally excludes it so validation reflects
  // what the generator actually produces.
  const passable = countTilesByType(grid, [TILE.GRASS, TILE.ROAD, TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE, TILE.RUINS, TILE.QUARRY, TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC]);
  const roadMinRatio = toNumberOr(validation.roadMinRatio, 0.02);
  const roadMin = roadMinRatio <= 0 ? 0 : Math.max(40, Math.round(area * roadMinRatio));
  const waterMin = Math.max(8, Math.round(area * toNumberOr(validation.waterMinRatio, 0.03)));
  const waterMax = Math.round(area * toNumberOr(validation.waterMaxRatio, 0.6));
  const passableRatio = passable / Math.max(1, area);
  const passableMin = toNumberOr(validation.passableMin, 0.42);
  const passableMax = toNumberOr(validation.passableMax, 0.94);

  // v0.8.10 — bare-initial-map: building minimums default to 0 because the
  // player builds everything by hand. Per-template validation can still
  // override (e.g. a tutorial scenario could require farmMin=1) but default
  // is "no buildings required". roadMinRatio is also implicitly tolerant
  // because stripInitialBuildings wipes generated roads in the same pass.
  const farmMin = toNumberOr(validation.farmMin, 0);
  const lumberMin = toNumberOr(validation.lumberMin, 0);
  const warehouseMin = toNumberOr(validation.warehouseMin, 0);

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
