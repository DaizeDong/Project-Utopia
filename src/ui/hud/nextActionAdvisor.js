import { BALANCE } from "../../config/balance.js";
import { TILE } from "../../config/constants.js";
import { getTile } from "../../world/grid/Grid.js";
import { getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";

const NETWORK_TILES = new Set([TILE.ROAD, TILE.WAREHOUSE, TILE.LUMBER, TILE.BRIDGE]);

const TARGETS = Object.freeze([
  { key: "warehouses", tool: "warehouse", label: "Build Warehouse" },
  { key: "farms", tool: "farm", label: "Build Farm" },
  { key: "lumbers", tool: "lumber", label: "Build Lumber" },
  { key: "roads", tool: "road", label: "Build Road" },
  { key: "walls", tool: "wall", label: "Build Wall" },
]);

function finiteCount(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function tileLabel(tile) {
  return tile && Number.isFinite(Number(tile.ix)) && Number.isFinite(Number(tile.iz))
    ? `(${tile.ix},${tile.iz})`
    : "";
}

function advice({ priority = "normal", label, detail, tool = "select", target = null, reason }) {
  return {
    priority,
    label,
    detail,
    tool,
    target,
    reason,
  };
}

function findOpenRouteGap(state, route) {
  const gaps = Array.isArray(route?.gapTiles) ? route.gapTiles : [];
  for (const gap of gaps) {
    const tile = getTile(state.grid, gap.ix, gap.iz);
    if (!NETWORK_TILES.has(tile)) return { ix: gap.ix, iz: gap.iz };
  }
  return gaps[0] ? { ix: gaps[0].ix, iz: gaps[0].iz } : null;
}

function getFoodCrisisAdvice(state) {
  const food = Number(state.resources?.food ?? 0);
  const emptySec = Number(state.metrics?.resourceEmptySec?.food ?? 0);
  const starvationRisk = finiteCount(state.metrics?.starvationRiskCount);
  const emergencyFood = Number(BALANCE.foodEmergencyThreshold ?? 18);
  if (food > emergencyFood && emptySec <= 0 && starvationRisk <= 0) return null;
  return advice({
    priority: "critical",
    label: "Recover food now",
    detail: "Build or reconnect farms before workers enter starvation recovery.",
    tool: "farm",
    reason: "food_crisis",
  });
}

function getRouteAdvice(state, runtime) {
  const route = (runtime.routes ?? []).find((entry) => !entry.connected);
  if (!route) return null;
  const target = findOpenRouteGap(state, route);
  const place = tileLabel(target);
  return advice({
    priority: "high",
    label: `Repair ${route.label ?? "supply route"}`,
    detail: target
      ? `Place Road at ${place} to reconnect this supply route.`
      : `Build road segments to reconnect ${route.label ?? "this supply route"}.`,
    tool: "road",
    target,
    reason: "route_gap",
  });
}

function getDepotAdvice(runtime) {
  const depot = (runtime.depots ?? []).find((entry) => !entry.ready);
  if (!depot) return null;
  const target = runtime.scenario?.anchors?.[depot.anchor] ?? null;
  const place = tileLabel(target);
  return advice({
    priority: "high",
    label: `Build Warehouse: ${depot.label ?? "depot"}`,
    detail: target
      ? `Place Warehouse near ${place} to make this depot usable.`
      : "Place a Warehouse inside the missing depot zone.",
    tool: "warehouse",
    target,
    reason: "depot_missing",
  });
}

function getTargetAdvice(runtime) {
  const counts = runtime.counts ?? {};
  const targets = runtime.logisticsTargets ?? {};
  for (const entry of TARGETS) {
    const current = finiteCount(counts[entry.key]);
    const target = finiteCount(targets[entry.key]);
    if (target > 0 && current < target) {
      return advice({
        priority: "normal",
        label: `${entry.label} ${current}/${target}`,
        detail: `Current scenario target needs ${target - current} more ${entry.key}.`,
        tool: entry.tool,
        reason: `target_${entry.key}`,
      });
    }
  }
  return null;
}

export function getNextActionAdvice(state) {
  if (!state || !state.grid) {
    return advice({
      priority: "idle",
      label: "Start a run",
      detail: "Start a colony to receive a live next action.",
      reason: "missing_state",
    });
  }

  if ((state.session?.phase ?? "active") !== "active") {
    return advice({
      priority: "idle",
      label: "Start a run",
      detail: "Start the colony to receive live next actions.",
      reason: "session_inactive",
    });
  }

  const runtime = getScenarioRuntime(state);
  return getFoodCrisisAdvice(state)
    ?? getRouteAdvice(state, runtime)
    ?? getDepotAdvice(runtime)
    ?? getTargetAdvice(runtime)
    ?? advice({
      priority: "done",
      label: "Hold and improve",
      detail: "Scenario logistics targets are stable; use build preview to improve throughput.",
      tool: "select",
      reason: "all_clear",
    });
}
