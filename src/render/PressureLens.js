import { EVENT_TYPE, NODE_FLAGS, TILE } from "../config/constants.js";
import { BALANCE } from "../config/balance.js";
import { getScenarioRuntime } from "../world/scenarios/ScenarioFactory.js";
import { inBounds } from "../world/grid/Grid.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

function summarizeTiles(tiles = []) {
  if (!Array.isArray(tiles) || tiles.length <= 0) return null;
  const sum = tiles.reduce((acc, tile) => {
    acc.x += Number(tile.ix ?? 0);
    acc.z += Number(tile.iz ?? 0);
    return acc;
  }, { x: 0, z: 0 });
  return {
    ix: sum.x / tiles.length,
    iz: sum.z / tiles.length,
    radius: clamp(Math.sqrt(tiles.length) * 0.52, 0.85, 3.2),
    count: tiles.length,
  };
}

function activeEventKind(eventType) {
  if (eventType === EVENT_TYPE.BANDIT_RAID) return "bandit_raid";
  if (eventType === EVENT_TYPE.TRADE_CARAVAN) return "trade_caravan";
  if (eventType === EVENT_TYPE.ANIMAL_MIGRATION) return "animal_migration";
  return "event";
}

function severityWeight(event) {
  const pressure = Number(event?.payload?.pressure ?? event?.intensity ?? 0);
  return clamp(0.45 + pressure * 0.26, 0.45, 0.98);
}

function pushUniqueMarker(markers, marker, seen) {
  if (!marker) return;
  if (!Number.isFinite(marker.ix) || !Number.isFinite(marker.iz)) return;
  const id = String(marker.id ?? `${marker.kind}:${marker.ix.toFixed(2)},${marker.iz.toFixed(2)}`);
  if (seen.has(id)) return;
  seen.add(id);
  markers.push({
    radius: 1,
    weight: 0.6,
    priority: 0,
    ...marker,
    id,
  });
}

function buildRouteMarkers(runtime) {
  const markers = [];
  for (const route of runtime.routes ?? []) {
    if (route.connected) continue;
    for (const tile of route.gapTiles ?? []) {
      markers.push({
        id: `route:${route.id}:${tile.ix},${tile.iz}`,
        kind: "route",
        ix: tile.ix,
        iz: tile.iz,
        radius: 0.92,
        weight: 0.98,
        priority: 120,
        label: route.label,
      });
    }
  }
  return markers;
}

function buildDepotMarkers(runtime) {
  const anchors = runtime.scenario?.anchors ?? {};
  return (runtime.depots ?? [])
    .filter((depot) => !depot.ready)
    .map((depot) => {
      const anchor = anchors[depot.anchor];
      if (!anchor) return null;
      return {
        id: `depot:${depot.id}`,
        kind: "depot",
        ix: anchor.ix,
        iz: anchor.iz,
        radius: clamp((Number(depot.radius ?? 2) * 0.8) + 0.8, 1.1, 3.2),
        weight: 0.82,
        priority: 108,
        label: depot.label,
      };
    })
    .filter(Boolean);
}

function buildWeatherMarkers(state) {
  const groups = new Map();
  const penaltyByKey = state.weather?.hazardPenaltyByKey ?? {};
  const labelsByKey = state.weather?.hazardLabelByKey ?? {};
  for (const tile of state.weather?.hazardTiles ?? []) {
    const key = tileKey(tile.ix, tile.iz);
    const labels = Array.isArray(labelsByKey[key]) && labelsByKey[key].length > 0
      ? labelsByKey[key]
      : [state.weather?.current ?? "weather"];
    for (const label of labels) {
      const group = groups.get(label) ?? { tiles: [], peakPenalty: 1 };
      group.tiles.push(tile);
      group.peakPenalty = Math.max(group.peakPenalty, Number(penaltyByKey[key] ?? 1));
      groups.set(label, group);
    }
  }
  return Array.from(groups.entries())
    .map(([label, group]) => {
      const summary = summarizeTiles(group.tiles);
      if (!summary) return null;
      return {
        id: `weather:${label}`,
        kind: "weather",
        ix: summary.ix,
        iz: summary.iz,
        radius: clamp(summary.radius + 0.35, 1.1, 3.8),
        weight: clamp(0.46 + Math.max(0, group.peakPenalty - 1) * 0.42, 0.48, 0.92),
        priority: 84,
        label,
      };
    })
    .filter(Boolean);
}

function buildEventMarkers(state) {
  return (state.events?.active ?? [])
    .map((event, index) => {
      const tiles = Array.isArray(event.payload?.targetTiles) && event.payload.targetTiles.length > 0
        ? event.payload.targetTiles
        : event.payload?.impactTile
          ? [event.payload.impactTile]
          : [];
      const summary = summarizeTiles(tiles);
      if (!summary) return null;
      return {
        id: `event:${index}:${event.type}:${event.payload?.targetLabel ?? "zone"}`,
        kind: activeEventKind(event.type),
        ix: summary.ix,
        iz: summary.iz,
        radius: clamp(summary.radius + 0.2, 0.95, 3.4),
        weight: severityWeight(event),
        priority: 96,
        label: event.payload?.targetLabel ?? event.type,
      };
    })
    .filter(Boolean);
}

function buildTrafficMarkers(state) {
  return (state.metrics?.traffic?.hotspotTiles ?? [])
    .slice()
    .sort((a, b) => Number(b.penalty ?? 0) - Number(a.penalty ?? 0))
    .slice(0, 4)
    .map((tile, index) => ({
      id: `traffic:${index}:${tile.ix},${tile.iz}`,
      kind: "traffic",
      ix: tile.ix,
      iz: tile.iz,
      radius: 0.9,
      weight: clamp(0.42 + Math.max(0, Number(tile.penalty ?? 1) - 1) * 0.5, 0.45, 0.88),
      priority: 70,
      label: "traffic hotspot",
    }));
}

function buildEcologyMarkers(state) {
  return (state.metrics?.ecology?.hotspotFarms ?? [])
    .slice(0, 4)
    .map((tile, index) => ({
      id: `ecology:${index}:${tile.ix},${tile.iz}`,
      kind: "ecology",
      ix: tile.ix,
      iz: tile.iz,
      radius: 0.96,
      weight: clamp(0.45 + Number(tile.pressure ?? 0) * 0.28, 0.46, 0.84),
      priority: 64,
      label: "wildlife pressure",
    }));
}

export function buildPressureLens(state) {
  const runtime = getScenarioRuntime(state);
  const markers = [];
  const seen = new Set();

  for (const marker of buildRouteMarkers(runtime)) pushUniqueMarker(markers, marker, seen);
  for (const marker of buildDepotMarkers(runtime)) pushUniqueMarker(markers, marker, seen);
  for (const marker of buildEventMarkers(state)) pushUniqueMarker(markers, marker, seen);
  for (const marker of buildWeatherMarkers(state)) pushUniqueMarker(markers, marker, seen);
  for (const marker of buildTrafficMarkers(state)) pushUniqueMarker(markers, marker, seen);
  for (const marker of buildEcologyMarkers(state)) pushUniqueMarker(markers, marker, seen);

  return markers
    .sort((a, b) => {
      const priorityDelta = Number(b.priority ?? 0) - Number(a.priority ?? 0);
      if (priorityDelta !== 0) return priorityDelta;
      const weightDelta = Number(b.weight ?? 0) - Number(a.weight ?? 0);
      if (Math.abs(weightDelta) > 0.0001) return weightDelta;
      return String(a.id).localeCompare(String(b.id));
    })
    .slice(0, 24);
}

// v0.8.0 Phase 7.C — Supply-Chain Heat Lens (spec § 6).
// Precompute pass over state.resources + grid tiles + warehouseDensity metrics
// that classifies every buildable tile into one of three channels:
//   RED   — producer adjacent to a "hot" warehouse (density ≥ risk threshold),
//           i.e. surplus input piling up next to saturated storage.
//   BLUE  — processing building (KITCHEN/SMITHY/CLINIC) whose colony-wide input
//           is empty (food / wood+stone / herbs), OR warehouse that is clearly
//           underused (no connected density score at all) and therefore starved.
//   GREY  — idle / healthy tiles (default; not rendered to keep pool cost low).
// Zero art: the existing pressureMarkerPool renders these via disc+ring colour.
const HEAT_PRODUCER_TILES = Object.freeze([
  TILE.FARM,
  TILE.LUMBER,
  TILE.QUARRY,
  TILE.HERB_GARDEN,
]);

const NODE_GATED_TOOL_FLAGS = Object.freeze({
  lumber: NODE_FLAGS.FOREST,
  quarry: NODE_FLAGS.STONE,
  herb_garden: NODE_FLAGS.HERB,
});

function resourceBelowHeatThreshold(resources, key) {
  const thresholds = BALANCE.heatLensStarveThreshold ?? {};
  return Number(resources?.[key] ?? 0) < Number(thresholds[key] ?? 0);
}

const HEAT_PROCESSOR_INPUT_CHECK = Object.freeze({
  // Kitchen consumes raw food (crafts meals). Blue before food fully bottoms out.
  [TILE.KITCHEN]: (resources) => resourceBelowHeatThreshold(resources, "food"),
  // Smithy consumes wood + stone (crafts tools). Blue when either input is scarce.
  [TILE.SMITHY]: (resources) => (
    resourceBelowHeatThreshold(resources, "wood") || resourceBelowHeatThreshold(resources, "stone")
  ),
  // Clinic consumes herbs (crafts medicine). Blue before herbs fully bottom out.
  [TILE.CLINIC]: (resources) => resourceBelowHeatThreshold(resources, "herbs"),
});

function isHotWarehouseKey(state, key) {
  const hot = state.metrics?.warehouseDensity?.hotWarehouses;
  if (!Array.isArray(hot) || hot.length <= 0) return false;
  return hot.includes(key);
}

function anyHotWarehouseAdjacent(state, ix, iz) {
  // Manhattan-4 adjacency. We intentionally don't walk the full density radius
  // here — the metrics layer already did the radial scan and bucketed hot
  // warehouses for us; we just need to know if this producer sits next to one.
  const width = Number(state.grid?.width ?? 0);
  const height = Number(state.grid?.height ?? 0);
  const tiles = state.grid?.tiles;
  if (!tiles || width <= 0 || height <= 0) return false;
  const DELTAS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dz] of DELTAS) {
    const nx = ix + dx;
    const nz = iz + dz;
    if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
    if (tiles[nx + nz * width] !== TILE.WAREHOUSE) continue;
    if (isHotWarehouseKey(state, tileKey(nx, nz))) return true;
  }
  return false;
}

function warehouseStarvationScore(state, key) {
  const density = state.metrics?.warehouseDensity;
  const score = Number(density?.byKey?.[key] ?? 0);
  const threshold = Number(
    density?.threshold ?? BALANCE.warehouseDensityRiskThreshold ?? 400,
  );
  if (threshold <= 0) return 0;
  return score / threshold;
}

export function buildHeatLens(state) {
  const grid = state.grid;
  const width = Number(grid?.width ?? 0);
  const height = Number(grid?.height ?? 0);
  const tiles = grid?.tiles;
  if (!tiles || width <= 0 || height <= 0) return [];

  const resources = state.resources ?? {};
  const markers = [];
  const seen = new Set();
  // v0.8.2 Round-6 Wave-1 01b-playability (Step 3) — primary-marker dedup by
  // tileKey, regardless of kind. Each colony tile gets at most one main heat
  // marker (RED > BLUE > warehouse-idle). The `pushUniqueMarker` `seen` set
  // already deduplicates by full marker id, but ids carry a kind prefix, so
  // RED+BLUE on the same tile would historically have produced two stacked
  // labels. The tile-keyed map below makes the priority order explicit and
  // makes the heat-lens overlay readable when multiple categories alias to
  // the same square.
  const PRIMARY_PRIORITY = { heat_surplus: 3, heat_starved: 2 };
  const primaryByKey = new Map();
  const tryPushPrimary = (marker) => {
    const k = tileKey(marker.ix, marker.iz);
    const existingPriority = primaryByKey.get(k) ?? 0;
    const incomingPriority = PRIMARY_PRIORITY[marker.kind] ?? 1;
    if (incomingPriority <= existingPriority) return;
    primaryByKey.set(k, incomingPriority);
    pushUniqueMarker(markers, marker, seen);
  };
  let firstSmithy = null;
  let hasQuarry = false;
  // Spec § 6: blue warehouses are "< 20% capacity" analogue — we treat an empty
  // density score (< 0.2 of the risk threshold) as the idle/starving state.
  const STARVATION_FRACTION = 0.2;

  // Budget: cap primary markers; halo pass can grow to MAX_HEAT_MARKERS_HALO.
  // v0.8.2 Round-6 Wave-1 01b-playability (Step 1) — drop the halo budget from
  // 160 to 64. With label="" (01a Step 1) the halo discs/rings only contribute
  // visual pulse, not text — so the per-tile information density was lower than
  // 160 markers' worth of overdraw warranted. 64 keeps "1 main marker + up to
  // 4 neighbours" room for ~12 simultaneous primary RED/BLUE markers, which
  // covers any realistic late-game economy without flooding the overlay.
  const MAX_HEAT_MARKERS = 48;
  const MAX_HEAT_MARKERS_HALO = 64;

  for (let iz = 0; iz < height && markers.length < MAX_HEAT_MARKERS; iz += 1) {
    for (let ix = 0; ix < width && markers.length < MAX_HEAT_MARKERS; ix += 1) {
      const tileType = tiles[ix + iz * width];
      const key = tileKey(ix, iz);
      if (tileType === TILE.SMITHY && !firstSmithy) firstSmithy = { ix, iz, key };
      if (tileType === TILE.QUARRY) hasQuarry = true;

      // RED — raw producer beside a saturated warehouse.
      if (HEAT_PRODUCER_TILES.includes(tileType)) {
        if (anyHotWarehouseAdjacent(state, ix, iz)) {
          tryPushPrimary({
            id: `heat-red:${key}`,
            kind: "heat_surplus",
            ix,
            iz,
            radius: 0.95,
            weight: 0.9,
            priority: 118,
            label: "supply surplus",
          });
        }
        continue;
      }

      // BLUE — starved processing building or idle warehouse.
      const processorCheck = HEAT_PROCESSOR_INPUT_CHECK[tileType];
      if (typeof processorCheck === "function") {
        if (processorCheck(resources)) {
          tryPushPrimary({
            id: `heat-blue:${key}`,
            kind: "heat_starved",
            ix,
            iz,
            radius: 0.95,
            weight: 0.82,
            priority: 116,
            label: "input starved",
          });
        }
        continue;
      }

      if (tileType === TILE.WAREHOUSE) {
        // Only flag warehouses as blue if the density metrics exist AND report
        // a near-zero score — otherwise we'd light up every new warehouse
        // before the metrics pass has scored it.
        const density = state.metrics?.warehouseDensity;
        if (density && density.byKey && Object.prototype.hasOwnProperty.call(density.byKey, key)) {
          const fraction = warehouseStarvationScore(state, key);
          if (fraction < STARVATION_FRACTION) {
            tryPushPrimary({
              id: `heat-blue:${key}`,
              kind: "heat_starved",
              ix,
              iz,
              radius: 1.05,
              weight: 0.68,
              priority: 110,
              label: "warehouse idle",
            });
          }
        }
      }
    }
  }

  if (
    markers.every((marker) => marker.kind !== "heat_starved")
    && hasQuarry
    && firstSmithy
    && Number(resources.stone ?? 0) <= 0
    && markers.length < MAX_HEAT_MARKERS
  ) {
    tryPushPrimary({
      id: `heat-blue:${firstSmithy.key}:stone-empty`,
      kind: "heat_starved",
      ix: firstSmithy.ix,
      iz: firstSmithy.iz,
      radius: 0.95,
      weight: 0.82,
      priority: 116,
      label: "stone input empty",
    });
  }

  // Halo pass: for each primary marker, emit 4-way neighbourhood secondaries.
  const primarySnapShot = markers.slice();
  const HALO_OFFSETS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const parent of primarySnapShot) {
    if (markers.length >= MAX_HEAT_MARKERS_HALO) break;
    for (const [dx, dz] of HALO_OFFSETS) {
      if (markers.length >= MAX_HEAT_MARKERS_HALO) break;
      const hx = parent.ix + dx;
      const hz = parent.iz + dz;
      if (hx < 0 || hz < 0 || hx >= width || hz >= height) continue;
      const htile = tiles[hx + hz * width];
      if (HEAT_PRODUCER_TILES.includes(htile) || HEAT_PROCESSOR_INPUT_CHECK[htile] || htile === TILE.WAREHOUSE) continue;
      // v0.8.2 Round-6 Wave-1 01a-onboarding (Step 1): halo markers no longer
      // carry a visible "halo" label — the coloured ring already does the
      // visual job of "this neighbouring tile is in the parent's pressure
      // halo". An empty label string is honoured by SceneRenderer's
      // #updatePressureLensLabels (Step 2 sets display:none when label is
      // empty) so we keep the halo's coloured disc/ring without leaking the
      // dev placeholder into the player's eye-line. (Per summary §2 D1,
      // 01a/01b/02b agree on label="" as the Wave-1 floor.)
      pushUniqueMarker(markers, {
        id: `halo:${parent.id}:${dx}:${dz}`,
        kind: parent.kind,
        ix: hx,
        iz: hz,
        radius: Number(parent.radius ?? 0.95) * 0.75,
        weight: Number(parent.weight ?? 0.9) * 0.55,
        priority: Number(parent.priority ?? 100) - 10,
        label: "",
      }, seen);
    }
  }

  return markers.sort((a, b) => {
    const priorityDelta = Number(b.priority ?? 0) - Number(a.priority ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
    const weightDelta = Number(b.weight ?? 0) - Number(a.weight ?? 0);
    if (Math.abs(weightDelta) > 0.0001) return weightDelta;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function classifyPlacementTiles(state, tool) {
  const requiredFlag = NODE_GATED_TOOL_FLAGS[tool];
  const grid = state?.grid;
  const width = Number(grid?.width ?? 0);
  const height = Number(grid?.height ?? 0);
  const tileState = grid?.tileState;
  if (!requiredFlag || !tileState || width <= 0 || height <= 0) {
    return { legal: [], illegal: [], requiredFlag: requiredFlag ?? 0 };
  }

  const legal = [];
  const illegal = [];
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      if (!inBounds(ix, iz, grid)) continue;
      const idx = ix + iz * width;
      const flags = Number(tileState.get(idx)?.nodeFlags ?? 0);
      const row = { ix, iz, flags };
      if ((flags & requiredFlag) !== 0) legal.push(row);
      else illegal.push(row);
    }
  }
  return { legal, illegal, requiredFlag };
}

// Heat-mode signature: cheap string the renderer can diff per frame to know
// whether to rebuild the marker set. Covers grid topology + colony resources +
// warehouse density metrics (the three inputs the precompute uses).
export function heatLensSignature(state) {
  const density = state.metrics?.warehouseDensity;
  const hot = Array.isArray(density?.hotWarehouses)
    ? density.hotWarehouses.join(",")
    : "";
  const peak = Number(density?.peak ?? 0).toFixed(1);
  const resources = state.resources ?? {};
  const r = [
    resources.food,
    resources.wood,
    resources.stone,
    resources.herbs,
  ].map((v) => Math.max(0, Math.round(Number(v ?? 0))));
  return [
    state.grid?.version ?? 0,
    state.grid?.tileStateVersion ?? 0,
    r.join("|"),
    hot,
    peak,
  ].join("||");
}
