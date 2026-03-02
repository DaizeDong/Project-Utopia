import { DEFAULT_GRID, TILE, TILE_INFO } from "../../config/constants.js";

export const MAP_TEMPLATES = Object.freeze([
  {
    id: "temperate_plains",
    name: "Temperate Plains",
    description: "Broad continental plains with rivers and balanced settlement expansion.",
    tags: ["plains", "balanced", "starter"],
  },
  {
    id: "rugged_highlands",
    name: "Rugged Highlands",
    description: "Broken highland basins with rough traversal, sparse arable land and dense wild zones.",
    tags: ["mountain", "rugged", "challenging"],
  },
  {
    id: "archipelago_isles",
    name: "Archipelago Isles",
    description: "Fragmented island-like terrain with scattered land bridges and isolated districts.",
    tags: ["island", "water-heavy", "fragmented"],
  },
  {
    id: "coastal_ocean",
    name: "Coastal Ocean",
    description: "Strong oceanic coastline with deep water pressure and narrow habitable corridors.",
    tags: ["ocean", "coastal", "navigation"],
  },
  {
    id: "fertile_riverlands",
    name: "Fertile Riverlands",
    description: "Multiple river channels across fertile floodplains, optimized for food throughput.",
    tags: ["fertile", "river", "economy"],
  },
  {
    id: "fortified_basin",
    name: "Fortified Basin",
    description: "Defended interior basin with structured chokepoints and controlled logistics.",
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
    farmBlobs: 11,
    lumberBlobs: 7,
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
    validation: { waterMinRatio: 0.06, waterMaxRatio: 0.39, passableMin: 0.58, passableMax: 0.93, roadMinRatio: 0.022 },
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
    validation: { waterMinRatio: 0.06, waterMaxRatio: 0.36, passableMin: 0.44, passableMax: 0.94, roadMinRatio: 0.016 },
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
    validation: { waterMinRatio: 0.32, waterMaxRatio: 0.74, passableMin: 0.24, passableMax: 0.78, roadMinRatio: 0.009 },
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
    validation: { waterMinRatio: 0.4, waterMaxRatio: 0.84, passableMin: 0.16, passableMax: 0.68, roadMinRatio: 0.008 },
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
    farmBlobs: 12,
    lumberBlobs: 7,
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
    validation: { waterMinRatio: 0.16, waterMaxRatio: 0.45, passableMin: 0.54, passableMax: 0.9, roadMinRatio: 0.038 },
  }),
  fortified_basin: Object.freeze({
    waterLevel: 0.19,
    riverCount: 1,
    riverWidth: 1.9,
    riverAmp: 0.11,
    riverVertical: false,
    roadHubs: 11,
    roadJitter: 0.22,
    sideRoads: 10,
    farmBlobs: 8,
    lumberBlobs: 8,
    ruinsBlobs: 4,
    wallMode: "fortress",
    edgeWaterBoost: 0.02,
    valleyFactor: 0.2,
    islandBias: 0.04,
    oceanBias: 0,
    oceanSide: "none",
    mountainStrength: 0.22,
    roadDensity: 0.56,
    settlementDensity: 0.65,
    validation: { waterMinRatio: 0.088, waterMaxRatio: 0.4, passableMin: 0.48, passableMax: 0.9, roadMinRatio: 0.02 },
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

function placeDistrictBlobs(tiles, width, height, count, tileType, seed, pickCenter, minRadius = 2.4, maxRadius = 5.1) {
  const overwrite = new Set([TILE.GRASS, TILE.ROAD, TILE.RUINS, TILE.FARM, TILE.LUMBER]);
  for (let i = 0; i < count; i += 1) {
    const center = pickCenter(i);
    if (!center) continue;
    const r0 = lerp(minRadius, maxRadius, hash2D(center.ix + i * 13, center.iz + i * 7, seed + 1409));
    const r1 = r0 * lerp(0.74, 1.28, hash2D(center.ix + i * 19, center.iz + i * 11, seed + 1423));
    paintBlob(tiles, width, height, center.ix, center.iz, r0, r1, tileType, seed + i * 17, overwrite);
  }
}

function carveBridgesOnMainAxis(tiles, width, height, profile, seed) {
  const step = Math.max(8, Math.floor((profile.riverVertical ? height : width) / 6));
  const start = Math.max(4, Math.floor(step * 0.65));
  if (profile.riverVertical) {
    for (let z = start; z < height - start; z += step) {
      let run = 0;
      for (let x = 0; x < width; x += 1) {
        const idx = toIndex(x, z, width);
        if (tiles[idx] === TILE.WATER) {
          run += 1;
          tiles[idx] = TILE.ROAD;
        } else if (run > 0) {
          if (run >= 2 && run <= 8) break;
          run = 0;
        }
      }
    }
  } else {
    for (let x = start; x < width - start; x += step) {
      let run = 0;
      for (let z = 0; z < height; z += 1) {
        const idx = toIndex(x, z, width);
        if (tiles[idx] === TILE.WATER) {
          run += 1;
          tiles[idx] = TILE.ROAD;
        } else if (run > 0) {
          if (run >= 2 && run <= 8) break;
          run = 0;
        }
      }
    }
  }

  for (let iz = 1; iz < height - 1; iz += 1) {
    for (let ix = 1; ix < width - 1; ix += 1) {
      const idx = toIndex(ix, iz, width);
      if (tiles[idx] !== TILE.ROAD) continue;
      if (hash2D(ix, iz, seed + 2003) < 0.1) {
        if (tiles[toIndex(ix + 1, iz, width)] === TILE.WATER) tiles[toIndex(ix + 1, iz, width)] = TILE.ROAD;
        if (tiles[toIndex(ix - 1, iz, width)] === TILE.WATER) tiles[toIndex(ix - 1, iz, width)] = TILE.ROAD;
        if (tiles[toIndex(ix, iz + 1, width)] === TILE.WATER) tiles[toIndex(ix, iz + 1, width)] = TILE.ROAD;
        if (tiles[toIndex(ix, iz - 1, width)] === TILE.WATER) tiles[toIndex(ix, iz - 1, width)] = TILE.ROAD;
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
  while (farms < minFarm && cursor < farmCandidates.length) {
    const c = farmCandidates[cursor];
    cursor += 1;
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

function generateTerrainTiles(width, height, templateId, seed, tuning = {}) {
  const baseProfile = getProfile(templateId);
  const normalizedTuning = sanitizeTerrainTuning(tuning, templateId);
  const profile = deriveProfile(baseProfile, normalizedTuning);
  const rng = createRng(seed);
  const tiles = new Uint8Array(width * height);
  tiles.fill(TILE_EMPTY_SENTINEL);

  const fields = baseTerrainPass(tiles, width, height, seed, profile);
  for (let i = 0; i < profile.riverCount; i += 1) {
    carveRiver(tiles, width, height, profile, seed + i * 311, i);
  }

  carveBridgesOnMainAxis(tiles, width, height, profile, seed + 2207);

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
      return moistureScore + (nearRoad ? 0.9 : 0) + terrainPenalty;
    }),
    2.8,
    5.5,
  );

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
      return noise + (nearRoad ? 0.45 : 0) + terrainPenalty;
    }),
    2.2,
    4.9,
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
  return { tiles, emptyBaseTiles, tuning: normalizedTuning, profile };
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

  return {
    width,
    height,
    tileSize,
    tiles: generated.tiles,
    version: 1,
    templateId,
    seed: seedInput,
    terrainTuning: generated.tuning,
    emptyBaseTiles: generated.emptyBaseTiles,
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
    walls: countTilesByType(grid, [TILE.WALL]),
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
  const passable = countTilesByType(grid, [TILE.GRASS, TILE.ROAD, TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE, TILE.RUINS]);
  const roadMin = Math.max(40, Math.round(area * toNumberOr(validation.roadMinRatio, 0.02)));
  const waterMin = Math.max(8, Math.round(area * toNumberOr(validation.waterMinRatio, 0.03)));
  const waterMax = Math.round(area * toNumberOr(validation.waterMaxRatio, 0.6));
  const passableRatio = passable / Math.max(1, area);
  const passableMin = toNumberOr(validation.passableMin, 0.42);
  const passableMax = toNumberOr(validation.passableMax, 0.94);

  if (unknownTiles > 0) issues.push(`unknown tiles present (${unknownTiles})`);
  if (roads < roadMin) issues.push(`road too low (${roads} < ${roadMin})`);
  if (farms < 2) issues.push("farm too low");
  if (lumbers < 2) issues.push("lumber too low");
  if (warehouses < 1) issues.push("warehouse too low");
  if (water < waterMin) issues.push(`water too low (${water} < ${waterMin})`);
  if (water > waterMax) issues.push(`water too high (${water} > ${waterMax})`);
  if (passableRatio < passableMin) issues.push(`passable ratio too low (${passableRatio.toFixed(3)})`);
  if (passableRatio > passableMax) issues.push(`passable ratio too high (${passableRatio.toFixed(3)})`);
  if (walls > Math.round(area * 0.28)) issues.push("wall too dense");
  if (ruins > Math.round(area * 0.2)) issues.push("ruins too dense");

  return { ok: issues.length === 0, issues };
}
