import { EVENT_TYPE } from "../config/constants.js";
import { getScenarioRuntime } from "../world/scenarios/ScenarioFactory.js";

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

