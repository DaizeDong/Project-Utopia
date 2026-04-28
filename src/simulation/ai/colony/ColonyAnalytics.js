/**
 * ColonyAnalytics — Round 2 LLM tuning support module.
 *
 * Pure-function analytics layer that surfaces algorithmic outputs the LLM can
 * consume directly instead of inventing them. Bridges PlacementSpecialist's
 * candidate scoring, ColonyPerceiver's projections, and chain heuristics into
 * a compact LLM-ready package.
 *
 * Exports (all pure, no side effects):
 *   - computeBuildingCandidates(state, buildType, options)
 *   - computeResourceProjections(state)
 *   - computeChainOpportunities(state, candidatesByType)
 *   - computeRichnessHeatmap(state, candidatesByType)
 *   - formatAnalyticsForLLM(analytics)
 *   - validatePlanCandidates(plan, candidatesByType)
 *
 * Design notes:
 *   1. The LLM picks tiles by candidate ID (C1..Cn), not by inventing
 *      coordinates. We surface a per-type top-N (default 6) so it has real
 *      options.
 *   2. Resource projections use ColonyPerceiver's economy.projectedZeroSec
 *      so we don't recompute rates — single source of truth.
 *   3. Chain opportunities pre-rank "what to build next" for the 3 main
 *      processing chains (food/tools/medical) plus expansion + logistics
 *      heuristics, so the LLM doesn't have to re-derive ROI from scratch.
 *   4. Richness scoring biases toward tiles where roads/buildings compound
 *      value — high-density neighborhoods of resources/grass.
 */

import { TILE, MOVE_DIRECTIONS_4, NODE_FLAGS } from "../../../config/constants.js";
import {
  BUILD_COST,
  BUILD_COST_ESCALATOR,
  CONSTRUCTION_BALANCE,
  computeEscalatedBuildCost,
} from "../../../config/balance.js";
import {
  inBounds, toIndex, listTilesByType, getTile, getTileState,
} from "../../../world/grid/Grid.js";
import { analyzeCandidateTiles } from "./PlacementSpecialist.js";
import { canAfford } from "../../construction/BuildAdvisor.js";

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_TOP_N = 6;
const RICHNESS_RADIUS = 4;
const MAX_GRASS_SCAN = 200; // cap candidate enumeration for perf

// R3 candidate-feasibility filter: minimum candidates we want per type after
// filtering — below this we drop the type from the menu so the LLM doesn't
// pick from a degenerate set of 1-2 marginal tiles.
const MIN_CANDIDATES_PER_TYPE = 3;

// R3: tools that are gated on a per-tile resource node (forest/stone/herb).
// These mirror NODE_GATED_TOOLS in BuildAdvisor.js so the analytics layer can
// pre-flight rejection without importing the full BuildAdvisor surface.
const NODE_GATE = Object.freeze({
  lumber: NODE_FLAGS.FOREST,
  quarry: NODE_FLAGS.STONE,
  herb_garden: NODE_FLAGS.HERB,
});

/**
 * The high-impact build types we always surface candidates for. Order matters
 * — `formatAnalyticsForLLM` renders this order. Roads/walls excluded
 * because their placement is driven by RoadPlanner / ThreatPlanner and
 * surfacing 6 candidates each would blow the prompt budget.
 */
const TRACKED_TYPES = Object.freeze([
  "warehouse", "farm", "quarry", "lumber",
  "herb_garden", "kitchen", "smithy", "clinic",
]);

// ── Helpers ──────────────────────────────────────────────────────────

/** Enumerate grass tiles, capped for perf, biased toward warehouse coverage. */
function _enumerateGrassNearInfra(grid, cap = MAX_GRASS_SCAN) {
  const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
  const out = [];
  const seen = new Set();
  if (warehouses.length === 0) {
    // Early game — any grass tile is fair. Sample uniformly.
    const { width, height } = grid;
    const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / cap)));
    for (let iz = 0; iz < height; iz += stride) {
      for (let ix = 0; ix < width; ix += stride) {
        const idx = toIndex(ix, iz, width);
        if (grid.tiles[idx] !== TILE.GRASS) continue;
        out.push({ ix, iz });
        if (out.length >= cap) return out;
      }
    }
    return out;
  }
  // Expand from each warehouse in a Manhattan disk of radius 12.
  const RADIUS = 12;
  for (const wh of warehouses) {
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > RADIUS) continue;
        const ix = wh.ix + dx;
        const iz = wh.iz + dz;
        if (!inBounds(ix, iz, grid)) continue;
        const key = ix * 1000 + iz;
        if (seen.has(key)) continue;
        seen.add(key);
        const idx = toIndex(ix, iz, grid.width);
        if (grid.tiles[idx] !== TILE.GRASS) continue;
        out.push({ ix, iz });
        if (out.length >= cap) return out;
      }
    }
  }
  return out;
}

/** Manhattan distance between two tile coords. */
function _manhattan(a, b) {
  return Math.abs(a.ix - b.ix) + Math.abs(a.iz - b.iz);
}

/** Count adjacencies (4-neighbors) by tile-type-name. */
function _adjacencySummary(grid, ix, iz) {
  const counts = {};
  for (const { dx, dz } of MOVE_DIRECTIONS_4) {
    const nx = ix + dx;
    const nz = iz + dz;
    if (!inBounds(nx, nz, grid)) continue;
    const t = grid.tiles[toIndex(nx, nz, grid.width)];
    const name = _tileName(t);
    if (name) counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

function _tileName(t) {
  switch (t) {
    case TILE.FARM: return "farm";
    case TILE.LUMBER: return "lumber";
    case TILE.QUARRY: return "quarry";
    case TILE.WAREHOUSE: return "warehouse";
    case TILE.HERB_GARDEN: return "herb_garden";
    case TILE.KITCHEN: return "kitchen";
    case TILE.SMITHY: return "smithy";
    case TILE.CLINIC: return "clinic";
    case TILE.ROAD: return "road";
    case TILE.WALL: return "wall";
    case TILE.BRIDGE: return "bridge";
    case TILE.GRASS: return "grass";
    case TILE.WATER: return "water";
    default: return null;
  }
}

// ── A. computeBuildingCandidates ──────────────────────────────────────

/**
 * R3 — Pre-flight feasibility filter that mirrors `groundPlanStep` →
 * `evaluateBuildPreview`'s most common rejection reasons WITHOUT actually
 * running the BuildSystem (kept pure for analytics use).
 *
 * Rejects when ANY of:
 *   - Tile is not GRASS (occupied / water / hidden — we don't see fog here
 *     but enumeration is already grass-only, so we still re-check in case
 *     state mutated since enumeration).
 *   - Cost (escalator-aware) is unaffordable given current resources.
 *   - Hard-cap reached for the type.
 *   - For warehouses: within `warehouseSpacingRadius` of another warehouse.
 *   - For lumber/quarry/herb_garden: tile lacks the required nodeFlag.
 *
 * @param {object} state
 * @param {string} buildType
 * @param {{ix:number,iz:number}} tile
 * @returns {{feasible: boolean, reason: string|null, cost: object}}
 */
function _preflightFeasibility(state, buildType, tile) {
  const grid = state?.grid;
  if (!grid) return { feasible: false, reason: "no_grid", cost: {} };
  const { ix, iz } = tile;
  if (!inBounds(ix, iz, grid)) return { feasible: false, reason: "oob", cost: {} };
  if (getTile(grid, ix, iz) !== TILE.GRASS) {
    return { feasible: false, reason: "occupied", cost: {} };
  }

  // Escalator-aware cost so the affordability check matches what
  // evaluateBuildPreview actually demands at execution time.
  const buildings = state.buildings ?? {};
  const existingCount = Number(buildings[_pluralBuildingKey(buildType)] ?? 0);
  const cost = BUILD_COST_ESCALATOR[buildType]
    ? computeEscalatedBuildCost(buildType, existingCount)
    : { ...(BUILD_COST[buildType] ?? {}) };

  if (!canAfford(state.resources ?? {}, cost)) {
    return { feasible: false, reason: "unaffordable", cost };
  }

  // Hard cap (e.g. warehouse: 20, kitchen: 6). When the type's escalator
  // declares a hardCap, refuse any further additions.
  const esc = BUILD_COST_ESCALATOR[buildType];
  if (esc && Number.isFinite(esc.hardCap) && existingCount >= esc.hardCap) {
    return { feasible: false, reason: "hardCap", cost };
  }

  // Node-gated tools: must sit on a tile carrying the matching nodeFlag.
  const requiredFlag = NODE_GATE[buildType];
  if (requiredFlag) {
    const entry = getTileState(grid, ix, iz);
    const flags = Number(entry?.nodeFlags ?? 0) | 0;
    if ((flags & requiredFlag) === 0) {
      return { feasible: false, reason: "missing_node", cost };
    }
  }

  // Warehouse spacing — must be > spacingRadius from existing warehouses.
  if (buildType === "warehouse") {
    const spacing = Number(CONSTRUCTION_BALANCE.warehouseSpacingRadius ?? 5);
    const others = listTilesByType(grid, [TILE.WAREHOUSE]);
    for (const wh of others) {
      const d = Math.abs(wh.ix - ix) + Math.abs(wh.iz - iz);
      if (d <= spacing) {
        return { feasible: false, reason: "warehouseTooClose", cost };
      }
    }
  }

  return { feasible: true, reason: null, cost };
}

/** Map build-tool key → buildings.* count key (mirrors balance.js mapping). */
function _pluralBuildingKey(kind) {
  switch (kind) {
    case "farm": return "farms";
    case "lumber": return "lumbers";
    case "warehouse": return "warehouses";
    case "wall": return "walls";
    case "quarry": return "quarries";
    case "herb_garden": return "herbGardens";
    case "kitchen": return "kitchens";
    case "smithy": return "smithies";
    case "clinic": return "clinics";
    case "road": return "roads";
    case "bridge": return "bridges";
    default: return kind;
  }
}

/**
 * Compute scored candidate tiles per building type.
 *
 * R3 — runs a `_preflightFeasibility` pass after the PlacementSpecialist's
 * scoring pass and drops any candidates that would be rejected by
 * `groundPlanStep` at execution time. The `affordability`/`hardCap` axes are
 * type-wide (not per-tile), so when ANY of those gates fires we still return
 * an empty list and the type is flagged as unaffordable to the caller.
 *
 * @param {object} state — game state
 * @param {string} buildType — e.g. "farm", "warehouse"
 * @param {object} [options]
 * @param {number} [options.topN=6] — number of candidates to return
 * @param {Array} [options.preEnumerated] — optional pre-filtered candidate list
 * @returns {Array<{ix:number,iz:number,score:number,reasons:string[],adjacencies:object,distToWarehouse:number}>}
 */
export function computeBuildingCandidates(state, buildType, options = {}) {
  const grid = state?.grid;
  if (!grid) return [];
  const topN = Math.max(1, Math.min(20, Number(options.topN) || DEFAULT_TOP_N));

  const raw = options.preEnumerated ?? _enumerateGrassNearInfra(grid);
  if (raw.length === 0) return [];

  // analyzeCandidateTiles handles scoring + reasoning per type.
  const analyzed = analyzeCandidateTiles(raw, buildType, grid, state);
  if (analyzed.length === 0) return [];

  // R3 — feasibility filter. We sweep the full analyzed list (not only the
  // top-N) because the post-filter top-N would otherwise collapse to zero
  // when the highest-scoring tiles happen to be infeasible (e.g. a top-tier
  // warehouse tile that's too close to an existing depot).
  const filtered = [];
  for (const c of analyzed) {
    const pf = _preflightFeasibility(state, buildType, { ix: c.ix, iz: c.iz });
    if (!pf.feasible) continue;
    filtered.push(c);
    if (filtered.length >= topN) break;
  }
  if (filtered.length === 0) return [];

  // Project into the LLM-friendly shape with reasons collapsed from notes.
  return filtered.slice(0, topN).map((c) => ({
    ix: c.ix,
    iz: c.iz,
    score: Math.round(c.score * 100) / 100,
    reasons: Array.isArray(c.notes) ? c.notes.slice(0, 3) : [],
    adjacencies: _adjacencySummary(grid, c.ix, c.iz),
    distToWarehouse: c.distToWarehouse,
    moisture: c.moisture,
    elevation: c.elevation,
  }));
}

/**
 * R3 — type-wide feasibility check (independent of any specific tile).
 * Returns true when the type is ENTIRELY out of reach this tick because of
 * affordability or hard-cap gates. Used by `computeAllCandidates` to surface
 * an `unaffordableTypes` list to the LLM.
 */
function _typeWideUnaffordable(state, buildType) {
  const buildings = state?.buildings ?? {};
  const existingCount = Number(buildings[_pluralBuildingKey(buildType)] ?? 0);
  const cost = BUILD_COST_ESCALATOR[buildType]
    ? computeEscalatedBuildCost(buildType, existingCount)
    : { ...(BUILD_COST[buildType] ?? {}) };
  if (!canAfford(state?.resources ?? {}, cost)) return { reason: "unaffordable", cost };
  const esc = BUILD_COST_ESCALATOR[buildType];
  if (esc && Number.isFinite(esc.hardCap) && existingCount >= esc.hardCap) {
    return { reason: "hardCap", cost };
  }
  return null;
}

/**
 * Build candidate map keyed by build type. Internal helper used by both the
 * formatter and the validator.
 *
 * R3 — also returns `unaffordableTypes` (a list of build types that are
 * entirely unreachable this tick because of affordability or hard-cap gates)
 * so the LLM doesn't waste plan steps on them. Types whose post-filter
 * candidate count is below `MIN_CANDIDATES_PER_TYPE` are dropped from the
 * surfaced menu entirely (the LLM shouldn't pick from a degenerate set of
 * 1-2 marginal tiles).
 *
 * @param {object} state
 * @param {Array<string>} [types]
 * @param {object} [options]
 * @returns {{ candidatesByType: Object<string, Array<object>>, unaffordableTypes: Array<string>, droppedTypes: Object<string, string> }}
 */
export function computeAllCandidates(state, types = TRACKED_TYPES, options = {}) {
  const out = {};
  const unaffordableTypes = [];
  const droppedTypes = {};
  // Enumerate once and reuse across types.
  const raw = _enumerateGrassNearInfra(state.grid);
  if (raw.length === 0) {
    return { candidatesByType: out, unaffordableTypes, droppedTypes };
  }
  for (const t of types) {
    // Type-wide gate first: if affordability/hardCap blocks the type entirely,
    // skip per-tile scoring (saves work and gives the LLM a clean signal).
    const wide = _typeWideUnaffordable(state, t);
    if (wide) {
      unaffordableTypes.push(t);
      continue;
    }
    const list = computeBuildingCandidates(state, t, { ...options, preEnumerated: raw });
    if (list.length < MIN_CANDIDATES_PER_TYPE) {
      // R3 — drop degenerate menus. The LLM should NEVER see a menu with
      // 0-2 entries: it'll either pick the lone option (regardless of fit)
      // or hallucinate a coordinate. Better to omit the type and force a
      // fallback to a different chain.
      droppedTypes[t] = list.length === 0 ? "no_feasible_tiles" : "menu_too_small";
      continue;
    }
    out[t] = list;
  }
  return { candidatesByType: out, unaffordableTypes, droppedTypes };
}

// ── B. computeResourceProjections ─────────────────────────────────────

/**
 * Project resource exhaustion times in seconds, and identify the bottleneck.
 * Pulls from `state.metrics.resourceRates` (set by ColonyPerceiver via
 * formatObservationForLLM) and `state.resources` for current stocks. When
 * rates aren't tracked yet (early game), returns Infinity for that resource.
 *
 * @param {object} state
 * @returns {{food:object, wood:object, stone:object, herbs:object, bottleneck:string|null}}
 */
export function computeResourceProjections(state) {
  const resources = state?.resources ?? {};
  // ResourceRateTracker is stored on the perceiver instance. When the caller
  // also passes the observation we read from there. Here we pull from the
  // economy section of the most recently computed observation if available
  // via state.ai.lastObservation; else compute a coarse projection from
  // metrics.
  const obs = state?.ai?.lastObservation ?? null;
  const economy = obs?.economy ?? null;

  const result = { bottleneck: null };
  let worstSec = Infinity;
  let worstKey = null;
  for (const key of ["food", "wood", "stone", "herbs"]) {
    const stock = Math.round(Number(resources?.[key] ?? 0));
    let rate = 0;
    let projectedZeroSec = Infinity;
    if (economy && economy[key]) {
      rate = Number(economy[key].rate ?? 0);
      const z = economy[key].projectedZeroSec;
      projectedZeroSec = z == null ? Infinity : Number(z);
    }
    result[key] = {
      stock,
      rate: Math.round(rate * 100) / 100,
      projectedZeroSec: Number.isFinite(projectedZeroSec) ? projectedZeroSec : Infinity,
      trend: rate > 0.1 ? "rising" : (rate < -0.1 ? "declining" : "stable"),
    };
    if (Number.isFinite(projectedZeroSec) && projectedZeroSec < worstSec) {
      worstSec = projectedZeroSec;
      worstKey = key;
    }
  }
  result.bottleneck = worstKey;
  result.bottleneckSec = Number.isFinite(worstSec) ? worstSec : null;
  return result;
}

// ── C. computeChainOpportunities ──────────────────────────────────────

/**
 * Identify high-payoff 3-5 step chains. Each opportunity describes a sequence
 * of building types that together unlock a new processing tier.
 *
 * Ranking:
 *   1. tools chain (highest ROI: +15% ALL production)
 *   2. food chain (kitchen unlocks 2x hunger efficiency)
 *   3. medical chain (clinic reduces mortality)
 *   4. logistics expansion (new warehouse + road link)
 *   5. herb-farm pairing (fertility synergy)
 *
 * @param {object} state
 * @param {object} [candidatesByType] — output of computeAllCandidates
 * @returns {Array<{id:string, name:string, steps:Array<string>, payoff:string, blocking:string|null, score:number}>}
 */
export function computeChainOpportunities(state, candidatesByType = {}) {
  const buildings = state?.buildings ?? {};
  const resources = state?.resources ?? {};
  const wood = Number(resources.wood ?? 0);
  const stone = Number(resources.stone ?? 0);
  const herbs = Number(resources.herbs ?? 0);

  const farms = Number(buildings.farms ?? 0);
  const lumbers = Number(buildings.lumbers ?? 0);
  const quarries = Number(buildings.quarries ?? 0);
  const herbGardens = Number(buildings.herbGardens ?? 0);
  const kitchens = Number(buildings.kitchens ?? 0);
  const smithies = Number(buildings.smithies ?? 0);
  const clinics = Number(buildings.clinics ?? 0);
  const warehouses = Number(buildings.warehouses ?? 0);

  const ops = [];

  // Chain 1: TOOLS (highest ROI, +15% all production)
  if (smithies === 0) {
    const steps = [];
    if (quarries === 0) steps.push("quarry (6w)");
    steps.push("smithy (6w+5s)");
    const blocking = quarries === 0 && wood < 12
      ? "need 12+ wood for quarry+smithy"
      : (smithies === 0 && stone < 5)
        ? "need 5+ stone for smithy"
        : null;
    ops.push({
      id: "T1",
      name: "Tools chain",
      steps,
      payoff: "+15% ALL production once tools flow",
      blocking,
      score: blocking ? 5 : 10,
    });
  }

  // Chain 2: FOOD (kitchen unlocks 2x hunger efficiency)
  if (kitchens === 0) {
    const steps = [];
    if (farms < 6) steps.push(`${6 - farms} more farms (5w each)`);
    steps.push("kitchen (8w+3s)");
    const blocking = farms < 6
      ? `need ${6 - farms} more farms first`
      : (wood < 8 || stone < 3)
        ? "need 8w + 3s for kitchen"
        : null;
    ops.push({
      id: "F1",
      name: "Food chain",
      steps,
      payoff: "kitchen converts food→meals at 2x hunger efficiency",
      blocking,
      score: blocking ? 4 : 9,
    });
  }

  // Chain 3: MEDICAL (clinic reduces mortality)
  if (clinics === 0) {
    const steps = [];
    if (herbGardens === 0) steps.push("herb_garden (4w)");
    steps.push("clinic (6w+2h)");
    const blocking = herbGardens === 0
      ? "need herb_garden first"
      : (wood < 6 || herbs < 2)
        ? "need 6w + 2h for clinic"
        : null;
    ops.push({
      id: "M1",
      name: "Medical chain",
      steps,
      payoff: "medicine reduces colonist mortality",
      blocking,
      score: blocking ? 3 : 7,
    });
  }

  // Chain 4: LOGISTICS expansion — new warehouse anchors a new district
  // when current ones are crowded.
  const farmsPerWh = warehouses > 0 ? farms / warehouses : Infinity;
  if (warehouses < 2 || farmsPerWh > 6) {
    ops.push({
      id: "L1",
      name: "Logistics expansion",
      steps: ["warehouse (10w)", "road x2-3 (1w each)"],
      payoff: warehouses < 2 ? "second anchor enables expansion" : "split crowded warehouse load",
      blocking: wood < 10 ? "need 10+ wood for warehouse" : null,
      score: warehouses < 2 ? 8 : 5,
    });
  }

  // Chain 5: HERB-FARM synergy. Encourage adjacent placement when both have
  // candidates.
  const farmCands = candidatesByType?.farm ?? [];
  const herbCands = candidatesByType?.herb_garden ?? [];
  if (farmCands.length > 0 && herbCands.length > 0
      && (farms < 3 || herbGardens === 0)) {
    ops.push({
      id: "S1",
      name: "Herb-farm synergy",
      steps: ["herb_garden adjacent to farm", "farm (or vice versa)"],
      payoff: "+0.003/tick fertility on adjacent farm; +0.2/s herbs",
      blocking: null,
      score: 4,
    });
  }

  // Chain 6: LUMBER stability when wood production is thin.
  if (lumbers < 2 && wood < 30) {
    ops.push({
      id: "W1",
      name: "Wood throughput",
      steps: ["lumber (5w)", "road to warehouse (1w each)"],
      payoff: "+0.5/s wood unblocks ALL further builds",
      blocking: wood < 5 ? "need 5+ wood" : null,
      score: 6,
    });
  }


  ops.sort((a, b) => b.score - a.score);
  return ops.slice(0, 5);
}

// ── D. computeRichnessHeatmap ─────────────────────────────────────────

/**
 * For each candidate tile across all tracked types, compute a "richness" score:
 * sum of nearby (4-tile radius) resource buildings + grass tiles available
 * for expansion. High richness = compounding location.
 *
 * Returns the top 5 hotspots (one entry per ix,iz, even if it appears across
 * multiple types).
 *
 * @param {object} state
 * @param {object} candidatesByType
 * @returns {Array<{ix:number,iz:number,richness:number,nearbyBuildings:number,nearbyGrass:number,types:Array<string>}>}
 */
export function computeRichnessHeatmap(state, candidatesByType = {}) {
  const grid = state?.grid;
  if (!grid) return [];

  // Aggregate unique tiles from all candidate lists.
  const map = new Map();
  for (const [type, list] of Object.entries(candidatesByType)) {
    for (const c of list ?? []) {
      const key = `${c.ix},${c.iz}`;
      const entry = map.get(key) ?? { ix: c.ix, iz: c.iz, types: [] };
      entry.types.push(type);
      map.set(key, entry);
    }
  }

  const RES_BUILDINGS = new Set([
    TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN,
    TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC, TILE.WAREHOUSE,
  ]);

  const out = [];
  for (const entry of map.values()) {
    let buildings = 0;
    let grass = 0;
    for (let dz = -RICHNESS_RADIUS; dz <= RICHNESS_RADIUS; dz++) {
      for (let dx = -RICHNESS_RADIUS; dx <= RICHNESS_RADIUS; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > RICHNESS_RADIUS) continue;
        const nx = entry.ix + dx;
        const nz = entry.iz + dz;
        if (!inBounds(nx, nz, grid)) continue;
        const t = grid.tiles[toIndex(nx, nz, grid.width)];
        if (RES_BUILDINGS.has(t)) buildings++;
        else if (t === TILE.GRASS) grass++;
      }
    }
    const richness = buildings * 2 + Math.min(grass, 30) * 0.1;
    out.push({
      ix: entry.ix,
      iz: entry.iz,
      richness: Math.round(richness * 10) / 10,
      nearbyBuildings: buildings,
      nearbyGrass: grass,
      types: entry.types.slice(0, 4),
    });
  }
  out.sort((a, b) => b.richness - a.richness);
  return out.slice(0, 5);
}

// ── E. formatAnalyticsForLLM ──────────────────────────────────────────

/**
 * Build the analytics package and render it as a compact markdown block for
 * the user prompt. Each candidate gets an integer ID like `C1, C2…` keyed by
 * `<type>` so the LLM can reference one back in its plan.
 *
 * Total target: 600-1200 chars for typical mid-game state.
 *
 * @param {object} state
 * @param {object} [options]
 * @param {number} [options.topN=4]
 * @returns {{ text: string, candidatesByType: object, candidateIndex: Map<string, object> }}
 */
export function formatAnalyticsForLLM(state, options = {}) {
  const topN = Math.max(2, Math.min(10, Number(options.topN) || 4));
  const allCands = computeAllCandidates(state, TRACKED_TYPES, { topN });
  const candidatesByType = allCands.candidatesByType;
  const unaffordableTypes = allCands.unaffordableTypes;
  const droppedTypes = allCands.droppedTypes;
  const projections = computeResourceProjections(state);
  const chains = computeChainOpportunities(state, candidatesByType);
  const richness = computeRichnessHeatmap(state, candidatesByType);

  const lines = [];
  const idMap = new Map(); // "C1" → { type, ix, iz, score }

  // 1) Resource Projections (compact). Make this leading section actionable:
  //    when projected exhaustion < 60s the LLM MUST prioritize that resource's
  //    chain before expansion.
  lines.push("## Resource Projections");
  const fmtProj = (key) => {
    const p = projections[key];
    const z = p.projectedZeroSec;
    const zs = Number.isFinite(z) ? `~${z}s to zero` : "ok";
    const rstr = p.rate > 0 ? `+${p.rate}` : `${p.rate}`;
    return `${key}=${p.stock}(${rstr}/s, ${zs})`;
  };
  lines.push(`${fmtProj("food")}, ${fmtProj("wood")}, ${fmtProj("stone")}, ${fmtProj("herbs")}`);
  if (projections.bottleneck) {
    const sec = projections.bottleneckSec;
    if (Number.isFinite(sec) && sec < 30) {
      lines.push(`URGENT bottleneck: ${projections.bottleneck} depletes in ~${sec}s — address it first.`);
    } else {
      lines.push(`Bottleneck: ${projections.bottleneck} (worst projected exhaustion)`);
    }
  }

  // 2) Building Candidates (with C-IDs). R3 — `candidatesByType` is now
  // already feasibility-filtered (see computeAllCandidates), so we just
  // render whatever survived. Types fully unaffordable this tick are
  // omitted from the menu entirely and listed as a single line so the LLM
  // doesn't waste plan steps on them.
  lines.push("");
  lines.push("## Building Candidates (pick by id)");
  let cId = 1;
  let renderedTypes = 0;
  for (const type of TRACKED_TYPES) {
    const list = candidatesByType[type] ?? [];
    if (list.length === 0) continue;
    renderedTypes++;
    // 2 candidates per type — top-N redundancy adds noise w/o info.
    const top = list.slice(0, 2);
    const cells = top.map((c) => {
      const id = `C${cId++}`;
      idMap.set(id, { type, ix: c.ix, iz: c.iz, score: c.score });
      const reasonStr = c.reasons.length > 0 ? ` ${c.reasons[0]}` : "";
      return `${id}=(${c.ix},${c.iz}) s=${c.score}${reasonStr}`;
    });
    lines.push(`- ${type}: ${cells.join(" | ")}`);
  }
  if (renderedTypes === 0) {
    lines.push("- (no buildable grass found near infrastructure)");
  }
  // R3 — surface fully-unaffordable types so the LLM doesn't propose them.
  if (unaffordableTypes.length > 0) {
    lines.push(`Unaffordable this tick: ${unaffordableTypes.join(", ")} (skip in plan).`);
  }
  // Surface dropped (degenerate menu) types as a softer signal so the LLM
  // knows why it can't pick e.g. a quarry — usually because no STONE node
  // tile lies inside warehouse coverage.
  const droppedKeys = Object.keys(droppedTypes);
  if (droppedKeys.length > 0) {
    lines.push(`Insufficient feasible tiles: ${droppedKeys.join(", ")} (need a different anchor).`);
  }

  // 3) Chain Opportunities — pre-ranked recipes the LLM should pick from.
  if (chains.length > 0) {
    lines.push("");
    lines.push("## Chain Opportunities");
    for (const op of chains.slice(0, 4)) {
      const blockStr = op.blocking ? ` (blocked: ${op.blocking})` : "";
      lines.push(`- [${op.id}] ${op.name}: ${op.steps.join(" → ")} — ${op.payoff}${blockStr}`);
    }
  }

  // 4) Richness Hotspots
  if (richness.length > 0) {
    lines.push("");
    lines.push("## Richness Hotspots");
    for (const h of richness.slice(0, 3)) {
      lines.push(`- (${h.ix},${h.iz}) richness=${h.richness} (bld=${h.nearbyBuildings}, grass=${h.nearbyGrass}, types=${h.types.join("/")})`);
    }
  }

  return {
    text: lines.join("\n"),
    candidatesByType,
    candidateIndex: idMap,
    projections,
    chains,
    richness,
    // R3 — exposed so AgentDirector / bench can record what's out of reach
    // and so callers can debug "why didn't the LLM see kitchen candidates?".
    unaffordableTypes,
    droppedTypes,
  };
}

// ── F. validatePlanCandidates ─────────────────────────────────────────

/**
 * Walk the steps of a validated plan and classify each tile as
 * `from_candidate` (matches an entry in candidatesByType) or `invented`.
 * Pure: never throws, returns a small report.
 *
 * @param {object} plan — output of validatePlanResponse
 * @param {object} candidatesByType
 * @returns {{ totalSteps:number, candidateMatches:number, invented:number, candidateUseRate:number, perStep: Array<{id:number, type:string, source:"candidate"|"invented"|"non-coord"}> }}
 */
export function validatePlanCandidates(plan, candidatesByType = {}) {
  const result = {
    totalSteps: 0,
    candidateMatches: 0,
    invented: 0,
    candidateUseRate: 0,
    perStep: [],
  };
  if (!plan || !Array.isArray(plan.steps)) return result;

  // Build a quick lookup: type → Set("ix,iz")
  const lookup = {};
  for (const [type, list] of Object.entries(candidatesByType)) {
    lookup[type] = new Set((list ?? []).map((c) => `${c.ix},${c.iz}`));
  }

  for (const step of plan.steps) {
    const action = step.action ?? {};
    const type = action.type;
    if (!type || type === "skill" || type === "reassign_role") {
      result.perStep.push({ id: step.id, type, source: "non-coord" });
      continue;
    }
    result.totalSteps++;
    // Plans encode tiles via `action.hint` — try to parse a coord.
    const hint = action.hint;
    let coord = null;
    if (typeof hint === "string") {
      const m = hint.match(/^(\d+),(\d+)$/);
      if (m) coord = `${parseInt(m[1], 10)},${parseInt(m[2], 10)}`;
    }
    // Also accept top-level ix/iz on a step (forward-compat).
    if (!coord && Number.isFinite(step.ix) && Number.isFinite(step.iz)) {
      coord = `${step.ix},${step.iz}`;
    }
    if (coord && lookup[type] && lookup[type].has(coord)) {
      result.candidateMatches++;
      result.perStep.push({ id: step.id, type, source: "candidate" });
    } else {
      result.invented++;
      result.perStep.push({ id: step.id, type, source: "invented" });
    }
  }

  result.candidateUseRate = result.totalSteps > 0
    ? Math.round((result.candidateMatches / result.totalSteps) * 1000) / 1000
    : 0;
  return result;
}
