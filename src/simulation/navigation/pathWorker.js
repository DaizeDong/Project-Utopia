import { aStar } from "./AStar.js";

let currentGrid = null;

function normalizeGrid(grid) {
  if (!grid) return null;
  return {
    width: Number(grid.width ?? 0),
    height: Number(grid.height ?? 0),
    tiles: grid.tiles ?? [],
    elevation: grid.elevation ?? null,
  };
}

function normalizeDynamicCosts(raw = null) {
  if (!raw) return null;
  return {
    hazards: {
      tiles: Array.isArray(raw.hazards?.tileKeys) ? new Set(raw.hazards.tileKeys) : null,
      penaltyMultiplier: Number(raw.hazards?.penaltyMultiplier ?? 1),
      penaltyByKey: raw.hazards?.penaltyByKey ?? null,
    },
    traffic: {
      penaltyByKey: raw.traffic?.penaltyByKey ?? null,
    },
  };
}

self.onmessage = (event) => {
  const message = event.data ?? {};
  if (message.type !== "path") return;

  const job = message.job ?? {};
  if (job.grid) {
    currentGrid = normalizeGrid(job.grid);
  }

  const startedAt = performance.now();
  let path = null;
  let error = "";
  try {
    if (!currentGrid) throw new Error("path worker has no grid snapshot");
    path = aStar(
      currentGrid,
      job.start,
      job.goal,
      Number(job.weatherMoveCostMultiplier ?? 1),
      normalizeDynamicCosts(job.dynamicCosts),
    );
  } catch (err) {
    error = String(err?.message ?? err);
    path = null;
  }

  self.postMessage({
    type: "path-result",
    id: job.id,
    key: job.key,
    gridVersion: job.gridVersion,
    costVersion: job.costVersion,
    path,
    error,
    durationMs: performance.now() - startedAt,
  });
};
