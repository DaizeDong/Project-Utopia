import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeCandidateTiles,
  formatCandidatesForLLM,
  PlacementSpecialist,
} from "../src/simulation/ai/colony/PlacementSpecialist.js";
import { TILE } from "../src/config/constants.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeGrid(width = 32, height = 32) {
  const tiles = new Uint8Array(width * height);
  const elevation = new Uint8Array(width * height).fill(128);
  const moisture = new Uint8Array(width * height).fill(128);
  return { width, height, tileSize: 1, tiles, elevation, moisture };
}

function setTile(grid, ix, iz, type) {
  grid.tiles[iz * grid.width + ix] = type;
}

function setMoisture(grid, ix, iz, value) {
  grid.moisture[iz * grid.width + ix] = Math.round(value * 255);
}

function setElevation(grid, ix, iz, value) {
  grid.elevation[iz * grid.width + ix] = Math.round(value * 255);
}

function makeState(grid, overrides = {}) {
  return {
    grid,
    resources: { food: 50, wood: 40, stone: 10, herbs: 5, ...overrides.resources },
    agents: overrides.agents ?? [],
    buildings: overrides.buildings ?? {},
    weather: overrides.weather ?? { season: "summer", current: "clear" },
    ai: { strategy: overrides.strategy ?? { primaryGoal: "test goal" } },
  };
}

// ── analyzeCandidateTiles ───────────────────────────────────────────────

describe("analyzeCandidateTiles", () => {
  it("returns scored candidates with terrain data", () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    setMoisture(grid, 15, 16, 0.8);
    setMoisture(grid, 17, 16, 0.3);
    const candidates = [{ ix: 15, iz: 16 }, { ix: 17, iz: 16 }];
    const state = makeState(grid);
    const result = analyzeCandidateTiles(candidates, "farm", grid, state);

    assert.equal(result.length, 2);
    assert.ok(result[0].moisture > result[1].moisture); // high moisture ranked first for farm
    assert.ok(result[0].score > result[1].score);
  });

  it("includes warehouse distance", () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    const candidates = [{ ix: 14, iz: 16 }, { ix: 10, iz: 16 }];
    const state = makeState(grid);
    const result = analyzeCandidateTiles(candidates, "farm", grid, state);

    const close = result.find(c => c.ix === 14);
    const far = result.find(c => c.ix === 10);
    assert.ok(close.distToWarehouse < far.distToWarehouse);
    assert.ok(close.withinCoverage);
  });

  it("detects adjacent building synergies", () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    setTile(grid, 14, 16, TILE.HERB_GARDEN); // adjacent to (15,16)
    const candidates = [{ ix: 15, iz: 16 }];
    const state = makeState(grid);
    const result = analyzeCandidateTiles(candidates, "farm", grid, state);

    assert.ok(result[0].adjacentBuildings.includes("herb_garden"));
    assert.ok(result[0].notes.some(n => n.includes("+fertility")));
  });

  it("warns about quarry adjacency for farms", () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    setTile(grid, 14, 16, TILE.QUARRY);
    const candidates = [{ ix: 15, iz: 16 }];
    const state = makeState(grid);
    const result = analyzeCandidateTiles(candidates, "farm", grid, state);

    assert.ok(result[0].notes.some(n => n.includes("quarry dust")));
  });

  it("warns about fire risk on low moisture", () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    setMoisture(grid, 15, 16, 0.15); // below fire threshold
    const candidates = [{ ix: 15, iz: 16 }];
    const state = makeState(grid);
    const result = analyzeCandidateTiles(candidates, "farm", grid, state);

    assert.ok(result[0].notes.some(n => n.includes("fire risk")));
  });

  it("includes fertility cap for farms", () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    setMoisture(grid, 15, 16, 0.6);
    const candidates = [{ ix: 15, iz: 16 }];
    const state = makeState(grid);
    const result = analyzeCandidateTiles(candidates, "farm", grid, state);

    assert.ok(result[0].notes.some(n => n.includes("fert_cap")));
  });

  it("favors high elevation for walls", () => {
    const grid = makeGrid();
    setElevation(grid, 15, 16, 0.9);
    setElevation(grid, 17, 16, 0.2);
    const candidates = [{ ix: 15, iz: 16 }, { ix: 17, iz: 16 }];
    const state = makeState(grid);
    const result = analyzeCandidateTiles(candidates, "wall", grid, state);

    assert.ok(result[0].elevation > result[1].elevation);
  });

  it("respects max evaluate limit", () => {
    const grid = makeGrid();
    const candidates = Array.from({ length: 100 }, (_, i) => ({ ix: i % 32, iz: Math.floor(i / 32) }));
    const state = makeState(grid);
    const result = analyzeCandidateTiles(candidates, "road", grid, state);

    assert.ok(result.length <= 40);
  });

  it("includes worker distance when workers present", () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    const state = makeState(grid, {
      agents: [{ type: "WORKER", alive: true, x: 0, z: 0 }],
    });
    const candidates = [{ ix: 16, iz: 16 }];
    const result = analyzeCandidateTiles(candidates, "farm", grid, state);

    assert.ok(result[0].distToWorker >= 0);
  });
});

// ── formatCandidatesForLLM ──────────────────────────────────────────────

describe("formatCandidatesForLLM", () => {
  it("produces table format", () => {
    const candidates = [{
      ix: 15, iz: 16, moisture: 0.72, elevation: 0.3,
      distToWarehouse: 4, withinCoverage: true, distToWorker: 3,
      adjacentBuildings: ["herb_garden"], notes: ["+fertility from herb_garden"],
      score: 0.85,
    }];
    const text = formatCandidatesForLLM(candidates, "farm", { season: "summer" });

    assert.ok(text.includes("Build: farm"));
    assert.ok(text.includes("| # |"));
    assert.ok(text.includes("15"));
    assert.ok(text.includes("0.72"));
    assert.ok(text.includes("herb_garden"));
  });

  it("includes strategy context", () => {
    const text = formatCandidatesForLLM([], "farm", { strategyGoal: "Expand food production" });
    assert.ok(text.includes("Expand food production"));
  });

  it("warns about drought", () => {
    const text = formatCandidatesForLLM([], "farm", { season: "summer", weather: "drought" });
    assert.ok(text.includes("DROUGHT"));
  });

  it("limits to MAX_CANDIDATES", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      ix: i, iz: 0, moisture: 0.5, elevation: 0.3,
      distToWarehouse: 5, withinCoverage: true, distToWorker: 3,
      adjacentBuildings: [], notes: [], score: 0.5,
    }));
    const text = formatCandidatesForLLM(candidates, "farm");
    const rows = text.split("\n").filter(l => l.startsWith("| ") && !l.startsWith("| #") && !l.startsWith("|--"));
    assert.ok(rows.length <= 8);
  });
});

// ── PlacementSpecialist class ───────────────────────────────────────────

describe("PlacementSpecialist", () => {
  it("returns algorithmic result for simple types (road)", async () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    const candidates = [{ ix: 15, iz: 16 }, { ix: 17, iz: 16 }];
    const state = makeState(grid);
    const specialist = new PlacementSpecialist({ enableLLM: false });

    const result = await specialist.chooseTile(candidates, "road", grid, state);
    assert.equal(result.source, "algorithmic");
    assert.ok(result.tile);
    assert.ok(result.tile.ix >= 0);
  });

  it("returns algorithmic fallback when LLM disabled", async () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    setMoisture(grid, 15, 16, 0.9);
    const candidates = [{ ix: 15, iz: 16 }, { ix: 17, iz: 16 }];
    const state = makeState(grid);
    const specialist = new PlacementSpecialist({ enableLLM: false });

    const result = await specialist.chooseTile(candidates, "farm", grid, state);
    assert.equal(result.source, "algorithmic");
    assert.ok(result.tile);
  });

  it("returns null tile for empty candidates", async () => {
    const grid = makeGrid();
    const state = makeState(grid);
    const specialist = new PlacementSpecialist({ enableLLM: false });

    const result = await specialist.chooseTile([], "farm", grid, state);
    assert.equal(result.tile, null);
  });

  it("tracks stats", async () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    const candidates = [{ ix: 15, iz: 16 }];
    const state = makeState(grid);
    const specialist = new PlacementSpecialist({ enableLLM: false });

    await specialist.chooseTile(candidates, "farm", grid, state);
    assert.equal(specialist.stats.fallbacks, 1);
    assert.equal(specialist.stats.llmCalls, 0);
  });

  it("chooses high-moisture tile for farm", async () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    setMoisture(grid, 14, 16, 0.9);
    setMoisture(grid, 18, 16, 0.2);
    const candidates = [{ ix: 14, iz: 16 }, { ix: 18, iz: 16 }];
    const state = makeState(grid);
    const specialist = new PlacementSpecialist({ enableLLM: false });

    const result = await specialist.chooseTile(candidates, "farm", grid, state);
    assert.equal(result.tile.ix, 14); // should prefer high moisture
  });

  it("avoids quarry-adjacent tiles for herb_garden", async () => {
    const grid = makeGrid();
    setTile(grid, 16, 16, TILE.WAREHOUSE);
    setTile(grid, 14, 16, TILE.QUARRY);
    setMoisture(grid, 15, 16, 0.7);
    setMoisture(grid, 17, 16, 0.7);
    const candidates = [{ ix: 15, iz: 16 }, { ix: 17, iz: 16 }];
    const state = makeState(grid);
    const specialist = new PlacementSpecialist({ enableLLM: false });

    const result = await specialist.chooseTile(candidates, "herb_garden", grid, state);
    assert.equal(result.tile.ix, 17); // should avoid quarry adjacent
  });
});
